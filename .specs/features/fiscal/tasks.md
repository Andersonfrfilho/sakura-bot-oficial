# Módulo Fiscal — Tasks (Revisão 2026-07, orientado a execução via opencode)

Cada task é auto-contida: **contexto**, **arquivos**, **critério de aceite**, **verificação**.
Estado da lib: `@adatechnology/fiscal-provider` já integrada (direto SEFAZ). Ver `design.md`.

Legenda: ✅ feito · ⬜ a fazer · 🔗 depende de.

---

## ✅ Já implementado (não refazer — apenas revisar no diff)
- Schemas `fiscal_configurations`, `fiscal_documents`; enums `fiscal_model`, `fiscal_document_status`.
- NCM/CFOP/CST por categoria + `buildFiscalItems`.
- Use-cases: Emit (in-process), Cancel, Get, Retry, RetryPending, TestConnection, UpsertConfig.
- FiscalController + FiscalRoutes (emit, getByOrder, list, cancel, downloadXml, getPdfUrl, config, test, retry, retryPending).
- Eventos WS `fiscal:emitting|authorized|rejected|cancelled`.

---

## Sprint A — Infra de fila + criptografia (fundação)

### FISCAL-A1 ✅ SecretCipher (AES-256-GCM)
- **Arquivos**: `apps/api/src/infra/crypto/SecretCipher.ts`, `SecretCipher.test.ts`.
- **Aceite**: `encrypt(x)` → `iv.tag.ct` base64; `decrypt(encrypt(x))===x`; erro claro se `APP_SECRET` ausente. ✔
- **Verificação**: `bun test src/infra/crypto/SecretCipher.test.ts` → 6/6 pass; `tsc --noEmit` limpo. ✔
- **Review**: opencode(qwen3.7-max) implementou; 2 agentes revisaram; aplicado hardening (validação de tamanho de IV/authTag). Salt estático e scrypt default aceitos p/ segredo único.
- **Pendente env**: adicionar `APP_SECRET` ao schema de env acontece junto de FISCAL-A3 (consumo real).

### FISCAL-A2a ✅ Conexão Redis dedicada + Queue BullMQ
- 🔗 —
- **Arquivos**: `infra/queue/redisConnection.ts`, `QueueNames.constant.ts`, `fiscalQueue.ts`. Dep `bullmq@5.80.2`.
- **Aceite**: `ioredis` dedicado `maxRetriesPerRequest:null`; `Queue<FiscalJobData,unknown,FiscalJobName>` tipada; `defaultJobOptions` com retenção limitada (sucesso 7d/2000, falha 30d/2000), `attempts:5`, backoff expo 5s. ✔
- **Verificação**: `tsc --noEmit` limpo; smoke import → `fiscalQueue.name === 'fiscal'`. ✔
- **Review**: 1 agente (config-only) → typou a Queue genericamente (enforça nome/data do job), add `FiscalSweepJobData`, cast simplificado.

### FISCAL-A2b ⬜ Bull Board (observabilidade) — DEFERIDO
- 🔗 FISCAL-A2a
- **Motivo do split**: a API usa **uWebSockets.js**, sem adapter oficial de Bull Board. Solução: mini-Express em porta própria, basic auth por env. Não bloqueia B1/B2.
- **Arquivos**: `infra/queue/bullBoard.ts` (+ `express`, `@bull-board/api`, `@bull-board/express`).

### FISCAL-A3 ✅ Criptografar certificado no UpsertFiscalConfig
- 🔗 FISCAL-A1
- **Arquivos**: novo `application/FiscalConfigCrypto.ts` (+test); `UpsertFiscalConfigUseCase.ts`; decrypt em Emit/Retry/Cancel/TestConnection.
- **Aceite**: sensíveis (`certificadoBase64/Senha`, `cscToken`, `activationCode`, `signatureAC`) cifrados com sentinela `enc:v1:`; legado texto-plano passa direto; sem dupla-cifra; provider decifra no build. ✔
- **Verificação**: `bun test FiscalConfigCrypto.test.ts` → 6/6; typecheck sem erro novo. ✔
- **Review**: opencode implementou; 2 agentes acharam CRITICAL (reenvio de `***mascarado` sobrescrevia cert) → corrigido em `mergeProviderConfig` (pula `***`); rename `pc`→`providerConfigDecrypted`.
- **⚠️ Follow-up (DRY, rule 16)**: `buildProviderConfig` está duplicado em Emit/Retry/Cancel/Test. Extrair um `buildFiscalProviderConfig(config)` compartilhado — fica para **FISCAL-B2** (quando a lógica de emissão migra pro worker).
- **Pendente**: GET config retornar `hasCertificate` em vez de `***last4` fica para **FISCAL-E3** (UI de config).

---

## Sprint B — Worker + resiliência offline

### FISCAL-B1 ✅ Emit assíncrono (refactor + service)
- 🔗 FISCAL-A2a
- **Arquivos**: novo `FiscalEmissionService.ts` (lógica de emissão centralizada — resolve o DRY da A3); `EmitFiscalDocumentUseCase` agora só valida, cria `pending`, publica emitting e `fiscalQueue.add(EMIT)`.
- **Aceite**: Emit não chama SEFAZ no request; job enfileirado. ✔ (typecheck)
- **Verificação latência/Bull Board**: ⏳ pendente (precisa Redis via `make up`).

### FISCAL-B2 ✅ FiscalEmissionProcessor (worker) + Retry unificado
- 🔗 FISCAL-B1, FISCAL-A3
- **Arquivos**: `application/workers/FiscalEmissionProcessor.ts`; worker instanciado no container sob `FISCAL_WORKER_ENABLED`; SIGTERM/SIGINT no `server.ts` fecha o worker; `RetryFiscalDocumentUseCase` reescrito p/ reenfileirar (−200 linhas de duplicação).
- **Aceite (hardening pós-review de 2 agentes)**:
  - **claim atômico** `UPDATE ... WHERE status='pending'` → exclusão mútua real (sem double-emit em jobs duplicados/concorrência 2).
  - `attemptCount` incrementado com `sql` (atômico, sem lost-update).
  - erro transitório → reset p/ `pending` + throw (re-claima no próximo attempt; nunca fica preso em `emitting`); **sem** WS REJECTED enganoso.
  - esgotou tentativas → `failed`-listener marca `rejected` (RETRIES_EXHAUSTED) + WS.
  - rejeição fatal SEFAZ → `rejected` sem throw (não auto-retenta).
- **Verificação**: `tsc` limpo; lógica CAS revisada. ⏳ **teste ao vivo do worker pendente** (subir Redis: `make up`, então `FISCAL_WORKER_ENABLED=true`, emitir e observar pending→emitting→authorized).
- **⚠️ Follow-ups anotados**: (a) graceful shutdown amplo (uWS listen socket + pool pg + Redis) — hoje só o worker é drenado (antes não havia shutdown algum); (b) checagem `config inativa` triplicada — extrair helper.

### FISCAL-B3 ✅ FiscalSweeper (repeatable job offline) — versão SEGURA
- 🔗 FISCAL-B2
- **Arquivos**: `application/workers/FiscalSweeper.ts`; repeatable job (`FISCAL_SWEEP_INTERVAL_MS`, default 120s); processor trata `SWEEP`; serviço/listener preservam o código de erro real (`extractFiscalErrorCode`).
- **Aceite (revisado por agente — evita NOTA DUPLICADA)**:
  - reenfileira `pending` (nunca enviados) + `rejected` cujo erro é **de conexão** (pré-envio, `SAFE_TO_REEMIT_CODES`) → seguro, sem duplicar.
  - `emitting` preso (crash) → **não** reemite; marca `rejected/NEEDS_REVIEW` (revisão humana) pois pode ter chegado à SEFAZ.
  - **timeout** ambíguo e rejeição fatal SEFAZ → **não** varridos.
  - `orderBy createdAt asc` + `limit 100` (sem starvation); idempotência pelo claim atômico.
- **Verificação**: `tsc` limpo. ⏳ ao vivo pendente (Redis).
- **🚨 GATE DE PRODUÇÃO**: auto-recuperação de casos ambíguos (timeout após a SEFAZ receber) exige **consulta SEFAZ** (por chave/protocolo) antes de reemitir — precisa de suporte na lib. Documentado.

---

## Sprint C — Toggle por-pedido + gatilho configurável

### FISCAL-C1 ✅ Schema toggle + trigger
- **Arquivos**: `schema/orders.ts` (+`fiscal_enabled bool default true`); `schema/fiscal-configurations.ts` (+`emit_trigger` default 'on_payment', +`email_provider` default 'resend'); migration `0004_damp_nightshade.sql`.
- **Aceite**: `drizzle-kit generate` OK; migration = 3 ALTER TABLE ADD COLUMN. ✔ typecheck limpo.
- **Verificação push**: ⏳ pendente (Postgres via `make up`).

### FISCAL-C2 ✅ Gatilho automático no pagamento/conclusão
- 🔗 FISCAL-C1, FISCAL-B1
- **Arquivos**: novo `TriggerFiscalEmissionUseCase.ts` + `FiscalEmissionEnqueue.ts` (helper DRY compartilhado c/ Emit); wiring em `AddCashMovementUseCase` (pagamento) e `UpdateOrderStatusUseCase` (completed); container injeta o trigger; migration `0005` (UNIQUE order_id).
- **Aceite**: dispara só se `order.fiscalEnabled && config.active && config.emitTrigger === evento`; `manual` nunca auto-dispara; **fire-and-forget** (não bloqueia caixa/pedido); nunca duplica. ✔
- **Hardening pós-review**: **UNIQUE(order_id)** em fiscal_documents (mata race SELECT-then-INSERT → nota duplicada); `on_payment` só dispara quando **pago integralmente** (soma dos movimentos ≥ total), não no 1º pagamento parcial.
- **Verificação**: `tsc` — arquivos tocados zero erros (erro em CashierController é pré-existente). ⏳ ao vivo pendente.
- **Follow-up**: manual `EmitFiscalDocumentUseCase` hoje NÃO checa `fiscalEnabled` (override explícito do operador — decisão de design); logging estruturado no lugar de console.error.

---

## Sprint D — Envio ao cliente

### FISCAL-D1 ⬜ FiscalDeliveryProvider (interface) + Resend + SMTP
- **Arquivos**: `providers/FiscalDeliveryProvider.interface.ts`, `ResendDeliveryProvider.ts`, `SmtpDeliveryProvider.ts`. Instalar `resend`, `nodemailer`.
- **Aceite**: envia PDF/XML/link; escolha por `config.email_provider`; falha registra erro sem invalidar nota.
- **Verificação**: teste com provider mock; envio real opcional em homologação.

### FISCAL-D2 ⬜ WhatsappN8nDeliveryProvider + DeliverFiscalDocumentUseCase
- 🔗 FISCAL-D1, FISCAL-B2
- **Arquivos**: `WhatsappN8nDeliveryProvider.ts`, `DeliverFiscalDocumentUseCase.ts`; job 'deliver'.
- **Aceite**: envia cupom+link via webhook n8n (`N8N_FISCAL_WEBHOOK_URL`); grava `deliveryStatus`.
- **Verificação**: job 'deliver' processa após authorized.

### FISCAL-D3 🟡 Página pública do cliente (token HMAC) — BACKEND ✅ / frontend ⬜
- 🔗 FISCAL-B2
- **Backend ✅**: `FiscalPublicToken.ts` (HMAC-SHA256 create/verify, constant-time, `FISCAL_PUBLIC_TOKEN_SECRET`) + `GET /public/fiscal/:token` (metadata) e `/xml` (download), sem auth. `findByIdPublic` (sem escopo). 5 testes do token. ✔
- **Hardening pós-review**: só expõe docs `authorized`; **metadata sem o XML** (XML só no endpoint explícito — evita vazar CNPJ/IE/CPF em toda carga); guarda UUID (evita 500). Não vaza establishmentId/erros.
- **Falta**: `apps/web/src/pages/public/CustomerInvoicePage.tsx` (rota pública, PWA-first, QR/chave/downloads) + geração do link (usado no envio D2).
- **Verificação**: `tsc` limpo, token 5/5. ⏳ E2E ao vivo pendente.

---

## Sprint E — Dashboard fiscal + impressão

### FISCAL-E1 ✅ Menu "Notas Fiscais" (dashboard) — listagem com status
- **Arquivos**: `apps/web/src/pages/fiscal/FiscalDocumentsPage.tsx`; rota `/fiscal` em `App.tsx` (RoleGuard admin/manager/cashier); item em `constants/navigation.ts`.
- **Aceite**: tabela responsiva (zebra) de notas vinculadas a pedidos; badge de status colorido (pending/emitting/authorized/rejected/cancelled); **tempo real via WS** (`fiscal:*` invalida a query); filtro multi-status + busca por chave/nº + limpar; ações por status: PDF, XML (download autenticado), Cancelar (justificativa ≥15), Reprocessar. ✔
- **Verificação**: `tsc --noEmit` limpo. ⏳ render ao vivo pendente (precisa stack `make up`).
- **Review**: 1 agente → corrigido **bug real** (download XML sem header de auth → agora fetch+blob autenticado), `disabled` no cancelar, `aria-label`, `onError` nas mutations.
- **⚠️ Follow-up (enhancement web.md §7)**: data-table rico — headers ordenáveis, seleção múltipla/ações em lote, estado na URL. Hoje é lista funcional com filtro local.
- **Nota**: opencode travou 2× nesta task (multi-arquivo e single-file) → página escrita diretamente; wiring à mão.

### FISCAL-E2 ⬜ Cupom fiscal + impressão ESC/POS
- 🔗 FISCAL-B2
- **Arquivos**: `providers/ThermalPrinterProvider.ts` (instalar `node-thermal-printer`); endpoint `POST /orders/:id/fiscal-document/print`; botão no dashboard.
- **Aceite**: gera cupom (DANFCe já vem da lib) com QR/chave; imprime via TCP/USB.
- **Verificação**: endpoint retorna 200; impressão simulada/loga ESC/POS.

### FISCAL-E3 ⬜ Toggle "Emitir NF" no CreateOrderModal + config Settings
- 🔗 FISCAL-C1
- **Arquivos**: `CreateOrderModal.tsx`, `FiscalSettingsPage.tsx`.
- **Aceite**: checkbox default = config; Settings expõe `emit_trigger`, `email_provider`, upload de certificado (mostra só `hasCertificate`).
- **Verificação**: criar pedido sem NF não gera doc; upload de cert persiste cifrado.

---

## Ordem de execução (dependências)
```
A1 ─┬─ A3 ─┐
A2 ─┴─ B1 ─┴─ B2 ─┬─ B3
                  ├─ D2 ── (D1)
                  ├─ D3
                  └─ E2
C1 ─ C2 (após B1)
C1 ─ E3
E1 (após B-series p/ dados reais)
```

## Protocolo por task (Claude + opencode + review)
1. Claude passa a task ao opencode: `opencode run "<task>" --dangerously-skip-permissions -c`.
2. 2 agentes de review analisam o diff (correção + aderência às regras Ada).
3. Claude roda `bun run check` + testes e valida o critério; corrige/reprocessa se falhar.
4. Marca ✅ e segue a próxima respeitando dependências.
