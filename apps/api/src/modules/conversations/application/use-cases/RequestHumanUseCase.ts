import type { ConversationRepository } from '../../domain/repositories/ConversationRepository'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'
import type { ConversationSession } from '@/infra/database/schema'

interface RequestHumanInput {
  establishmentId: string
  whatsappNumber: string
}

export class RequestHumanUseCase {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly wsHub: WebSocketHub,
  ) {}

  async execute(input: RequestHumanInput): Promise<ConversationSession> {
    const session = await this.conversationRepository.requestHuman(input.establishmentId, input.whatsappNumber)

    await this.wsHub.publishBroadcast(input.establishmentId, WS_EVENTS.CONVERSATION_SESSION, session)

    return session
  }
}
