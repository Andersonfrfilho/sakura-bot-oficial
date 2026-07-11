interface ConversationMessage {
  id: string
  direction: 'inbound' | 'outbound'
  sender: 'customer' | 'bot' | 'agent'
  type: string
  content: string | null
  payload: Record<string, unknown>
  status: string
  createdAt: string
}

interface MessageBubbleProps {
  message: ConversationMessage
  selected: boolean
  selectable: boolean
  onToggleSelect: (id: string) => void
  onViewMedia: (message: ConversationMessage) => void
}

const SENDER_LABEL: Record<ConversationMessage['sender'], string> = {
  customer: 'Cliente',
  bot: 'Bot',
  agent: 'Atendente',
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function statusGlyph(status: string) {
  if (status === 'read') return '✓✓'
  if (status === 'delivered') return '✓✓'
  if (status === 'failed') return '⚠️'
  return '✓'
}

function MediaContent({ message, onViewMedia }: { message: ConversationMessage; onViewMedia: (m: ConversationMessage) => void }) {
  const filename = typeof message.payload['filename'] === 'string' ? (message.payload['filename'] as string) : 'arquivo'
  const icon = message.type === 'image' ? '🖼️' : message.type === 'audio' ? '🎵' : message.type === 'video' ? '🎬' : '📄'
  return (
    <button
      onClick={() => onViewMedia(message)}
      className="flex items-center gap-2 bg-black/5 rounded-lg px-3 py-2 hover:bg-black/10 transition-colors text-left w-full"
    >
      <span className="text-lg">{icon}</span>
      <span className="text-sm truncate">{filename}</span>
    </button>
  )
}

export function MessageBubble({ message, selected, selectable, onToggleSelect, onViewMedia }: MessageBubbleProps) {
  const isOutbound = message.direction === 'outbound'
  const isMedia = message.type === 'image' || message.type === 'audio' || message.type === 'video' || message.type === 'document'

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'} group`}>
      <div className={`flex items-end gap-2 max-w-[75%] ${isOutbound ? 'flex-row-reverse' : ''}`}>
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(message.id)}
            className="mb-1 opacity-0 group-hover:opacity-100 checked:opacity-100 transition-opacity"
          />
        )}
        <div
          className={`rounded-xl px-3 py-2 shadow-sm ${
            isOutbound
              ? message.sender === 'bot'
                ? 'bg-brand-100 text-gray-900'
                : 'bg-brand-600 text-white'
              : 'bg-white text-gray-900'
          }`}
        >
          {!isOutbound && message.sender === 'bot' && (
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">{SENDER_LABEL.bot}</p>
          )}
          {message.type === 'template' ? (
            <p className="text-sm italic opacity-90">
              📋 Template: {typeof message.payload['templateName'] === 'string' ? (message.payload['templateName'] as string) : message.content}
            </p>
          ) : isMedia ? (
            <MediaContent message={message} onViewMedia={onViewMedia} />
          ) : (
            <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
          )}
          <div className={`flex items-center gap-1 mt-1 ${isOutbound ? 'justify-end' : 'justify-start'}`}>
            <span className={`text-[10px] ${isOutbound && message.sender === 'agent' ? 'text-white/70' : 'text-gray-400'}`}>
              {formatTime(message.createdAt)}
            </span>
            {isOutbound && (
              <span className={`text-[10px] ${message.status === 'read' ? 'text-blue-300' : isOutbound && message.sender === 'agent' ? 'text-white/70' : 'text-gray-400'}`}>
                {statusGlyph(message.status)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
