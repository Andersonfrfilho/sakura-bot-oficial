#!/usr/bin/env bash
# Importa e ativa todos os workflows de n8n/workflows/ via API Key (n8n v1+)
# Uso: N8N_API_KEY=xxx bash scripts/import-workflows.sh [n8n_url]

set -euo pipefail

N8N_URL="${1:-${N8N_URL:-http://localhost:5678}}"
N8N_API_KEY="${N8N_API_KEY:-}"
WORKFLOWS_DIR="$(dirname "$0")/../n8n/workflows"

if [ -z "$N8N_API_KEY" ]; then
  echo "ERRO: N8N_API_KEY não definida."
  echo "Gere uma em: n8n UI → Settings → n8n API → Create API Key"
  exit 1
fi

echo "Importando workflows para $N8N_URL..."

# Aguarda n8n ficar disponível
for i in $(seq 1 30); do
  if curl -sf "$N8N_URL/healthz" >/dev/null 2>&1; then
    break
  fi
  echo "  Aguardando n8n... ($i/30)"
  sleep 3
done

api() {
  local method="$1" path="$2"
  shift 2
  curl -s \
    -H "X-N8N-API-KEY: $N8N_API_KEY" \
    -H "Content-Type: application/json" \
    -X "$method" "$N8N_URL/api/v1$path" "$@"
}

# Workflows já existentes (evita duplicatas)
EXISTING=$(api GET "/workflows?limit=100" | python3 -c "
import json, sys
d = json.load(sys.stdin)
for w in d.get('data', []):
    print(w.get('name', ''))
" 2>/dev/null || true)

IMPORTED=0
SKIPPED=0

for wf_file in "$WORKFLOWS_DIR"/*.json; do
  [ -f "$wf_file" ] || continue

  WF_NAME=$(python3 -c "import json; print(json.load(open('$wf_file')).get('name',''))" 2>/dev/null)

  if echo "$EXISTING" | grep -qF "$WF_NAME"; then
    echo "  ↷ '$WF_NAME' já existe — pulando"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  echo "  → Importando '$WF_NAME'..."

  WF_DATA=$(python3 - "$wf_file" <<'PYEOF'
import json, sys
with open(sys.argv[1]) as f:
    wf = json.load(f)
wf.pop('id', None)
wf['active'] = False
print(json.dumps(wf))
PYEOF
)

  RESULT=$(echo "$WF_DATA" | api POST "/workflows" -d @-)
  WF_ID=$(echo "$RESULT" | python3 -c \
    "import json,sys; d=json.load(sys.stdin); print(d.get('id',''))" 2>/dev/null || true)

  if [ -z "$WF_ID" ]; then
    echo "  ✗ Falha ao criar '$WF_NAME'"
    echo "    Resposta: $RESULT"
    continue
  fi

  # Ativa o workflow
  api PUT "/workflows/$WF_ID/activate" -d '{}' >/dev/null 2>&1 || true

  echo "  ✓ '$WF_NAME' importado e ativado (id=$WF_ID)"
  IMPORTED=$((IMPORTED + 1))
done

echo ""
echo "Concluído: $IMPORTED importado(s), $SKIPPED ignorado(s)."
