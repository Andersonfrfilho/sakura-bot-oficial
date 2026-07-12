import type { ConversationRepository } from '../../domain/repositories/ConversationRepository'
import type { WhatsAppSender } from '../../infra/WhatsAppSender'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'
import type { ConversationMessage } from '@/infra/database/schema'

interface SendAgentMessageInput {
  establishmentId: string
  whatsappNumber: string
  agentUserId: string
  body: string
}

export class SendAgentMessageUseCase {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly whatsAppSender: WhatsAppSender,
    private readonly wsHub: WebSocketHub,
  ) {}

  async execute(input: SendAgentMessageInput): Promise<ConversationMessage> {
    const result = await this.whatsAppSender.sendText(input.whatsappNumber, input.body)

    const { message } = await this.conversationRepository.insertMessage({
      establishmentId: input.establishmentId,
      whatsappNumber: input.whatsappNumber,
      direction: 'outbound',
      sender: 'agent',
      agentUserId: input.agentUserId,
      type: 'text',
      content: input.body,
      waMessageId: result.waMessageId ?? undefined,
    })

    await this.wsHub.publishBroadcast(input.establishmentId, WS_EVENTS.CONVERSATION_MESSAGE, message)

    return message
  }
}
