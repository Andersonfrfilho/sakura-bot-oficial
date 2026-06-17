# Sakura Bot — Automação de Atendimento via WhatsApp

Bot de atendimento para qualquer tipo de estabelecimento (restaurante, barbearia, clínica, loja, etc.) via WhatsApp. Fluxo completo de pedidos com entrega ou retirada, reservas de mesa, histórico de pedidos, notificações automáticas de status e handoff para atendente humano.

---

## Setup em 3 comandos

```bash
make setup   # cria infra/.env a partir do exemplo
# edite infra/.env com suas credenciais
make all     # sobe tudo + configura automaticamente
```

Após `make all`, o único passo manual é escanear o QR code do WhatsApp em `http://localhost:8081/manager`.

> Para deploy em produção (nuvem, domínio, HTTPS), veja [DEPLOY.md](DEPLOY.md).

---

## O que está automatizado no `make all`

| O que | Como |
|---|---|
| Schema do banco | Montado via `database/schema.sql` no Docker init |
| Cardápio, FAQ | `make db-seed` importa os CSVs de `dados/` |
| n8n — owner + workflows | `make n8n-import` cria conta, credencial Postgres e ativa todos os workflows |
| Directus — admin | Criado pelas env vars `DIRECTUS_ADMIN_EMAIL` / `ADMIN_PASSWORD` |
| Chatwoot — admin + inbox | `make chatwoot-init` via Rails runner, salva tokens no banco |

---

## Arquitetura

```
WhatsApp → Evolution API [:8081]
                ↓ webhook
             n8n [:5678]  ←→  Groq (IA Llama 3)
                ↓
          PostgreSQL [:5432]
                ↓
     ┌──────────┴───────────┐
  Chatwoot [:3010]    Directus [:8055]
  (atendente humano)  (painel admin)
```

**Roteamento de mensagens** (tudo em `n8n/workflows/01-receber-mensagem.json`):

| Condição | Destino |
|---|---|
| Opções do menu (1–6) | Handler direto no workflow |
| Conversa de pedido | Máquina de estados (carrinho → endereço → pagamento → confirmação) |
| Pergunta livre | Groq (Llama 3) com contexto de `dados/processos.md` + FAQ do banco |
| Opção 4 — "Falar com atendente" | Cria conversa no Chatwoot + notifica agente via WhatsApp |
| Estado `human_handoff` | Pausa o bot até o cliente digitar "sair" |

---

## Workflows n8n

| Arquivo | Função | Ativo |
|---|---|---|
| `01-receber-mensagem.json` | Recebe webhook, roteia, responde | Sempre |
| `02-limpar-sessoes.json` | Limpa sessões expiradas (cron) | Sempre |
| `03-promocoes.json` | Envio de promoções agendadas | Opcional |
| `04-lembrete-pedido.json` | Lembra cliente de pedido em aberto | Opcional |
| `05-lembrete-reserva.json` | Lembra cliente de reserva | Se `FEATURE_RESERVAS=true` |
| `06-notificar-status.json` | Notifica cliente ao mudar status do pedido | Se `FEATURE_STATUS_NOTIFICATIONS=true` |

---

## Estrutura do projeto

```
sakura-bot/
├── dados/
│   ├── categorias.csv     ← Categorias do cardápio
│   ├── produtos.csv       ← Produtos/serviços
│   ├── faq.csv            ← Perguntas e respostas
│   └── processos.md       ← Regras de negócio (contexto da IA)
├── database/
│   ├── init.sql           ← Cria bancos auxiliares (n8n, chatwoot, etc.)
│   └── schema.sql         ← Schema completo da aplicação
├── infra/
│   ├── docker-compose.yml ← Todos os serviços
│   └── .env.example       ← Template de variáveis de ambiente
├── n8n/workflows/         ← Workflows exportados
├── scripts/
│   ├── seed-db.sh         ← Importa CSVs para o banco
│   └── import-workflows.sh← Importa e ativa workflows no n8n
├── tests/                 ← Testes de parsing e validação de workflow
├── DEPLOY.md              ← Guia de deploy em produção (custos, nuvem, passos)
└── Makefile               ← Interface principal
```

---

## Comandos disponíveis

```bash
make help          # lista todos os comandos
make all           # primeira execução completa
make up            # sobe os containers
make down          # para os containers
make restart       # reinicia os containers
make logs          # logs em tempo real
make ps            # status dos containers
make init          # reconfigura sem recriar containers
make db-reset      # recria schema (apaga dados)
make test-msg      # simula mensagem: MSG="oi" TEL=5511999999999
make test-order    # insere pedido de teste no banco
make test          # roda testes de parsing + validação de workflow
```

---

## URLs após `make up`

| Serviço | URL | Uso |
|---|---|---|
| Evolution API | http://localhost:8081 | Gateway WhatsApp + QR code |
| n8n | http://localhost:5678 | Workflows |
| Directus | http://localhost:8055 | Painel admin (cardápio, config) |
| Chatwoot | http://localhost:3010 | Atendimento humano |
| Metabase | http://localhost:4100 | Dashboards e relatórios |
| Adminer | http://localhost:8181 | Banco de dados |

---

## Feature flags

| Variável | Padrão | Efeito |
|---|---|---|
| `FEATURE_DELIVERY` | `true` | Habilita fluxo de delivery |
| `FEATURE_RETIRADA` | `true` | Habilita opção de retirada |
| `FEATURE_RESERVAS` | `false` | Habilita reservas de mesa |
| `FEATURE_PEDIDO_MESA` | `false` | Habilita pedido pelo WhatsApp para mesas |
| `FEATURE_STATUS_NOTIFICATIONS` | `true` | Notifica cliente via WhatsApp ao mudar status do pedido |

---

## Personalizar para um novo estabelecimento

1. `make setup` — cria o `.env`
2. Preencha `infra/.env` com nome, telefone, horários e chaves
3. Edite `dados/produtos.csv` com os produtos/serviços reais
4. Edite `dados/processos.md` com as regras do negócio
5. `make all` — sobe e configura tudo
6. Escaneie o QR code em `http://localhost:8081/manager`
