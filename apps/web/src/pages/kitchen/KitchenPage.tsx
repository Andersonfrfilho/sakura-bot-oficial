import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import { useWebSocket } from '@/hooks/useWebSocket'

interface OrderItem {
  id: string
  productName: string
  quantity: number
  notes: string | null
}

interface KitchenOrder {
  id: string
  type: string
  channel: string
  status: 'received' | 'in_production'
  totalAmount: string
  notes: string | null
  receivedAt: string
  ageMinutes: number
  slaStatus: 'ok' | 'warning' | 'critical'
  items: OrderItem[]
}

const SLA_COLORS = {
  ok: 'border-green-500',
  warning: 'border-yellow-400',
  critical: 'border-red-500',
}

const SLA_AGE_COLORS = {
  ok: 'text-green-600',
  warning: 'text-yellow-600',
  critical: 'text-red-600',
}

function OrderCard({ order, onAdvance }: { order: KitchenOrder; onAdvance: (id: string, status: string) => void }) {
  const nextStatus = order.status === 'received' ? 'in_production' : 'ready'
  const nextLabel = order.status === 'received' ? 'Iniciar' : 'Pronto'

  return (
    <div className={`bg-white rounded-xl shadow-sm border-l-4 ${SLA_COLORS[order.slaStatus]} p-4 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-400">
          {order.channel} · {order.type}
        </span>
        <span className={`text-sm font-semibold ${SLA_AGE_COLORS[order.slaStatus]}`}>
          {order.ageMinutes}min
        </span>
      </div>

      <ul className="space-y-1">
        {order.items.map((item) => (
          <li key={item.id} className="text-sm text-gray-800">
            <span className="font-bold text-lg mr-2">{item.quantity}×</span>
            {item.productName}
            {item.notes && <span className="text-gray-500 ml-1">({item.notes})</span>}
          </li>
        ))}
      </ul>

      {order.notes && <p className="text-xs text-gray-500 italic">{order.notes}</p>}

      <button
        onClick={() => onAdvance(order.id, nextStatus)}
        className={`w-full py-2 md:py-2.5 px-3 text-white text-sm font-medium rounded-lg transition-colors active:scale-95 ${
          nextStatus === 'in_production' ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-green-600 hover:bg-green-700'
        }`}
      >
        {nextLabel}
      </button>
    </div>
  )
}

export function KitchenPage() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['kitchen', 'queue'],
    queryFn: () => api.get<KitchenOrder[]>('/kitchen/queue', accessToken ?? undefined),
    refetchInterval: 15_000,
  })

  useWebSocket((message) => {
    if (
      message.type === 'order:created' ||
      message.type === 'order:status_changed' ||
      message.type === 'kitchen:order_queued'
    ) {
      void queryClient.invalidateQueries({ queryKey: ['kitchen', 'queue'] })
    }
  })

  async function handleAdvance(orderId: string, status: string) {
    await api.patch(`/kitchen/orders/${orderId}/advance`, { status }, accessToken ?? undefined)
    void queryClient.invalidateQueries({ queryKey: ['kitchen', 'queue'] })
  }

  if (isLoading) return <div className="p-4 md:p-8 text-gray-500">Carregando fila...</div>

  const received = orders.filter((o) => o.status === 'received')
  const inProduction = orders.filter((o) => o.status === 'in_production')

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">Cozinha</h1>
        <span className="bg-gray-900 text-white text-sm px-3 py-1 rounded-full">
          {orders.length} pedido{orders.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-3">
            Aguardando ({received.length})
          </h2>
          <div className="space-y-3">
            {received.map((order) => (
              <OrderCard key={order.id} order={order} onAdvance={handleAdvance} />
            ))}
            {received.length === 0 && (
              <p className="text-gray-400 text-center py-8">Nenhum pedido aguardando</p>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-3">
            Em preparo ({inProduction.length})
          </h2>
          <div className="space-y-3">
            {inProduction.map((order) => (
              <OrderCard key={order.id} order={order} onAdvance={handleAdvance} />
            ))}
            {inProduction.length === 0 && (
              <p className="text-gray-400 text-center py-8">Nenhum pedido em preparo</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
