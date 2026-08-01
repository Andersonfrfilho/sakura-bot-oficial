import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Plus, Pencil, Trash2, ScanLine } from 'lucide-react'
import { SectionManager } from './components/SectionManager'
import { IngredientManager } from './components/IngredientManager'
import { RecipeManager, RecipeCostBadge } from './components/RecipeManager'
import { BarcodeScanner } from './components/BarcodeScanner'
import { ExpiringBatchBadge } from './components/StockBatchList'
import {
  ProductsProvider,
  PRODUCT_OPTIONAL_FIELD,
  applyMarginToCost,
  formatBarcode,
  formatMarginPercent,
  formatMoney,
  useProductsConfig,
  type MoneyFormat,
} from '@adatechnology/products-ui'
import { productsApiAdapter } from '@/lib/productsApiAdapter'

const MONEY_FORMAT: MoneyFormat = { currency: 'BRL', locale: 'pt-BR' }

// Só os campos que existem no schema do Order Hub. `INVENTORY` e `SYNC_STATUS` ficam de fora:
// estoque vive em `stock_batches` por ingrediente, não por produto, e não há sincronização externa.
const PRODUCTS_FIELDS = [
  PRODUCT_OPTIONAL_FIELD.COST_PRICE,
  PRODUCT_OPTIONAL_FIELD.UNIT,
  PRODUCT_OPTIONAL_FIELD.BARCODE,
  PRODUCT_OPTIONAL_FIELD.SECTION,
  PRODUCT_OPTIONAL_FIELD.PREPARATION_TIME,
] as const

// Margem sobre o preço de venda, que é a definição do SDK e a usada no varejo. Por isso o teto é
// abaixo de 100%: uma margem de 100% sobre a venda implicaria custo zero.
const MARGIN_SHORTCUT_PERCENTS = [30, 50, 60] as const

interface Category {
  id: string
  name: string
  slug: string
  active: boolean
  sortOrder: number
  ncmCode?: string
  cfopCode?: string
  cstIcms?: string
}

interface Section {
  id: string
  name: string
  description: string | null
}

interface Product {
  id: string
  name: string
  description: string | null
  price: string
  costPrice: string | null
  unit: string
  barcode: string | null
  categoryId: string | null
  sectionId: string | null
  preparationTimeMinutes: number | null
  preparationInstructions: string | null
  active: boolean
  sortOrder: number
}

type ProductFormData = {
  name: string
  description: string
  price: string
  costPrice: string
  unit: string
  barcode: string
  categoryId: string
  sectionId: string
  preparationTimeMinutes: string
  preparationInstructions: string
  sortOrder: string
}

interface ProductSuggestion {
  name: string
  brand?: string
  barcode?: string
  imageUrl?: string
  category?: string
}

type CategoryFormData = {
  name: string
  sortOrder: string
  ncmCode: string
  cfopCode: string
  cstIcms: string
}

const EMPTY_PRODUCT: ProductFormData = { name: '', description: '', price: '', costPrice: '', unit: 'un', barcode: '', categoryId: '', sectionId: '', preparationTimeMinutes: '', preparationInstructions: '', sortOrder: '0' }
const EMPTY_CATEGORY: CategoryFormData = { name: '', sortOrder: '0', ncmCode: '', cfopCode: '', cstIcms: '' }

// A API guarda o preço como decimal em reais e o SDK formata centavo inteiro. A multiplicação
// arredondada mora só aqui — ver `productsApiAdapter` para o mesmo contrato do lado das mutações.
function toCents(value: string | number): number {
  return Math.round(Number(value) * 100)
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2)
}

function formatBRL(value: string | number) {
  return formatMoney(toCents(value), MONEY_FORMAT)
}

export function CatalogPage() {
  return (
    <ProductsProvider
      api={productsApiAdapter}
      config={{
        currency: MONEY_FORMAT.currency,
        locale: MONEY_FORMAT.locale,
        fields: PRODUCTS_FIELDS,
        marginShortcutPercents: MARGIN_SHORTCUT_PERCENTS,
      }}
    >
      <CatalogPageContent />
    </ProductsProvider>
  )
}

function CatalogPageContent() {
  const { marginShortcutPercents } = useProductsConfig()
  const marginShortcuts = marginShortcutPercents ?? MARGIN_SHORTCUT_PERCENTS
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()

  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)

  // Category modal
  const [catModal, setCatModal] = useState<'create' | 'edit' | 'delete' | null>(null)
  const [selectedCat, setSelectedCat] = useState<Category | null>(null)
  const [catForm, setCatForm] = useState<CategoryFormData>(EMPTY_CATEGORY)
  const [catError, setCatError] = useState<string | null>(null)

  // Product modal
  const [prodModal, setProdModal] = useState<'create' | 'edit' | 'delete' | null>(null)
  const [selectedProd, setSelectedProd] = useState<Product | null>(null)
  const [prodForm, setProdForm] = useState<ProductFormData>(EMPTY_PRODUCT)
  const [prodError, setProdError] = useState<string | null>(null)
  const [showScanner, setShowScanner] = useState(false)

  // Product search state
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['catalog-categories'] })
    void queryClient.invalidateQueries({ queryKey: ['catalog-products'] })
    void queryClient.invalidateQueries({ queryKey: ['menu'] })
    void queryClient.invalidateQueries({ queryKey: ['sections'] })
  }

  const { data: categories = [] } = useQuery({
    queryKey: ['catalog-categories'],
    queryFn: () => api.get<Category[]>('/catalog/categories', accessToken ?? undefined),
  })

  const { data: allProducts = [] } = useQuery({
    queryKey: ['catalog-products'],
    queryFn: () => api.get<Product[]>('/catalog/products', accessToken ?? undefined),
  })

  const { data: sections = [] } = useQuery({
    queryKey: ['sections'],
    queryFn: () => api.get('/sections', accessToken ?? undefined) as Promise<Section[]>,
  })

  const visibleProducts = selectedCatId === null
    ? allProducts
    : selectedCatId === '__none__'
    ? allProducts.filter((p) => p.categoryId === null)
    : allProducts.filter((p) => p.categoryId === selectedCatId)

  // Category mutations
  const createCat = useMutation({
    mutationFn: (body: unknown) => api.post('/catalog/categories', body, accessToken ?? undefined),
    onSuccess: () => { invalidate(); closeCatModal() },
    onError: (e: Error) => setCatError(e.message),
  })
  const updateCat = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) =>
      api.put(`/catalog/categories/${id}`, body, accessToken ?? undefined),
    onSuccess: () => { invalidate(); closeCatModal() },
    onError: (e: Error) => setCatError(e.message),
  })
  const deleteCat = useMutation({
    mutationFn: (id: string) => api.delete(`/catalog/categories/${id}`, accessToken ?? undefined),
    onSuccess: () => { invalidate(); closeCatModal(); setSelectedCatId(null) },
    onError: (e: Error) => setCatError(e.message),
  })

  // Product mutations
  const createProd = useMutation({
    mutationFn: (body: unknown) => api.post('/catalog/products', body, accessToken ?? undefined),
    onSuccess: () => { invalidate(); closeProdModal() },
    onError: (e: Error) => setProdError(e.message),
  })
  const updateProd = useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) =>
      api.put(`/catalog/products/${id}`, body, accessToken ?? undefined),
    onSuccess: () => { invalidate(); closeProdModal() },
    onError: (e: Error) => setProdError(e.message),
  })
  const toggleProd = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/catalog/products/${id}/toggle-active`, {}, accessToken ?? undefined),
    onSuccess: invalidate,
  })
  const deleteProd = useMutation({
    mutationFn: (id: string) => api.delete(`/catalog/products/${id}`, accessToken ?? undefined),
    onSuccess: () => { invalidate(); closeProdModal() },
    onError: (e: Error) => setProdError(e.message),
  })

  function openCreateCat() {
    setCatForm(EMPTY_CATEGORY)
    setCatError(null)
    setCatModal('create')
  }

  function openEditCat(cat: Category) {
    setSelectedCat(cat)
    setCatForm({
      name: cat.name,
      sortOrder: String(cat.sortOrder),
      ncmCode: cat.ncmCode ?? '',
      cfopCode: cat.cfopCode ?? '',
      cstIcms: cat.cstIcms ?? '',
    })
    setCatError(null)
    setCatModal('edit')
  }

  function openDeleteCat(cat: Category) {
    setSelectedCat(cat)
    setCatError(null)
    setCatModal('delete')
  }

  function closeCatModal() {
    setCatModal(null)
    setSelectedCat(null)
    setCatForm(EMPTY_CATEGORY)
    setCatError(null)
  }

  function submitCat() {
    const body = {
      name: catForm.name,
      sortOrder: parseInt(catForm.sortOrder) || 0,
      ncmCode: catForm.ncmCode || undefined,
      cfopCode: catForm.cfopCode || undefined,
      cstIcms: catForm.cstIcms || undefined,
    }
    if (catModal === 'create') createCat.mutate(body)
    else if (catModal === 'edit' && selectedCat) updateCat.mutate({ id: selectedCat.id, body })
    else if (catModal === 'delete' && selectedCat) deleteCat.mutate(selectedCat.id)
  }

  function openCreateProd() {
    setProdForm({ ...EMPTY_PRODUCT, categoryId: selectedCatId ?? '' })
    setProdError(null)
    setProdModal('create')
  }

  function openEditProd(prod: Product) {
    setSelectedProd(prod)
    setProdForm({
      name: prod.name,
      description: prod.description ?? '',
      price: prod.price,
      costPrice: prod.costPrice ?? '',
      unit: prod.unit ?? 'un',
      barcode: prod.barcode ?? '',
      categoryId: prod.categoryId ?? '',
      sectionId: prod.sectionId ?? '',
      preparationTimeMinutes: prod.preparationTimeMinutes?.toString() ?? '',
      preparationInstructions: prod.preparationInstructions ?? '',
      sortOrder: String(prod.sortOrder),
    })
    setProdError(null)
    setProdModal('edit')
  }

  function openDeleteProd(prod: Product) {
    setSelectedProd(prod)
    setProdError(null)
    setProdModal('delete')
  }

  function closeProdModal() {
    setProdModal(null)
    setSelectedProd(null)
    setProdForm(EMPTY_PRODUCT)
    setProdError(null)
  }

  function submitProd() {
    const body = {
      name: prodForm.name,
      description: prodForm.description || undefined,
      price: parseFloat(prodForm.price),
      costPrice: prodForm.costPrice ? parseFloat(prodForm.costPrice) : null,
      unit: prodForm.unit,
      barcode: prodForm.barcode || null,
      categoryId: prodForm.categoryId || null,
      sectionId: prodForm.sectionId || null,
      preparationTimeMinutes: prodForm.preparationTimeMinutes ? parseInt(prodForm.preparationTimeMinutes) : null,
      preparationInstructions: prodForm.preparationInstructions || null,
      sortOrder: parseInt(prodForm.sortOrder) || 0,
    }
    if (prodModal === 'create') createProd.mutate(body)
    else if (prodModal === 'edit' && selectedProd) updateProd.mutate({ id: selectedProd.id, body })
    else if (prodModal === 'delete' && selectedProd) deleteProd.mutate(selectedProd.id)
  }

  const handleSearchInput = useCallback((value: string) => {
    setSearchQuery(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (value.length < 2) {
      setSuggestions([])
      return
    }
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const results = await api.get<ProductSuggestion[]>(
          `/catalog/product-search?q=${encodeURIComponent(value)}`,
          accessToken ?? undefined
        )
        setSuggestions(results)
      } catch {
        setSuggestions([])
      } finally {
        setSearchLoading(false)
      }
    }, 400)
  }, [accessToken])

  function selectSuggestion(suggestion: ProductSuggestion) {
    setProdForm((prev) => ({
      ...prev,
      name: suggestion.name,
      barcode: suggestion.barcode ?? prev.barcode,
    }))
    setSearchQuery('')
    setSuggestions([])
    setSearchOpen(false)
  }

  async function handleBarcodeScan(barcode: string) {
    setProdForm((prev) => ({ ...prev, barcode }))
    setShowScanner(false)
    try {
      const suggestion = await api.get<ProductSuggestion | null>(
        `/catalog/product-lookup/${barcode}`,
        accessToken ?? undefined
      )
      if (suggestion) {
        setProdForm((prev) => ({
          ...prev,
          name: suggestion.name || prev.name,
          barcode: suggestion.barcode ?? prev.barcode,
        }))
      }
    } catch {
      // Product not found — keep barcode in form
    }
  }

  const isCatPending = createCat.isPending || updateCat.isPending || deleteCat.isPending
  const isProdPending = createProd.isPending || updateProd.isPending || deleteProd.isPending

  const uncategorizedCount = allProducts.filter((p) => p.categoryId === null).length

  const catModalTitle =
    catModal === 'create' ? 'Nova categoria' : catModal === 'edit' ? `Editar · ${selectedCat?.name}` : 'Excluir categoria'
  const prodModalTitle =
    prodModal === 'create' ? 'Novo produto' : prodModal === 'edit' ? `Editar · ${selectedProd?.name}` : 'Excluir produto'

  return (
    <div className="flex h-full min-h-screen">
      {/* Left panel — categories */}
      <div className="w-56 flex-shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Categorias</p>
          <button
            onClick={openCreateCat}
            className="flex items-center justify-center gap-2 w-full py-2 text-xs font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 transition-colors active:scale-95"
          >
            <Plus className="h-4 w-4" />
            Nova categoria
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          <button
            onClick={() => setSelectedCatId(null)}
            className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
              selectedCatId === null
                ? 'bg-brand-50 text-brand-700 font-medium'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <span>Todos</span>
            <span className="float-right text-xs text-gray-400">{allProducts.length}</span>
          </button>

          {categories.map((cat) => {
            const count = allProducts.filter((p) => p.categoryId === cat.id).length
            return (
              <div key={cat.id} className="group relative">
                <button
                  onClick={() => setSelectedCatId(cat.id)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                    selectedCatId === cat.id
                      ? 'bg-brand-50 text-brand-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-100'
                  } ${!cat.active ? 'opacity-50' : ''}`}
                >
                  <span className="truncate block pr-8">{cat.name}</span>
                  <span className="float-right text-xs text-gray-400">{count}</span>
                </button>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex gap-1">
                  <button
                    onClick={() => openEditCat(cat)}
                    className="p-1 text-gray-400 hover:text-brand-600"
                    title="Editar"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => openDeleteCat(cat)}
                    className="p-1 text-gray-400 hover:text-red-500"
                    title="Excluir"
                  >
                    ×
                  </button>
                </div>
              </div>
            )
          })}

          {uncategorizedCount > 0 && (
            <button
              onClick={() => setSelectedCatId('__none__')}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                selectedCatId === '__none__'
                  ? 'bg-brand-50 text-brand-700 font-medium'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              <span className="italic">Sem categoria</span>
              <span className="float-right text-xs text-gray-400">{uncategorizedCount}</span>
            </button>
          )}

          <div className="px-4">
            <SectionManager />
            <IngredientManager />
          </div>
        </div>
      </div>

      {/* Right panel — products */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h1 className="text-lg font-bold text-gray-900">
              {selectedCatId === null
                ? 'Todos os produtos'
                : selectedCatId === '__none__'
                ? 'Sem categoria'
                : (categories.find((c) => c.id === selectedCatId)?.name ?? '')}
            </h1>
            <p className="text-sm text-gray-400">{visibleProducts.length} produto{visibleProducts.length !== 1 ? 's' : ''}</p>
            <ExpiringBatchBadge className="mt-1" />
          </div>
          <button
            onClick={openCreateProd}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors active:scale-95"
          >
            <Plus className="h-4 w-4" />
            Novo produto
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {visibleProducts.length === 0 ? (
            <p className="text-gray-400 text-center py-16">Nenhum produto nesta categoria</p>
          ) : (
            <div className="grid gap-3">
              {visibleProducts.map((prod) => {
                const cat = categories.find((c) => c.id === prod.categoryId)
                const sec = sections.find((s) => s.id === prod.sectionId)
                return (
                  <div
                    key={prod.id}
                    className={`bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 ${!prod.active ? 'opacity-60' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 truncate">{prod.name}</span>
                        {!prod.active && (
                          <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">Inativo</span>
                        )}
                        {cat && (
                          <span className="text-xs px-2 py-0.5 bg-brand-50 text-brand-600 rounded-full">{cat.name}</span>
                        )}
                        {sec && (
                          <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full">{sec.name}</span>
                        )}
                      </div>
                      {prod.description && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">{prod.description}</p>
                      )}
                      {prod.barcode && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">
                          Cód: {formatBarcode(prod.barcode)}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-gray-900">{formatBRL(prod.price)}</p>
                      <RecipeCostBadge
                        productId={prod.id}
                        productPrice={prod.price}
                        costPrice={prod.costPrice}
                      />
                      {prod.costPrice && (
                        <p className="text-xs text-gray-300 mt-0.5">
                          Custo cadastrado {formatBRL(prod.costPrice)} · margem{' '}
                          {formatMarginPercent(toCents(prod.costPrice), toCents(prod.price))}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => openEditProd(prod)}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => toggleProd.mutate(prod.id)}
                        disabled={toggleProd.isPending}
                        className={`px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${
                          prod.active
                            ? 'text-orange-600 border-orange-200 hover:bg-orange-50'
                            : 'text-green-600 border-green-200 hover:bg-green-50'
                        }`}
                      >
                        {prod.active ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        onClick={() => openDeleteProd(prod)}
                        className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Category modal */}
      <Modal open={catModal !== null} onClose={closeCatModal} title={catModalTitle} size="sm">
            <div className="p-5 space-y-4">
              {catModal === 'delete' ? (
                <p className="text-sm text-gray-600">
                  Excluir <strong>{selectedCat?.name}</strong>? Os produtos associados ficam sem categoria.
                </p>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                    <input
                      type="text"
                      value={catForm.name}
                      onChange={(e) => setCatForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Ex: Bebidas"
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ordem</label>
                    <input
                      type="number"
                      min="0"
                      value={catForm.sortOrder}
                      onChange={(e) => setCatForm((prev) => ({ ...prev, sortOrder: e.target.value }))}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div className="border-t border-gray-100 pt-3">
                    <p className="text-xs font-medium text-gray-500 mb-2">Tributação fiscal (consultar contador)</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">NCM</label>
                        <input
                          type="text"
                          value={catForm.ncmCode}
                          onChange={(e) => setCatForm((prev) => ({ ...prev, ncmCode: e.target.value }))}
                          placeholder="21069090"
                          maxLength={8}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">CFOP</label>
                        <input
                          type="text"
                          value={catForm.cfopCode}
                          onChange={(e) => setCatForm((prev) => ({ ...prev, cfopCode: e.target.value }))}
                          placeholder="5102"
                          maxLength={4}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">CST ICMS</label>
                        <input
                          type="text"
                          value={catForm.cstIcms}
                          onChange={(e) => setCatForm((prev) => ({ ...prev, cstIcms: e.target.value }))}
                          placeholder="400"
                          maxLength={3}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
              {catError && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{catError}</p>}
              <div className="flex gap-3 pt-1">
                <button onClick={closeCatModal} className="flex-1 py-2.5 border border-gray-300 text-sm font-medium text-gray-700 rounded-xl hover:bg-gray-50">Cancelar</button>
                <button
                  onClick={submitCat}
                  disabled={isCatPending}
                  className={`flex-1 py-2.5 text-sm font-semibold rounded-xl disabled:opacity-50 ${catModal === 'delete' ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-brand-600 text-white hover:bg-brand-700'}`}
                >
                  {isCatPending ? 'Aguarde...' : catModal === 'delete' ? 'Excluir' : catModal === 'edit' ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </div>
      </Modal>

      {/* Product modal */}
      <Modal open={prodModal !== null} onClose={closeProdModal} title={prodModalTitle} size="md">
            <div className="p-5 space-y-4">
              {prodModal === 'delete' ? (
                <p className="text-sm text-gray-600">
                  Excluir <strong>{selectedProd?.name}</strong>? Esta ação não pode ser desfeita.
                </p>
              ) : (
                <>
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => { setSearchOpen(!searchOpen); setSearchQuery(''); setSuggestions([]) }}
                      className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        Buscar produto (Open Food Facts)
                      </span>
                      <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-gray-400 transition-transform ${searchOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {searchOpen && (
                      <div className="px-4 pb-3 space-y-2 border-t border-gray-100 pt-3">
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => handleSearchInput(e.target.value)}
                          placeholder="Digite o nome de um produto para buscar..."
                          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                        {searchLoading && <p className="text-xs text-gray-400">Buscando...</p>}
                        {suggestions.length > 0 && (
                          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                            {suggestions.map((suggestion, index) => (
                              <button
                                key={suggestion.barcode ?? index}
                                type="button"
                                onClick={() => selectSuggestion(suggestion)}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50 transition-colors"
                              >
                                <p className="font-medium text-gray-900 truncate">{suggestion.name}</p>
                                <p className="text-xs text-gray-400">
                                  {[suggestion.brand, suggestion.category].filter(Boolean).join(' · ')}
                                  {suggestion.barcode && <> · {suggestion.barcode}</>}
                                </p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                    <input
                      type="text"
                      value={prodForm.name}
                      onChange={(e) => setProdForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Ex: Coca-Cola 350ml"
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Descrição (opcional)</label>
                    <textarea
                      value={prodForm.description}
                      onChange={(e) => setProdForm((prev) => ({ ...prev, description: e.target.value }))}
                      placeholder="Detalhes do produto..."
                      rows={2}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Preço de custo (R$)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={prodForm.costPrice}
                      onChange={(e) => setProdForm((prev) => ({ ...prev, costPrice: e.target.value }))}
                      placeholder="0,00"
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>

                  {prodForm.costPrice && Number(prodForm.costPrice) > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        Margem rápida (sobre a venda)
                      </label>
                      <div className="flex gap-2">
                        {marginShortcuts.map((margin) => (
                          <button
                            key={margin}
                            type="button"
                            onClick={() =>
                              setProdForm((prev) => ({
                                ...prev,
                                price: fromCents(
                                  applyMarginToCost(toCents(prev.costPrice), margin)
                                ),
                              }))
                            }
                            className="flex-1 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-brand-50 hover:border-brand-300 transition-colors"
                          >
                            +{margin}%
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Preço de venda (R$)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={prodForm.price}
                        onChange={(e) => setProdForm((prev) => ({ ...prev, price: e.target.value }))}
                        placeholder="0,00"
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      {prodForm.costPrice && prodForm.price && Number(prodForm.costPrice) > 0 && (
                        <p className="text-xs text-brand-600 mt-1 font-medium">
                          Margem {formatMarginPercent(toCents(prodForm.costPrice), toCents(prodForm.price))}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Ordem</label>
                      <input
                        type="number"
                        min="0"
                        value={prodForm.sortOrder}
                        onChange={(e) => setProdForm((prev) => ({ ...prev, sortOrder: e.target.value }))}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Unidade</label>
                      <select
                        value={prodForm.unit}
                        onChange={(e) => setProdForm((prev) => ({ ...prev, unit: e.target.value }))}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        <option value="un">Unidade</option>
                        <option value="kg">Kg</option>
                        <option value="g">Grama</option>
                        <option value="l">Litro</option>
                        <option value="ml">Mililitro</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Código de barras</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={prodForm.barcode}
                          onChange={(e) => setProdForm((prev) => ({ ...prev, barcode: e.target.value }))}
                          placeholder="Código de barras (EAN)"
                          className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowScanner(true)}
                          className="px-3 py-2 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
                          title="Escanear código de barras"
                        >
                          <ScanLine className="h-4 w-4 text-gray-600" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                    <Select
                      value={prodForm.categoryId}
                      onChange={(value) => setProdForm((prev) => ({ ...prev, categoryId: value }))}
                      options={[
                        { value: '', label: 'Sem categoria' },
                        ...categories.map((cat) => ({ value: cat.id, label: cat.name })),
                      ]}
                      searchable={categories.length > 6}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Seção</label>
                    <Select
                      value={prodForm.sectionId}
                      onChange={(value) => setProdForm((prev) => ({ ...prev, sectionId: value }))}
                      options={[
                        { value: '', label: 'Nenhuma' },
                        ...sections.map((section) => ({ value: section.id, label: section.name })),
                      ]}
                      searchable={sections.length > 6}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tempo de preparo (min)</label>
                      <input
                        type="number"
                        min="1"
                        value={prodForm.preparationTimeMinutes}
                        onChange={(e) => setProdForm((prev) => ({ ...prev, preparationTimeMinutes: e.target.value }))}
                        placeholder="Ex: 30"
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Instruções de preparo</label>
                      <textarea
                        value={prodForm.preparationInstructions}
                        onChange={(e) => setProdForm((prev) => ({ ...prev, preparationInstructions: e.target.value }))}
                        placeholder="Modo de preparo..."
                        rows={2}
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </div>
                  {prodModal === 'edit' && selectedProd && (
                    <RecipeManager productId={selectedProd.id} />
                  )}
                </>
              )}
              {prodError && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{prodError}</p>}
              <div className="flex gap-3 pt-1">
                <button onClick={closeProdModal} className="flex-1 py-2.5 border border-gray-300 text-sm font-medium text-gray-700 rounded-xl hover:bg-gray-50">Cancelar</button>
                <button
                  onClick={submitProd}
                  disabled={isProdPending}
                  className={`flex-1 py-2.5 text-sm font-semibold rounded-xl disabled:opacity-50 ${prodModal === 'delete' ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-brand-600 text-white hover:bg-brand-700'}`}
                >
                  {isProdPending ? 'Aguarde...' : prodModal === 'delete' ? 'Excluir' : prodModal === 'edit' ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </div>
      </Modal>
      {showScanner && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  )
}
