# sakura-bot-oficial

Bot de atendimento WhatsApp usando a **API oficial da Meta (WhatsApp Cloud API)**. Versão sem risco de ban, com suporte nativo a botões interativos, menus, catálogos e WhatsApp Flows.

> Projeto irmão de [sakura-bot](https://github.com/Andersonfrfilho/sakura-bot) (Evolution API). Use este para produção.

---

## Por que a API oficial?

| | Evolution API (não-oficial) | Meta Cloud API (oficial) |
|---|---|---|
| Risco de ban | Alto | Zero |
| Botões / Menus | Instável | Nativo |
| WhatsApp Flows | Não | Sim |
| Catálogo de produtos | Não | Sim |
| Templates outbound | Não | Sim |
| Reconexão QR | Periódica | Não precisa |
| Webhook confiável | Depende do host | Garantido pela Meta |

### Tipos de mensagens interativas disponíveis

**Reply Buttons** — até 3 botões de resposta rápida
```
┌─────────────────────────┐
│ Como posso te ajudar?   │
├──────────┬──────────────┤
│ Cardápio │ Fazer pedido │  Suporte
└──────────┴──────────────┘
```

**List Message** — menu com até 10 opções em seções
```
┌─────────────────────────┐
│ Escolha uma opção       │
│        [Ver opções ▼]   │
└─────────────────────────┘
```

**WhatsApp Flows** — formulários nativos (endereço, agendamento, pagamento) sem sair do WhatsApp.

---

## Pré-requisitos

- Docker + Docker Compose
- Conta Meta for Developers com app WhatsApp configurado
- URL pública HTTPS para o webhook (Railway, Fly.io ou ngrok para dev)

> Veja o [SETUP.md](SETUP.md) para o passo a passo completo.

---

## Setup rápido

```bash
# 1. Clone e configure
git clone https://github.com/Andersonfrfilho/sakura-bot-oficial
cd sakura-bot-oficial
make setup           # cria infra/.env a partir do exemplo

# 2. Preencha infra/.env com suas credenciais Meta
# WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, etc.

# 3. Suba os serviços
make up

# 4. Exponha o n8n publicamente (dev)
ngrok http 5678
# URL gerada: https://abc123.ngrok.io

# 5. Registre o webhook na Meta
# URL: https://abc123.ngrok.io/webhook/whatsapp
# Verify token: (o que você definiu em WHATSAPP_WEBHOOK_VERIFY_TOKEN)
```

---

## Arquitetura

```
WhatsApp → Meta Cloud API (hospedado pela Meta)
                  ↓ POST webhook (HTTPS obrigatório)
             n8n [:5678]  ←→  Groq (IA Llama 3)
                  ↓
            PostgreSQL [:5432]
                  ↓
     ┌────────────┴────────────┐
  Chatwoot [:3010]       Directus [:8055]
  (atendente humano)     (painel admin)
```

**n8n** recebe os webhooks da Meta, roteia mensagens e chama a Graph API para enviar respostas. Não há Evolution API neste projeto.

---

## Variáveis de ambiente obrigatórias

```bash
# WhatsApp Cloud API (Meta)
WHATSAPP_ACCESS_TOKEN=EAAxx...       # token do app
WHATSAPP_PHONE_NUMBER_ID=112905...   # ID do número (não o número em si)
WHATSAPP_BUSINESS_ACCOUNT_ID=133...  # WABA ID
WHATSAPP_WEBHOOK_VERIFY_TOKEN=...    # string que você define
WHATSAPP_API_VERSION=v21.0
```

---

## Enviar mensagem via Graph API (referência n8n)

```
POST https://graph.facebook.com/v21.0/{{PHONE_NUMBER_ID}}/messages
Authorization: Bearer {{ACCESS_TOKEN}}

# Texto simples
{ "messaging_product": "whatsapp", "to": "5511999999999",
  "type": "text", "text": { "body": "Olá!" } }

# Botões interativos
{ "messaging_product": "whatsapp", "to": "5511999999999",
  "type": "interactive",
  "interactive": {
    "type": "button",
    "body": { "text": "Como posso te ajudar?" },
    "action": {
      "buttons": [
        { "type": "reply", "reply": { "id": "cardapio", "title": "Cardápio" } },
        { "type": "reply", "reply": { "id": "pedido",   "title": "Fazer pedido" } },
        { "type": "reply", "reply": { "id": "suporte",  "title": "Suporte" } }
      ]
    }
  }
}

# Menu lista
{ "messaging_product": "whatsapp", "to": "5511999999999",
  "type": "interactive",
  "interactive": {
    "type": "list",
    "body": { "text": "Escolha uma opção" },
    "action": {
      "button": "Ver opções",
      "sections": [{
        "title": "Menu principal",
        "rows": [
          { "id": "opt1", "title": "Cardápio completo" },
          { "id": "opt2", "title": "Fazer pedido" },
          { "id": "opt3", "title": "Status do pedido" },
          { "id": "opt4", "title": "Falar com atendente" }
        ]
      }]
    }
  }
}
```

---

## URLs após `make up`

| Serviço | URL |
|---|---|
| n8n | http://localhost:5678 |
| Directus | http://localhost:8055 |
| Chatwoot | http://localhost:3010 |
| Metabase | http://localhost:4100 |
| Adminer | http://localhost:8181 |

---

## Comandos

```bash
make help       # lista todos os comandos
make up         # sobe os containers
make down       # para os containers
make logs       # logs em tempo real
make ps         # status dos containers
make db-reset   # recria schema (apaga dados)
make test-msg   # simula mensagem: MSG="oi" TEL=5511999999999
```
