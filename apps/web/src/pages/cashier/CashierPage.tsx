import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'

interface CashMovement {
  id: string
  type: 'payment' | 'withdrawal' | 'supply'
  paymentMethod: string | null
  amount: string
  notes: string | null
  createdAt: string
}

interface CurrentRegister {
  id: string
  status: 'open' | 'closed'
  openingAmount: string
  openedAt: string
  movements: CashMovement[]
  totalIn: string
  totalOut: string
  balance: string
}

const MOVEMENT_LABELS = { payment: 'Pagamento', withdrawal: 'Retirada', supply: 'Suprimento' }
const PAYMENT_LABELS: Record<string, string> = {
  pix: 'Pix', card_credit: 'Crédito', card_debit: 'Débito', cash: 'Dinheiro', voucher: 'Voucher',
}

function formatBRL(value: string | number) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function CashierPage() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()

  const [openingAmount, setOpeningAmount] = useState('0')
  const [closingAmount, setClosingAmount] = useState('0')
  const [movementAmount, setMovementAmount] = useState('')
  const [movementType, setMovementType] = useState<'payment' | 'withdrawal' | 'supply'>('payment')
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card_credit' | 'card_debit' | 'cash' | 'voucher'>('cash')
  const [movementNotes, setMovementNotes] = useState('')
  const [openError, setOpenError] = useState('')
  const [closeError, setCloseError] = useState('')

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['cashier-current'] })
    void queryClient.invalidateQueries({ queryKey: ['dashboard', 'metrics'] })
  }

  const { data: register, isLoading } = useQuery({
    queryKey: ['cashier-current'],
    queryFn: () => api.get<CurrentRegister | null>('/cashier/registers/current', accessToken ?? undefined),
    refetchInterval: 30_000,
  })

  const openMutation = useMutation({
    mutationFn: () =>
      api.post('/cashier/registers', { openingAmount: parseFloat(openingAmount) }, accessToken ?? undefined),
    onSuccess: () => { setOpenError(''); invalidate() },
    onError: (e: Error) => setOpenError(e.message),
  })

  const closeMutation = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/cashier/registers/${id}/close`, { closingAmount: parseFloat(closingAmount) }, accessToken ?? undefined),
    onSuccess: () => { setCloseError(''); invalidate() },
    onError: (e: Error) => setCloseError(e.message),
  })

  const movementMutation = useMutation({
    mutationFn: () =>
      api.post('/cashier/movements', {
        type: movementType,
        paymentMethod,
        amount: parseFloat(movementAmount),
        ...(movementNotes ? { notes: movementNotes } : {}),
      }, accessToken ?? undefined),
    onSuccess: () => { setMovementAmount(''); setMovementNotes(''); invalidate() },
  })

  if (isLoading) {
    return <p className="text-gray-400 text-center py-16">Carregando caixa...</p>
  }

  const isOpen = !!register

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Caixa</h1>

      {!isOpen ? (
        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Abrir caixa</h2>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Valor inicial (R$)</label>
            <input
              type="number"
              value={openingAmount}
              onChange={(e) => setOpeningAmount(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
              min="0"
              step="0.01"
            />
          </div>
          {openError && <p className="text-sm text-red-600 mb-3">{openError}</p>}
          <button
            onClick={() => openMutation.mutate()}
            disabled={openMutation.isPending}
            className="w-full py-3 bg-green-600 text-white font-bold rounded-xl disabled:opacity-50 hover:bg-green-700 transition-colors"
          >
            {openMutation.isPending ? 'Abrindo...' : 'Abrir caixa'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Balance cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl shadow-sm p-4 text-center">
              <p className="text-xs text-gray-400 mb-1">Saldo atual</p>
              <p className="text-lg font-bold text-gray-900">{formatBRL(register.balance)}</p>
            </div>
            <div className="bg-green-50 rounded-2xl shadow-sm p-4 text-center">
              <p className="text-xs text-green-600 mb-1">Entradas</p>
              <p className="text-lg font-bold text-green-700">{formatBRL(register.totalIn)}</p>
            </div>
            <div className="bg-red-50 rounded-2xl shadow-sm p-4 text-center">
              <p className="text-xs text-red-500 mb-1">Saídas</p>
              <p className="text-lg font-bold text-red-600">{formatBRL(register.totalOut)}</p>
            </div>
          </div>

          {/* Add movement */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Registrar movimento</h2>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <select
                value={movementType}
                onChange={(e) => setMovementType(e.target.value as typeof movementType)}
                className="px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="payment">Pagamento</option>
                <option value="withdrawal">Retirada</option>
                <option value="supply">Suprimento</option>
              </select>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                className="px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="cash">Dinheiro</option>
                <option value="pix">Pix</option>
                <option value="card_credit">Crédito</option>
                <option value="card_debit">Débito</option>
                <option value="voucher">Voucher</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <input
                type="number"
                value={movementAmount}
                onChange={(e) => setMovementAmount(e.target.value)}
                placeholder="Valor (R$)"
                className="px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                min="0.01"
                step="0.01"
              />
              <input
                type="text"
                value={movementNotes}
                onChange={(e) => setMovementNotes(e.target.value)}
                placeholder="Observação (opcional)"
                className="px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <button
              onClick={() => movementMutation.mutate()}
              disabled={!movementAmount || movementMutation.isPending}
              className="w-full py-2.5 bg-brand-600 text-white font-semibold rounded-xl disabled:opacity-50 hover:bg-brand-700 transition-colors active:scale-[0.98]"
            >
              {movementMutation.isPending ? 'Registrando...' : 'Registrar'}
            </button>
          </div>

          {/* Movements list */}
          {register.movements.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h2 className="font-semibold text-gray-900 mb-1">
                Movimentos de hoje
              </h2>
              <p className="text-xs text-gray-400 mb-3">
                Aberto às {formatTime(register.openedAt)} · inicial {formatBRL(register.openingAmount)}
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {register.movements.map((m) => (
                  <div key={m.id} className="flex items-start justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                    <div>
                      <span className="font-medium text-gray-800">{MOVEMENT_LABELS[m.type]}</span>
                      {m.paymentMethod && (
                        <span className="ml-1.5 text-xs text-gray-400">{PAYMENT_LABELS[m.paymentMethod] ?? m.paymentMethod}</span>
                      )}
                      {m.notes && <p className="text-xs text-gray-400 mt-0.5">{m.notes}</p>}
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <span className={`font-semibold ${m.type === 'withdrawal' ? 'text-red-600' : 'text-green-600'}`}>
                        {m.type === 'withdrawal' ? '−' : '+'}{formatBRL(m.amount)}
                      </span>
                      <p className="text-xs text-gray-400">{formatTime(m.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Close register */}
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 mb-1">Fechar caixa</h2>
            <p className="text-xs text-gray-400 mb-3">Saldo esperado: {formatBRL(register.balance)}</p>
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor contado em caixa (R$)</label>
              <input
                type="number"
                value={closingAmount}
                onChange={(e) => setClosingAmount(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-brand-500"
                min="0"
                step="0.01"
              />
            </div>
            {closingAmount !== '0' && Number(closingAmount) !== Number(register.balance) && (
              <p className={`text-xs mb-3 ${Number(closingAmount) < Number(register.balance) ? 'text-red-600' : 'text-orange-500'}`}>
                Diferença: {formatBRL(Math.abs(Number(closingAmount) - Number(register.balance)))}
                {Number(closingAmount) < Number(register.balance) ? ' a menos' : ' a mais'}
              </p>
            )}
            {closeError && <p className="text-sm text-red-600 mb-3">{closeError}</p>}
            <button
              onClick={() => closeMutation.mutate(register.id)}
              disabled={closeMutation.isPending}
              className="w-full py-3 bg-red-600 text-white font-bold rounded-xl disabled:opacity-50 hover:bg-red-700 transition-colors"
            >
              {closeMutation.isPending ? 'Fechando...' : 'Fechar caixa'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
