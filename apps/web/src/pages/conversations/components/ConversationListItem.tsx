interface ConversationSummary {
  whatsappNumber: string
  mode: 'bot' | 'human'
  humanRequestedAt: string | null
  unreadCount: number
  lastActivity: string
  lastMessage: {
    content: string | null
    type: string
    direction: 'inbound' | 'outbound'
    createdAt: string
  } | null
}

interface ConversationListItemProps {
  conversation: ConversationSummary
  selected: boolean
  onSelect: (whatsappNumber: string) => void
}

function formatPhone(number: string) {
  const digits = number.replace(/\D/g, '')
  if (digits.length === 13) return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`
  return number
}

function formatRelativeTime(dateStr: string) {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function previewText(lastMessage: ConversationSummary['lastMessage']) {
  if (!lastMessage) return 'Sem mensagens'
  if (lastMessage.type === 'text') return lastMessage.content ?? ''
  if (lastMessage.type === 'template') return '📋 Template enviado'
  if (lastMessage.type === 'image') return '🖼️ Imagem'
  if (lastMessage.type === 'audio') return '🎵 Áudio'
  if (lastMessage.type === 'video') return '🎬 Vídeo'
  return '📄 Arquivo'
}

export function ConversationListItem({ conversation, selected, onSelect }: ConversationListItemProps) {
  return (
    <button
      onClick={() => onSelect(conversation.whatsappNumber)}
      className={`w-full text-left px-3 py-3 border-b border-gray-100 transition-colors ${
        selected ? 'bg-brand-50 border-l-2 border-l-brand-500' : 'hover:bg-gray-50'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-sm font-semibold flex-shrink-0">
          {conversation.whatsappNumber.slice(-2)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-gray-900 text-sm truncate">{formatPhone(conversation.whatsappNumber)}</p>
            <span className="text-[11px] text-gray-400 flex-shrink-0">{formatRelativeTime(conversation.lastActivity)}</span>
          </div>
          <p className="text-xs text-gray-500 truncate mt-0.5">{previewText(conversation.lastMessage)}</p>
          <div className="flex items-center gap-1.5 mt-1">
            {conversation.mode === 'human' && (
              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">Humano</span>
            )}
            {conversation.humanRequestedAt && conversation.mode !== 'human' && (
              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">Aguardando</span>
            )}
            {conversation.unreadCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold bg-brand-600 text-white ml-auto">
                {conversation.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
