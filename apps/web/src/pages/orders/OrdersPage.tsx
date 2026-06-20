import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { useWebSocket } from '@/hooks/useWebSocket'
import { CreateOrderModal } from './CreateOrderModal'

type OrderStatus = 'received' | 'in_production' | 'ready' | 'in_delivery' | 'picked_up' | 'completed' | 'cancelled'

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

const STATUS_LABELS: Record<OrderStatus, string> = {
  received: 'Recebido',
  in_production: 'Em preparo',
  ready: 'Pronto',
  in_delivery: 'Em entrega',
  picked_up: 'Retirado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
}

const STATUS_COLORS: Record<OrderStatus, string> = {
  received: 'bg-blue-100 text-blue-800',
  in_production: 'bg-yellow-100 text-yellow-800',
  ready: 'bg-green-100 text-green-800',
  in_delivery: 'bg-purple-100 text-purple-800',
  picked_up: 'bg-indigo-100 text-indigo-800',
  completed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-700',
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

  useWebSocket((message) => {
    if (message.type.startsWith('order:')) {
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
    }
  })

  async function handleAdvance(orderId: string, nextStatus: OrderStatus) {
    await api.patch(`/orders/${orderId}/status`, { status: nextStatus }, accessToken ?? undefined)
    void queryClient.invalidateQueries({ queryKey: ['orders'] })
  }

  async function handleCancel(orderId: string) {
    await api.patch(`/orders/${orderId}/status`, { status: 'cancelled', cancellationReason: 'Cancelado manualmente' }, accessToken ?? undefined)
    void queryClient.invalidateQueries({ queryKey: ['orders'] })
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

      {isLoading && <div className="text-gray-400 text-center py-12">Carregando pedidos...</div>}

      <div className="space-y-3">
        {orders.map((order) => {
          const next = NEXT_STATUS[order.status]
          return (
            <div key={order.id} className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status]}`}>
                    {STATUS_LABELS[order.status]}
                  </span>
                  <span className="ml-2 text-xs text-gray-400 uppercase">{order.channel} · {order.type}</span>
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

              {order.notes && (
                <p className="text-xs text-gray-500 italic mb-2">{order.notes}</p>
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {new Date(order.receivedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <div className="flex gap-2">
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
                      → {STATUS_LABELS[next]}
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
