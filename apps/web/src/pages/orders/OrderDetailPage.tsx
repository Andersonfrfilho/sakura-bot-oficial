import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  ORDER_CHANNEL_LABELS,
  ORDER_TYPE_LABELS,
  type OrderStatus,
} from '@/constants/orderLabels'
import { Skeleton } from '@/components/ui/Skeleton'
import { ArrowLeft } from 'lucide-react'
import { OrderProgressBar } from './OrderProgressBar'

interface OrderItem {
  id: string
  productName: string
  unitPrice: string
  quantity: number
  totalPrice: string
  notes: string | null
}

interface OrderPayment {
  id: string
  paymentTypeName: string
  amount: string
  splitLabel: string | null
}

interface OrderDelivery {
  id: string
  addressSnapshot: { address: string; complement: string | null }
  feeAmount: string
  distanceKm: string | null
}

interface OrderStatusLog {
  id: number
  status: OrderStatus
  note: string | null
  createdAt: string
}

type FiscalDocStatus = 'pending' | 'emitting' | 'authorized' | 'rejected' | 'cancelled'

interface FiscalDocument {
  status: FiscalDocStatus
  chaveAcesso: string | null
  numeroDocumento: number | null
  danfePdfUrl: string | null
  errorMessage: string | null
}

interface OrderDetail {
  id: string
  channel: string
  type: string
  status: OrderStatus
  totalAmount: string
  notes: string | null
  receivedAt: string
  customer: { name: string; whatsappNumber: string } | null
  items: OrderItem[]
  payments: OrderPayment[]
  delivery: OrderDelivery[]
  fiscalDocument: FiscalDocument | null
  statusLogs: OrderStatusLog[]
}

const FISCAL_STATUS_LABELS: Record<FiscalDocStatus, string> = {
  pending: 'Pendente',
  emitting: 'Emitindo...',
  authorized: 'Autorizada',
  rejected: 'Rejeitada',
  cancelled: 'Cancelada',
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const accessToken = useAuthStore((state) => state.accessToken)

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.get<OrderDetail>(`/orders/${id}`, accessToken ?? undefined),
    enabled: Boolean(id),
  })

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <Link
        to="/orders"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para pedidos
      </Link>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      )}

      {!isLoading && !order && <p className="text-gray-400 text-center py-12">Pedido não encontrado</p>}

      {order && (
        <>
          <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ORDER_STATUS_COLORS[order.status]}`}
                >
                  {ORDER_STATUS_LABELS[order.status]}
                </span>
                <span className="text-xs text-gray-400 uppercase">
                  {ORDER_CHANNEL_LABELS[order.channel] ?? order.channel} ·{' '}
                  {ORDER_TYPE_LABELS[order.type as keyof typeof ORDER_TYPE_LABELS] ?? order.type}
                </span>
              </div>
              <span className="text-lg font-bold text-gray-900">
                R$ {parseFloat(order.totalAmount).toFixed(2)}
              </span>
            </div>
            <p className="text-xs text-gray-400">
              Recebido em {new Date(order.receivedAt).toLocaleString('pt-BR')}
            </p>
            {order.customer && (
              <p className="text-sm text-gray-600 mt-2">
                {order.customer.name} · {order.customer.whatsappNumber}
              </p>
            )}
            {order.notes && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-2 italic">
                📝 {order.notes}
              </p>
            )}
          </div>

          {order.status !== 'cancelled' && (
            <section className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <OrderProgressBar
                type={order.type}
                status={order.status}
                statusLogs={order.statusLogs}
                variant="full"
              />
            </section>
          )}

          <section className="bg-white rounded-xl shadow-sm p-4 mb-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Itens</h2>
            <div className="space-y-2">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-start justify-between text-sm">
                  <div>
                    <p className="text-gray-800">
                      {item.quantity}× {item.productName}
                    </p>
                    {item.notes && <p className="text-xs text-gray-400 italic">{item.notes}</p>}
                  </div>
                  <span className="text-gray-600">R$ {parseFloat(item.totalPrice).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-xl shadow-sm p-4 mb-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Pagamento</h2>
            <div className="space-y-2">
              {order.payments.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-800">
                    {payment.paymentTypeName}
                    {payment.splitLabel ? ` · ${payment.splitLabel}` : ''}
                  </span>
                  <span className="text-gray-600">R$ {parseFloat(payment.amount).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </section>

          {order.type === 'delivery' && order.delivery?.[0] && (
            <section className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Entrega</h2>
              <p className="text-sm text-gray-800">{order.delivery[0].addressSnapshot.address}</p>
              {order.delivery[0].addressSnapshot.complement && (
                <p className="text-xs text-gray-500">{order.delivery[0].addressSnapshot.complement}</p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                Taxa: R$ {parseFloat(order.delivery[0].feeAmount).toFixed(2)}
                {order.delivery[0].distanceKm ? ` · ${parseFloat(order.delivery[0].distanceKm).toFixed(1)} km` : ''}
              </p>
            </section>
          )}

          {order.fiscalDocument && (
            <section className="bg-white rounded-xl shadow-sm p-4 mb-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Nota fiscal</h2>
              <p className="text-sm text-gray-800">{FISCAL_STATUS_LABELS[order.fiscalDocument.status]}</p>
              {order.fiscalDocument.chaveAcesso && (
                <p className="text-xs text-gray-500 font-mono mt-1">Chave: {order.fiscalDocument.chaveAcesso}</p>
              )}
              {order.fiscalDocument.numeroDocumento && (
                <p className="text-xs text-gray-500">Nº {order.fiscalDocument.numeroDocumento}</p>
              )}
              {order.fiscalDocument.danfePdfUrl && (
                <a
                  href={order.fiscalDocument.danfePdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 hover:text-brand-700 text-sm font-medium mt-2 inline-block"
                >
                  📄 DANFE PDF
                </a>
              )}
              {order.fiscalDocument.status === 'rejected' && order.fiscalDocument.errorMessage && (
                <p className="text-xs text-red-700 bg-red-50 rounded px-2 py-1 mt-2">
                  Erro: {order.fiscalDocument.errorMessage}
                </p>
              )}
            </section>
          )}

          <section className="bg-white rounded-xl shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Histórico de status</h2>
            <div className="space-y-3">
              {order.statusLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-3">
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${ORDER_STATUS_COLORS[log.status]}`}
                  >
                    {ORDER_STATUS_LABELS[log.status]}
                  </span>
                  <div className="flex-1">
                    {log.note && <p className="text-xs text-gray-600">{log.note}</p>}
                    <p className="text-xs text-gray-400">{new Date(log.createdAt).toLocaleString('pt-BR')}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
