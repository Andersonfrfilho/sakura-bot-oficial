import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'

type TableStatus = 'available' | 'occupied' | 'reserved'

interface Comanda {
  id: string
  code: string
  status: 'open'
  customerName: string | null
  customerPhone: string | null
  openedAt: string
}

interface TableWithComanda {
  id: string
  number: number
  capacity: number
  status: TableStatus
  createdAt: string
  comanda: Comanda | null
}

const STATUS_LABELS: Record<TableStatus, string> = {
  available: 'Disponível',
  occupied: 'Ocupada',
  reserved: 'Reservada',
}

const STATUS_COLORS: Record<TableStatus, string> = {
  available: 'bg-green-100 text-green-800 border-green-200',
  occupied: 'bg-red-100 text-red-800 border-red-200',
  reserved: 'bg-yellow-100 text-yellow-800 border-yellow-200',
}

const STATUS_CARD: Record<TableStatus, string> = {
  available: 'border-green-200 bg-green-50',
  occupied: 'border-red-200 bg-red-50',
  reserved: 'border-yellow-200 bg-yellow-50',
}

export function TablesPage() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editTarget, setEditTarget] = useState<TableWithComanda | null>(null)
  const [formNumber, setFormNumber] = useState('')
  const [formCapacity, setFormCapacity] = useState('')
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [comandaModal, setComandaModal] = useState<{ tableId: string; tableNumber: number } | null>(null)
  const [closeModal, setCloseModal] = useState<{ comanda: Comanda; tableNumber: number } | null>(null)
  const [closeStatus, setCloseStatus] = useState<'closed' | 'paid'>('paid')
  const [actionLoading, setActionLoading] = useState(false)

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['tables'],
    queryFn: () => api.get<TableWithComanda[]>('/tables', accessToken ?? undefined),
    refetchInterval: 15_000,
  })

  function openCreate() {
    setFormNumber('')
    setFormCapacity('')
    setFormError(null)
    setEditTarget(null)
    setModalMode('create')
  }

  function openEdit(table: TableWithComanda) {
    setFormNumber(String(table.number))
    setFormCapacity(String(table.capacity))
    setFormError(null)
    setEditTarget(table)
    setModalMode('edit')
  }

  async function handleSubmit() {
    const number = parseInt(formNumber)
    const capacity = parseInt(formCapacity)
    if (!number || number < 1) { setFormError('Número de mesa inválido'); return }
    if (!capacity || capacity < 1 || capacity > 50) { setFormError('Capacidade deve ser entre 1 e 50'); return }

    setFormLoading(true)
    setFormError(null)
    try {
      if (modalMode === 'create') {
        await api.post('/tables', { number, capacity }, accessToken ?? undefined)
      } else {
        await api.put(`/tables/${editTarget!.id}`, { number, capacity }, accessToken ?? undefined)
      }
      void queryClient.invalidateQueries({ queryKey: ['tables'] })
      setModalMode(null)
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setFormLoading(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/tables/${id}`, accessToken ?? undefined)
      void queryClient.invalidateQueries({ queryKey: ['tables'] })
    } finally {
      setDeleteConfirmId(null)
    }
  }

  async function handleOpenComanda() {
    if (!comandaModal) return
    setActionLoading(true)
    try {
      await api.post(`/tables/${comandaModal.tableId}/comanda`, {}, accessToken ?? undefined)
      void queryClient.invalidateQueries({ queryKey: ['tables'] })
      setComandaModal(null)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao abrir comanda')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleCloseComanda() {
    if (!closeModal) return
    setActionLoading(true)
    try {
      await api.patch(`/comandas/${closeModal.comanda.id}/close`, { status: closeStatus }, accessToken ?? undefined)
      void queryClient.invalidateQueries({ queryKey: ['tables'] })
      setCloseModal(null)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao encerrar comanda')
    } finally {
      setActionLoading(false)
    }
  }

  const available = tables.filter((t) => t.status === 'available').length
  const occupied = tables.filter((t) => t.status === 'occupied').length

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Mesas</h1>
          <p className="text-gray-500 text-sm mt-1">
            {tables.length} mesa{tables.length !== 1 ? 's' : ''} · {available} livre{available !== 1 ? 's' : ''} · {occupied} ocupada{occupied !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors active:scale-95 self-start sm:self-auto"
        >
          + Nova mesa
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Carregando mesas...</div>
      ) : tables.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg mb-2">Nenhuma mesa cadastrada</p>
          <p className="text-sm">Clique em "+ Nova mesa" para começar</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {tables.map((table) => (
            <div
              key={table.id}
              className={`border-2 rounded-xl p-4 transition-all ${STATUS_CARD[table.status]}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-2xl font-bold text-gray-900">{table.number}</p>
                  <p className="text-xs text-gray-500">{table.capacity} lugares</p>
                </div>
                <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[table.status]}`}>
                  {STATUS_LABELS[table.status]}
                </span>
              </div>

              {table.comanda ? (
                <div className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs font-mono font-bold text-gray-800 bg-white/80 px-2 py-0.5 rounded border">
                      {table.comanda.code}
                    </span>
                  </div>
                  {table.comanda.customerName ? (
                    <p className="text-xs text-gray-600 truncate">{table.comanda.customerName}</p>
                  ) : (
                    <p className="text-xs text-gray-400 italic">Aguardando confirmação</p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(table.comanda.openedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              ) : (
                <div className="mb-3 h-[52px]" />
              )}

              <div className="space-y-1.5">
                {table.status === 'available' ? (
                  <button
                    onClick={() => setComandaModal({ tableId: table.id, tableNumber: table.number })}
                    className="w-full px-2 py-1.5 bg-brand-600 text-white text-xs font-medium rounded-lg hover:bg-brand-700 transition-colors active:scale-95"
                  >
                    Abrir comanda
                  </button>
                ) : table.comanda ? (
                  <button
                    onClick={() => setCloseModal({ comanda: table.comanda!, tableNumber: table.number })}
                    className="w-full px-2 py-1.5 bg-gray-800 text-white text-xs font-medium rounded-lg hover:bg-gray-900 transition-colors active:scale-95"
                  >
                    Encerrar
                  </button>
                ) : null}
                <div className="flex gap-1">
                  <button
                    onClick={() => openEdit(table)}
                    className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded-lg hover:bg-white/60 transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(table.id)}
                    disabled={table.status === 'occupied'}
                    className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-30"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal criar / editar mesa */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">{modalMode === 'create' ? 'Nova mesa' : 'Editar mesa'}</h2>
              <button onClick={() => setModalMode(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Número da mesa *</label>
                <input
                  type="number"
                  min="1"
                  value={formNumber}
                  onChange={(e) => setFormNumber(e.target.value)}
                  placeholder="Ex: 1"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Capacidade *</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={formCapacity}
                  onChange={(e) => setFormCapacity(e.target.value)}
                  placeholder="Ex: 4"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              {formError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{formError}</p>}
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-gray-200">
              <button onClick={() => setModalMode(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={() => void handleSubmit()}
                disabled={formLoading}
                className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 active:scale-95"
              >
                {formLoading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal abrir comanda */}
      {comandaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="font-semibold text-gray-900 mb-2">Abrir comanda — Mesa {comandaModal.tableNumber}</h2>
            <p className="text-sm text-gray-500 mb-5">
              Um código único será gerado e poderá ser compartilhado com o cliente para confirmação dos dados.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setComandaModal(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={() => void handleOpenComanda()}
                disabled={actionLoading}
                className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 active:scale-95"
              >
                {actionLoading ? 'Abrindo...' : 'Abrir comanda'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal encerrar comanda */}
      {closeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="font-semibold text-gray-900 mb-1">Encerrar comanda — Mesa {closeModal.tableNumber}</h2>
            <p className="text-xs font-mono text-gray-400 mb-4">Código: {closeModal.comanda.code}</p>
            {closeModal.comanda.customerName && (
              <p className="text-sm text-gray-600 mb-4">Cliente: {closeModal.comanda.customerName}</p>
            )}
            <div className="space-y-2 mb-5">
              {(['paid', 'closed'] as const).map((s) => (
                <label key={s} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    value={s}
                    checked={closeStatus === s}
                    onChange={() => setCloseStatus(s)}
                    className="text-brand-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{s === 'paid' ? 'Pago e encerrado' : 'Encerrado sem pagamento'}</p>
                    <p className="text-xs text-gray-400">{s === 'paid' ? 'Cliente realizou o pagamento' : 'Cancelado ou encerrado manualmente'}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setCloseModal(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={() => void handleCloseComanda()}
                disabled={actionLoading}
                className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 active:scale-95"
              >
                {actionLoading ? 'Encerrando...' : 'Encerrar comanda'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar exclusão */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="font-semibold text-gray-900 mb-2">Excluir mesa?</h2>
            <p className="text-sm text-gray-500 mb-5">Esta ação não pode ser desfeita.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirmId(null)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={() => void handleDelete(deleteConfirmId)}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 active:scale-95"
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
