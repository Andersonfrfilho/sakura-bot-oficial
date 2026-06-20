import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'

interface Category {
  id: string
  name: string
  slug: string
  active: boolean
  sortOrder: number
}

interface Product {
  id: string
  name: string
  description: string | null
  price: string
  categoryId: string | null
  active: boolean
  sortOrder: number
}

type ProductFormData = {
  name: string
  description: string
  price: string
  categoryId: string
  sortOrder: string
}

type CategoryFormData = {
  name: string
  sortOrder: string
}

const EMPTY_PRODUCT: ProductFormData = { name: '', description: '', price: '', categoryId: '', sortOrder: '0' }
const EMPTY_CATEGORY: CategoryFormData = { name: '', sortOrder: '0' }

function formatBRL(value: string | number) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function CatalogPage() {
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

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['catalog-categories'] })
    void queryClient.invalidateQueries({ queryKey: ['catalog-products'] })
    void queryClient.invalidateQueries({ queryKey: ['menu'] })
  }

  const { data: categories = [] } = useQuery({
    queryKey: ['catalog-categories'],
    queryFn: () => api.get<Category[]>('/catalog/categories', accessToken ?? undefined),
  })

  const { data: allProducts = [] } = useQuery({
    queryKey: ['catalog-products'],
    queryFn: () => api.get<Product[]>('/catalog/products', accessToken ?? undefined),
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
    setCatForm({ name: cat.name, sortOrder: String(cat.sortOrder) })
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
      categoryId: prod.categoryId ?? '',
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
      categoryId: prodForm.categoryId || null,
      sortOrder: parseInt(prodForm.sortOrder) || 0,
    }
    if (prodModal === 'create') createProd.mutate(body)
    else if (prodModal === 'edit' && selectedProd) updateProd.mutate({ id: selectedProd.id, body })
    else if (prodModal === 'delete' && selectedProd) deleteProd.mutate(selectedProd.id)
  }

  const isCatPending = createCat.isPending || updateCat.isPending || deleteCat.isPending
  const isProdPending = createProd.isPending || updateProd.isPending || deleteProd.isPending

  const uncategorizedCount = allProducts.filter((p) => p.categoryId === null).length

  return (
    <div className="flex h-full min-h-screen">
      {/* Left panel — categories */}
      <div className="w-56 flex-shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-200">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Categorias</p>
          <button
            onClick={openCreateCat}
            className="w-full py-2 text-xs font-semibold bg-brand-600 text-white rounded-xl hover:bg-brand-700 transition-colors active:scale-95"
          >
            + Nova categoria
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
          </div>
          <button
            onClick={openCreateProd}
            className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors active:scale-95"
          >
            + Novo produto
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {visibleProducts.length === 0 ? (
            <p className="text-gray-400 text-center py-16">Nenhum produto nesta categoria</p>
          ) : (
            <div className="grid gap-3">
              {visibleProducts.map((prod) => {
                const cat = categories.find((c) => c.id === prod.categoryId)
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
                      </div>
                      {prod.description && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">{prod.description}</p>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-gray-900">{formatBRL(prod.price)}</p>
                      <p className="text-xs text-gray-400">ord {prod.sortOrder}</p>
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
      {catModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">
                {catModal === 'create' && 'Nova categoria'}
                {catModal === 'edit' && `Editar · ${selectedCat?.name}`}
                {catModal === 'delete' && 'Excluir categoria'}
              </h2>
              <button onClick={closeCatModal} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
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
          </div>
        </div>
      )}

      {/* Product modal */}
      {prodModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">
                {prodModal === 'create' && 'Novo produto'}
                {prodModal === 'edit' && `Editar · ${selectedProd?.name}`}
                {prodModal === 'delete' && 'Excluir produto'}
              </h2>
              <button onClick={closeProdModal} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-5 space-y-4">
              {prodModal === 'delete' ? (
                <p className="text-sm text-gray-600">
                  Excluir <strong>{selectedProd?.name}</strong>? Esta ação não pode ser desfeita.
                </p>
              ) : (
                <>
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
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Preço (R$)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={prodForm.price}
                        onChange={(e) => setProdForm((prev) => ({ ...prev, price: e.target.value }))}
                        placeholder="0,00"
                        className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                    <select
                      value={prodForm.categoryId}
                      onChange={(e) => setProdForm((prev) => ({ ...prev, categoryId: e.target.value }))}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="">Sem categoria</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
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
          </div>
        </div>
      )}
    </div>
  )
}
