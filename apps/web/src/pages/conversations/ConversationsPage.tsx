import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import { api, ApiError } from '@/lib/api'
import { ConversationListItem } from './components/ConversationListItem'
import { MessageBubble } from './components/MessageBubble'
import { MessageComposer } from './components/MessageComposer'

interface ConversationMessage {
  id: string
  establishmentId: string
  whatsappNumber: string
  direction: 'inbound' | 'outbound'
  sender: 'customer' | 'bot' | 'agent'
  agentUserId: string | null
  type: string
  content: string | null
  payload: Record<string, unknown>
  waMessageId: string | null
  status: string
  readAt: string | null
  createdAt: string
}

interface ConversationSession {
  id: string
  establishmentId: string
  whatsappNumber: string
  currentState: string
  context: Record<string, unknown>
  mode: 'bot' | 'human'
  assignedUserId: string | null
  humanRequestedAt: string | null
  lastInboundAt: string | null
  lastAgentReadAt: string | null
  lastActivity: string
  createdAt: string
  updatedAt: string
}

interface ConversationSummary extends ConversationSession {
  lastMessage: Pick<ConversationMessage, 'content' | 'type' | 'direction' | 'createdAt'> | null
  unreadCount: number
}

interface ListConversationsResult {
  data: ConversationSummary[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

interface ListMessagesResult {
  data: ConversationMessage[]
  hasMore: boolean
}

interface ConversationContextResult {
  currentState: string
  context: Record<string, unknown>
}

interface FetchMediaResult {
  base64: string
  mimeType: string
}

type WindowStatus = 'active' | 'expiring' | 'expired' | 'none'

const STATE_LABELS: Record<string, string> = {
  start: 'Início',
  awaiting_name: 'Aguardando nome',
  browsing_cat: 'Vendo cardápio',
  ordering_items: 'Montando pedido',
  awaiting_qty: 'Aguardando quantidade',
  more: 'Perguntando se quer mais',
  awaiting_type: 'Escolhendo entrega/retirada',
  awaiting_address: 'Aguardando endereço',
  awaiting_complement: 'Aguardando complemento',
  offer_pickup: 'Oferecendo retirada',
  awaiting_payment: 'Aguardando forma de pagamento',
  awaiting_change: 'Aguardando troco',
  awaiting_split: 'Dividindo conta',
  awaiting_mixed: 'Pagamento misto',
  reserving: 'Fazendo reserva',
  confirming_reservation: 'Confirmando reserva',
  human_handoff: 'Transferido para atendente',
  order_detail: 'Vendo detalhes do pedido',
}

const QUICK_MESSAGES = [
  { label: 'A caminho', text: 'Seu pedido está a caminho! 🛵' },
  { label: 'Pronto', text: 'Seu pedido está pronto! 🎉' },
  { label: 'Endereço', text: 'Qual o endereço completo para entrega?' },
  { label: 'Pagamento', text: 'Aceitamos Pix, cartão e dinheiro. Qual a forma de pagamento?' },
  { label: 'Obrigado', text: 'Obrigado pela preferência! Até a próxima 😊' },
]

function getWindowStatus(session: ConversationSummary | undefined): WindowStatus {
  if (!session?.lastInboundAt) return 'none'
  const hours = (Date.now() - new Date(session.lastInboundAt).getTime()) / 3_600_000
  if (hours >= 24) return 'expired'
  if (hours >= 22) return 'expiring'
  return 'active'
}

function formatPhone(number: string) {
  const digits = number.replace(/\D/g, '')
  if (digits.length === 13) return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`
  return number
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function renderContextEntries(context: Record<string, unknown>): Array<[string, string]> {
  const entries: Array<[string, string]> = []
  for (const [key, value] of Object.entries(context)) {
    if (key === 'cart' || value === null || value === undefined) continue
    if (typeof value === 'object') continue
    entries.push([key, String(value)])
  }
  return entries
}

interface CartItem {
  name?: string
  quantity?: number
  price?: number
}

function extractCart(context: Record<string, unknown>): CartItem[] {
  const cart = context['cart']
  if (!Array.isArray(cart)) return []
  return cart as CartItem[]
}

export function ConversationsPage() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const currentUser = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [waitingHumanFilter, setWaitingHumanFilter] = useState(false)
  const [hasUnreadFilter, setHasUnreadFilter] = useState(false)
  const [page, setPage] = useState(1)
  const [selectedWhatsapp, setSelectedWhatsapp] = useState<string | null>(null)
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [hasMoreHistory, setHasMoreHistory] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [composerValue, setComposerValue] = useState('')
  const [attachedFile, setAttachedFile] = useState<{ file: File; previewUrl: string | null } | null>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set())
  const [mediaPreview, setMediaPreview] = useState<{ mimeType: string; base64: string } | null>(null)

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesScrollRef = useRef<HTMLDivElement>(null)
  const pageSize = 20

  const handleSearch = useCallback((value: string) => {
    setSearch(value)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(value)
      setPage(1)
    }, 300)
  }, [])

  const { data: conversationsData, isLoading: conversationsLoading } = useQuery({
    queryKey: ['conversations', page, waitingHumanFilter, hasUnreadFilter, debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      if (waitingHumanFilter) params.set('waitingHuman', 'true')
      if (hasUnreadFilter) params.set('hasUnread', 'true')
      if (debouncedSearch) params.set('search', debouncedSearch)
      return api.get<ListConversationsResult>(`/conversations?${params}`, accessToken ?? undefined)
    },
    refetchInterval: 15_000,
  })

  const selectedSummary = conversationsData?.data.find((item) => item.whatsappNumber === selectedWhatsapp)

  const { data: contextData } = useQuery({
    queryKey: ['conversation-context', selectedWhatsapp],
    queryFn: () => api.get<ConversationContextResult>(`/conversations/${selectedWhatsapp}/context`, accessToken ?? undefined),
    enabled: !!selectedWhatsapp,
  })

  const loadMessages = useCallback(
    async (whatsappNumber: string, before?: string) => {
      const params = new URLSearchParams({ limit: '30' })
      if (before) params.set('before', before)
      const result = await api.get<ListMessagesResult>(`/conversations/${whatsappNumber}/messages?${params}`, accessToken ?? undefined)
      return result
    },
    [accessToken]
  )

  useEffect(() => {
    if (!selectedWhatsapp) {
      setMessages([])
      return
    }
    setMessages([])
    setHasMoreHistory(false)
    void loadMessages(selectedWhatsapp).then((result) => {
      setMessages([...result.data].reverse())
      setHasMoreHistory(result.hasMore)
    })
    void api.post(`/conversations/${selectedWhatsapp}/read`, {}, accessToken ?? undefined).then(() => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
    })
  }, [selectedWhatsapp, loadMessages, accessToken, queryClient])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function handleLoadOlder() {
    if (!selectedWhatsapp || messages.length === 0 || loadingOlder) return
    setLoadingOlder(true)
    try {
      const oldest = messages[0]
      const result = await loadMessages(selectedWhatsapp, oldest?.createdAt)
      setMessages((current) => [...[...result.data].reverse(), ...current])
      setHasMoreHistory(result.hasMore)
    } finally {
      setLoadingOlder(false)
    }
  }

  function handleScroll() {
    const container = messagesScrollRef.current
    if (container && container.scrollTop < 80 && hasMoreHistory && !loadingOlder) {
      void handleLoadOlder()
    }
  }

  useWebSocket((message) => {
    if (!message.type.startsWith('conversation:')) return
    void queryClient.invalidateQueries({ queryKey: ['conversations'] })

    if (message.type === 'conversation:message') {
      const incoming = message.payload as ConversationMessage
      if (incoming.whatsappNumber === selectedWhatsapp) {
        setMessages((current) => (current.some((item) => item.id === incoming.id) ? current : [...current, incoming]))
      }
    }
    if (message.type === 'conversation:session' && selectedWhatsapp) {
      void queryClient.invalidateQueries({ queryKey: ['conversation-context', selectedWhatsapp] })
    }
  })

  async function handleSend() {
    if (!selectedWhatsapp || sending) return
    setSending(true)
    setSendError(null)
    try {
      if (attachedFile) {
        const base64Data = await fileToBase64(attachedFile.file)
        const message = await api.post<ConversationMessage>(
          `/conversations/${selectedWhatsapp}/send-media`,
          {
            base64Data,
            mimeType: attachedFile.file.type || 'application/octet-stream',
            filename: attachedFile.file.name,
            caption: composerValue.trim() || undefined,
          },
          accessToken ?? undefined
        )
        setMessages((current) => [...current, message])
        setAttachedFile(null)
        setComposerValue('')
      } else {
        const message = await api.post<ConversationMessage>(
          `/conversations/${selectedWhatsapp}/send`,
          { body: composerValue.trim() },
          accessToken ?? undefined
        )
        setMessages((current) => [...current, message])
        setComposerValue('')
      }
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
    } catch (error: unknown) {
      const message = error instanceof ApiError ? error.message : 'Erro ao enviar mensagem'
      setSendError(message)
    } finally {
      setSending(false)
    }
  }

  async function handleSendTemplate(templateName: string) {
    if (!selectedWhatsapp) return
    setSending(true)
    setSendError(null)
    try {
      const message = await api.post<ConversationMessage>(
        `/conversations/${selectedWhatsapp}/send-template`,
        { templateName, languageCode: 'pt_BR' },
        accessToken ?? undefined
      )
      setMessages((current) => [...current, message])
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
    } catch (error: unknown) {
      const message = error instanceof ApiError ? error.message : 'Erro ao enviar template'
      setSendError(message)
    } finally {
      setSending(false)
    }
  }

  function handleAttach(file: File) {
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null
    setAttachedFile({ file, previewUrl })
  }

  async function handleTakeover() {
    if (!selectedWhatsapp) return
    await api.post(`/conversations/${selectedWhatsapp}/takeover`, {}, accessToken ?? undefined)
    void queryClient.invalidateQueries({ queryKey: ['conversations'] })
  }

  async function handleRelease() {
    if (!selectedWhatsapp) return
    await api.post(`/conversations/${selectedWhatsapp}/release`, {}, accessToken ?? undefined)
    void queryClient.invalidateQueries({ queryKey: ['conversations'] })
  }

  async function handleFinalize() {
    if (!selectedWhatsapp) return
    await api.post(`/conversations/${selectedWhatsapp}/finalize`, {}, accessToken ?? undefined)
    void queryClient.invalidateQueries({ queryKey: ['conversations'] })
  }

  async function handleViewMedia(message: ConversationMessage) {
    const mediaId = typeof message.payload['mediaId'] === 'string' ? (message.payload['mediaId'] as string) : message.waMessageId
    if (!mediaId) return
    const result = await api.get<FetchMediaResult>(`/conversations/media/${mediaId}`, accessToken ?? undefined)
    setMediaPreview(result)
  }

  function toggleMessageSelection(id: string) {
    setSelectedMessageIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleCopySelected() {
    const selected = messages.filter((message) => selectedMessageIds.has(message.id))
    const text = selected.map((message) => `[${message.sender}] ${message.content ?? ''}`).join('\n')
    void navigator.clipboard.writeText(text)
    setSelectedMessageIds(new Set())
  }

  async function handleExport() {
    if (!selectedWhatsapp) return
    const exported = await api.get<ConversationMessage[]>(`/conversations/${selectedWhatsapp}/export`, accessToken ?? undefined)
    const text = exported.map((message) => `[${message.createdAt}] [${message.sender}] ${message.content ?? `(${message.type})`}`).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `conversa-${selectedWhatsapp}.txt`
    link.click()
    URL.revokeObjectURL(url)
  }

  const windowStatus = getWindowStatus(selectedSummary)
  const isHuman = selectedSummary?.mode === 'human'
  const isAssignedToMe = selectedSummary?.assignedUserId === currentUser?.id
  const cart = contextData ? extractCart(contextData.context) : []
  const cartTotal = cart.reduce((sum, item) => sum + (item.price ?? 0) * (item.quantity ?? 1), 0)

  return (
    <div className="flex h-[calc(100vh-3.5rem)] md:h-screen">
      {/* Lista de conversas */}
      <div className={`w-full md:w-80 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col ${selectedWhatsapp ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-3 border-b border-gray-200 space-y-2">
          <h1 className="text-lg font-bold text-gray-900">Conversas</h1>
          <input
            type="search"
            placeholder="Buscar por número..."
            value={search}
            onChange={(event) => handleSearch(event.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setWaitingHumanFilter((value) => !value)}
              className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                waitingHumanFilter ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Aguardando humano
            </button>
            <button
              onClick={() => setHasUnreadFilter((value) => !value)}
              className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                hasUnreadFilter ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Não lidas
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversationsLoading ? (
            <p className="text-center text-gray-400 text-sm py-10">Carregando...</p>
          ) : conversationsData?.data.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-10">Nenhuma conversa encontrada</p>
          ) : (
            conversationsData?.data.map((conversation) => (
              <ConversationListItem
                key={conversation.whatsappNumber}
                conversation={conversation}
                selected={conversation.whatsappNumber === selectedWhatsapp}
                onSelect={setSelectedWhatsapp}
              />
            ))
          )}
        </div>

        {conversationsData && conversationsData.totalPages > 1 && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-gray-200 bg-gray-50">
            <button
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-xs border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-100"
            >
              Anterior
            </button>
            <span className="text-xs text-gray-500">{conversationsData.page}/{conversationsData.totalPages}</span>
            <button
              onClick={() => setPage((current) => Math.min(conversationsData.totalPages, current + 1))}
              disabled={page === conversationsData.totalPages}
              className="px-3 py-1 text-xs border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-100"
            >
              Próxima
            </button>
          </div>
        )}
      </div>

      {/* Painel da conversa */}
      {!selectedWhatsapp ? (
        <div className="hidden md:flex flex-1 items-center justify-center text-gray-400 text-sm">
          Selecione uma conversa para começar
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 bg-white">
            <div className="flex items-center gap-2 min-w-0">
              <button onClick={() => setSelectedWhatsapp(null)} className="md:hidden text-gray-400 hover:text-gray-600 text-lg">←</button>
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 truncate">{formatPhone(selectedWhatsapp)}</p>
                <p className="text-xs text-gray-400">
                  {STATE_LABELS[contextData?.currentState ?? ''] ?? contextData?.currentState ?? '—'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {selectedMessageIds.size > 0 && (
                <button onClick={handleCopySelected} className="px-2.5 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">
                  Copiar ({selectedMessageIds.size})
                </button>
              )}
              <button onClick={() => void handleExport()} className="px-2.5 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">
                Exportar
              </button>
              {!isHuman ? (
                <button
                  onClick={() => void handleTakeover()}
                  className="px-3 py-1.5 text-xs font-medium bg-brand-600 text-white rounded-lg hover:bg-brand-700 active:scale-95"
                >
                  Assumir
                </button>
              ) : (
                <>
                  <button onClick={() => void handleRelease()} className="px-2.5 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50">
                    Liberar p/ bot
                  </button>
                  <button
                    onClick={() => void handleFinalize()}
                    className="px-2.5 py-1 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                  >
                    Finalizar
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-1 min-h-0">
            <div className="flex-1 flex flex-col min-w-0">
              <div ref={messagesScrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50">
                {loadingOlder && <p className="text-center text-xs text-gray-400">Carregando mensagens anteriores...</p>}
                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    selected={selectedMessageIds.has(message.id)}
                    selectable={selectedMessageIds.size > 0}
                    onToggleSelect={toggleMessageSelection}
                    onViewMedia={() => void handleViewMedia(message)}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>

              {sendError && (
                <p className="px-4 py-1.5 text-xs text-red-600 bg-red-50 border-t border-red-100">{sendError}</p>
              )}

              {windowStatus === 'expired' || windowStatus === 'none' ? (
                <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 flex items-center justify-between gap-2">
                  <p className="text-xs text-amber-800">
                    {windowStatus === 'none'
                      ? 'Este contato ainda não enviou mensagem — só é possível iniciar com um template aprovado.'
                      : 'Janela de 24h encerrada — reabra a conversa com um template aprovado antes de enviar texto livre.'}
                  </p>
                  <button
                    onClick={() => void handleSendTemplate('atendimento_reabertura')}
                    className="px-2.5 py-1 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 flex-shrink-0"
                  >
                    Enviar template
                  </button>
                </div>
              ) : windowStatus === 'expiring' ? (
                <div className="px-4 py-1.5 bg-amber-50 border-t border-amber-200">
                  <p className="text-xs text-amber-700">Janela de 24h expira em breve.</p>
                </div>
              ) : null}

              {!isHuman ? (
                <div className="px-4 py-3 bg-gray-100 border-t border-gray-200 text-center">
                  <p className="text-sm text-gray-500">Assuma o atendimento para responder diretamente ao cliente.</p>
                </div>
              ) : (
                <MessageComposer
                  value={composerValue}
                  onChange={setComposerValue}
                  onSend={() => void handleSend()}
                  onAttach={handleAttach}
                  attachedFile={attachedFile}
                  onRemoveAttachment={() => setAttachedFile(null)}
                  disabled={windowStatus === 'expired' || windowStatus === 'none'}
                  sending={sending}
                  quickMessages={QUICK_MESSAGES}
                />
              )}
            </div>

            {/* Painel de contexto */}
            <div className="hidden lg:block w-72 flex-shrink-0 border-l border-gray-200 bg-white overflow-y-auto p-4 space-y-4">
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Estado do fluxo</h3>
                <p className="text-sm text-gray-900">
                  {STATE_LABELS[contextData?.currentState ?? ''] ?? contextData?.currentState ?? '—'}
                </p>
                {isAssignedToMe && (
                  <span className="inline-flex mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-100 text-brand-700">
                    Atribuído a você
                  </span>
                )}
              </div>

              {cart.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Pedido em andamento</h3>
                  <div className="space-y-1.5">
                    {cart.map((item, index) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 truncate">{item.quantity ?? 1}x {item.name ?? 'Item'}</span>
                        {typeof item.price === 'number' && (
                          <span className="text-gray-500 flex-shrink-0 ml-2">
                            {(item.price * (item.quantity ?? 1)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  {cartTotal > 0 && (
                    <div className="flex items-center justify-between text-sm font-semibold mt-2 pt-2 border-t border-gray-100">
                      <span>Total</span>
                      <span>{cartTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                    </div>
                  )}
                </div>
              )}

              {contextData && renderContextEntries(contextData.context).length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Dados coletados</h3>
                  <div className="space-y-1.5">
                    {renderContextEntries(contextData.context).map(([key, value]) => (
                      <div key={key} className="text-xs">
                        <span className="text-gray-400">{key}: </span>
                        <span className="text-gray-700">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {mediaPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setMediaPreview(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-4" onClick={(event) => event.stopPropagation()}>
            <div className="flex justify-end mb-2">
              <button onClick={() => setMediaPreview(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            {mediaPreview.mimeType.startsWith('image/') ? (
              <img src={`data:${mediaPreview.mimeType};base64,${mediaPreview.base64}`} alt="" className="max-w-full max-h-[70vh] mx-auto rounded-lg" />
            ) : mediaPreview.mimeType.startsWith('audio/') ? (
              <audio controls src={`data:${mediaPreview.mimeType};base64,${mediaPreview.base64}`} className="w-full" />
            ) : mediaPreview.mimeType.startsWith('video/') ? (
              <video controls src={`data:${mediaPreview.mimeType};base64,${mediaPreview.base64}`} className="max-w-full max-h-[70vh] mx-auto rounded-lg" />
            ) : (
              <a
                href={`data:${mediaPreview.mimeType};base64,${mediaPreview.base64}`}
                download
                className="text-brand-600 underline text-sm"
              >
                Baixar arquivo
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
