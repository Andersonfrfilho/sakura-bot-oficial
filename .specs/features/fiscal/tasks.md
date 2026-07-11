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

### FISCAL-B1 ⬜ EnqueueFiscalEmissionUseCase (refactor do Emit)
- 🔗 FISCAL-A2
- **Arquivos**: novo `EnqueueFiscalEmissionUseCase.ts`; ajustar `EmitFiscalDocumentUseCase` p/ só criar `pending` + `fiscalQueue.add('emit', {fiscalDocumentId})` (remover `processEmission` inline).
- **Aceite**: `POST /orders/:id/fiscal-document` responde 202 em ≤500ms sem chamar SEFAZ no request; job enfileirado.
- **Verificação**: curl mede latência; job aparece no Bull Board.

### FISCAL-B2 ⬜ FiscalEmissionProcessor (worker)
- 🔗 FISCAL-B1, FISCAL-A3
- **Arquivos**: `application/workers/FiscalEmissionProcessor.ts`; registrar Worker no boot sob `FISCAL_WORKER_ENABLED`.
- **Aceite**: consome 'emit', idempotente (relê doc; pula se authorized/cancelled); sucesso→authorized+WS+enfileira 'deliver'; erro transitório→throw (backoff BullMQ); rejeição→rejected. Graceful shutdown no SIGTERM.
- **Verificação**: emissão homologação autoriza via worker; matar rede → job retenta.

### FISCAL-B3 ⬜ FiscalSweeper (repeatable job offline)
- 🔗 FISCAL-B2
- **Arquivos**: `application/workers/FiscalSweeper.ts`; repeatable job (`FISCAL_SWEEP_INTERVAL_MS`).
- **Aceite**: reenfileira `pending`/`emitting` presos e `rejected` por causa transitória; não toca `authorized`/`cancelled`/rejeição fatal.
- **Verificação**: doc preso em pending volta a `authorized` após sweep com internet.

---

## Sprint C — Toggle por-pedido + gatilho configurável

### FISCAL-C1 ⬜ Schema toggle + trigger
- **Arquivos**: `schema/orders.ts` (+`fiscal_enabled bool default true`); `schema/fiscal-configurations.ts` (+`emit_trigger`, `email_provider`); migration Drizzle.
- **Aceite**: `bun drizzle-kit generate` + push sem erro.
- **Verificação**: colunas existem.

### FISCAL-C2 ⬜ Gatilho automático no pagamento/conclusão
- 🔗 FISCAL-C1, FISCAL-B1
- **Arquivos**: use-case de registrar pagamento no caixa e/ou `UpdateOrderStatusUseCase`.
- **Aceite**: dispara `EnqueueFiscalEmissionUseCase` só se `order.fiscal_enabled && config.active && trigger casa`; nunca duplica (checa doc existente).
- **Verificação**: pagar pedido com toggle on → doc criado; toggle off → nenhum.

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

### FISCAL-D3 ⬜ Página pública do cliente (token HMAC)
- 🔗 FISCAL-B2
- **Arquivos**: rotas públicas `GET /public/fiscal/:token(/pdf|/xml)`; `apps/web/src/pages/public/CustomerInvoicePage.tsx`.
- **Aceite**: token HMAC (`FISCAL_PUBLIC_TOKEN_SECRET`) sem auth de usuário; PWA-first; QR/chave/downloads.
- **Verificação**: link abre nota sem login; token inválido → 404.

---

## Sprint E — Dashboard fiscal + impressão

### FISCAL-E1 ⬜ Menu "Notas Fiscais" (dashboard)
- **Arquivos**: `apps/web/src/pages/fiscal/FiscalDocumentsPage.tsx`; `constants/navigation.ts`; `App.tsx` rota.
- **Aceite**: tabela de notas vinculadas a pedidos (padrão data-table da regra web.md §7: ordenação, filtros multi, seleção, limpar); status em tempo real via WS; ações PDF/XML/cupom/reprocessar/cancelar (RBAC).
- **Verificação**: página lista, reprocessa rejeitada, cancela dentro de 30min.

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
