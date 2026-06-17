#!/usr/bin/env bash
# Import and activate all n8n workflows via REST API
# Usage: ./scripts/import-workflows.sh [n8n_url] [email] [password]

set -euo pipefail

N8N_URL="${1:-http://localhost:5678}"
N8N_EMAIL="${2:-admin@sakura.local}"
N8N_PASSWORD="${3:-SakuraBot123}"
WORKFLOWS_DIR="$(dirname "$0")/../n8n/workflows"

# Load DB credentials from .env
ENV_FILE="$(dirname "$0")/../infra/.env"
DB_HOST=$(grep -s ^POSTGRES_HOST     "$ENV_FILE" | cut -d= -f2 || echo "postgres")
DB_PORT=$(grep -s ^POSTGRES_PORT     "$ENV_FILE" | cut -d= -f2 || echo "5432")
DB_NAME=$(grep -s ^POSTGRES_DB       "$ENV_FILE" | cut -d= -f2 || echo "botdb")
DB_USER=$(grep -s ^POSTGRES_USER     "$ENV_FILE" | cut -d= -f2 || echo "botuser")
DB_PASS=$(grep -s ^POSTGRES_PASSWORD "$ENV_FILE" | cut -d= -f2 || echo "")

echo "Importando workflows para $N8N_URL..."

# Wait for n8n to be ready
for i in $(seq 1 30); do
  if curl -sf "$N8N_URL/healthz" >/dev/null 2>&1 || curl -sf "$N8N_URL" >/dev/null 2>&1; then
    break
  fi
  echo "  Aguardando n8n... ($i/30)"
  sleep 3
done

# Setup owner (idempotent — 400 if already configured is fine)
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$N8N_URL/rest/owner/setup" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$N8N_EMAIL\",\"firstName\":\"Admin\",\"lastName\":\"Bot\",\"password\":\"$N8N_PASSWORD\"}" \
  2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  echo "  Owner configurado."
elif [ "$HTTP_CODE" = "400" ]; then
  echo "  Owner já configurado — OK."
else
  echo "  AVISO: owner/setup retornou HTTP $HTTP_CODE"
fi

# Login
TOKEN=$(curl -si -X POST "$N8N_URL/rest/login" \
  -H "Content-Type: application/json" \
  -d "{\"emailOrLdapLoginId\":\"$N8N_EMAIL\",\"password\":\"$N8N_PASSWORD\"}" | \
  grep "Set-Cookie: n8n-auth=" | sed 's/.*n8n-auth=//;s/;.*//' | tr -d '\r')

if [ -z "$TOKEN" ]; then
  echo "ERRO: Login falhou. Verifique as credenciais do n8n."
  exit 1
fi

echo "  Login OK"

api() {
  local method="$1" path="$2"
  shift 2
  curl -s -H "Cookie: n8n-auth=$TOKEN" \
    -H "Content-Type: application/json" \
    -X "$method" "$N8N_URL$path" "$@"
}

# Ensure Postgres credential exists
CRED_ID=$(api GET "/rest/credentials" | python3 -c "
import json, sys
d = json.load(sys.stdin)
data = d.get('data', [])
for c in (data if isinstance(data, list) else []):
    if c.get('type') == 'postgres':
        print(c.get('id', ''))
        break
" 2>/dev/null || true)

if [ -z "$CRED_ID" ]; then
  echo "  Criando credencial Postgres..."
  CRED_RESP=$(api POST "/rest/credentials" -d "$(python3 -c "
import json
print(json.dumps({
  'name': 'Postgres account',
  'type': 'postgres',
  'data': {
    'host': '${DB_HOST}',
    'port': int('${DB_PORT}'),
    'database': '${DB_NAME}',
    'user': '${DB_USER}',
    'password': '${DB_PASS}',
    'ssl': 'disable'
  }
}))")
  CRED_ID=$(echo "$CRED_RESP" | python3 -c \
    "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)
  if [ -z "$CRED_ID" ]; then
    echo "  AVISO: Falha ao criar credencial Postgres. Workflows podem não ativar."
  else
    echo "  Credencial Postgres criada (id=$CRED_ID)"
  fi
else
  echo "  Credencial Postgres existente (id=$CRED_ID)"
fi

# Get existing workflows to avoid duplicates
EXISTING=$(api GET "/rest/workflows" | python3 -c "
import json, sys
d = json.load(sys.stdin)
data = d.get('data', [])
if isinstance(data, list):
    for w in data:
        print(w.get('name', ''))
" 2>/dev/null || true)

IMPORTED=0
for wf_file in "$WORKFLOWS_DIR"/*.json; do
  [ -f "$wf_file" ] || continue
  WF_NAME=$(python3 -c "import json; print(json.load(open('$wf_file')).get('name',''))" 2>/dev/null)

  if echo "$EXISTING" | grep -qF "$WF_NAME"; then
    echo "  Workflow '$WF_NAME' já existe — pulando"
    continue
  fi

  echo "  Importando '$WF_NAME'..."

  # Prepare workflow: remove id, inject credential
  WF_DATA=$(python3 << PYEOF
import json

with open('$wf_file') as f:
    wf = json.load(f)

wf.pop('id', None)
wf['active'] = False

for n in wf.get('nodes', []):
    if n.get('type') == 'n8n-nodes-base.postgres':
        n['credentials'] = {'postgres': {'id': '${CRED_ID}', 'name': 'Postgres account'}}

print(json.dumps(wf))
PYEOF
)

  RESULT=$(echo "$WF_DATA" | api POST "/rest/workflows" -d @-)
  WF_ID=$(echo "$RESULT" | python3 -c \
    "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('id',''))" 2>/dev/null)

  if [ -z "$WF_ID" ]; then
    echo "  AVISO: Falha ao criar workflow '$WF_NAME'"
    continue
  fi

  # Activate
  VID=$(api GET "/rest/workflows/$WF_ID" | python3 -c \
    "import json,sys; d=json.load(sys.stdin); print(d.get('data',{}).get('versionId',''))" 2>/dev/null)
  api POST "/rest/workflows/$WF_ID/activate" -d "{\"versionId\":\"$VID\"}" >/dev/null

  echo "  Workflow '$WF_NAME' importado e ativado (id=$WF_ID)"
  IMPORTED=$((IMPORTED + 1))
done

echo ""
echo "Concluído: $IMPORTED workflow(s) importados."
