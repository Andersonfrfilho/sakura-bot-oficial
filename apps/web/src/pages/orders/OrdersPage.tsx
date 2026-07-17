import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { useWebSocket } from '@/hooks/useWebSocket'
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  ORDER_CHANNEL_LABELS,
  ORDER_TYPE_LABELS,
  type OrderStatus,
} from '@/constants/orderLabels'
import { CreateOrderModal } from './CreateOrderModal'
import { Skeleton } from '@/components/ui/Skeleton'

interface Order {
  id: string
  channel: string
  type: string
  status: OrderStatus
  totalAmount: string
  notes: string | null
  receivedAt: string
  customer: { name: string; phone: string } | null
  items: Array<{ productName: string; quantity: number }>
}

interface OrdersResponse {
  data: Order[]
  total: number
  page: number
  pageSize: number
}

type FiscalDocStatus = 'pending' | 'emitting' | 'authorized' | 'rejected' | 'cancelled'

interface FiscalDoc {
  id: string
  orderId: string
  status: FiscalDocStatus
  chaveAcesso: string | null
  numeroDocumento: number | null
  errorCode: string | null
  errorMessage: string | null
  danfePdfUrl: string | null
}

const FISCAL_STATUS_LABELS: Record<FiscalDocStatus, string> = {
  pending: 'Pendente',
  emitting: 'Emitindo...',
  authorized: 'Autorizada',
  rejected: 'Rejeitada',
  cancelled: 'Cancelada',
}

const FISCAL_STATUS_COLORS: Record<FiscalDocStatus, string> = {
  pending: 'bg-gray-100 text-gray-600',
  emitting: 'bg-blue-100 text-blue-800',
  authorized: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-orange-100 text-orange-700',
}

const ACTIVE_STATUSES: OrderStatus[] = ['received', 'in_production', 'ready', 'in_delivery', 'picked_up']
const ALL_STATUSES: OrderStatus[] = [...ACTIVE_STATUSES, 'completed', 'cancelled']

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  received: 'in_production',
  in_production: 'ready',
  ready: 'completed',
  in_delivery: 'completed',
}

export function OrdersPage() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active')
  const [page, setPage] = useState(1)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null)
  const [editingNotesText, setEditingNotesText] = useState('')
  const [emittingOrderId, setEmitiringOrderId] = useState<string | null>(null)
  const [fiscalError, setFiscalError] = useState<string | null>(null)

  const statuses = statusFilter === 'active' ? ACTIVE_STATUSES : ALL_STATUSES

  const { data, isLoading } = useQuery({
    queryKey: ['orders', statusFilter, page],
    queryFn: () =>
      api.get<OrdersResponse>(
        `/orders?status=${statuses.join(',')}&page=${page}&pageSize=20`,
        accessToken ?? undefined
      ),
    refetchInterval: 15_000,
  })

  // Fetch fiscal documents for current orders
  const { data: fiscalDocs } = useQuery({
    queryKey: ['fiscal-docs', (data?.data ?? []).map((o) => o.id).join(',')],
    queryFn: async () => {
      const orders = data?.data ?? []
      if (orders.length === 0) return {} as Record<string, FiscalDoc>
      const results: Record<string, FiscalDoc> = {}
      await Promise.all(
        orders.map(async (order) => {
          try {
            const doc = await api.get<FiscalDoc>(
              `/orders/${order.id}/fiscal-document`,
              accessToken ?? undefined
            )
            results[order.id] = doc
          } catch {
            // No fiscal document for this order
          }
        })
      )
      return results
    },
    enabled: (data?.data ?? []).length > 0,
  })

  // Listen to WebSocket events for both orders and fiscal
  useWebSocket((message) => {
    if (message.type.startsWith('order:')) {
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
    }
    if (message.type.startsWith('fiscal:')) {
      void queryClient.invalidateQueries({ queryKey: ['fiscal-docs'] })
      setEmitiringOrderId(null)
    }
  })

  const notesMutation = useMutation({
    mutationFn: ({ orderId, notes }: { orderId: string; notes: string | null }) =>
      api.patch(`/orders/${orderId}/notes`, { notes }, accessToken ?? undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      setEditingNotesId(null)
    },
  })

  async function handleEmitFiscal(orderId: string) {
    setEmitiringOrderId(orderId)
    setFiscalError(null)
    try {
      await api.post(`/orders/${orderId}/fiscal-document`, {}, accessToken ?? undefined)
      void queryClient.invalidateQueries({ queryKey: ['fiscal-docs'] })
    } catch (e) {
      setFiscalError(e instanceof Error ? e.message : 'Erro ao emitir NF')
      setEmitiringOrderId(null)
    }
  }

  async function handleAdvance(orderId: string, nextStatus: OrderStatus) {
    await api.patch(`/orders/${orderId}/status`, { status: nextStatus }, accessToken ?? undefined)
    void queryClient.invalidateQueries({ queryKey: ['orders'] })
  }

  async function handleCancel(orderId: string) {
    await api.patch(`/orders/${orderId}/status`, { status: 'cancelled', cancellationReason: 'Cancelado manualmente' }, accessToken ?? undefined)
    void queryClient.invalidateQueries({ queryKey: ['orders'] })
  }

  function startEditingNotes(orderId: string, currentNotes: string | null) {
    setEditingNotesId(orderId)
    setEditingNotesText(currentNotes ?? '')
  }

  function saveNotes(orderId: string) {
    notesMutation.mutate({ orderId, notes: editingNotesText.trim() || null })
  }

  const orders = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / 20)

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Pedidos</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 text-sm font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors active:scale-95"
          >
            + Novo pedido
          </button>
          <button
            onClick={() => { setStatusFilter('active'); setPage(1) }}
            className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors active:scale-95 ${
              statusFilter === 'active' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-300'
            }`}
          >
            Ativos ({total})
          </button>
          <button
            onClick={() => { setStatusFilter('all'); setPage(1) }}
            className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors active:scale-95 ${
              statusFilter === 'all' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-300'
            }`}
          >
            Todos
          </button>
        </div>
      </div>

      {fiscalError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {fiscalError}
          <button onClick={() => setFiscalError(null)} className="ml-2 text-red-500 hover:text-red-700">✕</button>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-start justify-between mb-2">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-4 w-16" />
              </div>
              <Skeleton className="h-4 w-2/3 mb-2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {orders.map((order) => {
          const next = NEXT_STATUS[order.status]
          const fiscalDoc = fiscalDocs?.[order.id]
          return (
            <div key={order.id} className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ORDER_STATUS_COLORS[order.status]}`}>
                    {ORDER_STATUS_LABELS[order.status]}
                  </span>
                  <span className="text-xs text-gray-400 uppercase">
                    {ORDER_CHANNEL_LABELS[order.channel] ?? order.channel} · {ORDER_TYPE_LABELS[order.type as keyof typeof ORDER_TYPE_LABELS] ?? order.type}
                  </span>
                  {fiscalDoc && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${FISCAL_STATUS_COLORS[fiscalDoc.status]}`}>
                      NF: {FISCAL_STATUS_LABELS[fiscalDoc.status]}
                    </span>
                  )}
                </div>
                <span className="text-sm font-bold text-gray-900">
                  R$ {parseFloat(order.totalAmount).toFixed(2)}
                </span>
              </div>

              {order.customer && (
                <p className="text-sm text-gray-600 mb-1">
                  {order.customer.name} · {order.customer.phone}
                </p>
              )}

              <p className="text-xs text-gray-500 mb-2">
                {order.items.map((i) => `${i.quantity}× ${i.productName}`).join(', ')}
              </p>

              {editingNotesId === order.id ? (
                <div className="mb-2">
                  <textarea
                    autoFocus
                    value={editingNotesText}
                    onChange={(e) => setEditingNotesText(e.target.value)}
                    maxLength={1000}
                    rows={2}
                    className="w-full text-xs border border-brand-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                    placeholder="Observação do pedido..."
                  />
                  <div className="flex gap-1.5 mt-1">
                    <button
                      onClick={() => saveNotes(order.id)}
                      disabled={notesMutation.isPending}
                      className="px-2 py-0.5 text-xs bg-brand-600 text-white rounded-md hover:bg-brand-700 disabled:opacity-50 transition-colors"
                    >
                      Salvar
                    </button>
                    <button
                      onClick={() => setEditingNotesId(null)}
                      className="px-2 py-0.5 text-xs text-gray-500 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-1 mb-2 group">
                  {order.notes ? (
                    <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 flex-1 italic">
                      📝 {order.notes}
                    </p>
                  ) : null}
                  <button
                    onClick={() => startEditingNotes(order.id, order.notes)}
                    className={`text-xs text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 ${order.notes ? '' : 'opacity-0 group-hover:opacity-100'}`}
                  >
                    {order.notes ? '✏️' : '+ nota'}
                  </button>
                </div>
              )}

              {/* Fiscal document info */}
              {fiscalDoc && fiscalDoc.status === 'authorized' && (
                <div className="mb-2 px-3 py-1.5 bg-green-50 rounded-lg text-xs">
                  {fiscalDoc.chaveAcesso && (
                    <p className="text-green-800 font-mono mb-1">
                      Chave: {fiscalDoc.chaveAcesso}
                    </p>
                  )}
                  <div className="flex gap-2">
                    {fiscalDoc.danfePdfUrl && (
                      <a
                        href={fiscalDoc.danfePdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-600 hover:text-brand-700 font-medium"
                      >
                        📄 DANFE PDF
                      </a>
                    )}
                    {fiscalDoc.numeroDocumento && (
                      <span className="text-gray-500">Nº {fiscalDoc.numeroDocumento}</span>
                    )}
                  </div>
                </div>
              )}

              {fiscalDoc && fiscalDoc.status === 'rejected' && (
                <div className="mb-2 px-3 py-1.5 bg-red-50 rounded-lg text-xs text-red-700">
                  Erro: {fiscalDoc.errorMessage || fiscalDoc.errorCode || 'Falha na emissão'}
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {new Date(order.receivedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <div className="flex gap-2">
                  {/* Emitir NF button */}
                  {order.status === 'completed' && !fiscalDoc && (
                    <button
                      onClick={() => handleEmitFiscal(order.id)}
                      disabled={emittingOrderId === order.id}
                      className="px-2 py-1 text-xs text-green-700 border border-green-300 rounded-lg hover:bg-green-50 disabled:opacity-50 transition-colors"
                    >
                      {emittingOrderId === order.id ? 'Emitindo...' : 'Emitir NF'}
                    </button>
                  )}
                  {order.status !== 'completed' && order.status !== 'cancelled' && (
                    <button
                      onClick={() => handleCancel(order.id)}
                      className="px-2 py-1 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      Cancelar
                    </button>
                  )}
                  {next && (
                    <button
                      onClick={() => handleAdvance(order.id, next)}
                      className="px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700 transition-colors active:scale-95"
                    >
                      → {ORDER_STATUS_LABELS[next]}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {!isLoading && orders.length === 0 && (
          <p className="text-gray-400 text-center py-12">
            {statusFilter === 'active' ? 'Nenhum pedido ativo' : 'Nenhum pedido encontrado'}
          </p>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-100 transition-colors active:scale-95"
          >
            Anterior
          </button>
          <span className="px-3 py-1 text-sm text-gray-600">{page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-100 transition-colors active:scale-95"
          >
            Próxima
          </button>
        </div>
      )}

      {showCreateModal && (
        <CreateOrderModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  )
}
