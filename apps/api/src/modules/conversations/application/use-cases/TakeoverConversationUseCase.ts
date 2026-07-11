import type { ConversationRepository } from '../../domain/repositories/ConversationRepository'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'
import type { ConversationSession } from '@/infra/database/schema'

interface TakeoverConversationInput {
  establishmentId: string
  whatsappNumber: string
  userId: string
}

export class TakeoverConversationUseCase {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly wsHub: WebSocketHub,
  ) {}

  async execute(input: TakeoverConversationInput): Promise<ConversationSession> {
    const session = await this.conversationRepository.setMode(input.establishmentId, input.whatsappNumber, 'human', input.userId)

    await this.wsHub.publishBroadcast(input.establishmentId, WS_EVENTS.CONVERSATION_SESSION, session)

    return session
  }
}
