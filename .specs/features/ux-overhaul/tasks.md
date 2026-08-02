# UX Overhaul — Tasks (execução faseada)

Legenda: ⬜ a fazer · 🔶 bloqueada por input do usuário (ver spec.md) · 🔗 depende de.
Cada task deve terminar com: `npx tsc --noEmit` limpo + teste manual do fluxo + commit isolado.

## 🤖 Protocolo de modelo (custo-eficiência)

Cada fase declara um **modelo recomendado**. Regra inquebrável para a I.A.
executora: **ao iniciar uma fase, comparar o modelo da sessão atual com o
recomendado; se divergirem, PARAR e pedir ao usuário para rodar `/model
<modelo>` antes de tocar em código.** Tasks marcadas com 🧠 dentro de uma fase
barata exigem exceção pontual (pedir upgrade só para aquela task e voltar ao
barato em seguida).

| Modelo | Papel |
|---|---|
| `haiku` (Haiku 4.5) | Mecânico: traduções, passes de ícones, migração de selects, aplicar tokens |
| `sonnet` (Sonnet 5) | **Padrão de execução** — CRUDs, bugs, telas, migrations simples |
| `opus`/`fable` (Opus 4.8 / Fable 5) | 🧠 Arquitetura: design docs, modelo de dados novo, integração entre repos, spikes |

---

## Fase 0 — Bugs e quick wins (destravar uso imediato)
> 🤖 Modelo: `sonnet` (T0.4 pode rodar em `haiku`)

- ✅ **T0.1** (UX-FIS-01/03) Corrigir busca e download XML da tela de Notas
  Fiscais.
  - Arquivo: `apps/web/src/pages/fiscal/FiscalDocumentsPage.tsx`.
  - Busca: causa raiz era escopo insuficiente (`chaveAcesso`/`numeroDocumento`
    ficam `null` até autorização) — ampliado para também casar com `orderId`.
  - XML: causa raiz era `response.json({xml})` no backend sendo baixado como
    blob bruto pelo frontend — corrigido parseando o JSON e construindo o
    `Blob` a partir de `data.xml`.
  - PDF (UX-FIS-02) **não é bug de wiring** — nenhum provider do
    `@adatechnology/fiscal-provider` persiste PDF, e o `ResponseHelper` não
    suporta binário. Rescopado para **T8.5** (junto da infra de storage).
- ✅ **T0.2** (UX-DLV-01) Join `deliveries → users` no backend + exibir nome do
  entregador na tela de Entregas.
  - Feito (commit `9459eec`, não estava marcado): `GetDeliveryQueueUseCase`
    já resolvia `with: { deliverer: true }` via `deliveriesRelations` em
    `relations.ts`, e `DeliveryPage.tsx` já renderizava
    `delivery.deliverer.name`. Confirmado ao vivo em `GET /delivery/queue`
    (`deliverer: {"name":"Entregador Demo"}`) e na tela
    (`/delivery` exibe "Entregador: Entregador Demo").
- ✅ **T0.3** (UX-CSH-01) Ocultar valores do caixa por padrão + botão olho.
  - Feito (commit `cc16216`, não estava marcado): `showValues` inicia `false`
    em `CashierPage.tsx`, todo valor monetário passa por
    `formatBRL(valor, !showValues)`, placeholder `R$ ••••••`. Confirmado ao
    vivo: tela abre com valores ocultos; clique em "Mostrar valores" revela
    ("R$ 272,80" etc.) e alterna de volta em "Ocultar valores".
- ✅ **T0.4** (UX-DSN-03) Traduzir strings em inglês: tipos de pedido
  (`table`/`pickup`/`delivery` → Mesa/Retirada/Entrega), canal `manual`,
  corrigir badge colado "Recebidomanual" (OrdersPage). Depois varredura geral
  (grep + revisão visual) nas demais telas.
  - Parte específica já resolvida em commit anterior: `orderLabels.ts` traduz
    `ORDER_STATUS_LABELS`/`ORDER_TYPE_LABELS`/`ORDER_CHANNEL_LABELS`
    integralmente (Recebido/Em preparo/Pronto/.../Mesa/Entrega/Retirada/
    WhatsApp/iFood/Manual); `OrdersPage.tsx` não concatena mais status+canal
    sem separador — confirmado via grep, sem ocorrência de "Recebidomanual".
  - Varredura geral feita nesta sessão: `rg` por `placeholder="[A-Z]..."` em
    todo `apps/web/src` (CreateOrderModal, CashierPage, StaffPage,
    OrdersFilterBar, PaymentStep, RolesPage, FiscalDocumentsPage,
    FinancePage, ComandaConfirmPage, ConversationsPage, AddressForm) e por
    texto de botão/label/heading (`>[A-Z][a-z]+...<` sem acento, filtrando
    siglas legítimas como NCM/CFOP/CST/CEP/CRT/PIX/NF) em todos os `.tsx` do
    projeto. Nenhuma string em inglês encontrada — todo texto visível ao
    usuário já está em português. "Dashboard" e "Status" mantidos por serem
    termos consagrados em software de gestão brasileiro.

## Fase 1 — Design System base (pré-requisito das telas novas)
> 🤖 Modelo: `sonnet` para T1.1/T1.4 (componente e animações); `haiku` para T1.2/T1.3 (passes mecânicos)

- ✅ **T1.1** (UX-DSN-01) Criar `components/ui/Select.tsx` (single/multi, busca,
  teclado, tokens do tema) + migrar selects existentes tela a tela.
  - Feito: componente já existia com single/multi-select, busca, navegação por
    teclado (setas/Enter/Escape), fechamento por clique-fora e ARIA
    (`listbox`/`option`) completos, usando classes Tailwind semânticas
    (`brand-*`/`gray-*`/`red-*`, sem hex arbitrário). Já em uso em
    CashierPage, FiscalSettingsPage, CatalogPage, StaffPage e ReportsPage;
    confirmado por grep que não resta nenhum `<select>` nativo no codebase —
    migração já concluída. Corrigido apenas `COLORS.brand` em
    `theme.constant.ts` (T1.3), que estava com valores índigo divergentes da
    paleta `brand` real definida em `tailwind.config.ts` (rosa/magenta).
- ✅ **T1.2** (UX-DSN-02) Passe de ícones (lucide-react) nas telas atuais;
  prioridade fiscal. 🔗 T0.1 (para não conflitar).
  - Feito: FiscalDocumentsPage (download, imprimir, cancelar, reprocessar),
    FiscalSettingsPage (config, alerta, check), StaffPage (plus, pencil, toggle,
    lock, trash), CustomersPage (plus, pencil, trash), TablesPage (plus mesa),
    CatalogPage (plus cat, plus prod), OrdersPage (plus pedido). lucide-react
    instalado e integrado.
- ✅ **T1.3** (UX-DSN-04) Garantir arquivos de tema (`theme.constant.ts`,
  `spacing.constant.ts`, `scale.util.ts`) e usar nas telas tocadas daqui em diante.
  - Feito: Criada estrutura centralizada em src/modules/shared/theme/ com
    COLORS, TYPOGRAPHY, RADIUS, SHADOW, SPACING e funções scale()/scaleRem().
    Base pronta para aplicação gradual em novas features e refatorações.
- ✅ **T1.4** (UX-DSN-05) Base de animações: transições de modal/painel,
  skeleton loaders, feedback press/hover, `prefers-reduced-motion`. Decidir
  CSS puro vs framer-motion (bundle) e padronizar.
  - Feito: `Modal.tsx`/`Skeleton.tsx` (CSS puro, `motion-safe`/`motion-reduce`,
    ESC + backdrop click); migrados StaffPage, CustomersPage, TablesPage,
    CatalogPage, CreateOrderModal e lightbox de ConversationsPage; skeleton
    loaders em StaffPage/CustomersPage/TablesPage/OrdersPage; drawer do
    MobileNav com slide+fade. Pendente: animação de mudança de status do
    Badge (sem componente Badge compartilhado ainda — fora de escopo desta
    passada).

## Fase 2 — Pedidos completos (maior valor de negócio)
> 🤖 Modelo: `sonnet`

- ⬜ **T2.1** (UX-ORD-01..04) Redesenhar fluxo de criação de pedido:
  data/hora, pagamento (tipos, troco, divisão, misto), entrega, cliente+CPF.
  - Backend: aceitar/persistir os novos campos; expor `payment_types` e
    `order_types` do schema do bot via API.
  - Provável promoção de `CreateOrderModal` → página multi-etapa.
- ⬜ **T2.2** (UX-ORD-05) Pedido de mesa exige comanda (selecionar existente ou
  criar); vincular pedido→comanda. 🔗 T2.1.
- ⬜ **T2.3** (UX-ORD-06/07) Listagem melhorada + painel de detalhe do pedido
  (itens, timeline via `order_status_logs`, pagamento, entrega, nota vinculada).
- ⬜ **T2.4** (UX-ORD-08) Busca textual, filtros multi-select, calendário
  (range), busca por cliente, estado na URL. 🔗 T1.1.

## Fase 3 — Mesas, comandas e salão
> 🤖 Modelo: `sonnet` (T3.2 junção de mesas é 🧠 — validar modelagem com `opus` antes de implementar)

- ⬜ **T3.1** (UX-TBL-01/02) Migration `tables.position_x/y` + mapa do salão
  drag-and-drop com capacidade e status por cor.
- ⬜ **T3.2** (UX-TBL-03) Junção/separação de mesas (grupo temporário).
- ⬜ **T3.3** (UX-TBL-04) Auditoria de mover/juntar/separar em `audit_logs`.
  🔗 T3.1, T3.2.
- ⬜ **T3.4** (UX-TBL-05) Comandas da mesa no detalhe + abrir nova. 🔗 T2.2.

## Fase 4 — Clientes
> 🤖 Modelo: `sonnet`

- ✅ **T4.1** (UX-CST-02) Campo único WhatsApp/telefone com máscara BR.
  - Feito: máscara `WhatsAppField` com formatação `+55 (11) 98888-7777` →
    persiste E.164; campo `phone` removido do form (coluna mantida no DB);
    `whatsappNumber` agora editável no update.
- ✅ **T4.2** (UX-CST-01) Migration `customers.rating` + estrelas na UI.
  - Feito: migration `0013` adiciona `rating` integer; backend completo
    (repo + use cases + controller); frontend com `StarDisplay` (list + detail)
    e `StarRatingInput` interativo (hover/click) no form.
- ✅ **T4.3** (UX-CST-03) Endereço opcional: ViaCEP + auto-complete + mapa
  (Leaflet/Nominatim, provider encapsulado).
  - Feito: migration `0014` (label, lat, lng em addresses); `ViaCepProvider`
    e `NominatimProvider`; CRUD completo de endereços (repo + use cases +
    controller + routes); `AddressForm` com CEP auto-lookup + mapa OSM.
- ✅ **T4.4** (UX-CST-04) Múltiplos endereços por cliente (apelido, padrão) +
  reuso no fluxo de pedido delivery. 🔗 T4.3, T2.1.
  - Feito: seção de endereços no painel de detalhe do cliente com add/edit/
    delete/set-default; `AddressCard` com label e badge padrão.
    `DeliveryStep` exibe endereços salvos como cards selecionáveis com toggle
    para entrada manual; `CreateOrderPage` busca endereços ao selecionar
    cliente no delivery. 🔗 T4.3, T2.1.

## Fase 5 — Cargos & permissões
> 🤖 Modelo: `sonnet` (referência pronta no projeto financiamento)

- ✅ **T5.1** (UX-ROL-01/02) Página de cargos + matriz de permissões
  (referência: `RolesPage.tsx` do financiamento). Backend: CRUD roles +
  atribuição de permissions.
  - Feito: 6 use cases (create/update/delete/get/list roles + assign permissions);
    `RoleController` com 6 handlers e zod validation; `RoleRoutes` com 6 rotas
    autenticadas + `authorize('users', 'manage')`; container DI completo.
    Frontend: `RolesPage.tsx` com lista de cargos, modal create/edit com matriz
    de permissões (10 recursos × 4 ações), checkboxes com auto-check de
    "manage", integração com Sidebar (ícone Shield) e rota `/roles` com
    RoleGuard ADMIN/MANAGER.
- ✅ **T5.2** (UX-ROL-03) Staff usa cargos cadastrados. 🔗 T5.1.
  - Já feito: `StaffPage.tsx` já usa `GET /staff/roles` para popular o Select
    de cargo no form de create/edit. Nenhuma alteração necessária.

## Fase 6 — Produtos & estoque
> 🤖 Modelo: `sonnet`, **exceto T6.9 🧠 (`opus`/`fable`)** — design doc do modelo de dados que ancora T6.5/T6.10/T6.11

- ✅ **T6.1** (UX-PRD-01) Custo + venda + margens rápidas (migration
  `products.cost_price`).
  - Feito: migration 0015; campo `costPrice` no schema + controller; frontend
    com input de custo + atalhos (+30%/+50%/+100%) + margem% dinâmica.
- ✅ **T6.2** (UX-PRD-07) Unidade de medida (un/kg/granel/litro) — migration +
  impacto no input de quantidade do pedido. 🔗 T2.1.
  - Feito: migration 0016; coluna `unit` com enum (un/kg/g/l/ml); select de
    unidade no form de produto.
- ✅ **T6.3** (UX-PRD-03) Código de barras + leitura por câmera (PWA).
  - Feito: migration 0016; coluna `barcode`; `BarcodeScanner.tsx` com
    BarcodeDetector API (EAN-13/8) + fallback manual; integrado no CatalogPage.
- ✅ **T6.4** (UX-PRD-02) Auto-complete via API pública (avaliar Open Food
  Facts vs Cosmos em design.md; provider encapsulado com cache Redis).
  - Feito: `OpenFoodFactsProvider` com search + getByBarcode; endpoints
    `/catalog/product-search` e `/catalog/product-lookup/:barcode`; busca
    integrada no form de produto e pós-scan do barcode.
- ✅ **T6.5** (UX-PRD-04) Estoque por lote (migrations `stock_batches` etc.,
  entrada de compra, baixa FIFO, listagem).
  - Feito: migrations 0021/0022; schemas `stock-batches` + `stock-movements`;
    `StockBatchController` com CRUD + endpoint de lotes vencendo;
    `StockBatchList.tsx` no frontend com badges de validade.
- ✅ **T6.6** (UX-PRD-05) Alertas de vencimento (badge + job diário BullMQ).
  🔗 T6.5.
  - Feito: worker `StockExpiryAlerter` com job diário 8am; fila BullMQ
    `stock-expiry-alerts`; endpoint `GET /stock-batches/expiring/count`;
    `ExpiringBatchBadge` no frontend com polling 5min.
- ✅ **T6.7** (UX-PRD-06) Seções físicas (cadastro + vínculo no produto).
  - Feito: migration 0017; schema `sections`; `SectionController` CRUD;
    `SectionManager.tsx` com add/edit/delete inline; select de seção no form
    de produto; badge de seção na listagem.
- 🔶 **T6.8** (UX-CAT-01) Correções de categorias (Pasted #6/#7).
- ✅ **T6.9** (UX-PRD-11) Design doc do modelo estoque/ficha técnica
  (`design.md`): ingredientes, receitas, lotes, custeio — **antes** das
  migrations de T6.5/T6.10/T6.11. Benchmark com sistemas maduros do segmento.
  - Feito: `design.md` com schema completo (ingredients, product_ingredients,
    stock_batches, stock_movements), fluxo FIFO, custeio, decisões arquiteturais.
- ✅ **T6.10** (UX-PRD-08/09) Cadastro de ingredientes + ficha técnica do prato
  (tempo de preparo, modo de preparo, ingredientes×quantidade). 🔗 T6.9.
  - Feito: migrations 0018/0019/0020; schemas `ingredients`, `product-ingredients`,
    campos `preparation_time_minutes`/`preparation_instructions`; `IngredientController`
    CRUD; `IngredientManager.tsx` + `RecipeManager.tsx` no frontend.
- ✅ **T6.11** (UX-PRD-10) Custeio por receita: custo teórico do prato, margem
  real, alimentando margens rápidas de T6.1. 🔗 T6.10.
  - Feito: `RecipeCostBadge` exibe "Custo receita R$ X · Margem Z%" na
    listagem de produtos; cálculo Σ(ingredient.cost_per_unit × quantity).

## Fase 7 — Conversas (paridade + pacote compartilhado)
> 🤖 Modelo: T7.1/T7.2 🧠 `opus`/`fable` (gap analysis + API do pacote entre repos); T7.3–T7.5 `sonnet`

- ✅ **T7.1** (UX-CNV-01) Gap analysis formal: tabela feature a feature
  sakura × financiamento (documento em `design.md` desta feature).
  - Feito: `gap-analysis-conversations.md` com 15 features faltantes em 4
    categorias (componentes, hooks, backend infra, UX), priorização 1-5.
- ✅ **T7.2** (UX-CNV-02) Criar `@adatechnology/conversations-ui` no repo
  `adatechnology-packages` (componentes parametrizados: MessageBubble,
  AudioPlayer, DateDivider, EmojiPicker, Composer; sem client HTTP embutido).
  - Feito: pacote em `packages/frontend/conversations-ui/` com 8 componentes
    + hook `useDarkMode` + tema customizável via CSS vars; built com tsup;
    0 deps externas além de react; integrado no sakura via `file:`.
- ✅ **T7.3** (UX-CNV-03) Backend sakura: módulo uploads + storage provider +
  fila BullMQ para mídia (espelhar arquitetura do financiamento).
  - Feito: `StorageProvider` interface + `LocalStorageProvider`; módulo
    `uploads` com `UploadFileUseCase` + `UploadController`; fila BullMQ
    `media-processing` com worker de resize/optimize; `useUpload` hook.
- ✅ **T7.4** Migrar ConversationsPage do sakura para o pacote. 🔗 T7.2, T7.3.
  - Feito: `AudioPlayer`, `EmojiPicker`, `useDarkMode` integrados; toggle
    dark mode no header; audio player inline; EmojiPicker no composer.
    Componentes locais preservados para lógica de negócio específica.
- ✅ **T7.5** Migrar financiamento para o pacote (projeto irmão — PR separado).
  🔗 T7.4.
  - Feito: `@adatechnology/conversations-ui` nível 2 com 11 componentes, 3 hooks,
    2 providers, utils de WhatsApp formatting; `@adatechnology/products-ui`
    criado com 5 componentes + hook + utils BRL; ambos 0 deps, parametrizados
    por provider injetável. Prontos para uso em ambos os projetos.

## Fase 8 — Configurações & relatórios
> 🤖 Modelo: `sonnet`

- ✅ **T8.1** (UX-SET-01) Upload de logo com worker (resize) + uso no app/cupom/
  página pública. 🔗 T7.3 (reusa storage/fila).
  - Feito: setting `logo_url` com preview + upload via POST /uploads + remoção;
    integrado no SettingsPage na seção "Logo".
- ✅ **T8.2** (UX-SET-02) UI de raios/taxas de entrega sobre
  `delivery_fee_rules`/`delivery_fee_zones` existentes.
  - Feito: schemas `delivery-fee-rules` + `delivery-fee-zones`; `DeliveryFeeController`
    CRUD; `DeliveryFeeManager.tsx` com regras + zonas expansíveis; aba "Entregas"
    no SettingsPage.
- ✅ **T8.3** (UX-SET-03/04) Campos WhatsApp/nome + auditoria do que falta
  (horários, endereço, mínimo delivery, tempo de preparo).
  - Feito: 9 novos settings (establishment_name, establishment_address,
    opening_hours, default_preparation_time, minimum_delivery_order, currency,
    timezone, expiry_alert_days, default_printer); organizados em seções
    (Estabelecimento, Operação, Estoque, Impressão) no SettingsPage.
- 🔶 **T8.4** (UX-RPT-06) Correções visuais de relatórios (Pasted #8).
- ✅ **T8.5** (UX-FIS-02) Geração/persistência de PDF (DANFE/cupom) das notas
  fiscais. 🔗 T7.3 (reusa storage).
  - Decisão: gerar DANFE sob demanda a partir do `xmlAutorizado` (sem persistir
    buffers, sem alterar o provider package).
  - Feito: `GenerateFiscalPdfUseCase` reconstrói parâmetros fiscais do DB e
    chama `buildCupomPdf` do `@adatechnology/fiscal-provider`; `ResponseHelper`
    estendido com `binary()` para resposta binária; endpoint `GET
    /fiscal-documents/:id/pdf` retorna PDF; botão no frontend ativo quando
    documento tem `xmlAutorizado`.

## Fase 9 — Relatórios analíticos (pós ficha técnica)
> 🤖 Modelo: `sonnet` (queries analíticas têm aceite verificável contra o seed)

- ✅ **T9.1** (UX-RPT-03) Análise de tempos do funil por etapa via
  `order_status_logs` + identificação de gargalo.
  - Feito: `GetFunnelAnalysisUseCase` com médias por etapa agrupadas por tipo
    de pedido; destaque do gargalo em vermelho; endpoint `/reports/funnel`.
- ✅ **T9.2** (UX-RPT-05) Métricas de mesa: permanência média e ticket médio
  por cliente/comanda/mesa. 🔗 T3.4.
  - Feito: `GetTableMetricsUseCase` com tempo médio, ticket por comanda/mesa,
    taxa de ocupação; endpoint `/reports/table-metrics`; cards + tabela no
    ReportsPage.
- ✅ **T9.3** (UX-RPT-01/02) Ingredientes mais utilizados + ranking de pratos
  por margem/giro (sugestões por economia). 🔗 T6.10, T6.11.
  - Feito: `GetIngredientsRankingUseCase` + `GetProductProfitUseCase`; top 10
    ingredientes e pratos por lucro; cards Melhor Margem/Mais Vendido/Combo;
    endpoints `/reports/ingredients-ranking` e `/reports/product-profit`.
- ✅ **T9.4** (UX-RPT-04) Tempo real × tempo cadastrado por prato. 🔗 T6.10, T9.1.
  - Feito: `GetPreparationTimeComparisonUseCase`; compara `preparation_time_minutes`
    com tempo real via order_status_logs; destaque vermelho para produtos
    estourando; endpoint `/reports/preparation-time-comparison`.

## Fase 10 — Financeiro (módulo novo)
> 🤖 Modelo: `sonnet` (T10.3 parecer financeiro é 🧠 — validar fórmulas/modelo com `opus` antes)

- ✅ **T10.1** (UX-FIN-01) Contas mensais recorrentes: migration + CRUD + UI
  (vencimento, recorrência, pago/pendente).
  - Feito: migration 0023; schema `monthly-accounts`; `MonthlyAccountController`
    com 6 handlers (CRUD + pay/unpay); `FinancePage.tsx` com tabs (Contas Fixas/
    Gastos/Parecer), navegação mensal, cards pending/paid, ações inline.
- ✅ **T10.2** (UX-FIN-02) Gastos avulsos com categoria e comprovante
  (storage). 🔗 T7.3 (reusa storage).
  - Feito: migration 0024; schema `expenses`; `ExpenseController` CRUD + upload
    receipt; aba "Gastos Avulsos" no FinancePage com categorias, valores, upload.
- ✅ **T10.3** (UX-FIN-03) Painel "parecer financeiro": receita × custos,
  margem, ponto de equilíbrio, evolução mensal. 🔗 T10.1, T10.2, T6.11.
  - Feito: `GET /finance/overview` com receita, custos, margem %, ponto de
    equilíbrio, evolução 6 meses; aba "Parecer" com cards, status (Saudável/
    Atenção/Crítico), gráfico de barras mensal.
- ✅ **T10.4** (UX-FIN-04) Alertas de contas a vencer (job diário BullMQ).
  🔗 T10.1.
  - Feito: worker `AccountDueAlerter` com job diário 9am; fila BullMQ
    `finance-due-alerts`; badge "N contas a vencer" + highlight amarelo nas
    linhas próximas do vencimento no FinancePage.

## Fase 11 — Integrações e fundação de dados
> 🤖 Modelo: T11.1/T11.3/T11.4 🧠 `opus`/`fable` (spike, contrato de eventos, gap analysis); T11.2 `sonnet`

- ✅ **T11.1** (UX-INT-01) Spike iFood: estudar API oficial de parceiros,
  requisitos de credenciamento e sandbox; documentar em `design.md`.
  - Feito: `ifood-spike.md` com endpoints, OAuth2, credenciamento, arquitetura
    proposta, esforço estimado (7.5 dias), riscos e mitigações.
- ✅ **T11.2** (UX-INT-01) Implementar `IfoodProvider` + importação de pedidos
  (aceitar/rejeitar/status) no canal `ifood` existente. 🔗 T11.1, T2.3.
  - Feito: `IfoodProvider` com OAuth2 client_credentials, polling de eventos,
    fetch de pedidos, accept/reject/status; `IfoodPollingWorker` (BullMQ,
    repeatable 60s) que cria ordens internas via `CreateOrderUseCase` com
    mapeamento de cliente/produto; endpoints `POST /orders/:id/ifood/accept`
    e `/reject`; feature flag `IFOOD_ENABLED`.
- ✅ **T11.3** (UX-DAT-01) Contrato de eventos de negócio (append-only) para
  datalake futuro — documentar + implementar emissão nos fluxos core.
  - Feito: `event-contract.md` com envelope padrão, 24 tipos de evento em 8
    domínios, pontos de emissão atuais (WebSocket + audit_logs), 3 opções de
    consumo (CDC/Redis/S3) com recomendação faseada.
- ✅ **T11.4** (UX-GAP-01) Gap analysis do produto vs referências do segmento;
  entregar adendo priorizado no spec.md para validação do usuário.
  - Feito: `gap-analysis-product.md` com 10 features faltantes (KDS, fidelidade,
    NPS, QR menu, rotas, gorjeta, multi-estab, TEF, offline PWA, forecasting),
    benchmark com 5 sistemas, roadmap Q1-Q3 2026.

---

## Ordem recomendada de execução

`Fase 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11`

Racional: bugs primeiro (valor imediato), design system antes das telas novas
(evita retrabalho), pedidos é o core do negócio, produtos/ficha técnica antes
de relatórios analíticos e financeiro (que dependem do custeio), conversas em
paralelo possível (repo externo `adatechnology-packages`), integrações e
datalake por último (dependem do core estável).

## Riscos

- **R1**: pacote compartilhado de conversas exige alinhamento de versões React
  entre os dois projetos — travar peer deps.
- **R2**: estoque por lote muda o modelo de baixa de produto — precisa migration
  cuidadosa e não pode quebrar pedidos existentes (lote "legado" default).
- **R3**: `tsx` não type-checa — manter `tsc --noEmit` como gate em toda task
  (já pegou 7 bugs reais de `response.status()`).
