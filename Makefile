ENV_FILE = infra/.env

# Nome do projeto derivado de ESTABELECIMENTO_NOME no .env (ex: "Sakura Delivery" → "sakura-delivery")
# Fallback para "whatsapp-bot" se o .env ainda não existir
PROJECT := $(shell grep -s ^ESTABELECIMENTO_NOME $(ENV_FILE) | cut -d= -f2 | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-')
PROJECT := $(if $(PROJECT),$(PROJECT),whatsapp-bot)

COMPOSE = docker compose -f infra/docker-compose.yml -p $(PROJECT)

.PHONY: help all setup init up down restart logs ps db-reset db-seed n8n-import directus-init chatwoot-init test test-order test-msg evolution-start evolution-stop evolution-logs validate build

help:
	@echo ""
	@echo "  make all         Primeira execução completa: setup + up + init"
	@echo "  make setup       Cria infra/.env a partir do exemplo"
	@echo "  make up          Sobe todos os serviços (inclui Evolution API)"
	@echo "  make init          Seed banco + workflows + Directus admin (roda após 'up')"
	@echo "  make directus-init Cria admin do Directus a partir do .env"
	@echo "  make n8n-import    Importa/atualiza workflows no n8n manualmente"
	@echo "  make down        Para todos os serviços"
	@echo "  make restart     Para e sobe novamente"
	@echo "  make logs        Acompanha logs em tempo real"
	@echo "  make ps          Status dos containers"
	@echo "  make validate    Valida JSON + JS syntax + anti-padrões (roda antes do push)
  make test        Roda testes de parsing + validação do workflow"
	@echo "  make db-reset    Recria o schema do app no banco (destrói dados)"
	@echo "  make db-seed     Importa cardapio.csv e faq.csv para o banco"
	@echo "  make test-order  Insere pedido de teste completo no banco"
	@echo "  make test-msg    Simula uma mensagem WhatsApp no n8n (webhook)"
	@echo "  make chatwoot-init Cria admin + inbox do Chatwoot e salva config no banco"
	@echo ""
	@echo "  Serviços após 'make up':"
	@echo "    http://localhost:3001  Typebot        (fluxos do bot)"
	@echo "    http://localhost:3010  Chatwoot       (atendimento humano)"
	@echo "    http://localhost:4100  Metabase       (dashboards e relatórios)"
	@echo "    http://localhost:5678  n8n            (workflows)"
	@echo "    http://localhost:8055  Directus       (painel admin cardápio/config)"
	@echo "    http://localhost:8080  Evolution API  (HOST — rode: make evolution-start)"
	@echo "    http://localhost:8181  Adminer        (banco de dados)"
	@echo ""

# Primeira execução completa
all: setup up
	@echo ""
	@echo "Aguardando serviços iniciarem (60s)..."
	@sleep 60
	@$(MAKE) init
	@echo ""
	@echo "Ambiente pronto! Acesse os serviços com 'make help'."
	@echo ""

# Seed banco + importa workflows + configura Directus + Chatwoot (roda após 'make up')
init: db-seed n8n-import directus-init chatwoot-init
	@echo "Inicialização concluída."

# Cria o admin do Directus a partir do DIRECTUS_ADMIN_EMAIL/.._PASSWORD do .env
DIRECTUS_EMAIL    := $(shell grep -s ^DIRECTUS_ADMIN_EMAIL    $(ENV_FILE) | cut -d= -f2)
DIRECTUS_PASSWORD := $(shell grep -s ^DIRECTUS_ADMIN_PASSWORD $(ENV_FILE) | cut -d= -f2)

directus-init:
	@echo "Configurando Directus..."
	@docker exec directus node /directus/cli.js bootstrap 2>/dev/null || true
	@ROLE_ID=$$(docker exec postgres psql -U $(DB_USER) -d $(DB_NAME) -tAc \
	  "SELECT id FROM directus_roles WHERE name='Administrator' LIMIT 1;" 2>/dev/null | tr -d ' '); \
	EXISTS=$$(docker exec postgres psql -U $(DB_USER) -d $(DB_NAME) -tAc \
	  "SELECT COUNT(*) FROM directus_users WHERE email='$(DIRECTUS_EMAIL)';" 2>/dev/null | tr -d ' '); \
	if [ "$$EXISTS" = "0" ]; then \
	  docker exec postgres psql -U $(DB_USER) -d $(DB_NAME) -c \
	    "INSERT INTO directus_users (id, first_name, email, password, role, status, provider) \
	     VALUES (gen_random_uuid(), 'Admin', '$(DIRECTUS_EMAIL)', 'placeholder', '$$ROLE_ID', 'active', 'default');" 2>/dev/null; \
	  docker exec directus node /directus/cli.js users passwd \
	    --email "$(DIRECTUS_EMAIL)" --password "$(DIRECTUS_PASSWORD)"; \
	  echo "  Admin Directus criado: $(DIRECTUS_EMAIL)"; \
	else \
	  echo "  Admin Directus já existe — pulando"; \
	fi

CHATWOOT_ADMIN_NAME     := $(shell grep -s ^CHATWOOT_ADMIN_NAME     $(ENV_FILE) | cut -d= -f2)
CHATWOOT_ADMIN_NAME     := $(if $(CHATWOOT_ADMIN_NAME),$(CHATWOOT_ADMIN_NAME),Admin)
CHATWOOT_ADMIN_EMAIL    := $(shell grep -s ^CHATWOOT_ADMIN_EMAIL    $(ENV_FILE) | cut -d= -f2)
CHATWOOT_ADMIN_EMAIL    := $(if $(CHATWOOT_ADMIN_EMAIL),$(CHATWOOT_ADMIN_EMAIL),admin@sakura.local)
CHATWOOT_ADMIN_PASSWORD := $(shell grep -s ^CHATWOOT_ADMIN_PASSWORD $(ENV_FILE) | cut -d= -f2)
CHATWOOT_ADMIN_PASSWORD := $(if $(CHATWOOT_ADMIN_PASSWORD),$(CHATWOOT_ADMIN_PASSWORD),SakuraBot123)

chatwoot-init:
	@echo "Configurando Chatwoot..."
	@SCRIPT='email = "$(CHATWOOT_ADMIN_EMAIL)"; \
	  user = User.find_by(email: email); \
	  if user.nil?; \
	    user = User.new(name: "$(CHATWOOT_ADMIN_NAME)", email: email, \
	      password: "$(CHATWOOT_ADMIN_PASSWORD)", password_confirmation: "$(CHATWOOT_ADMIN_PASSWORD)"); \
	    user.skip_confirmation!; user.save!; \
	  end; \
	  account = AccountUser.where(user_id: user.id).first&.account; \
	  account ||= Account.create!(name: "Sakura"); \
	  AccountUser.find_or_create_by!(account_id: account.id, user_id: user.id) { |au| au.role = :administrator }; \
	  inbox = Inbox.where(account: account).first; \
	  if inbox.nil?; \
	    channel = Channel::Api.create!(account: account); \
	    inbox = Inbox.create!(name: "WhatsApp Bot", channel: channel, account: account); \
	  end; \
	  token = AccessToken.find_or_create_by!(owner: user); \
	  puts "ACCOUNT_ID=" + account.id.to_s; \
	  puts "INBOX_ID=" + inbox.id.to_s; \
	  puts "API_TOKEN=" + token.token.to_s'; \
	RESULT=$$(docker exec chatwoot sh -c \
	  "bundle exec rails runner '$$SCRIPT' 2>/dev/null" 2>/dev/null \
	  | grep -E '^(ACCOUNT_ID|INBOX_ID|API_TOKEN)='); \
	ACCOUNT_ID=$$(echo "$$RESULT" | grep ^ACCOUNT_ID | cut -d= -f2); \
	INBOX_ID=$$(echo  "$$RESULT"  | grep ^INBOX_ID   | cut -d= -f2); \
	API_TOKEN=$$(echo "$$RESULT"  | grep ^API_TOKEN  | cut -d= -f2); \
	if [ -n "$$API_TOKEN" ]; then \
	  docker exec postgres psql -U $(DB_USER) -d $(DB_NAME) -c \
	    "UPDATE settings SET value='$$ACCOUNT_ID' WHERE key='chatwoot_account_id'; \
	     UPDATE settings SET value='$$INBOX_ID'   WHERE key='chatwoot_inbox_id'; \
	     UPDATE settings SET value='$$API_TOKEN'  WHERE key='chatwoot_api_token';" > /dev/null; \
	  echo "  Chatwoot pronto: $(CHATWOOT_ADMIN_EMAIL) | Account $$ACCOUNT_ID | Inbox $$INBOX_ID"; \
	  echo "  Configurações salvas no banco."; \
	else \
	  echo "  ⚠️  Chatwoot não respondeu — execute 'make chatwoot-init' após os containers subirem"; \
	fi

setup:
	@test -f $(ENV_FILE) && echo "infra/.env já existe — edite manualmente se necessário" || \
	  (cp infra/.env.example $(ENV_FILE) && echo "infra/.env criado — preencha as credenciais antes de rodar 'make up'")

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

restart:
	$(COMPOSE) down
	$(COMPOSE) up -d

logs:
	$(COMPOSE) logs -f

ps:
	$(COMPOSE) ps

# Recria apenas o schema da aplicação (tabelas do bot)
# Não afeta os bancos do Typebot e Chatwoot
db-reset:
	@echo "Recriando schema da aplicação..."
	$(COMPOSE) exec -T postgres psql \
	  -U $$(grep ^POSTGRES_USER $(ENV_FILE) | cut -d= -f2) \
	  -d $$(grep ^POSTGRES_DB $(ENV_FILE) | cut -d= -f2) \
	  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
	$(COMPOSE) exec -T postgres psql \
	  -U $$(grep ^POSTGRES_USER $(ENV_FILE) | cut -d= -f2) \
	  -d $$(grep ^POSTGRES_DB $(ENV_FILE) | cut -d= -f2) \
	  < database/schema.sql
	@echo "Schema recriado."

DB_USER := $(shell grep ^POSTGRES_USER $(ENV_FILE) | cut -d= -f2)
DB_NAME := $(shell grep ^POSTGRES_DB $(ENV_FILE) | cut -d= -f2)

# Importa os CSVs de dados iniciais para o banco
db-seed:
	@bash scripts/seed-db.sh

# Importa workflows do n8n via REST API (idempotente — pula se já existir)
N8N_URL      := http://localhost:5678
N8N_EMAIL    := $(shell grep -s ^N8N_EMAIL    $(ENV_FILE) | cut -d= -f2)
N8N_EMAIL    := $(if $(N8N_EMAIL),$(N8N_EMAIL),admin@sakura.local)
N8N_PASSWORD := $(shell grep -s ^N8N_PASSWORD $(ENV_FILE) | cut -d= -f2)
N8N_PASSWORD := $(if $(N8N_PASSWORD),$(N8N_PASSWORD),SakuraBot123)

test:
	@echo ""
	@echo "▶ Testes de parsing de pedidos"
	@node tests/ordering.test.js
	@echo ""
	@echo "▶ Validação da estrutura do workflow"
	@node tests/workflow.validate.js
	@echo ""

build:
	@node scripts/build-workflow.js

validate: build
	@bash scripts/validate-workflows.sh

n8n-import: validate
	@bash scripts/import-workflows.sh "$(N8N_URL)" "$(N8N_EMAIL)" "$(N8N_PASSWORD)"

# Importa workflows direto no Railway (produção)
# Uso: make n8n-import-railway N8N_RAILWAY_URL=https://n8n-xxx.up.railway.app
n8n-import-railway:
	@bash scripts/import-workflows.sh \
		"$(N8N_RAILWAY_URL)" \
		"$(N8N_EMAIL)" \
		"$(N8N_PASSWORD)"

# Insere um pedido de teste completo no banco (cliente + 2 pedidos + logs + IA)
# Idempotente — limpa dados anteriores antes de inserir
test-order:
	@$(COMPOSE) exec -T postgres psql -U $(DB_USER) -d $(DB_NAME) \
	  < database/seed_test.sql
	@echo ""
	@echo "Visualize em: http://localhost:8181 (Adminer) ou http://localhost:4100 (Metabase)"

# Simula uma mensagem recebida via Evolution API para testar o workflow do n8n
# Uso: make test-msg MSG="quero fazer um pedido" TEL=5511999999999
MSG ?= oi, quero fazer um pedido
TEL ?= 5511999999999

test-msg:
	@curl -s -X POST http://localhost:5678/webhook/whatsapp \
	  -H "Content-Type: application/json" \
	  -d '{ \
	    "event": "messages.upsert", \
	    "instance": "$(shell grep ^EVOLUTION_INSTANCE_NAME $(ENV_FILE) | cut -d= -f2)", \
	    "data": { \
	      "key": { \
	        "remoteJid": "$(TEL)@s.whatsapp.net", \
	        "fromMe": false, \
	        "id": "TESTMSG001" \
	      }, \
	      "message": { "conversation": "$(MSG)" }, \
	      "messageTimestamp": "$(shell date +%s)", \
	      "pushName": "Cliente Teste" \
	    } \
	  }' | cat
	@echo ""

# Evolution API — roda no HOST (Baileys não funciona em Docker no Mac)
# Instalar: npm install -g @evolution-api/cli
EVOLUTION_ENV = AUTHENTICATION_API_KEY=$(shell grep ^AUTHENTICATION_API_KEY $(ENV_FILE) | cut -d= -f2) \
                AUTHENTICATION_JWT_SECRET=$(shell grep ^AUTHENTICATION_JWT_SECRET $(ENV_FILE) | cut -d= -f2) \
                DATABASE_ENABLED=true \
                DATABASE_PROVIDER=postgresql \
                DATABASE_CONNECTION_URI=postgresql://$(DB_USER):$(shell grep ^POSTGRES_PASSWORD $(ENV_FILE) | cut -d= -f2)@localhost:5432/evolution \
                CACHE_REDIS_ENABLED=true \
                CACHE_REDIS_URI=redis://localhost:6379 \
                SERVER_URL=http://localhost:8080 \
                WEBHOOK_GLOBAL_URL=http://localhost:5678/webhook/whatsapp \
                WEBHOOK_GLOBAL_ENABLED=true \
                WEBHOOK_EVENTS_MESSAGES_UPSERT=true

evolution-start:
	@echo "Iniciando Evolution API no HOST (porta 8080)..."
	@$(EVOLUTION_ENV) evolution-api --port 8080 & echo $$! > /tmp/evolution.pid
	@echo "PID: $$(cat /tmp/evolution.pid)"
	@echo "Manager: http://localhost:8080/manager"

evolution-stop:
	@[ -f /tmp/evolution.pid ] && kill $$(cat /tmp/evolution.pid) && rm /tmp/evolution.pid && echo "Evolution parado" || echo "Evolution não está rodando"

evolution-logs:
	@tail -f /tmp/evolution.log 2>/dev/null || echo "Log não encontrado — use 'make evolution-start' primeiro"
