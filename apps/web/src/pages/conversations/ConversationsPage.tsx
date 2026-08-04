/**
 * Inbox de atendimento sobre a camada headless do @adatechnology/conversations-ui. Toda a
 * tradução para as rotas do Order Hub vive no adapter (`lib/conversationsSdkApi.ts`) e o estado da
 * listagem no `useConversationsInbox`; aqui só se monta a tela.
 */

import { useMemo, useState, type RefObject } from 'react'
import { useSearchParams } from 'react-router-dom'
import '@adatechnology/conversations-ui/styles.css'
import {
  CHANNEL_FILTER_ALL,
  ChannelIcon,
  ConversationContextPanel,
  ConversationHeader,
  ConversationRow,
  ConversationsProvider,
  ConversationWallpaper,
  DateDivider,
  isWindowBlocking,
  MessageBubble,
  MessageComposer,
  useConversationContext,
  useConversationMessages,
  useConversationRealtime,
  useScrollToLatestMessage,
  WINDOW_FILTERS,
  WindowExpiredNotice,
  windowOf,
  type ConversationSummary,
} from '@adatechnology/conversations-ui'
import {
  ConversationSimulatorPanel,
  createPreviewBridgeClient,
} from '@adatechnology/conversations-ui/preview'

import { CONVERSATION_QUERY_PARAM } from '@/constants/conversationLinks'
import { api } from '@/lib/api'
import { conversationsSdkApi } from '@/lib/conversationsSdkApi'
import { conversationsSdkRealtime } from '@/lib/conversationsSdkRealtime'
import { fileToAttachment } from '@/lib/fileToAttachment'
import { uploadPreviewMedia } from '@/lib/uploadPreviewMedia'
import { IS_CONVERSATION_PREVIEW_ENABLED } from './previewEnvironment'
import { stateLabel, toContextEntries } from './conversationContext'
import { downloadConversation } from './conversationsExport'
import { CONVERSATION_QUICK_REPLIES, quickReplyVariablesFor } from './quickReplies'
import { useConversationsInbox } from './useConversationsInbox.hook'

interface ConversationPaneProps {
  conversation: ConversationSummary
  now: number
  busy: boolean
  onTakeover: () => void
  onReturnToBot: () => void
  onFinish: () => void
  onBack: () => void
  simulatorOpen: boolean
  onToggleSimulator: () => void
}

function ConversationPane({
  conversation,
  now,
  busy,
  onTakeover,
  onReturnToBot,
  onFinish,
  onBack,
  simulatorOpen,
  onToggleSimulator,
}: ConversationPaneProps) {
  const { messages, refetch, sendMessage, sendMedia, sendTemplate } = useConversationMessages(conversation.id)
  const { context } = useConversationContext(conversation.id)
  const [sendFailure, setSendFailure] = useState<string | undefined>(undefined)

  // Abrir no topo do histórico obrigava a rolar semanas até a última mensagem — que é sempre o
  // que interessa. O hook salta ao trocar de conversa e acompanha mensagem nova sem arrastar
  // quem estiver lendo o histórico.
  const scroll = useScrollToLatestMessage({ conversationId: conversation.id, messageCount: messages.length })

  // O evento traz só o essencial; quem tem o conteúdo é a query.
  useConversationRealtime(conversation.id, () => {
    void refetch()
  })

  const blocked = isWindowBlocking(
    windowOf({ lastInboundAt: conversation.lastInboundAt, now, channel: conversation.channel })
  )
  const isHuman = conversation.mode === 'human'
  // O nome vem do contexto do fluxo (o bot pergunta antes de anotar o pedido), não da listagem.
  const clientName = typeof context?.['name'] === 'string' ? context['name'] : undefined

  /**
   * Falha vira aviso na tela em vez de exceção engolida: o atendente escreveu, achou que mandou,
   * e sem retorno não teria como saber que o cliente não recebeu nada.
   */
  async function runSend(action: () => Promise<unknown>, fallbackMessage: string): Promise<void> {
    setSendFailure(undefined)
    try {
      await action()
    } catch (error: unknown) {
      setSendFailure(error instanceof Error ? error.message : fallbackMessage)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ConversationHeader
        conversation={conversation}
        busy={busy}
        onTakeover={onTakeover}
        onReturnToBot={onReturnToBot}
        onFinish={onFinish}
        onDownload={() =>
          void downloadConversation({
            conversationId: conversation.id,
            whatsappNumber: conversation.whatsappNumber,
            clientName,
          })
        }
        onBack={onBack}
        // No cabeçalho da conversa, ao lado de "Assumir atendimento": o simulador age sobre ESTA
        // conversa, e no cabeçalho da página ele parecia um filtro da inbox.
        extraUtilities={
          IS_CONVERSATION_PREVIEW_ENABLED
            ? [
                {
                  key: 'simulator',
                  icon: '🧪',
                  label: 'Simular cliente',
                  active: simulatorOpen,
                  run: onToggleSimulator,
                },
              ]
            : []
        }
      />

      <ConversationContextPanel
        entries={toContextEntries(context)}
        flowLabel={stateLabel(conversation.currentState)}
      />

      <ConversationWallpaper
        // O pacote é tipado com React 19, onde `RefObject<T>` já inclui `null`; aqui é React 18.
        // A referência é a mesma em runtime — só a assinatura do tipo mudou entre as versões.
        ref={scroll.containerRef as RefObject<HTMLDivElement>}
        onScroll={scroll.handleScroll}
        className="relative min-h-0 flex-1 overflow-y-auto px-4 py-3"
      >
        {messages.map((message, index) => {
          const previous = index > 0 ? messages[index - 1] : undefined
          const startsNewDay =
            !previous || new Date(message.timestamp).toDateString() !== new Date(previous.timestamp).toDateString()

          return (
            <div key={message.id}>
              {startsNewDay ? <DateDivider iso={message.timestamp} /> : null}
              <MessageBubble
                message={message}
                isMine={message.direction === 'outbound'}
                isFirstInGroup={!previous || previous.sender !== message.sender}
              />
            </div>
          )
        })}
      </ConversationWallpaper>

      {sendFailure ? (
        <p role="alert" className="border-t bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {sendFailure}
        </p>
      ) : null}

      {blocked ? (
        <WindowExpiredNotice
          disabled={busy}
          onSendTemplate={() => void runSend(() => sendTemplate({}), 'Erro ao enviar o template de reabertura.')}
        />
      ) : !isHuman ? (
        <p className="border-t bg-gray-100 px-4 py-3 text-center text-sm text-gray-500 dark:bg-gray-800 dark:text-gray-400">
          Assuma o atendimento para responder diretamente ao cliente.
        </p>
      ) : (
        <MessageComposer
          onSend={(text) => void runSend(() => sendMessage(text), 'Erro ao enviar a mensagem.')}
          // Habilita clipe E microfone: o composer desenha o gravador sozinho quando existe um
          // jeito de entregar arquivo, porque áudio gravado é um anexo como qualquer outro.
          onAttach={(file) =>
            void runSend(async () => sendMedia(await fileToAttachment(file)), 'Erro ao enviar o arquivo.')
          }
          placeholder="Responder como atendente…"
          quickReplies={CONVERSATION_QUICK_REPLIES}
          quickReplyVariables={quickReplyVariablesFor(clientName)}
        />
      )}
    </div>
  )
}

/**
 * Lado do cliente, para exercitar o fluxo sem um telefone real. Manda a INTENÇÃO ("mandou este
 * texto", "tocou neste botão") para a API, que monta o payload da Meta e o assina com o app secret —
 * que fica só no servidor. Assinar aqui obrigaria a publicar o segredo no bundle.
 *
 * Neste projeto o bot é o workflow do n8n, e a API não responde sozinha: o que se vê na thread ao
 * lado é a mensagem do cliente entrando. A resposta aparece quando o n8n estiver apontado para esta
 * instância.
 */
function SimulatorPanel({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const client = useMemo(
    () =>
      createPreviewBridgeClient({
        from: conversationId,
        // `api` e não `fetch` na mão: é o cliente que carrega o access token e renova no 401.
        sendCommand: async (command) => {
          await api.post('/conversations/preview/inbound', command)
        },
      }),
    [conversationId]
  )

  return (
    <ConversationSimulatorPanel
      conversationId={conversationId}
      onClose={onClose}
      client={client}
      // Sem isto o painel esconde o microfone: nota de voz precisa de um id que o canal resolva,
      // e é o servidor que hospeda os bytes e devolve esse id.
      uploadMedia={uploadPreviewMedia}
      sse={conversationsSdkRealtime}
      loadMessages={(id) => conversationsSdkApi.fetchMessages(id)}
    />
  )
}

function Inbox() {
  const [searchParams] = useSearchParams()
  const [simulatorOpen, setSimulatorOpen] = useState(false)
  // Lido uma vez: o hook usa como estado inicial, e reagir a mudanças depois roubaria a conversa
  // que o atendente tivesse aberto na mão.
  const inbox = useConversationsInbox({
    initialWhatsappNumber: searchParams.get(CONVERSATION_QUERY_PARAM) ?? undefined,
  })
  const selectedConversation = inbox.selectedConversation
  const showSimulator = simulatorOpen && selectedConversation !== undefined

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-h-0 flex-col md:h-screen">
      {/* Cabeçalho denso em tela estreita: ícone + número. O rótulo escrito ("conversas",
          "não lidas") ocupava três linhas em 375px e empurrava a lista para fora da tela. */}
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold lg:text-xl">Conversas</h1>
          <p className="flex flex-wrap items-center gap-x-3 text-sm text-gray-500">
            <span title="Conversas">
              💬 {inbox.totalCount}
              <span className="cv-only-wide"> conversas</span>
            </span>
            <span title="Aguardando atendimento" className="text-amber-600 dark:text-amber-400">
              ⏳ {inbox.waitingCount}
              <span className="cv-only-wide"> aguardando</span>
            </span>
            <span title="Não lidas">
              ✉️ {inbox.unreadCount}
              <span className="cv-only-wide"> não lidas</span>
            </span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => inbox.setWaitingOnly(!inbox.waitingOnly)}
            aria-pressed={inbox.waitingOnly}
            title="Só aguardando atendimento"
            className={`rounded-md border px-3 py-2 text-sm ${inbox.waitingOnly ? 'bg-brand-600 text-white' : ''}`}
          >
            ⏳<span className="cv-only-wide"> Aguardando atendimento</span>
          </button>
          {/* O contador só aparece quando há seleção: " (0)" era texto morto ao lado do ícone. */}
          <button
            type="button"
            onClick={() => void inbox.markSelectedAsRead()}
            disabled={inbox.selectedIds.size === 0 || inbox.busy}
            title="Marcar selecionadas como lidas"
            aria-label="Marcar selecionadas como lidas"
            className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
          >
            ✓<span className="cv-only-wide"> Marcar selecionadas como lidas</span>
            {inbox.selectedIds.size > 0 ? ` (${inbox.selectedIds.size})` : ''}
          </button>
        </div>
      </header>

      {/* Silêncio aqui foi o que fez "não existe nenhuma conversa" parecer perda de dados: sem
          sessão a API responde 401, a lista vem vazia e a tela não dizia nada. */}
      {inbox.loadFailure ? (
        <p
          role="alert"
          className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        >
          {inbox.loadFailure}
        </p>
      ) : null}

      {/* Master/detail: abaixo de `lg` a lista e a conversa dividiriam a mesma altura fixa e cada
          uma viraria uma fatia inútil — ali mostra uma ou outra. */}
      <div
        className={`grid min-h-0 flex-1 grid-cols-1 gap-3 bg-gray-100 p-3 dark:bg-gray-900 ${
          showSimulator ? 'lg:grid-cols-[360px_minmax(0,1fr)_24rem]' : 'lg:grid-cols-[360px_minmax(0,1fr)]'
        }`}
      >
        <aside
          className={`flex min-h-0 flex-col overflow-hidden rounded-xl border bg-white dark:bg-gray-800 ${
            selectedConversation ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div className="space-y-2 border-b p-3">
            <input
              type="search"
              value={inbox.search}
              onChange={(event) => inbox.setSearch(event.target.value)}
              placeholder="Buscar conversa..."
              className="w-full rounded-md border px-3 py-2 text-sm"
            />

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-gray-500">Janela:</span>
              {WINDOW_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => inbox.setWindowFilter(filter.value)}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 ${
                    inbox.windowFilter === filter.value ? 'bg-gray-200 dark:bg-gray-700' : ''
                  }`}
                >
                  {filter.dotClass ? <span className={`h-2 w-2 rounded-full ${filter.dotClass}`} /> : null}
                  {filter.label}
                </button>
              ))}
            </div>

            {/* A barra sai da própria listagem e some quando há um canal só — o SDK devolve lista
                vazia nesse caso, porque filtro de opção única não filtra nada. */}
            {inbox.channelFilters.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-gray-500">Canal:</span>
                {inbox.channelFilters.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => inbox.setChannelFilter(filter.value)}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 ${
                      inbox.channelFilter === filter.value ? 'bg-gray-200 dark:bg-gray-700' : ''
                    }`}
                  >
                    {filter.value === CHANNEL_FILTER_ALL ? null : <ChannelIcon channel={filter.value} />}
                    {filter.label}
                  </button>
                ))}
              </div>
            ) : null}

            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={
                  inbox.pageConversations.length > 0 &&
                  inbox.pageConversations.every((conversation) => inbox.selectedIds.has(conversation.id))
                }
                onChange={inbox.toggleSelectAllOnPage}
              />
              Selecionar todas
            </label>
          </div>

          <div className="flex-1 overflow-y-auto">
            {inbox.pageConversations.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                active={conversation.id === inbox.selectedId}
                selected={inbox.selectedIds.has(conversation.id)}
                now={inbox.now}
                busy={inbox.busy}
                onOpen={() => inbox.selectConversation(conversation.id)}
                onToggleSelected={() => inbox.toggleSelected(conversation.id)}
                onTakeover={() => void inbox.takeover(conversation.id)}
              />
            ))}
            {!inbox.loading && inbox.filteredCount === 0 ? (
              <p className="p-4 text-sm text-gray-500">Nenhuma conversa encontrada.</p>
            ) : null}
          </div>

          <div className="flex items-center justify-between border-t px-3 py-2 text-xs">
            <span className="text-gray-500">
              {inbox.filteredCount === 0 ? '0' : `${inbox.firstOnPage}–${inbox.lastOnPage}`} de {inbox.totalCount}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => inbox.goToPage(1)}
                disabled={inbox.page === 1}
                aria-label="Primeira página"
                className="px-2 disabled:opacity-40"
              >
                «
              </button>
              <button
                type="button"
                onClick={() => inbox.goToPage(inbox.page - 1)}
                disabled={inbox.page === 1}
                aria-label="Página anterior"
                className="px-2 disabled:opacity-40"
              >
                ‹
              </button>
              <span>
                {inbox.page} / {inbox.pageCount}
              </span>
              <button
                type="button"
                onClick={() => inbox.goToPage(inbox.page + 1)}
                disabled={inbox.page === inbox.pageCount}
                aria-label="Próxima página"
                className="px-2 disabled:opacity-40"
              >
                ›
              </button>
              <button
                type="button"
                onClick={() => inbox.goToPage(inbox.pageCount)}
                disabled={inbox.page === inbox.pageCount}
                aria-label="Última página"
                className="px-2 disabled:opacity-40"
              >
                »
              </button>
            </div>
          </div>
        </aside>

        {/* `min-w-0` junto do `min-h-0`: em grid o padrão é não encolher abaixo do conteúdo, e é
            por aí que uma bolha larga vaza para fora da coluna. */}
        <section
          className={`min-h-0 min-w-0 overflow-hidden rounded-xl border bg-white dark:bg-gray-800 ${
            selectedConversation ? 'flex flex-col' : 'hidden lg:block'
          }`}
        >
          {selectedConversation ? (
            <ConversationPane
              conversation={selectedConversation}
              now={inbox.now}
              busy={inbox.busy}
              onTakeover={() => void inbox.takeover(selectedConversation.id)}
              onReturnToBot={() => void inbox.releaseToBot(selectedConversation.id)}
              onFinish={() => void inbox.finalize(selectedConversation.id)}
              onBack={inbox.clearSelection}
              simulatorOpen={simulatorOpen}
              onToggleSimulator={() => setSimulatorOpen((open) => !open)}
            />
          ) : (
            <p className="p-6 text-sm text-gray-500">Selecione uma conversa.</p>
          )}
        </section>

        {/* Cartão próprio, como no financiamento e no quickcart: mesma moldura da conversa, separado
            pelo `gap` do grid. Dentro do cartão da conversa ele lia como parte do atendimento.
            `flex` em linha porque o painel do pacote não tem teto de altura — em coluna ele cresce
            com o transcript e transborda; em linha herda a altura da faixa e rola por dentro. */}
        {showSimulator && selectedConversation ? (
          <div className="flex min-h-0 overflow-hidden rounded-xl border bg-white dark:bg-gray-800">
            <SimulatorPanel
              conversationId={selectedConversation.id}
              onClose={() => setSimulatorOpen(false)}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function ConversationsPage() {
  return (
    <ConversationsProvider api={conversationsSdkApi} sse={conversationsSdkRealtime}>
      <Inbox />
    </ConversationsProvider>
  )
}
