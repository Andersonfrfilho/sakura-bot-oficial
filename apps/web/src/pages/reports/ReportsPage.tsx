import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'

interface DailyBreakdown {
  day: number
  orderCount: number
  revenue: string
}

interface MonthlyReport {
  period: { year: number; month: number; label: string }
  summary: {
    totalRevenue: string
    completedOrders: number
    cancelledOrders: number
    avgTicket: string
    totalOrdersCreated: number
  }
  byChannel: Array<{ channel: string; count: number; revenue: string }>
  byType: Array<{ type: string; count: number; revenue: string }>
  byStatus: Array<{ status: string; count: number }>
  byPaymentMethod: Array<{ method: string; total: string }>
  topProducts: Array<{ productName: string; quantity: number; revenue: string }>
  dailyBreakdown: DailyBreakdown[]
}

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  ifood: 'iFood',
  manual: 'Manual',
}

const TYPE_LABELS: Record<string, string> = {
  delivery: 'Entrega',
  pickup: 'Retirada',
  table: 'Mesa',
}

const STATUS_LABELS: Record<string, string> = {
  received: 'Recebido',
  in_production: 'Em preparo',
  ready: 'Pronto',
  in_delivery: 'Em entrega',
  picked_up: 'Retirado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
}

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'Pix',
  card_credit: 'Crédito',
  card_debit: 'Débito',
  cash: 'Dinheiro',
  voucher: 'Voucher',
}

function formatBRL(value: string | number) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function getMiniBar(value: number, max: number) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return pct
}

export function ReportsPage() {
  const accessToken = useAuthStore((state) => state.accessToken)

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const { data: report, isLoading, isError } = useQuery({
    queryKey: ['monthly-report', year, month],
    queryFn: () =>
      api.get<MonthlyReport>(
        `/reports/monthly?year=${year}&month=${month}`,
        accessToken ?? undefined
      ),
  })

  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i)
  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ]

  const maxDailyRevenue = report
    ? Math.max(...report.dailyBreakdown.map((d) => Number(d.revenue)))
    : 0

  function handleExportCSV() {
    const from = new Date(year, month - 1, 1).toISOString().split('T')[0]
    const to = new Date(year, month, 0).toISOString().split('T')[0]
    void api
      .get<{ csv: string; filename: string }>(
        `/reports/orders/export?from=${from}&to=${to}T23:59:59Z`,
        accessToken ?? undefined
      )
      .then(({ csv, filename }) => {
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename ?? 'orders.csv'
        a.click()
        URL.revokeObjectURL(url)
      })
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Relatório mensal</h1>
          {report && (
            <p className="text-sm text-gray-500">{report.period.label}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(parseInt(e.target.value))}
            className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {months.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 rounded-xl hover:bg-gray-50 transition-colors active:scale-95"
          >
            Exportar CSV
          </button>
        </div>
      </div>

      {isLoading && (
        <p className="text-gray-400 text-center py-16">Carregando relatório...</p>
      )}

      {isError && (
        <p className="text-red-500 text-center py-16">Erro ao carregar relatório.</p>
      )}

      {report && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-400 mb-1">Receita total</p>
              <p className="text-xl font-bold text-gray-900">{formatBRL(report.summary.totalRevenue)}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-400 mb-1">Pedidos concluídos</p>
              <p className="text-xl font-bold text-gray-900">{report.summary.completedOrders}</p>
              <p className="text-xs text-gray-400">{report.summary.totalOrdersCreated} criados</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-400 mb-1">Ticket médio</p>
              <p className="text-xl font-bold text-gray-900">{formatBRL(report.summary.avgTicket)}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-gray-400 mb-1">Cancelados</p>
              <p className="text-xl font-bold text-red-600">{report.summary.cancelledOrders}</p>
              {report.summary.totalOrdersCreated > 0 && (
                <p className="text-xs text-gray-400">
                  {Math.round((report.summary.cancelledOrders / report.summary.totalOrdersCreated) * 100)}% do total
                </p>
              )}
            </div>
          </div>

          {/* Daily bar chart */}
          {report.dailyBreakdown.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Receita por dia</h2>
              <div className="flex items-end gap-1 h-32">
                {report.dailyBreakdown.map((d) => {
                  const pct = getMiniBar(Number(d.revenue), maxDailyRevenue)
                  return (
                    <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <div
                        className="w-full bg-brand-500 rounded-t-sm transition-all hover:bg-brand-600"
                        style={{ height: `${Math.max(pct, 2)}%` }}
                      />
                      {/* Tooltip on hover */}
                      <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        Dia {d.day}: {formatBRL(d.revenue)} · {d.orderCount} pedidos
                      </div>
                      <span className="text-xs text-gray-400 leading-none">{d.day}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Three columns: channel / type / payment */}
          <div className="grid sm:grid-cols-3 gap-4">
            {/* By channel */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Por canal</h2>
              {report.byChannel.length === 0 ? (
                <p className="text-xs text-gray-400">Sem dados</p>
              ) : (
                <div className="space-y-2">
                  {report.byChannel.map((r) => (
                    <div key={r.channel} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{CHANNEL_LABELS[r.channel] ?? r.channel}</span>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">{formatBRL(r.revenue)}</p>
                        <p className="text-xs text-gray-400">{r.count} pedidos</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* By type */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Por tipo</h2>
              {report.byType.length === 0 ? (
                <p className="text-xs text-gray-400">Sem dados</p>
              ) : (
                <div className="space-y-2">
                  {report.byType.map((r) => (
                    <div key={r.type} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{TYPE_LABELS[r.type] ?? r.type}</span>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">{formatBRL(r.revenue)}</p>
                        <p className="text-xs text-gray-400">{r.count} pedidos</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* By payment method */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Formas de pagamento</h2>
              {report.byPaymentMethod.length === 0 ? (
                <p className="text-xs text-gray-400">Sem dados do caixa</p>
              ) : (
                <div className="space-y-2">
                  {report.byPaymentMethod.map((r) => (
                    <div key={r.method} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{PAYMENT_LABELS[r.method] ?? r.method}</span>
                      <p className="font-semibold text-gray-900">{formatBRL(r.total)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Top products */}
          {report.topProducts.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Top produtos vendidos</h2>
              <div className="space-y-2">
                {report.topProducts.map((prod, idx) => {
                  const maxQty = report.topProducts[0]?.quantity ?? 1
                  const pct = Math.round((prod.quantity / maxQty) * 100)
                  return (
                    <div key={prod.productName} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-gray-400 w-5 text-right">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-sm font-medium text-gray-800 truncate pr-2">{prod.productName}</span>
                          <div className="text-right flex-shrink-0">
                            <span className="text-sm font-bold text-gray-900">{prod.quantity}×</span>
                            <span className="text-xs text-gray-400 ml-1">{formatBRL(prod.revenue)}</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand-500 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Status breakdown */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Status dos pedidos</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {report.byStatus.map((r) => (
                <div key={r.status} className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{r.count}</p>
                  <p className="text-xs text-gray-400">{STATUS_LABELS[r.status] ?? r.status}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
