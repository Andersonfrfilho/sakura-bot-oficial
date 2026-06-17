# CLAUDE.md — sakura-bot-oficial

Template de bot de atendimento WhatsApp usando a **Meta WhatsApp Cloud API** (oficial).
Projeto irmão de `sakura-bot/` (Evolution API). Use este para produção — sem risco de ban.

## O que é este projeto

Infrastructure-as-configuration: sem código para compilar ou testar. Trabalho aqui significa editar
CSVs de dados, schemas SQL, regras de negócio em markdown, workflows n8n e configuração Docker.

Cada estabelecimento recebe sua própria cópia configurada via `infra/.env` e arquivos em `dados/`.

## Diferença fundamental em relação ao sakura-bot (Evolution)

| Aspecto | sakura-bot (Evolution) | sakura-bot-oficial (Meta) |
|---|---|---|
| Gateway WhatsApp | Evolution API (Docker, porta 8081) | Meta Cloud API (hospedado pela Meta) |
| Webhook | Evolution → n8n | Meta → n8n (HTTPS obrigatório) |
| Teste local | Possível | Requer URL pública (Railway ou ngrok) |
| Risco de ban | Alto | Zero |
| Botões interativos | Instável | Nativo e confiável |
| Mensagem format | JSON Evolution | JSON Meta Graph API |
| Envio de mensagem | POST → Evolution API | POST → graph.facebook.com |

## Arquitetura

```
WhatsApp → Meta Cloud API (hospedado pela Meta)
                  ↓ POST webhook (HTTPS obrigatório)
             n8n [:5678]  ←→  Groq (IA)
                  ↓
            PostgreSQL [:5432]
                  ↓
     ┌────────────┴────────────┐
  Chatwoot [:3010]       Directus [:8055]
  (atendente humano)     (painel admin)
```

Não há Evolution API neste projeto. O n8n recebe webhooks diretamente da Meta.

## Variáveis de ambiente Meta (em infra/.env)

```bash
WHATSAPP_ACCESS_TOKEN          # token do app Meta
WHATSAPP_PHONE_NUMBER_ID       # ID do número (não o número em si)
WHATSAPP_BUSINESS_ACCOUNT_ID   # WABA ID
WHATSAPP_WEBHOOK_VERIFY_TOKEN  # string que você define para verificação
WHATSAPP_API_VERSION           # padrão: v21.0
```

Obter em: developers.facebook.com/apps → WhatsApp → Primeiros passos

## Enviar mensagem (referência para workflows n8n)

```
POST https://graph.facebook.com/{{WHATSAPP_API_VERSION}}/{{WHATSAPP_PHONE_NUMBER_ID}}/messages
Authorization: Bearer {{WHATSAPP_ACCESS_TOKEN}}

# Texto
{ "messaging_product":"whatsapp", "to":"5511999999999",
  "type":"text", "text":{"body":"Olá!"} }

# Botões (até 3)
{ "messaging_product":"whatsapp", "to":"5511999999999",
  "type":"interactive",
  "interactive":{ "type":"button", "body":{"text":"Como posso ajudar?"},
    "action":{ "buttons":[
      {"type":"reply","reply":{"id":"cardapio","title":"Cardápio"}},
      {"type":"reply","reply":{"id":"pedido","title":"Fazer pedido"}},
      {"type":"reply","reply":{"id":"suporte","title":"Suporte"}}
    ]}}}
```

## Receber mensagem (POST da Meta no n8n)

```json
{
  "entry": [{ "changes": [{ "value": {
    "messages": [{
      "from": "5511999999999",
      "type": "text",
      "text": { "body": "Olá" }
    }]
  }}]}]
}
```

Expressões n8n:
```
Telefone : {{ $json.body.entry[0].changes[0].value.messages[0].from }}
Texto    : {{ $json.body.entry[0].changes[0].value.messages[0].text.body }}
```

O webhook também recebe GET para verificação (hub.challenge) — tratar no workflow.

## Setup

1. `make setup` → cria `infra/.env` a partir do `.env.example`
2. Preencher credenciais Meta em `infra/.env`
3. `make up` → sobe todos os serviços localmente
4. Expor n8n publicamente:
   - Dev: `ngrok http 5678`
   - Produção: `railway up` (ver `railway.toml`)
5. Registrar webhook na Meta com a URL pública

Ver [SETUP.md](SETUP.md) para passo a passo detalhado.

## Comandos

```bash
make setup      # cria infra/.env
make up         # sobe todos os serviços
make down       # para containers
make logs       # logs em tempo real
make ps         # status dos containers
make db-reset   # recria schema (destrói dados)
make test-msg   # simula mensagem: MSG="oi" TEL=5511999999999
```

## URLs após make up

- n8n: http://localhost:5678
- Directus: http://localhost:8055
- Chatwoot: http://localhost:3010
- Typebot Builder: http://localhost:3001
- Metabase: http://localhost:4100
- Adminer: http://localhost:8181

## Arquivos de dados

| Arquivo | Função | Quando editar |
|---|---|---|
| `dados/processos.md` | Contexto da IA — regras de negócio | Mudar regras, horários, preços |
| `dados/cardapio.csv` | Seed do cardápio | Adicionar/remover/reprear itens |
| `dados/faq.csv` | Seed do FAQ | Adicionar perguntas frequentes |
| `database/schema.sql` | Schema completo | Mudanças de estrutura |
| `infra/.env.example` | Template de variáveis | Adicionar novas credenciais |

## Feature flags (em .env)

| Variável | Padrão | Efeito |
|---|---|---|
| `FEATURE_DELIVERY` | `true` | Habilita fluxo de delivery |
| `FEATURE_RETIRADA` | `true` | Habilita retirada |
| `FEATURE_RESERVAS` | `false` | Habilita reservas |
| `FEATURE_PEDIDO_MESA` | `false` | Habilita pedido na mesa |
