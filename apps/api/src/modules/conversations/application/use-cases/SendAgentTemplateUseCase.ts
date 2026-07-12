import type { ConversationRepository } from '../../domain/repositories/ConversationRepository'
import type { WhatsAppSender } from '../../infra/WhatsAppSender'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'
import type { ConversationMessage } from '@/infra/database/schema'

interface SendAgentTemplateInput {
  establishmentId: string
  whatsappNumber: string
  agentUserId: string
  templateName: string
  languageCode?: string
  bodyParameters?: readonly string[]
}

export class SendAgentTemplateUseCase {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly whatsAppSender: WhatsAppSender,
    private readonly wsHub: WebSocketHub,
  ) {}

  async execute(input: SendAgentTemplateInput): Promise<ConversationMessage> {
    const result = await this.whatsAppSender.sendTemplate({
      to: input.whatsappNumber,
      templateName: input.templateName,
      languageCode: input.languageCode,
      bodyParameters: input.bodyParameters,
    })

    const { message } = await this.conversationRepository.insertMessage({
      establishmentId: input.establishmentId,
      whatsappNumber: input.whatsappNumber,
      direction: 'outbound',
      sender: 'agent',
      agentUserId: input.agentUserId,
      type: 'template',
      payload: { templateName: input.templateName, languageCode: input.languageCode, bodyParameters: input.bodyParameters },
      waMessageId: result.waMessageId ?? undefined,
    })

    await this.wsHub.publishBroadcast(input.establishmentId, WS_EVENTS.CONVERSATION_MESSAGE, message)

    return message
  }
}
