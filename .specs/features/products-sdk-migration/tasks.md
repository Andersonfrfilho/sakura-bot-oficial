# Migração do catálogo para `@adatechnology/products-ui`

O pacote já está declarado em `apps/web/package.json` e nunca foi importado.
A tela `/catalog` (864 linhas) faz tudo à mão. Esta spec traz o SDK para dentro
dela **sem perder nada** — o SDK cobre menos que a tela atual, e o que ele não
cobre continua sendo código do Order Hub.

## Tradução de vocabulário (fonte de todo o risco)

| SDK | Order Hub | Observação |
|---|---|---|
| `Catalog` | `Category` (`/catalog/categories`) | mesmo conceito, nome diferente |
| `priceInCents: number` | `price: string` (decimal em reais) | centavo inteiro ↔ string decimal |
| `costPriceInCents` | `costPrice: string \| null` | idem |
| `PaginatedResponse<T>` | array puro | a rota não pagina; envelopar |
| `Section = {id,name,catalogId}` | `Section = {id,name,description}` | **armadilha**: o `Section` do SDK é subdivisão de catálogo; o do Order Hub é setor de produção (cozinha, bar). O `ProductForm` filtra seções por `catalogId`, então cada setor precisa ser expandido em uma entrada por categoria |

## O que o SDK **não** cobre (fica como está — remover seria regressão)

`ncmCode`/`cfopCode`/`cstIcms` na categoria (fiscal), `slug`,
`preparationInstructions`, ingredientes, receitas + `RecipeCostBadge`,
lotes de estoque + `ExpiringBatchBadge`, scanner de código de barras,
sugestões externas (`/catalog/product-search`, `/catalog/product-lookup/:barcode`).

Também não há rota de importação em massa na API, então `BulkImport` fica fora
até `POST /catalog/products/bulk` existir.

## Fase 1 — Adaptador e helpers
> 🤖 Modelo: `sonnet`

- **T1.1** ✅ `apps/web/src/lib/productsApiAdapter.ts`: implementa `ProductsApi`
  sobre as rotas existentes, com a conversão reais↔centavos isolada num único
  lugar. `uploadImage` e `bulkImportProducts` lançam erro explícito (não há rota).
- **T1.2** ✅ `formatBRL` local sai; entra `formatMoney` do SDK, que é o mesmo
  formatador que os componentes usam internamente — duas implementações de
  dinheiro na mesma tela divergem cedo ou tarde.
- **T1.3** ✅ `ProductsProvider` embrulha a `CatalogPage` com `fields` declarando
  só o que o Order Hub tem.

## Fase 2 — Componentes de leitura
> 🤖 Modelo: `sonnet`

- **T2.1** Margem por produto via `formatMarginPercent` (custo já está no schema).
- **T2.2** `formatBarcode` na exibição do código de barras.
- **T2.3** Atalhos de margem no formulário via `applyMarginToCost`.

## Fase 3 — Formulário 🧠
> 🤖 Modelo: `opus` — decide se o `ProductForm` do SDK substitui o formulário
> atual ou se o Order Hub mantém o seu.

O `ProductForm` do SDK não tem `preparationInstructions`, scanner nem sugestões
externas. Substituí-lo hoje é regressão. Só entra se o SDK ganhar `slot`
de campos extras, ou se esses campos migrarem para uma aba separada.

## Fase 4 — Backend faltante
> 🤖 Modelo: `sonnet`

- **T4.1** `POST /catalog/products/bulk` (CSV) → habilita `BulkImport`.
- **T4.2** Upload de imagem depende de storage de objetos, que o `apps/api`
  não tem (mesmo bloqueio dos documentos das conversas). Fora de escopo.
