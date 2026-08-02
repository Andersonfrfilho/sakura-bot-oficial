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

- **T1.5** Seed de catálogo e estoque. Hoje nenhum seed popula produtos ou
  ingredientes — a tela do gerente abre vazia, e todo teste manual começa por
  cadastrar dado à mão. Seguindo a regra do projeto, o seed executa os próprios
  use-cases, nunca `INSERT` bruto.

## Fase 2 — Estoque na interface
> 🤖 Modelo: `sonnet`

- **T2.1** Tela de entrada de lote a partir do `IngredientManager`.
- **T2.2** Painel de estoque: saldo, custo médio, mínimo, lotes com validade,
  e o histórico de movimentos do ingrediente (a auditoria só serve se for
  visível).
- **T2.3** Ajuste e perda com motivo obrigatório no formulário.

## Fase 3 — Gestão de produto que falta
> 🤖 Modelo: `sonnet`

- **T3.1** `POST /catalog/products/bulk` (CSV) → habilita o `BulkImport` do SDK,
  que está pronto e desligado só por falta de rota. (Era a T4.1 da spec
  `products-sdk-migration`.)
- **T3.2** Ações em lote no `ProductList` do SDK: seleção por linha,
  ativar/desativar, mover de catálogo e reajuste percentual de preço. Isso
  também cobre a dívida do padrão de listagens (checkbox + barra de ação em
  lote, ordenação por cabeçalho, filtros na URL), que o `ProductList` ainda não
  cumpre. **Adição no pacote**, não no Order Hub.
- **T3.3** Duplicar produto — variação de tamanho e sabor é o caso comum, e
  hoje se resolve redigitando.
- **T3.4** Histórico de preço (`product_price_history`: produto, preço anterior,
  novo, autor, data). Sem ele não há como responder "quando esse item subiu",
  e retroagir depois é impossível: o dado não existe em lugar nenhum.
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
