# Workflows n8n

Importe os arquivos `.json` desta pasta diretamente no n8n (Menu → Import Workflow).

Ative somente os workflows correspondentes às features habilitadas no `.env`.

> **Importante — n8n 2.x:** Code nodes rodam em sandbox isolado onde `process.env` não está disponível. Todas as variáveis de runtime (API keys, flags de feature, configurações de horário) são lidas da tabela `configuracoes` no banco de dados. Para alterar qualquer configuração, use o Directus (`http://localhost:8055`) ou Adminer (`http://localhost:8181`) — a mudança entra na próxima mensagem, sem restart.

## Workflows

| Arquivo | Descrição | Trigger | Feature |
|---|---|---|---|
| `01-receber-mensagem.json` | Recebe webhook da Evolution API e roteia para o fluxo correto | Webhook | sempre ativo |
| `02-fluxo-pedido.json` | Coleta itens, endereço e pagamento | Chamado pelo 01 | `FEATURE_DELIVERY` ou `FEATURE_PEDIDO_MESA` |
| `03-ia-duvidas.json` | Envia pergunta ao Groq com contexto do estabelecimento | Chamado pelo 01 | sempre ativo |
| `04-handoff-humano.json` | Cria conversa no Chatwoot e notifica equipe | Chamado pelo 03 | sempre ativo |
| `05-confirmar-pedido.json` | Salva pedido no banco e notifica equipe | Chamado pelo 02 | `FEATURE_DELIVERY` ou `FEATURE_PEDIDO_MESA` |
| `06-relatorio-semanal.json` | Analisa perguntas_log e envia resumo ao admin | Cron: toda segunda 8h | sempre ativo |
| `07-status-pedido.json` | Atualiza status do pedido e notifica cliente | Webhook | `FEATURE_DELIVERY` |
| `08-fluxo-reserva.json` | Coleta data, hora e nº de pessoas para reserva | Chamado pelo 01 | `FEATURE_RESERVAS` |
| `09-confirmar-reserva.json` | Salva reserva no banco e envia confirmação | Chamado pelo 08 | `FEATURE_RESERVAS` |
| `10-lembrete-reserva.json` | Envia lembrete ao cliente 2h antes da reserva | Cron: a cada hora | `FEATURE_RESERVAS` |
| `11-retorno-bot.json` | Detecta conversa resolvida no Chatwoot e devolve controle ao bot | Webhook Chatwoot | sempre ativo |

## Roteamento no workflow 01

O workflow principal decide o caminho com base na mensagem recebida e no estado da sessão:

```
mensagem recebida
  ├── sessão em andamento?  → continua o fluxo ativo (pedido / reserva)
  ├── palavra-chave pedido  → chama 02-fluxo-pedido
  ├── palavra-chave reserva → chama 08-fluxo-reserva  (se FEATURE_RESERVAS=true)
  ├── palavra-chave humano  → chama 04-handoff-humano
  └── livre                 → chama 03-ia-duvidas
```

## Cálculo de tempo de entrega (workflow 02)

O workflow usa dois serviços gratuitos em sequência:

### 1. Geocoding — Nominatim (sem API key)
Converte o endereço do cliente em coordenadas lat/lng:
```
GET https://nominatim.openstreetmap.org/search
  ?q={endereco_completo}
  &format=json
  &limit=1
  &countrycodes=br

Resposta → [{ "lat": "-23.561", "lon": "-46.656" }]
```

### 2. Validação de raio — PostgreSQL
Antes de chamar o OSRM, verifica se o endereço está dentro do limite de atendimento:
```sql
SELECT calcular_distancia_km(
  {lat_cliente}, {lng_cliente},
  {ESTABELECIMENTO_LAT}, {ESTABELECIMENTO_LNG}
) AS distancia_km
```
Se `distancia_km > RAIO_MAXIMO_KM` → informa que não atende a região.

### 3. Tempo de rota — OSRM (sem API key)
Calcula a duração real da rota de carro:
```
GET http://router.project-osrm.org/route/v1/driving/{lng_loja},{lat_loja};{lng_cliente},{lat_cliente}
  ?overview=false

Resposta → { "routes": [{ "duration": 1020, "distance": 5234 }] }
           duration em segundos, distance em metros
```

### 4. Tempo total estimado
```
tempo_rota_min  = ceil(duration / 60)
tempo_total_min = TEMPO_PREPARO_MIN + tempo_rota_min
```
Mensagem ao cliente: *"Seu pedido chega em aproximadamente {tempo_total_min} minutos!"*

### 5. Taxa de entrega
```
SE subtotal >= FRETE_GRATIS_ACIMA → taxa = 0
SENÃO → taxa = TAXA_ENTREGA (valor fixo do .env)
```

---

## Palavras-chave sugeridas para roteamento

Ajuste no workflow 01 conforme o tipo de estabelecimento:

| Intenção | Exemplos de palavras-chave |
|---|---|
| Fazer pedido | pedido, quero, cardápio, menu, pedir, delivery, retirar |
| Reservar mesa | reserva, reservar, mesa, lugar, jantar, almoço, data |
| Falar com humano | atendente, humano, pessoa, ajuda, problema, reclamação |
