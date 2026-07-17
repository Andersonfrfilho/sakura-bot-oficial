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
- ⬜ **T0.2** (UX-DLV-01) Join `deliveries → users` no backend + exibir nome do
  entregador na tela de Entregas.
- ⬜ **T0.3** (UX-CSH-01) Ocultar valores do caixa por padrão + botão olho.
- ⬜ **T0.4** (UX-DSN-03) Traduzir strings em inglês: tipos de pedido
  (`table`/`pickup`/`delivery` → Mesa/Retirada/Entrega), canal `manual`,
  corrigir badge colado "Recebidomanual" (OrdersPage). Depois varredura geral
  (grep + revisão visual) nas demais telas.

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

- ⬜ **T4.1** (UX-CST-02) Campo único WhatsApp/telefone com máscara BR.
- ⬜ **T4.2** (UX-CST-01) Migration `customers.rating` + estrelas na UI.
- ⬜ **T4.3** (UX-CST-03) Endereço opcional: ViaCEP + auto-complete + mapa
  (Leaflet/Nominatim, provider encapsulado).
- ⬜ **T4.4** (UX-CST-04) Múltiplos endereços por cliente (apelido, padrão) +
  reuso no fluxo de pedido delivery. 🔗 T4.3, T2.1.

## Fase 5 — Cargos & permissões
> 🤖 Modelo: `sonnet` (referência pronta no projeto financiamento)

- ⬜ **T5.1** (UX-ROL-01/02) Página de cargos + matriz de permissões
  (referência: `RolesPage.tsx` do financiamento). Backend: CRUD roles +
  atribuição de permissions.
- ⬜ **T5.2** (UX-ROL-03) Staff usa cargos cadastrados. 🔗 T5.1.

## Fase 6 — Produtos & estoque
> 🤖 Modelo: `sonnet`, **exceto T6.9 🧠 (`opus`/`fable`)** — design doc do modelo de dados que ancora T6.5/T6.10/T6.11

- ⬜ **T6.1** (UX-PRD-01) Custo + venda + margens rápidas (migration
  `products.cost_price`).
- ⬜ **T6.2** (UX-PRD-07) Unidade de medida (un/kg/granel/litro) — migration +
  impacto no input de quantidade do pedido. 🔗 T2.1.
- ⬜ **T6.3** (UX-PRD-03) Código de barras + leitura por câmera (PWA).
- ⬜ **T6.4** (UX-PRD-02) Auto-complete via API pública (avaliar Open Food
  Facts vs Cosmos em design.md; provider encapsulado com cache Redis).
- ⬜ **T6.5** (UX-PRD-04) Estoque por lote (migrations `stock_batches` etc.,
  entrada de compra, baixa FIFO, listagem).
- ⬜ **T6.6** (UX-PRD-05) Alertas de vencimento (badge + job diário BullMQ).
  🔗 T6.5.
- ⬜ **T6.7** (UX-PRD-06) Seções físicas (cadastro + vínculo no produto).
- 🔶 **T6.8** (UX-CAT-01) Correções de categorias (Pasted #6/#7).
- ⬜ **T6.9** (UX-PRD-11) Design doc do modelo estoque/ficha técnica
  (`design.md`): ingredientes, receitas, lotes, custeio — **antes** das
  migrations de T6.5/T6.10/T6.11. Benchmark com sistemas maduros do segmento.
- ⬜ **T6.10** (UX-PRD-08/09) Cadastro de ingredientes + ficha técnica do prato
  (tempo de preparo, modo de preparo, ingredientes×quantidade). 🔗 T6.9.
- ⬜ **T6.11** (UX-PRD-10) Custeio por receita: custo teórico do prato, margem
  real, alimentando margens rápidas de T6.1. 🔗 T6.10.

## Fase 7 — Conversas (paridade + pacote compartilhado)
> 🤖 Modelo: T7.1/T7.2 🧠 `opus`/`fable` (gap analysis + API do pacote entre repos); T7.3–T7.5 `sonnet`

- ⬜ **T7.1** (UX-CNV-01) Gap analysis formal: tabela feature a feature
  sakura × financiamento (documento em `design.md` desta feature).
- ⬜ **T7.2** (UX-CNV-02) Criar `@adatechnology/conversations-ui` no repo
  `adatechnology-packages` (componentes parametrizados: MessageBubble,
  AudioPlayer, DateDivider, EmojiPicker, Composer; sem client HTTP embutido).
- ⬜ **T7.3** (UX-CNV-03) Backend sakura: módulo uploads + storage provider +
  fila BullMQ para mídia (espelhar arquitetura do financiamento).
- ⬜ **T7.4** Migrar ConversationsPage do sakura para o pacote. 🔗 T7.2, T7.3.
- ⬜ **T7.5** Migrar financiamento para o pacote (projeto irmão — PR separado).
  🔗 T7.4.

## Fase 8 — Configurações & relatórios
> 🤖 Modelo: `sonnet`

- ⬜ **T8.1** (UX-SET-01) Upload de logo com worker (resize) + uso no app/cupom/
  página pública. 🔗 T7.3 (reusa storage/fila).
- ⬜ **T8.2** (UX-SET-02) UI de raios/taxas de entrega sobre
  `delivery_fee_rules`/`delivery_fee_zones` existentes.
- ⬜ **T8.3** (UX-SET-03/04) Campos WhatsApp/nome + auditoria do que falta
  (horários, endereço, mínimo delivery, tempo de preparo).
- 🔶 **T8.4** (UX-RPT-06) Correções visuais de relatórios (Pasted #8).
- ⬜ **T8.5** (UX-FIS-02) Geração/persistência de PDF (DANFE/cupom) das notas
  fiscais. 🔗 T7.3 (reusa storage). Decisão de design necessária: persistir
  buffer retornado pelo provider (`@adatechnology/fiscal-provider`, hoje
  descartado) via storage provider + adicionar suporte a resposta binária no
  `ResponseHelper` (`apps/api/src/infra/http/router.ts`, hoje só JSON) **ou**
  gerar DANFE sob demanda a partir do `xmlAutorizado` já salvo. Documentar
  escolha em `design.md` antes de implementar — toca pacote irmão.

## Fase 9 — Relatórios analíticos (pós ficha técnica)
> 🤖 Modelo: `sonnet` (queries analíticas têm aceite verificável contra o seed)

- ⬜ **T9.1** (UX-RPT-03) Análise de tempos do funil por etapa via
  `order_status_logs` + identificação de gargalo.
- ⬜ **T9.2** (UX-RPT-05) Métricas de mesa: permanência média e ticket médio
  por cliente/comanda/mesa. 🔗 T3.4.
- ⬜ **T9.3** (UX-RPT-01/02) Ingredientes mais utilizados + ranking de pratos
  por margem/giro (sugestões por economia). 🔗 T6.10, T6.11.
- ⬜ **T9.4** (UX-RPT-04) Tempo real × tempo cadastrado por prato. 🔗 T6.10, T9.1.

## Fase 10 — Financeiro (módulo novo)
> 🤖 Modelo: `sonnet` (T10.3 parecer financeiro é 🧠 — validar fórmulas/modelo com `opus` antes)

- ⬜ **T10.1** (UX-FIN-01) Contas mensais recorrentes: migration + CRUD + UI
  (vencimento, recorrência, pago/pendente).
- ⬜ **T10.2** (UX-FIN-02) Gastos avulsos com categoria e comprovante
  (storage). 🔗 T7.3 (reusa storage).
- ⬜ **T10.3** (UX-FIN-03) Painel "parecer financeiro": receita × custos,
  margem, ponto de equilíbrio, evolução mensal. 🔗 T10.1, T10.2, T6.11.
- ⬜ **T10.4** (UX-FIN-04) Alertas de contas a vencer (job diário BullMQ).
  🔗 T10.1.

## Fase 11 — Integrações e fundação de dados
> 🤖 Modelo: T11.1/T11.3/T11.4 🧠 `opus`/`fable` (spike, contrato de eventos, gap analysis); T11.2 `sonnet`

- ⬜ **T11.1** (UX-INT-01) Spike iFood: estudar API oficial de parceiros,
  requisitos de credenciamento e sandbox; documentar em `design.md`.
- ⬜ **T11.2** (UX-INT-01) Implementar `IfoodProvider` + importação de pedidos
  (aceitar/rejeitar/status) no canal `ifood` existente. 🔗 T11.1, T2.3.
- ⬜ **T11.3** (UX-DAT-01) Contrato de eventos de negócio (append-only) para
  datalake futuro — documentar + implementar emissão nos fluxos core.
- ⬜ **T11.4** (UX-GAP-01) Gap analysis do produto vs referências do segmento;
  entregar adendo priorizado no spec.md para validação do usuário.

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
