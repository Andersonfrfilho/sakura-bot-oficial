/**
 * Biblioteca de arquivos trocados no WhatsApp, de todas as conversas.
 *
 * Existe fora da inbox porque a pergunta é outra: quem procura um comprovante raramente lembra de
 * qual conversa ele veio. O componente é do @adatechnology/conversations-ui e fala com o mesmo
 * adapter da inbox — aqui só se monta a tela e se decide o que fazer ao abrir a conversa de origem.
 *
 * `renderFilters` também é onde o upload manual pega o WhatsApp de destino: `uploadDocument` no
 * backend exige um `sessionId`, e o número escolhido aqui é o que resolve ele.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import '@adatechnology/conversations-ui/styles.css'
import { ConversationsProvider, DocumentsWorkspace } from '@adatechnology/conversations-ui'

import { CONVERSATION_QUERY_PARAM } from '@/constants/conversationLinks'
import { conversationsSdkApi } from '@/lib/conversationsSdkApi'
import { conversationsSdkRealtime } from '@/lib/conversationsSdkRealtime'

export function DocumentsPage() {
  const navigate = useNavigate()
  const [whatsappNumber, setWhatsappNumber] = useState('')

  function handleOpenConversation(conversationId: string): void {
    navigate(`/conversations?${CONVERSATION_QUERY_PARAM}=${encodeURIComponent(conversationId)}`)
  }

  return (
    <ConversationsProvider api={conversationsSdkApi} sse={conversationsSdkRealtime}>
      {/* Sem título próprio: o DocumentsWorkspace já desenha o seu, e dois viravam cabeçalho repetido. */}
      <div className="p-4 lg:p-6">
        <DocumentsWorkspace
          onOpenConversation={handleOpenConversation}
          renderFilters={({ setExtra }) => (
            <input
              type="text"
              value={whatsappNumber}
              placeholder="WhatsApp do cliente para enviar arquivo"
              onChange={(event) => {
                const value = event.target.value
                setWhatsappNumber(value)
                setExtra(value ? { whatsappNumber: value } : {})
              }}
              className="h-8 rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
          )}
        />
      </div>
    </ConversationsProvider>
  )
}
