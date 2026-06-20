import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/lib/api'

interface Setting {
  key: string
  value: unknown
}

const KNOWN_SETTINGS: Array<{ key: string; label: string; type: 'text' | 'number' | 'boolean'; description?: string }> = [
  { key: 'business_name', label: 'Nome do estabelecimento', type: 'text' },
  { key: 'whatsapp_number', label: 'Número WhatsApp', type: 'text', description: 'Formato: 5511999999999' },
  { key: 'delivery_fee', label: 'Taxa de entrega (R$)', type: 'number' },
  { key: 'min_order_amount', label: 'Pedido mínimo (R$)', type: 'number' },
  { key: 'estimated_delivery_time', label: 'Tempo estimado de entrega (min)', type: 'number' },
  { key: 'estimated_pickup_time', label: 'Tempo estimado de retirada (min)', type: 'number' },
  { key: 'accept_orders', label: 'Aceitar pedidos', type: 'boolean' },
  { key: 'accept_delivery', label: 'Aceitar entregas', type: 'boolean' },
  { key: 'accept_pickup', label: 'Aceitar retirada', type: 'boolean' },
  { key: 'accept_table', label: 'Aceitar pedidos na mesa', type: 'boolean' },
]

function toString(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

export function SettingsPage() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const queryClient = useQueryClient()

  const [values, setValues] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: settings = [], isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<Setting[]>('/settings', accessToken ?? undefined),
  })

  useEffect(() => {
    if (settings.length > 0) {
      const map: Record<string, string> = {}
      for (const s of settings) {
        map[s.key] = toString(s.value)
      }
      setValues(map)
    }
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) =>
      api.put('/settings', { key, value }, accessToken ?? undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (e: Error) => setError(e.message),
  })

  async function handleSave() {
    setError(null)
    setSaved(false)
    const promises = KNOWN_SETTINGS.map((def) => {
      const raw = values[def.key]
      if (raw === undefined) return Promise.resolve()
      let parsed: unknown = raw
      if (def.type === 'number') parsed = raw === '' ? null : Number(raw)
      if (def.type === 'boolean') parsed = raw === 'true'
      return saveMutation.mutateAsync({ key: def.key, value: parsed })
    })
    await Promise.all(promises)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  function getValue(key: string, type: 'text' | 'number' | 'boolean'): string {
    const v = values[key]
    if (v !== undefined) return v
    const existing = settings.find((s) => s.key === key)
    if (existing) return toString(existing.value)
    return type === 'boolean' ? 'false' : ''
  }

  function setValue(key: string, val: string) {
    setValues((prev) => ({ ...prev, [key]: val }))
    setSaved(false)
  }

  if (isLoading) return <p className="text-gray-400 text-center py-16">Carregando...</p>

  const textFields = KNOWN_SETTINGS.filter((s) => s.type === 'text' || s.type === 'number')
  const boolFields = KNOWN_SETTINGS.filter((s) => s.type === 'boolean')

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Configurações</h1>
        <button
          onClick={() => void handleSave()}
          disabled={saveMutation.isPending}
          className="px-5 py-2 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 disabled:opacity-50 transition-colors active:scale-95"
        >
          {saveMutation.isPending ? 'Salvando...' : saved ? '✓ Salvo' : 'Salvar'}
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}

      {/* Text / number fields */}
      <div className="bg-white rounded-2xl shadow-sm p-5 mb-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Informações gerais</h2>
        {textFields.map((def) => (
          <div key={def.key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{def.label}</label>
            <input
              type={def.type === 'number' ? 'number' : 'text'}
              value={getValue(def.key, def.type)}
              onChange={(e) => setValue(def.key, e.target.value)}
              step={def.type === 'number' ? '0.01' : undefined}
              min={def.type === 'number' ? '0' : undefined}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {def.description && (
              <p className="text-xs text-gray-400 mt-1">{def.description}</p>
            )}
          </div>
        ))}
      </div>

      {/* Boolean toggles */}
      <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">Funcionalidades</h2>
        {boolFields.map((def) => {
          const isOn = getValue(def.key, 'boolean') === 'true'
          return (
            <div key={def.key} className="flex items-center justify-between py-1">
              <span className="text-sm text-gray-700">{def.label}</span>
              <button
                onClick={() => setValue(def.key, isOn ? 'false' : 'true')}
                className={`relative w-11 h-6 rounded-full transition-colors ${isOn ? 'bg-brand-600' : 'bg-gray-200'}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isOn ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </div>
          )
        })}
      </div>

      {/* Change password link */}
      <div className="mt-4 bg-white rounded-2xl shadow-sm p-5">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Segurança</h2>
        <a
          href="/change-password"
          className="text-sm text-brand-600 hover:text-brand-700 font-medium"
        >
          Alterar minha senha →
        </a>
      </div>
    </div>
  )
}
