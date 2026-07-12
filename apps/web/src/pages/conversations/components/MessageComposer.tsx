import { useRef, useState } from 'react'

interface AttachedFile {
  file: File
  previewUrl: string | null
}

interface QuickMessage {
  label: string
  text: string
}

interface MessageComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onAttach: (file: File) => void
  attachedFile: AttachedFile | null
  onRemoveAttachment: () => void
  disabled: boolean
  sending: boolean
  quickMessages: QuickMessage[]
}

const EMOJIS = ['😀', '😉', '👍', '🙏', '🎉', '😅', '❤️', '🛵', '⏰', '✅', '❌', '📦']

function wrapSelection(textarea: HTMLTextAreaElement, value: string, marker: string, onChange: (value: string) => void) {
  const { selectionStart, selectionEnd } = textarea
  const selected = value.slice(selectionStart, selectionEnd)
  const next = `${value.slice(0, selectionStart)}${marker}${selected}${marker}${value.slice(selectionEnd)}`
  onChange(next)
}

export function MessageComposer({
  value,
  onChange,
  onSend,
  onAttach,
  attachedFile,
  onRemoveAttachment,
  disabled,
  sending,
  quickMessages,
}: MessageComposerProps) {
  const [showEmojis, setShowEmojis] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (value.trim() || attachedFile) onSend()
    }
  }

  function handleFormat(marker: string) {
    const textarea = textareaRef.current
    if (!textarea) return
    wrapSelection(textarea, value, marker, onChange)
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) onAttach(file)
    event.target.value = ''
  }

  return (
    <div className="border-t border-gray-200 bg-white p-3 space-y-2">
      {attachedFile && (
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-sm">
          {attachedFile.previewUrl ? (
            <img src={attachedFile.previewUrl} alt="" className="w-8 h-8 rounded object-cover" />
          ) : (
            <span>📎</span>
          )}
          <span className="truncate flex-1">{attachedFile.file.name}</span>
          <button onClick={onRemoveAttachment} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
      )}

      {quickMessages.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {quickMessages.map((quickMessage) => (
            <button
              key={quickMessage.label}
              onClick={() => onChange(value ? `${value} ${quickMessage.text}` : quickMessage.text)}
              className="whitespace-nowrap px-2.5 py-1 text-xs bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition-colors flex-shrink-0"
            >
              {quickMessage.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1">
        <button onClick={() => handleFormat('*')} title="Negrito" className="px-2 py-1 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded">B</button>
        <button onClick={() => handleFormat('_')} title="Itálico" className="px-2 py-1 text-sm italic text-gray-500 hover:bg-gray-100 rounded">I</button>
        <button onClick={() => handleFormat('~')} title="Tachado" className="px-2 py-1 text-sm line-through text-gray-500 hover:bg-gray-100 rounded">S</button>
        <div className="relative">
          <button onClick={() => setShowEmojis((show) => !show)} className="px-2 py-1 text-sm hover:bg-gray-100 rounded">😀</button>
          {showEmojis && (
            <div className="absolute bottom-full mb-1 left-0 bg-white border border-gray-200 rounded-lg shadow-lg p-2 grid grid-cols-6 gap-1 z-10">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onChange(value + emoji)
                    setShowEmojis(false)
                  }}
                  className="text-lg hover:bg-gray-100 rounded p-1"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => fileInputRef.current?.click()} className="px-2 py-1 text-sm hover:bg-gray-100 rounded" title="Anexar arquivo">📎</button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
      </div>

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? 'Assuma o atendimento para responder...' : 'Digite uma mensagem...'}
          rows={2}
          className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
        />
        <button
          onClick={onSend}
          disabled={disabled || sending || (!value.trim() && !attachedFile)}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-40 transition-colors active:scale-95 h-fit"
        >
          {sending ? '⏳' : '➤'}
        </button>
      </div>
    </div>
  )
}
