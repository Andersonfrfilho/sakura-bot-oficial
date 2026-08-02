# Estoque real e cadastro inteligente de produto

Duas frentes que se sustentam: o **estoque**, que hoje é um esqueleto de leitura,
e o **cadastro de produto**, que hoje exige digitar tudo à mão. A segunda só paga
o custo de integração externa se a primeira existir — sem lote e sem custo por
lote, "sugestão de preço" é chute sem margem para comparar.

## Diagnóstico (verificado no código, não presumido)

O schema está bem modelado: `ingredients` (com `stockQuantity`, `minimumStock`,
`costPerUnit`), `stock_batches` (FIFO por `remainingQuantity`, `costPerUnit`,
`expiresAt`), `stock_movements` (`movementType`, `reason`, `orderId`, `userId`)
e `product_ingredients` como receita.

**Nada no código escreve nessas tabelas.** Busca por `stockMovements`,
`stockBatches` e `stockQuantity` em `apps/api/src` só encontra leitura:

| Existe | Situação |
|---|---|
| `GET /stock-batches/expiring` + `/count` | lê lotes que nunca são criados |
| `ExpenseController` soma `movements × costPerUnit` | soma sempre zero |
| `ingredients.minimumStock` | gravado pelo CRUD, nunca lido |
| `product_ingredients` | editável na tela, nunca consumido |

Consequência prática: `ExpiringBatchBadge` nunca acende, o CMV do mês é sempre
R$ 0,00 e a "receita" do produto é decorativa.

---

## Fase 1 — Escrita de estoque (a base)
> 🤖 Modelo: `sonnet` (T1.2 é 🧠 — validar com `opus` antes)

- **T1.1** `POST /stock-batches` — entrada de compra: ingrediente, número do
  lote, quantidade, custo unitário, validade. Em **uma transação**: cria o lote
  com `remainingQuantity = quantity`, grava `stock_movements` do tipo `in` e
  soma em `ingredients.stockQuantity`. Recalcula `ingredients.costPerUnit` como
  média ponderada dos lotes com saldo — custo de reposição errado contamina toda
  a margem exibida.
  *Verificação:* `POST` → `GET /ingredients` mostra o novo saldo e o novo custo;
  segundo lote mais caro move a média na direção certa.

- **T1.2** ✅ 🧠 Baixa por receita no fechamento do pedido. Concluído: gatilho é a
  transição `received → in_production` (kitchen começa a produzir), via
  `DeductStockForOrderUseCase` chamado de dentro de `UpdateOrderStatusUseCase`.
  Para cada item explode `product_ingredients × quantidade` e dá baixa **FIFO**
  nos lotes por `expiresAt`, gravando um `stock_movements` (`out`) por lote
  tocado, com `orderId` e `userId`.
  Decisão do saldo insuficiente: **configurável por produto**, campo
  `products.allowNegativeStock` (default `false` = bloqueia a transição com
  409; `true` = permite negativo e grava movimento extra sinalizando saldo
  negativo permitido). Idempotência por `orderId`: checa `stock_movements`
  existente antes de processar. Produto sem receita não movimenta nada.
  Achado no caminho: `stock_batches`/`stock_movements`/`product_ingredients`
  no banco real estavam desalinhados do schema Drizzle (colunas ausentes ou
  com nome diferente) — corrigido via migrations `0025`, `0026`, `0027`.
  *Verificação (feita ao vivo):* pedido com 2 itens de receita conhecida baixa exatamente a
  quantidade esperada, do lote que vence primeiro; repetir a chamada não muda
  saldo algum.

- **T1.3** ✅ `POST /stock-movements` — ajuste, perda e contagem. Concluído via
  `CreateStockMovementUseCase`. `movementType` em `adjustment` (bidirecional,
  exige `direction: increase|decrease` — é o que fecha a contagem física
  quando ela diverge do sistema pra mais ou pra menos) / `loss` (sempre
  decrescente, `direction` ignorado). `reason` obrigatório (1–255 chars) em
  ambos. `quantity` é gravada com sinal em `stock_movements` (negativa para
  decréscimo), então a soma da coluna já reflete o saldo corrente sem precisar
  reler `movementType` para inferir direção. Uma transação: insere o
  movimento e atualiza `ingredients.stockQuantity`; sem checagem de saldo
  mínimo aqui — ajuste/perda é correção manual e deliberada de quem está no
  chão da cozinha, não uma venda.
  *Verificação (feita ao vivo):* adjustment sem `direction` → 400; adjustment
  `increase` 20 → saldo sobe para 20; loss 5 (sem `direction`, forçado a
  decrescer) → saldo cai para 15, `quantity` gravada como `-5.0000`; `reason`
  vazio → 400; ingrediente de outro estabelecimento/inexistente → 404.

- **T1.4** ✅ Alerta de estoque mínimo: `GET /ingredients/low-stock` compara
  `stockQuantity <= minimumStock` (ignora ingrediente sem `minimumStock`
  definido — sem limite não há como estar "abaixo dele"), mais
  `GET /ingredients/low-stock/count`, no mesmo padrão do par
  `expiring`/`expiring/count` de `StockBatchController`.
  *Verificação (feita ao vivo):* ingrediente com `minimumStock=10` e
  `stockQuantity=0` aparece na lista e no contador; após ajuste de estoque
  para 50 (acima do mínimo), some de ambos.

- **T1.5** ✅ Seed de catálogo e estoque (`catalog.seed.ts`, chamado de
  `seeds/index.ts` logo após `seedUsers`). 2 categorias, 3 seções, 5 produtos,
  4 ingredientes e 4 linhas de receita (`product_ingredients`) via `INSERT`
  com IDs fixos + `onConflictDoNothing` — mesmo padrão de todo o resto de
  `seeds/*.ts` no projeto (a regra "seed só via use-case" do `code-standart.md`
  não é o que os seeds existentes já fazem; segui a convenção real do
  arquivo). A entrada de estoque em si roda por `CreateStockBatchUseCase`
  (não por `INSERT` bruto), guardada por uma checagem de lote já existente por
  ingrediente para ficar idempotente em reexecução.
  *Verificação (feita ao vivo):* `npm run db:seed` popula produtos,
  ingredientes com `costPerUnit`/`stockQuantity` corretos e `minimumStock`;
  rodar o seed uma segunda vez não duplica nem altera o saldo.

## Fase 2 — Estoque na interface
> 🤖 Modelo: `sonnet`

- **T2.1** ✅ Tela de entrada de lote a partir do `IngredientManager`.
  - Backend: `GET /stock-batches?ingredientId=` (`StockBatchController.listByIngredient`)
    lista os lotes de um ingrediente ordenados por validade.
  - Frontend: `StockBatchList.tsx` já existia mas estava dessincronizado do
    schema atual (`unitCost` em vez de `costPerUnit`, sem `batchNumber`,
    campos `notes`/`purchasedAt` removidos numa migration anterior) e nunca
    era montado em lugar nenhum. Corrigido para usar os campos reais do
    backend e conectado ao `IngredientManager` via linha expansível
    (chevron por ingrediente) que revela a lista de lotes e o botão
    "Entrada" (modal com número do lote, quantidade, custo unitário e
    validade).
  - Corrigido também um bug de layout pré-existente na lista de ingredientes
    da sidebar: nome do ingrediente e badges de custo/estoque se sobrepunham
    visualmente em telas estreitas (texto sem `truncate` vazando por cima do
    irmão flex). Reestruturado em duas linhas (nome+ações / custo+estoque).
  - *Verificação (feita ao vivo, via browser):* login como `gerente@orderhub.io`,
    `/catalog` → expandir "Arroz" mostra o lote seedado `SEED-000`; "Entrada"
    abre o modal, submeter lote `TESTE-UI-001` (3kg @ R$7,00, validade
    31/12/2026) atualiza a lista, o estoque do ingrediente (20→23) e o custo
    médio ponderado (6.50→6.5652) em tempo real. `vite build` sem erros.
    Dados de teste revertidos via SQL após a verificação.
- **T2.2** ✅ Painel de estoque: saldo, custo médio, mínimo, lotes com validade,
  e o histórico de movimentos do ingrediente (a auditoria só serve se for
  visível).
  - Backend: `GET /stock-movements?ingredientId=` (`StockMovementController.listByIngredient`)
    lista as últimas 50 movimentações do ingrediente (tipo, quantidade,
    motivo, usuário via join, pedido, data), mais recentes primeiro.
  - Frontend: `StockMovementHistory.tsx` (tabela com badge colorido por tipo
    — entrada/saída/ajuste/perda) e badge de estoque mínimo direto na linha
    do ingrediente (`mín. X.XX`), ambos conectados ao `IngredientManager`.
  - *Verificação (feita ao vivo, via browser):* `/catalog` → expandir "Arroz"
    mostra "mín. 5.00" ao lado do saldo e a tabela "Histórico de
    movimentações" com a entrada de lote seedada.
- **T2.3** ✅ Ajuste e perda com motivo obrigatório no formulário.
  - Frontend: `StockAdjustmentForm.tsx` — botão "Ajuste / perda" no
    `IngredientManager` abre modal com Tipo (ajuste/perda), Direção
    (aumentar/diminuir, só para ajuste), Quantidade e Motivo (obrigatório,
    valida antes de enviar). Usa `POST /stock-movements` (backend já existia
    desde a T1.3).
  - *Verificação (feita ao vivo, via browser):* registrar um ajuste de +1kg
    em "Arroz" atualiza o badge de estoque (20→21) e a linha aparece no
    histórico de movimentações em tempo real. Dados de teste revertidos via
    SQL após a verificação.

## Fase 3 — Gestão de produto que falta
> 🤖 Modelo: `sonnet`

- **T3.1** ✅ `POST /catalog/products/bulk` (CSV) → habilita o `BulkImport` do SDK,
  que está pronto e desligado só por falta de rota. (Era a T4.1 da spec
  `products-sdk-migration`.)
  - Backend: `parseProductsCsv.ts` (parser tolerante a cabeçalho com/sem
    acento — `nome`/`preço`/`descrição`/`unidade`/`código_barras`/`catálogo`)
    + `CatalogController.bulkImportProducts` reaproveitando o parser
    multipart já usado em `UploadController`/`ExpenseController`. Cada linha
    é validada e inserida individualmente (mesmas regras de slug único do
    `createProduct`); erros de linha não interrompem o lote.
  - Frontend: `productsApiAdapter.bulkImportProducts` trocou o `reject`
    fixo por um `fetch` multipart (mesmo padrão do `useUpload.ts`), plugando
    o `BulkImport` do SDK que já existia desligado.
  - *Verificação (feita ao vivo, via `curl`):* CSV com 2 produtos válidos →
    `{"succeeded":2,"failed":0}` e os produtos aparecem em
    `GET /catalog/products`; reenviar o mesmo arquivo →
    `{"succeeded":0,"failed":2,"errors":[...]}` com mensagem de duplicidade
    por linha; CSV com preço vazio → erro de validação por linha. Produtos
    de teste revertidos via SQL após a verificação.
- **T3.2** ✅ Ações em lote no `ProductList` do SDK: seleção por linha,
  ativar/desativar, mover de catálogo e reajuste percentual de preço. Isso
  também cobre a dívida do padrão de listagens (checkbox + barra de ação em
  lote, ordenação por cabeçalho, filtros na URL), que o `ProductList` ainda não
  cumpre. **Adição no pacote**, não no Order Hub.
  - Implementado em `adatechnology-packages` (repo irmão), pacote
    `@adatechnology/products-ui`, branch `feat/products-bulk-actions`
    (commit `bf5446c`, aberta a partir de `main`).
    `ProductList.tsx` ganhou a prop `bulkActionsEnabled` (desligada por
    padrão — lista só-leitura, como um seletor de produto num pedido, não
    deve oferecer ativar/desativar): checkbox por linha, "selecionar todos"
    no cabeçalho, e barra de ação com ativar/desativar, mover para catálogo
    (via `listCatalogs`) e reajuste percentual de preço. Cada ação dispara
    N chamadas `updateProduct` em paralelo — o contrato `ProductsApi` não
    tem endpoint de batch — e uma falha isolada não aborta as demais.
    Ordenação por cabeçalho já existia no componente; **filtros na URL
    seguem como dívida em aberto** (o `ProductList` ainda não tem UI de
    filtro nenhuma, é debt maior que cabe numa task própria).
  - *Verificação:* `npm run check` (tsc --noEmit) e `npm run build` do
    pacote sem erros. Sem suíte de testes no pacote (nenhuma pré-existente
    em `products-ui`); verificação visual em navegador não feita porque o
    componente ainda não está montado em nenhuma tela do Order Hub — é
    biblioteca aguardando consumidor. Changeset registrado
    (`.changeset/product-list-bulk-actions.md`, minor).
- ✅ **T3.3** Duplicar produto — variação de tamanho e sabor é o caso comum, e
  hoje se resolve redigitando.
  - *Implementação:* botão "Duplicar" em `CatalogPage.tsx`, ao lado de
    "Editar", em cada card de produto. Sem endpoint novo — abre o modal em
    modo de criação com `duplicateSource` guardando o produto de origem;
    `sdkInitialProduct` monta os `initialValues` do `ProductForm` a partir
    dele (nome com sufixo " (cópia)", preço, catálogo, seção, unidade,
    tempo/instruções de preparo). Código de barras não é copiado — copiar
    geraria duplicidade no lookup de código de barras que o T3.1 usa para
    achar produto existente. Submit reaproveita `createProd` (POST
    `/catalog/products`), o mesmo caminho do "Novo produto".
  - *Verificação:* `tsc --noEmit` sem novos erros (os 13 erros do
    `apps/web` são pré-existentes, confirmado via `git stash` antes/depois
    da mudança — nenhum introduzido por esta task). Testado ao vivo no
    navegador: clicar "Duplicar" em "Refrigerante Lata" abriu o modal
    "Duplicar · Refrigerante Lata" com nome "Refrigerante Lata (cópia)",
    descrição, preço R$ 6,00 e catálogo/seção "Bebidas" pré-preenchidos e
    código de barras vazio; salvar criou o produto (6 produtos na lista),
    depois excluído para limpar o dado de teste (voltou a 5).
- ✅ **T3.4** Histórico de preço (`product_price_history`: produto, preço anterior,
  novo, autor, data). Sem ele não há como responder "quando esse item subiu",
  e retroagir depois é impossível: o dado não existe em lugar nenhum.
  - *Implementação:* tabela `product_price_history` (migration
    `0028_add_product_price_history.sql`, aplicada manualmente ao Postgres
    de dev via `psql` — sem `drizzle-kit generate` interativo disponível
    neste ambiente; `drizzle-kit migrate` aplica a mesma migration em
    produção normalmente). `CatalogController.updateProduct` grava uma
    linha só quando `Number(existing.price) !== Number(updated.price)`, com
    `previousPrice`, `newPrice` e `userId` de quem editou — descrição,
    catálogo etc. não geram entrada, só preço. Rota nova `GET
    /catalog/products/:id/price-history`, ordenada por `createdAt desc`,
    com o nome do autor via relation `user`. Ainda sem UI própria no
    frontend (fica pendente numa task de tela); a API está completa e
    testável.
  - *Verificação:* `tsc --noEmit` sem novos erros nos arquivos tocados
    (`CatalogController.ts`, `CatalogRoutes.ts`, schema/relations).
    Testado ao vivo via curl: `PUT` alterando preço de R$6,00 para R$6,50
    gerou 1 linha em `price-history` com `previousPrice: "6.00"`,
    `newPrice: "6.50"` e o usuário autenticado; um segundo `PUT` mudando só
    a descrição (preço igual) não criou linha nova — confirmado que a
    lista de histórico continuou com 1 item. Preço e descrição revertidos
    ao valor original e as 2 linhas de teste (subida e volta) apagadas do
    banco ao final.
- **T3.5** Upload de imagem — **bloqueado**. Depende de storage de objetos, que
  o `apps/api` não tem (mesmo bloqueio dos documentos das conversas). Fica aqui
  registrado para não ser redescoberto.

---

## Fase 4 — Cadastro inteligente de produto 🧠
> 🤖 Modelo: `opus` (desenho) → `sonnet` (implementação por provider)

A ideia é boa, mas ela se divide em duas coisas com viabilidades **muito**
diferentes, e tratá-las como uma só é o que faria a feature falhar.

### 4A — Enriquecimento do item (dado externo, viável hoje)

Já existe meio caminho: `OpenFoodFactsProvider` com `search` e `getByBarcode`,
ligado no `ProductForm` do SDK via `onSearchSuggestions` e `onScanBarcode`.
Devolve nome, marca, imagem e categoria.

Limites reais dessa base, que precisam estar claros antes de prometer:
cobre **alimento embalado com GTIN** — hortifrúti, prato pronto e serviço não
existem lá; descrição é fraca ou ausente; e **não tem preço**.

- **T4.1** Cache dos resultados externos (Redis, TTL longo) por código de barras
  e por termo. Chamada externa em digitação é lenta e instável, e o mesmo item
  é consultado por todo estabelecimento da base.
- **T4.2** Segundo provider de GTIN atrás da mesma interface `ProductLookup`,
  para trazer **NCM** e descrição fiscal (Cosmos/Bluesoft, GS1). É serviço pago
  e por chave — a interface fica pronta, a contratação é decisão comercial.
  Traz o NCM que hoje é digitado à mão no catálogo e alimenta direto a NFC-e.
- **T4.3** Fallback ordenado e explícito: cache → OpenFoodFacts → provider
  fiscal → nada. Nunca gravar sozinho: sugestão **preenche o formulário**, o
  usuário confirma. Dado externo é entrada não confiável e passa por Zod, na
  mesma régua de qualquer outra fronteira.

### 4B — Preço sugerido por região (parcialmente viável, com ressalva)

Não existe base nacional pública de preço. O que existe é o programa de
transparência de NFC-e das SEFAZ estaduais — "Preço da Hora" (BA), "Menor Preço"
(PR, RS, SP entre outros) — que expõem preço praticado por GTIN e raio
geográfico, alimentado por nota fiscal real.

Isso significa: **cobertura por UF, não nacional**, contrato diferente por
estado, e disponibilidade que não dá para garantir. É uma feature honesta se for
apresentada como *"preço praticado na sua região, quando disponível"*, e uma
promessa quebrada se for vendida como universal.

- **T4.4** Interface `RegionalPriceProvider` + implementação para **uma** UF
  primeiro (a do estabelecimento piloto). Entrada: GTIN + CEP/raio. Saída:
  mínimo, médio, máximo e data da coleta — sem data o número engana.
- **T4.5** Na tela, sugestão de preço aparece como **referência ao lado do
  campo**, nunca preenchendo sozinha, e sempre acompanhada da margem que aquele
  preço daria sobre o custo do último lote (Fase 1). É aqui que o estoque paga a
  integração: sem custo real, "preço da região" não informa decisão nenhuma.

### 4C — Sugestão de produtos e kits (o mais valioso, e nem precisa de fora)

Aqui eu discordo do caminho externo. Base externa não sabe o que **este**
estabelecimento vende junto; o histórico de pedidos sabe, e ele já está no banco.

- **T4.6** "Comprados juntos": co-ocorrência de itens em `order_items` no mesmo
  pedido, calculada em job agendado (não na requisição). Alimenta sugestão de
  kit no cadastro e upsell no bot do WhatsApp — o mesmo dado serve às duas
  telas.
- **T4.7** Kit/combo como produto composto: um produto que agrega outros com
  preço próprio, que ao ser vendido baixa a receita de cada componente
  (reaproveita T1.2 direto).
- **T4.8** Sugestão de itens que faltam no catálogo, a partir do que a região
  vende e o estabelecimento não tem. **Depende de 4B** e só é honesto no estado
  com cobertura. Último da fila.

### Ordem recomendada

`4A (cache + fallback)` → `4C (kits e comprados juntos)` → `4B (preço regional,
uma UF)` → `4A T4.2 (provider fiscal pago)`.

O 4C entrega valor sem depender de terceiro, de contrato ou de cobertura
estadual — e é o que mais muda o ticket médio.

---

## Riscos e regras que valem para tudo aqui

- Movimentação de estoque é **efeito com dinheiro atrás**: transação,
  idempotência e trilha de auditoria em toda escrita. Sem exceção.
- Todo provider externo é encapsulado atrás de interface e injetado (nada de
  `new` acoplado), com timeout, cache e degradação silenciosa — catálogo não
  pode parar de abrir porque a OpenFoodFacts caiu.
- Resposta de API externa é entrada não confiável: valida com Zod antes de
  chegar perto do formulário.
- Nenhum dado pessoal em log de estoque; `userId` opaco basta para a auditoria.
