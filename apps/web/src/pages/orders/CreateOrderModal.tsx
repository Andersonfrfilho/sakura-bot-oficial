import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'

interface Product {
  id: string
  name: string
  description: string | null
  price: string
  categoryId: string | null
}

interface Category {
  id: string
  name: string
  products: Product[]
}

interface Menu {
  categories: Category[]
  uncategorized: Product[]
}

interface TableWithComanda {
  id: string
  number: number
  capacity: number
  status: 'available' | 'occupied' | 'reserved'
  comanda: { id: string; code: string; customerName: string | null } | null
}

interface CartItem {
  productId: string
  productName: string
  unitPrice: number
  quantity: number
  notes: string
}

type OrderType = 'table' | 'delivery' | 'pickup'

const TYPE_LABELS: Record<OrderType, string> = {
  table: 'Mesa',
  delivery: 'Entrega',
  pickup: 'Retirada',
}

function formatBRL(value: number | string) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function CreateOrderModal({ onClose }: { onClose: () => void }) {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()

  const [step, setStep] = useState<'type' | 'menu' | 'confirm'>('type')
  const [orderType, setOrderType] = useState<OrderType>('table')
  const [selectedTable, setSelectedTable] = useState<TableWithComanda | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [globalNotes, setGlobalNotes] = useState('')
  const [search, setSearch] = useState('')
  const [activeCat, setActiveCat] = useState<string | null>(null)

  const { data: menu } = useQuery({
    queryKey: ['menu'],
    queryFn: () => api.get<Menu>('/menu', accessToken ?? undefined),
  })

  const { data: tables = [] } = useQuery({
    queryKey: ['tables'],
    queryFn: () => api.get<TableWithComanda[]>('/tables', accessToken ?? undefined),
    enabled: orderType === 'table',
  })

  const mutation = useMutation({
    mutationFn: (body: unknown) => api.post('/orders', body, accessToken ?? undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      onClose()
    },
  })

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id)
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      }
      return [...prev, {
        productId: product.id,
        productName: product.name,
        unitPrice: Number(product.price),
        quantity: 1,
        notes: '',
      }]
    })
  }

  function updateQty(productId: string, qty: number) {
    if (qty <= 0) {
      setCart((prev) => prev.filter((i) => i.productId !== productId))
    } else {
      setCart((prev) => prev.map((i) => i.productId === productId ? { ...i, quantity: qty } : i))
    }
  }

  function updateItemNotes(productId: string, notes: string) {
    setCart((prev) => prev.map((i) => i.productId === productId ? { ...i, notes } : i))
  }

  const total = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0)

  const allCategories = menu?.categories ?? []
  const filteredCategories = search
    ? allCategories.map((c) => ({
        ...c,
        products: c.products.filter((p) =>
          p.name.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter((c) => c.products.length > 0)
    : activeCat
    ? allCategories.filter((c) => c.id === activeCat)
    : allCategories

  function handleSubmit() {
    const body = {
      channel: 'manual' as const,
      type: orderType,
      tableId: selectedTable?.id,
      items: cart.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        ...(i.notes ? { notes: i.notes } : {}),
      })),
      ...(globalNotes ? { notes: globalNotes } : {}),
    }
    mutation.mutate(body)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[95vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            {step !== 'type' && (
              <button
                onClick={() => setStep(step === 'confirm' ? 'menu' : 'type')}
                className="text-gray-400 hover:text-gray-700 transition-colors"
              >
                ←
              </button>
            )}
            <h2 className="font-semibold text-gray-900">
              {step === 'type' && 'Tipo de pedido'}
              {step === 'menu' && 'Montar pedido'}
              {step === 'confirm' && 'Confirmar pedido'}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        {/* Step: tipo */}
        {step === 'type' && (
          <div className="p-6 flex-1 overflow-y-auto">
            <div className="grid grid-cols-3 gap-3 mb-6">
              {(['table', 'delivery', 'pickup'] as OrderType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => { setOrderType(t); if (t !== 'table') setSelectedTable(null) }}
                  className={`p-4 rounded-xl border-2 text-sm font-medium transition-all ${
                    orderType === t
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <div className="text-2xl mb-1">
                    {t === 'table' ? '🪑' : t === 'delivery' ? '🛵' : '🏃'}
                  </div>
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>

            {orderType === 'table' && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-3">Selecionar mesa</p>
                {tables.length === 0 ? (
                  <p className="text-sm text-gray-400">Nenhuma mesa cadastrada</p>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {tables.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTable(t === selectedTable ? null : t)}
                        className={`p-3 rounded-xl border-2 text-center transition-all ${
                          selectedTable?.id === t.id
                            ? 'border-brand-500 bg-brand-50'
                            : t.status === 'occupied'
                            ? 'border-red-200 bg-red-50 opacity-60'
                            : 'border-gray-200 hover:border-brand-300'
                        }`}
                      >
                        <p className="text-lg font-bold text-gray-900">{t.number}</p>
                        <p className="text-xs text-gray-500">{t.capacity}p</p>
                        {t.comanda && (
                          <p className="text-xs font-mono text-brand-600">{t.comanda.code}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setStep('menu')}
                disabled={orderType === 'table' && !selectedTable}
                className="px-6 py-2.5 bg-brand-600 text-white font-medium rounded-xl disabled:opacity-40 hover:bg-brand-700 transition-colors active:scale-95"
              >
                Montar pedido →
              </button>
            </div>
          </div>
        )}

        {/* Step: menu */}
        {step === 'menu' && (
          <div className="flex flex-1 min-h-0">
            {/* Products */}
            <div className="flex-1 flex flex-col min-w-0 border-r border-gray-100">
              {/* Search + category tabs */}
              <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
                <input
                  type="search"
                  placeholder="Buscar item..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setActiveCat(null) }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 mb-2"
                />
                {!search && (
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                    <button
                      onClick={() => setActiveCat(null)}
                      className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        !activeCat ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Todos
                    </button>
                    {allCategories.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setActiveCat(c.id)}
                        className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          activeCat === c.id ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Product list */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                {filteredCategories.length === 0 && (
                  <p className="text-gray-400 text-sm text-center py-8">Nenhum item encontrado</p>
                )}
                {filteredCategories.map((cat) => (
                  <div key={cat.id}>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{cat.name}</p>
                    <div className="space-y-1">
                      {cat.products.map((p) => {
                        const inCart = cart.find((i) => i.productId === p.id)
                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-gray-50 transition-colors"
                          >
                            <div className="min-w-0 flex-1 mr-3">
                              <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                              {p.description && <p className="text-xs text-gray-400 truncate">{p.description}</p>}
                              <p className="text-sm font-semibold text-brand-600 mt-0.5">{formatBRL(p.price)}</p>
                            </div>
                            {inCart ? (
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <button
                                  onClick={() => updateQty(p.id, inCart.quantity - 1)}
                                  className="w-7 h-7 rounded-full bg-gray-200 text-gray-700 font-bold flex items-center justify-center hover:bg-gray-300 transition-colors"
                                >
                                  −
                                </button>
                                <span className="w-5 text-center text-sm font-semibold">{inCart.quantity}</span>
                                <button
                                  onClick={() => updateQty(p.id, inCart.quantity + 1)}
                                  className="w-7 h-7 rounded-full bg-brand-600 text-white font-bold flex items-center justify-center hover:bg-brand-700 transition-colors"
                                >
                                  +
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => addToCart(p)}
                                className="w-7 h-7 rounded-full bg-brand-600 text-white font-bold flex items-center justify-center hover:bg-brand-700 transition-colors flex-shrink-0"
                              >
                                +
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
                {menu && menu.uncategorized.length > 0 && !activeCat && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Outros</p>
                    <div className="space-y-1">
                      {menu.uncategorized.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase())).map((p) => {
                        const inCart = cart.find((i) => i.productId === p.id)
                        return (
                          <div key={p.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-gray-50">
                            <div className="min-w-0 flex-1 mr-3">
                              <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                              <p className="text-sm font-semibold text-brand-600 mt-0.5">{formatBRL(p.price)}</p>
                            </div>
                            {inCart ? (
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <button onClick={() => updateQty(p.id, inCart.quantity - 1)} className="w-7 h-7 rounded-full bg-gray-200 text-gray-700 font-bold flex items-center justify-center">−</button>
                                <span className="w-5 text-center text-sm font-semibold">{inCart.quantity}</span>
                                <button onClick={() => updateQty(p.id, inCart.quantity + 1)} className="w-7 h-7 rounded-full bg-brand-600 text-white font-bold flex items-center justify-center">+</button>
                              </div>
                            ) : (
                              <button onClick={() => addToCart(p)} className="w-7 h-7 rounded-full bg-brand-600 text-white font-bold flex items-center justify-center flex-shrink-0">+</button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Cart sidebar */}
            <div className="w-64 flex-shrink-0 flex flex-col">
              <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
                <p className="text-sm font-semibold text-gray-700">
                  {orderType === 'table' && selectedTable ? `Mesa ${selectedTable.number}` : TYPE_LABELS[orderType]}
                  {selectedTable?.comanda && (
                    <span className="ml-1.5 text-xs font-mono text-brand-500">{selectedTable.comanda.code}</span>
                  )}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3">
                {cart.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-6">Nenhum item adicionado</p>
                ) : (
                  <div className="space-y-3">
                    {cart.map((item) => (
                      <div key={item.productId} className="text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-800 flex-1 min-w-0 truncate pr-2">{item.productName}</span>
                          <button onClick={() => updateQty(item.productId, 0)} className="text-gray-300 hover:text-red-500 transition-colors text-xs flex-shrink-0">✕</button>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => updateQty(item.productId, item.quantity - 1)} className="w-5 h-5 rounded bg-gray-100 text-gray-600 font-bold flex items-center justify-center text-xs">−</button>
                            <span className="text-xs font-semibold w-4 text-center">{item.quantity}</span>
                            <button onClick={() => updateQty(item.productId, item.quantity + 1)} className="w-5 h-5 rounded bg-brand-100 text-brand-700 font-bold flex items-center justify-center text-xs">+</button>
                          </div>
                          <span className="text-xs text-gray-500">{formatBRL(item.unitPrice * item.quantity)}</span>
                        </div>
                        <input
                          type="text"
                          placeholder="Observação..."
                          value={item.notes}
                          onChange={(e) => updateItemNotes(item.productId, e.target.value)}
                          className="mt-1 w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-400"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-600">Total</span>
                  <span className="text-base font-bold text-gray-900">{formatBRL(total)}</span>
                </div>
                <button
                  onClick={() => setStep('confirm')}
                  disabled={cart.length === 0}
                  className="w-full py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl disabled:opacity-40 hover:bg-brand-700 transition-colors active:scale-[0.98]"
                >
                  Revisar pedido →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step: confirm */}
        {step === 'confirm' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-700">Resumo</p>
                <span className="text-xs px-2 py-1 bg-brand-100 text-brand-700 rounded-full font-medium">
                  {TYPE_LABELS[orderType]}
                  {selectedTable && ` · Mesa ${selectedTable.number}`}
                  {selectedTable?.comanda && ` · ${selectedTable.comanda.code}`}
                </span>
              </div>
              <div className="space-y-2">
                {cart.map((item) => (
                  <div key={item.productId} className="flex items-start justify-between text-sm">
                    <div>
                      <span className="font-medium text-gray-800">{item.quantity}× {item.productName}</span>
                      {item.notes && <p className="text-xs text-gray-400 mt-0.5">{item.notes}</p>}
                    </div>
                    <span className="text-gray-600 ml-3 flex-shrink-0">{formatBRL(item.unitPrice * item.quantity)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
                <span className="font-semibold text-gray-900">Total</span>
                <span className="text-lg font-bold text-brand-600">{formatBRL(total)}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observação geral</label>
              <textarea
                value={globalNotes}
                onChange={(e) => setGlobalNotes(e.target.value)}
                placeholder="Ex: cliente com alergia a amendoim..."
                rows={3}
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {mutation.isError && (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
                {mutation.error instanceof Error ? mutation.error.message : 'Erro ao criar pedido'}
              </p>
            )}

            <button
              onClick={handleSubmit}
              disabled={mutation.isPending}
              className="w-full py-3 bg-brand-600 text-white font-semibold rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-colors active:scale-[0.98]"
            >
              {mutation.isPending ? 'Enviando...' : `Confirmar pedido · ${formatBRL(total)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
