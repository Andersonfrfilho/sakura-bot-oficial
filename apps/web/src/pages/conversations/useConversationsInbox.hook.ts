/**
 * Estado da inbox: filtros, paginação, seleção em massa e ações de atendimento.
 *
 * Fora da tela porque a tela já era grande demais para caber junto — e porque o estado tem regras
 * (guarda do marcar-como-lida, reset de página ao filtrar) que se leem melhor sozinhas.
 *
 * A paginação é do servidor: `page`/`pageSize` chegam na rota de listagem. Os filtros de janela e
 * de canal são derivados de campos que a própria listagem devolve, então filtram o que já veio.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CHANNEL_FILTER_ALL,
  CONVERSATION_WINDOW,
  DEFAULT_CONVERSATION_CHANNEL,
  channelFiltersFor,
  useConversationList,
  useGlobalRealtime,
  windowOf,
  type ChannelFilter,
  type ChannelFilterOption,
  type ConversationSummary,
  type ConversationWindow,
} from '@adatechnology/conversations-ui'

import {
  finalizeConversation,
  markConversationRead,
  releaseConversation,
  takeoverConversation,
} from '@/lib/conversationsSdkApi'

export const CONVERSATIONS_PER_PAGE = 20
const SEARCH_DEBOUNCE_MS = 300

export interface UseConversationsInboxResult {
  readonly conversations: ConversationSummary[]
  readonly pageConversations: ConversationSummary[]
  readonly loading: boolean
  readonly totalCount: number
  readonly unreadCount: number
  readonly waitingCount: number
  readonly filteredCount: number
  readonly page: number
  readonly pageCount: number
  readonly firstOnPage: number
  readonly lastOnPage: number
  readonly selectedId: string | undefined
  readonly selectedConversation: ConversationSummary | undefined
  readonly selectedIds: ReadonlySet<string>
  readonly waitingOnly: boolean
  readonly windowFilter: ConversationWindow
  readonly channelFilter: ChannelFilter
  readonly channelFilters: ChannelFilterOption[]
  readonly search: string
  readonly busy: boolean
  readonly now: number
  /**
   * Por que a lista está vazia, quando não é por não haver conversa. Sem isto uma sessão expirada
   * responde 401, a lista vem vazia e a tela fica indistinguível de inbox vazia de verdade.
   */
  readonly loadFailure: string | undefined
  selectConversation(conversationId: string): void
  clearSelection(): void
  toggleSelected(conversationId: string): void
  toggleSelectAllOnPage(): void
  setWaitingOnly(value: boolean): void
  setWindowFilter(value: ConversationWindow): void
  setChannelFilter(value: ChannelFilter): void
  setSearch(value: string): void
  goToPage(value: number): void
  markSelectedAsRead(): Promise<void>
  takeover(conversationId: string): Promise<void>
  releaseToBot(conversationId: string): Promise<void>
  finalize(conversationId: string): Promise<void>
}

function describeInboxFailure(error: Error | undefined): string | undefined {
  if (!error) return undefined
  const status = (error as { status?: number }).status
  if (status === 401 || status === 403) {
    return 'Sessão expirada nesta aba — entre no painel de novo para ver as conversas.'
  }
  return error.message
    ? `Não foi possível carregar as conversas: ${error.message}`
    : 'Não foi possível carregar as conversas.'
}

export function useConversationsInbox(): UseConversationsInboxResult {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [waitingOnly, setWaitingOnly] = useState(false)
  const [windowFilter, setWindowFilter] = useState<ConversationWindow>(CONVERSATION_WINDOW.ALL)
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>(CHANNEL_FILTER_ALL)
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search])

  const { conversations, total, loading, error, refetch } = useConversationList({
    page,
    limit: CONVERSATIONS_PER_PAGE,
    waitingHuman: waitingOnly ? true : undefined,
    search: debouncedSearch || undefined,
  })

  // O canal global não diz o que mudou: a resposta correta é refazer a query, não deduzir.
  useGlobalRealtime(
    useCallback(() => {
      void refetch()
    }, [refetch])
  )

  // Carimbo único por render de lista: recalcular `Date.now()` por linha faria conversas na
  // fronteira de 12h/21h/24h caírem em faixas diferentes na mesma tela.
  const now = useMemo(() => Date.now(), [conversations])

  const filtered = useMemo(
    () =>
      conversations
        .filter(
          (conversation) =>
            channelFilter === CHANNEL_FILTER_ALL ||
            (conversation.channel ?? DEFAULT_CONVERSATION_CHANNEL) === channelFilter
        )
        .filter(
          (conversation) =>
            windowFilter === CONVERSATION_WINDOW.ALL ||
            windowOf({ lastInboundAt: conversation.lastInboundAt, now, channel: conversation.channel }) ===
              windowFilter
        ),
    [conversations, windowFilter, channelFilter, now]
  )

  // Trocar de filtro com a página 7 ativa deixaria a lista vazia sem explicação.
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, waitingOnly, windowFilter, channelFilter])

  useEffect(() => {
    if (selectedId && !conversations.some((conversation) => conversation.id === selectedId)) {
      setSelectedId(undefined)
    }
  }, [conversations, selectedId])

  /**
   * Última tentativa de marcar como lida, como `id:unread`.
   *
   * Guarda contra laço quente: marcar dispara `refetch`, que muda `conversations`, que reexecuta o
   * efeito. O `unread === 0` encerra o ciclo normal, mas se a rota falhar ou devolver dado velho o
   * par se repetiria para sempre — uma requisição por render só aparece em produção, na aba que
   * alguém deixou aberta.
   */
  const lastMarkReadAttempt = useRef<string | undefined>(undefined)

  /**
   * Conversa aberta não exibe contador de não lidas. Em efeito, e não dentro do clique, para
   * cobrir os dois casos com a mesma regra: abrir a conversa e receber mensagem nova enquanto ela
   * está na tela.
   */
  useEffect(() => {
    if (!selectedId) return

    const opened = conversations.find((conversation) => conversation.id === selectedId)
    if (!opened || opened.unread === 0) return

    const attempt = `${selectedId}:${opened.unread}`
    if (lastMarkReadAttempt.current === attempt) return
    lastMarkReadAttempt.current = attempt

    void markConversationRead(selectedId)
      .then(() => refetch())
      .catch(() => {
        // Sem tratamento visível de propósito: falhar aqui deixa o badge onde estava, que é
        // exatamente a verdade — nada foi marcado.
      })
  }, [selectedId, conversations, refetch])

  const toggleSelected = useCallback((conversationId: string): void => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(conversationId)) next.delete(conversationId)
      else next.add(conversationId)
      return next
    })
  }, [])

  const pageIds = filtered.map((conversation) => conversation.id)
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id))

  const toggleSelectAllOnPage = useCallback((): void => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id))
      else pageIds.forEach((id) => next.add(id))
      return next
    })
  }, [allOnPageSelected, pageIds])

  const runAction = useCallback(
    async (action: () => Promise<void>): Promise<void> => {
      setBusy(true)
      try {
        await action()
        await refetch()
      } finally {
        setBusy(false)
      }
    },
    [refetch]
  )

  const markSelectedAsRead = useCallback(
    (): Promise<void> =>
      runAction(async () => {
        // Uma chamada por conversa: não existe rota em lote para seleção. Em paralelo para não
        // somar latência.
        await Promise.all([...selectedIds].map((conversationId) => markConversationRead(conversationId)))
        setSelectedIds(new Set())
      }),
    [selectedIds, runAction]
  )

  const takeover = useCallback(
    (conversationId: string): Promise<void> => runAction(() => takeoverConversation(conversationId)),
    [runAction]
  )

  const releaseToBot = useCallback(
    (conversationId: string): Promise<void> => runAction(() => releaseConversation(conversationId)),
    [runAction]
  )

  const finalize = useCallback(
    (conversationId: string): Promise<void> => runAction(() => finalizeConversation(conversationId)),
    [runAction]
  )

  const pageCount = Math.max(1, Math.ceil(total / CONVERSATIONS_PER_PAGE))
  const currentPage = Math.min(page, pageCount)

  return {
    conversations,
    pageConversations: filtered,
    loading,
    totalCount: total,
    unreadCount: conversations.reduce((sum, conversation) => sum + conversation.unread, 0),
    waitingCount: conversations.filter((conversation) => conversation.waitingHuman).length,
    filteredCount: filtered.length,
    page: currentPage,
    pageCount,
    firstOnPage: (currentPage - 1) * CONVERSATIONS_PER_PAGE + 1,
    lastOnPage: (currentPage - 1) * CONVERSATIONS_PER_PAGE + filtered.length,
    selectedId,
    selectedConversation: conversations.find((conversation) => conversation.id === selectedId),
    selectedIds,
    waitingOnly,
    windowFilter,
    channelFilter,
    channelFilters: channelFiltersFor(conversations),
    search,
    busy,
    now,
    loadFailure: describeInboxFailure(error),
    selectConversation: setSelectedId,
    clearSelection: () => setSelectedId(undefined),
    toggleSelected,
    toggleSelectAllOnPage,
    setWaitingOnly,
    setWindowFilter,
    setChannelFilter,
    setSearch,
    goToPage: setPage,
    markSelectedAsRead,
    takeover,
    releaseToBot,
    finalize,
  }
}
