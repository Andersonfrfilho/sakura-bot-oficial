# Fluxo de Handoff — Bot → Atendente → Bot

## Visão Geral

```
Cliente
  │
  ▼
[Evolution API]
  │
  ▼
[n8n — workflow 01]
  │
  ├── estado = 'humano'? ──► IGNORA (atendente já está respondendo)
  │
  └── estado != 'humano'
        │
        ├── pedido/reserva ──► fluxo normal do bot
        │
        └── gatilho de handoff ──► [workflow 04]
                                        │
                                        ▼
                                   Cria conversa no Chatwoot
                                   Salva chatwoot_conversa_id na sessão
                                   Muda sessoes.estado = 'humano'
                                   Envia mensagem ao cliente: "conectando..."
                                   Notifica equipe
                                        │
                                        ▼
                                   [Atendente responde no Chatwoot]
                                   Chatwoot → Evolution API → Cliente
                                        │
                                        ▼
                                   Atendente resolve conversa no Chatwoot
                                        │
                                        ▼
                                   [Chatwoot webhook → n8n workflow 11]
                                   Reseta sessoes.estado = 'inicio'
                                   Limpa chatwoot_conversa_id
                                   Envia mensagem ao cliente: "posso ajudar mais?"
                                        │
                                        ▼
                                   Bot retoma controle
```

---

## Gatilhos de Handoff (workflow 01 → workflow 04)

O workflow 01 deve chamar o 04 quando qualquer uma das condições abaixo for verdadeira:

| Condição | Como detectar |
|---|---|
| Cliente pediu atendente | Mensagem contém: "atendente", "humano", "pessoa", "falar com alguém" |
| IA com confiança baixa | Campo `confianca = 'baixa'` retornado pelo workflow 03 |
| Reclamação | Mensagem contém: "problema", "errado", "reclamação", "cancelar", "fui enganado" |
| Pedido corporativo | Total do carrinho acima de `PEDIDO_HANDOFF_ACIMA` (configurável no .env) |
| Timeout sem resolução | Cliente mandou 5+ mensagens sem avançar no fluxo |
| Solicitação de desconto | Mensagem contém: "desconto", "promoção", "mais barato" |

---

## Workflow 04 — Handoff para Humano

**Passos que o workflow deve executar:**

1. Buscar histórico da sessão em `sessoes` (carrinho, dados_temp)
2. Buscar últimas N mensagens do cliente no `perguntas_log`
3. Chamar API do Chatwoot: `POST /api/v1/accounts/{id}/conversations`
   - Incluir no campo `additional_attributes` o histórico resumido
4. Salvar o ID da conversa criada em `sessoes.chatwoot_conversa_id`
5. Atualizar `sessoes.estado = 'humano'`
6. Registrar em `perguntas_log` com `transferiu_humano = true`
7. Enviar mensagem ao cliente via Evolution API:
   > "Estou te conectando com um de nossos atendentes. Aguarde um momento! 🙏"
8. Notificar equipe (grupo interno no WhatsApp ou Telegram)

---

## Workflow 01 — Bloqueio durante atendimento humano

Ao receber qualquer mensagem, o workflow 01 deve primeiro verificar:

```
SELECT estado, chatwoot_conversa_id
FROM sessoes
WHERE telefone = $telefone_cliente
```

- Se `estado = 'humano'` → **não processar**. Encerrar o workflow.
- A mensagem chegará ao Chatwoot normalmente via Evolution API sem intervenção do bot.

---

## Workflow 11 — Retorno ao Bot

**Trigger:** Webhook do Chatwoot ao resolver/fechar conversa.

**Configuração no Chatwoot:**
- Settings → Integrations → Webhooks → Add
- URL: `http://n8n:5678/webhook/chatwoot-resolved`
- Events: marcar **Conversation Status Changed**

**Passos que o workflow deve executar:**

1. Receber payload do Chatwoot com `status = 'resolved'` e `id` da conversa
2. Buscar o telefone do cliente em `sessoes` onde `chatwoot_conversa_id = id`
3. Atualizar `sessoes`:
   - `estado = 'inicio'`
   - `carrinho = '[]'`
   - `dados_temp = '{}'`
   - `chatwoot_conversa_id = NULL`
4. Enviar mensagem ao cliente via Evolution API:
   > "Seu atendimento foi encerrado. Se precisar de mais alguma coisa, é só me chamar! 😊"

---

## Estados da Sessão

| Estado | Descrição | Quem responde |
|---|---|---|
| `inicio` | Aguardando primeira mensagem | Bot |
| `pedindo` | Cliente está montando pedido | Bot |
| `reservando` | Cliente está fazendo reserva | Bot |
| `humano` | Atendente assumiu a conversa | Atendente (Chatwoot) |

---

## Integração Chatwoot ↔ Evolution API

Para que o Chatwoot consiga enviar e receber mensagens do WhatsApp:

1. **Chatwoot** → Settings → Inboxes → Add Inbox → API Channel
2. Anotar o `Channel Access Token` gerado
3. Configurar webhook da inbox apontando para Evolution API:
   - URL: `http://evolution-api:8080/chatwoot/webhook/{instancia}`
4. Na Evolution API, configurar a integração Chatwoot:
   - `POST http://evolution-api:8080/chatwoot/set/{instancia}`
   - Body: `{ "enabled": true, "account_id": "...", "token": "...", "url": "http://chatwoot:3000" }`

---

## Mensagens Padrão (configurar no .env)

```env
MSG_HANDOFF_INICIO=Estou te conectando com um atendente. Aguarde um momento!
MSG_HANDOFF_RETORNO=Atendimento encerrado. Posso ajudar com mais alguma coisa?
MSG_HANDOFF_FILA=Todos os atendentes estão ocupados. Retornaremos em breve!
```
