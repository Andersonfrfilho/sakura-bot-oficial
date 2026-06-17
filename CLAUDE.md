# CLAUDE.md — sakura-bot-oficial

This is the **official Meta WhatsApp Cloud API** variant of the sakura-bot.
The sister project `sakura-bot/` uses Evolution API (unofficial). This project uses the Meta Graph API directly for greater reliability and compliance.

**Client**: AdA Technology
**WhatsApp number**: +55 16 99170-7267
**Meta App ID**: 1017474297938142

## What This Project Is

A WhatsApp automation bot for any type of establishment. Infrastructure and configuration project — no application code to compile or test. Work here means editing CSV data, SQL schemas, markdown operational rules, n8n workflow JSONs, and Docker Compose configuration.

## Key Difference from sakura-bot/

| Aspect | sakura-bot (Evolution) | sakura-bot-oficial (Meta) |
|---|---|---|
| WhatsApp gateway | Evolution API (Docker, porta 8081) | Meta Cloud API (hosted by Meta) |
| Webhook source | Evolution → n8n | Meta Graph API → n8n (HTTPS required) |
| Local testing | Possible | Needs public URL (ngrok or Railway) |
| Stability | Risk of ban | Official, no ban risk |
| Message format | Evolution JSON | Meta Graph API JSON |
| Send messages | POST to Evolution API | POST to graph.facebook.com |

## Architecture

```
WhatsApp → Meta Cloud API (hosted by Meta)
                ↓ POST webhook (HTTPS obrigatório)
           n8n [DOCKER:5678 or Railway]
                ↓
           PostgreSQL [DOCKER:5432]
                ↓
     ┌──────────┴──────────┐
  Typebot              Chatwoot
(bot flows)        (human agents)
```

### Meta Cloud API credentials (in infra/.env)
- `WHATSAPP_ACCESS_TOKEN` — token do app (Meta Business Suite)
- `WHATSAPP_PHONE_NUMBER_ID` — ID do número: 1129051206965973
- `WHATSAPP_BUSINESS_ACCOUNT_ID` — WABA ID: 1331187315501590
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` — token de verificação do webhook (definido por nós)
- `WHATSAPP_API_VERSION` — versão da Graph API (padrão: v21.0)

### Sending messages (n8n HTTP Request node)
```
POST https://graph.facebook.com/v21.0/{{WHATSAPP_PHONE_NUMBER_ID}}/messages
Authorization: Bearer {{WHATSAPP_ACCESS_TOKEN}}
Content-Type: application/json

{
  "messaging_product": "whatsapp",
  "to": "5511999999999",
  "type": "text",
  "text": { "body": "Sua mensagem aqui" }
}
```

### Receiving messages (n8n Webhook node)
Meta sends two types of requests to the webhook URL:

**GET** (verification, one-time): respond with `hub.challenge`
```
GET /webhook/whatsapp?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=XYZ
→ Response: XYZ (just the challenge value)
```

**POST** (incoming message):
```json
{
  "entry": [{
    "changes": [{
      "value": {
        "messages": [{
          "from": "5516991707267",
          "text": { "body": "Olá" },
          "type": "text",
          "timestamp": "1234567890"
        }]
      }
    }]
  }]
}
```

## Setup

1. `make setup` — cria `infra/.env` a partir do exemplo
2. `make up` — sobe todos os serviços
3. Exponha o n8n publicamente:
   - **Desenvolvimento**: `ngrok http 5678` → use a URL gerada
   - **Produção**: Railway/Fly.io com deploy via GitHub
4. No Meta Developer Console → Webhooks → configure URL: `https://SEU_HOST/webhook/whatsapp`
5. Importe os workflows n8n de `n8n/workflows/`

## Common Commands

```bash
make setup      # cria infra/.env a partir do exemplo
make up         # sobe todos os serviços
make down       # para containers
make logs       # acompanha logs em tempo real
make ps         # status dos containers
make db-reset   # recria o schema do app no banco (destrói dados)
make test-msg   # simula mensagem WhatsApp no n8n (MSG="texto" TEL=número)
```

### Service URLs after startup:
- **n8n** (workflow orchestrator): http://localhost:5678
- **Directus** (admin panel): http://localhost:8055
- **Chatwoot** (human agents): http://localhost:3010
- **Typebot Builder** (chatbot flows): http://localhost:3001
- **Metabase** (dashboards): http://localhost:4100
- **Adminer** (DB browser): http://localhost:8181

## n8n Webhook — Critical Setup

The webhook node in n8n must handle **both** GET and POST from Meta:

```
Webhook URL registrado na Meta:
  https://SEU_HOST/webhook/whatsapp

GET  → verifica hub.verify_token e responde com hub.challenge
POST → processa mensagem recebida
```

No modo desenvolvimento, use ngrok:
```bash
ngrok http 5678
# URL gerada ex: https://abc123.ngrok.io
# Registrar na Meta: https://abc123.ngrok.io/webhook/whatsapp
```

## Key Data Files

| File | Purpose | When to edit |
|---|---|---|
| `dados/processos.md` | AI system context — business rules | Change operating rules |
| `dados/cardapio.csv` | Menu seed data for `cardapio` table | Add/remove/reprice items |
| `dados/faq.csv` | FAQ seed data for `faq` table | Add new questions |
| `database/schema.sql` | Full schema — run once | Schema changes |
| `infra/.env.example` | Env var template — never commit real `.env` | Add new credentials |

## Feature Flags (in `.env`)

| Variable | Default | Effect |
|---|---|---|
| `FEATURE_DELIVERY` | `false` | Enables delivery order flow |
| `FEATURE_RETIRADA` | `false` | Enables takeout option |
| `FEATURE_RESERVAS` | `false` | Enables table reservation flow |
| `FEATURE_PEDIDO_MESA` | `false` | Enables dine-in WhatsApp ordering |

## Handoff Rules (in `dados/processos.md`)

The AI must transfer to a human agent when:
- Quality complaint, wrong or lost order
- Customer explicitly asks for human
- Severe allergy concern
- Corporate order above R$300
- Confidence is low
