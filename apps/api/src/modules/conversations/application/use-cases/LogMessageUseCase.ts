import type { ConversationRepository, InsertMessageInput } from '../../domain/repositories/ConversationRepository'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'
import type { ConversationMessage } from '@/infra/database/schema'

interface LogMessageInput extends InsertMessageInput {
  currentState?: string
  context?: Record<string, unknown>
}

export class LogMessageUseCase {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly wsHub: WebSocketHub,
  ) {}

  async execute(input: LogMessageInput): Promise<ConversationMessage> {
    const { currentState, context, ...messageInput } = input
    const { message, isDuplicate } = await this.conversationRepository.insertMessage(messageInput)

    if (isDuplicate) return message

    if (currentState !== undefined || context !== undefined) {
      const session = await this.conversationRepository.updateSessionContext({
        establishmentId: input.establishmentId,
        whatsappNumber: input.whatsappNumber,
        currentState,
        context,
      })
      await this.wsHub.publishBroadcast(input.establishmentId, WS_EVENTS.CONVERSATION_SESSION, session)
    } else {
      await this.conversationRepository.getOrCreateSession(input.establishmentId, input.whatsappNumber)
    }

    await this.wsHub.publishBroadcast(input.establishmentId, WS_EVENTS.CONVERSATION_MESSAGE, message)

    return message
  }
}
