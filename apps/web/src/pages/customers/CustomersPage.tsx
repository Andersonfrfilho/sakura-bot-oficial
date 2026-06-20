import { useState, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'

interface Customer {
  id: string
  name: string
  whatsappNumber: string
  phone: string | null
  document: string | null
  birthDate: string | null
  createdAt: string
}

interface CustomerWithStats extends Customer {
  orderCount: number
  totalSpent: string
  lastOrderAt: string | null
}

interface CustomersResponse {
  data: CustomerWithStats[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

type OrderStatus = 'received' | 'in_production' | 'ready' | 'in_delivery' | 'picked_up' | 'completed' | 'cancelled'

interface CustomerDetails {
  customer: Customer
  stats: {
    orderCount: number
    totalSpent: string
    lastOrderAt: string | null
    firstOrderAt: string | null
  }
  recentOrders: Array<{
    id: string
    status: OrderStatus
    totalAmount: string
    channel: string
    type: string
    receivedAt: string
  }>
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

function formatWhatsApp(number: string) {
  const n = number.replace(/\D/g, '')
  if (n.length === 13) return `+${n.slice(0, 2)} (${n.slice(2, 4)}) ${n.slice(4, 9)}-${n.slice(9)}`
  return number
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatBRL(value: string | number) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function calcAge(birthDate: string): number {
  const today = new Date()
  const dob = new Date(birthDate + 'T00:00:00')
  let age = today.getFullYear() - dob.getFullYear()
  const m = today.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--
  return age
}

function isAdult(birthDate: string): boolean {
  return calcAge(birthDate) >= 18
}

function formatDocument(doc: string) {
  const d = doc.replace(/\D/g, '')
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return doc
}

interface CustomerFormData {
  name: string
  whatsappNumber: string
  phone: string
  document: string
  birthDate: string
}

const emptyForm: CustomerFormData = { name: '', whatsappNumber: '', phone: '', document: '', birthDate: '' }

export function CustomersPage() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [form, setForm] = useState<CustomerFormData>(emptyForm)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pageSize = 20

  const handleSearch = useCallback((value: string) => {
    setSearch(value)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(value)
      setPage(1)
    }, 300)
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['customers', page, debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (debouncedSearch) params.set('search', debouncedSearch)
      return api.get<CustomersResponse>(`/customers?${params}`, accessToken ?? undefined)
    },
  })

  const { data: details, isLoading: detailsLoading } = useQuery({
    queryKey: ['customer-details', selectedId],
    queryFn: () => api.get<CustomerDetails>(`/customers/${selectedId}`, accessToken ?? undefined),
    enabled: !!selectedId,
  })

  function openCreate() {
    setForm(emptyForm)
    setFormError(null)
    setModalMode('create')
  }

  function openEdit(customer: Customer) {
    setForm({
      name: customer.name,
      whatsappNumber: customer.whatsappNumber,
      phone: customer.phone ?? '',
      document: customer.document ?? '',
      birthDate: customer.birthDate ?? '',
    })
    setFormError(null)
    setModalMode('edit')
    setSelectedId(customer.id)
  }

  async function handleSubmit() {
    setFormLoading(true)
    setFormError(null)
    try {
      const payload = {
        name: form.name,
        whatsappNumber: form.whatsappNumber,
        phone: form.phone || undefined,
        document: form.document || undefined,
        birthDate: form.birthDate || undefined,
      }
      if (modalMode === 'create') {
        await api.post('/customers', payload, accessToken ?? undefined)
      } else {
        await api.put(`/customers/${selectedId}`, {
          name: form.name,
          phone: form.phone || null,
          document: form.document || null,
          birthDate: form.birthDate || null,
        }, accessToken ?? undefined)
      }
      void queryClient.invalidateQueries({ queryKey: ['customers'] })
      void queryClient.invalidateQueries({ queryKey: ['customer-details', selectedId] })
      setModalMode(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar'
      setFormError(msg)
    } finally {
      setFormLoading(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/customers/${id}`, accessToken ?? undefined)
      void queryClient.invalidateQueries({ queryKey: ['customers'] })
      if (selectedId === id) setSelectedId(null)
    } finally {
      setDeleteConfirmId(null)
    }
  }

  return (
    <div className="p-4 md:p-6 flex gap-6">
      {/* Lista principal */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">Clientes</h1>
            <p className="text-gray-500 text-sm mt-1">
              {data?.total ?? 0} cliente{(data?.total ?? 0) !== 1 ? 's' : ''} cadastrado{(data?.total ?? 0) !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <input
              type="search"
              placeholder="Buscar por nome ou WhatsApp..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full sm:w-64 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
            <button
              onClick={openCreate}
              className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors active:scale-95 whitespace-nowrap"
            >
              + Novo
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Cliente</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Contato</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Pedidos</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Total gasto</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Desde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">Carregando...</td></tr>
                ) : data?.data.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                      {debouncedSearch ? 'Nenhum cliente encontrado para esta busca' : 'Nenhum cliente cadastrado'}
                    </td>
                  </tr>
                ) : (
                  data?.data.map((customer) => (
                    <tr
                      key={customer.id}
                      onClick={() => setSelectedId(customer.id === selectedId ? null : customer.id)}
                      className={`hover:bg-gray-50 transition-colors cursor-pointer ${
                        selectedId === customer.id ? 'bg-brand-50 border-l-2 border-l-brand-500' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                            {customer.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate">{customer.name}</p>
                            {customer.document && (
                              <p className="text-xs text-gray-400 font-mono">{formatDocument(customer.document)}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <p className="text-gray-600 font-mono text-sm">{formatWhatsApp(customer.whatsappNumber)}</p>
                        {customer.phone && <p className="text-xs text-gray-400">{customer.phone}</p>}
                      </td>
                      <td className="px-4 py-3 text-right hidden md:table-cell">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          {customer.orderCount}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-gray-900 hidden md:table-cell">
                        {formatBRL(customer.totalSpent)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-sm hidden lg:table-cell">
                        {formatDate(customer.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {data && data.totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 bg-gray-50">
              <p className="text-sm text-gray-500">Página {data.page} de {data.totalPages}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-100 transition-colors active:scale-95"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                  disabled={page === data.totalPages}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-100 transition-colors active:scale-95"
                >
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Painel de detalhes — desktop */}
      {selectedId && (
        <div className="w-80 flex-shrink-0 hidden lg:block">
          <CustomerDetailPanel
            details={details ?? null}
            isLoading={detailsLoading}
            onClose={() => setSelectedId(null)}
            onEdit={openEdit}
            onDelete={(id) => setDeleteConfirmId(id)}
          />
        </div>
      )}

      {/* Drawer mobile */}
      {selectedId && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/40" onClick={() => setSelectedId(null)} />
          <div className="w-80 bg-white h-full overflow-y-auto shadow-xl">
            <CustomerDetailPanel
              details={details ?? null}
              isLoading={detailsLoading}
              onClose={() => setSelectedId(null)}
              onEdit={openEdit}
              onDelete={(id) => setDeleteConfirmId(id)}
            />
          </div>
        </div>
      )}

      {/* Modal criar / editar */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">
                {modalMode === 'create' ? 'Novo cliente' : 'Editar cliente'}
              </h2>
              <button onClick={() => setModalMode(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              <Field label="Nome *" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Nome completo" />
              {modalMode === 'create' && (
                <Field label="WhatsApp *" value={form.whatsappNumber} onChange={(v) => setForm((f) => ({ ...f, whatsappNumber: v }))} placeholder="5511999999999" type="tel" />
              )}
              <Field label="Telefone" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder="(11) 9999-9999" type="tel" />
              <Field label="CPF / CNPJ" value={form.document} onChange={(v) => setForm((f) => ({ ...f, document: v }))} placeholder="000.000.000-00" />
              <Field label="Data de nascimento" value={form.birthDate} onChange={(v) => setForm((f) => ({ ...f, birthDate: v }))} type="date" />
              {formError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>}
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200">
              <button onClick={() => setModalMode(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={() => void handleSubmit()}
                disabled={formLoading || !form.name || (modalMode === 'create' && !form.whatsappNumber)}
                className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors active:scale-95"
              >
                {formLoading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar exclusão */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="font-semibold text-gray-900 mb-2">Excluir cliente?</h2>
            <p className="text-sm text-gray-500 mb-5">Esta ação não pode ser desfeita. O histórico de pedidos permanece.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirmId(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={() => void handleDelete(deleteConfirmId)}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors active:scale-95"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
      />
    </div>
  )
}

function CustomerDetailPanel({
  details,
  isLoading,
  onClose,
  onEdit,
  onDelete,
}: {
  details: CustomerDetails | null
  isLoading: boolean
  onClose: () => void
  onEdit: (customer: Customer) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 h-fit sticky top-6">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">Detalhes</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none">×</button>
      </div>

      {isLoading ? (
        <div className="p-6 text-center text-gray-400 text-sm">Carregando...</div>
      ) : !details ? null : (
        <div className="p-4 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-xl font-bold flex-shrink-0">
              {details.customer.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900 truncate">{details.customer.name}</p>
              <p className="text-sm text-gray-500 font-mono">{formatWhatsApp(details.customer.whatsappNumber)}</p>
              {details.customer.phone && <p className="text-xs text-gray-400">{details.customer.phone}</p>}
              {details.customer.document && (
                <p className="text-xs text-gray-400 font-mono">{formatDocument(details.customer.document)}</p>
              )}
              {details.customer.birthDate && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-xs text-gray-400">
                    {formatDate(details.customer.birthDate)} · {calcAge(details.customer.birthDate)} anos
                  </p>
                  <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${
                    isAdult(details.customer.birthDate)
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {isAdult(details.customer.birthDate) ? '18+' : 'Menor'}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => onEdit(details.customer)}
              className="flex-1 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Editar
            </button>
            <button
              onClick={() => onDelete(details.customer.id)}
              className="px-3 py-1.5 text-xs font-medium border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
            >
              Excluir
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Pedidos" value={String(details.stats.orderCount)} />
            <StatCard label="Total gasto" value={formatBRL(details.stats.totalSpent)} small />
            <StatCard label="Primeiro pedido" value={details.stats.firstOrderAt ? formatDate(details.stats.firstOrderAt) : '—'} small />
            <StatCard label="Último pedido" value={details.stats.lastOrderAt ? formatDate(details.stats.lastOrderAt) : '—'} small />
          </div>

          <p className="text-xs text-gray-400">
            Cliente desde {new Date(details.customer.createdAt).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </p>

          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Últimos pedidos</h3>
            {details.recentOrders.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum pedido ainda</p>
            ) : (
              <div className="space-y-2">
                {details.recentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[order.status]}`}>
                          {STATUS_LABELS[order.status]}
                        </span>
                        <span className="text-xs text-gray-400 capitalize">{order.channel}</span>
                      </div>
                      <p className="text-xs text-gray-400">{formatDateTime(order.receivedAt)}</p>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 ml-2 flex-shrink-0">{formatBRL(order.totalAmount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className={`font-semibold text-gray-900 ${small ? 'text-sm' : 'text-lg'}`}>{value}</p>
    </div>
  )
}
