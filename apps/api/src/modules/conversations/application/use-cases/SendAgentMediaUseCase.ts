import type { ConversationRepository } from '../../domain/repositories/ConversationRepository'
import type { WhatsAppSender } from '../../infra/WhatsAppSender'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'
import type { ConversationMessage } from '@/infra/database/schema'

interface SendAgentMediaInput {
  establishmentId: string
  whatsappNumber: string
  agentUserId: string
  base64Data: string
  mimeType: string
  filename: string
  caption?: string
}

function resolveMessageType(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('video/')) return 'video'
  return 'document'
}

export class SendAgentMediaUseCase {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly whatsAppSender: WhatsAppSender,
    private readonly wsHub: WebSocketHub,
  ) {}

  async execute(input: SendAgentMediaInput): Promise<ConversationMessage> {
    const buffer = Buffer.from(input.base64Data, 'base64')

    const result = await this.whatsAppSender.sendMedia({
      to: input.whatsappNumber,
      buffer,
      mimeType: input.mimeType,
      filename: input.filename,
      caption: input.caption,
    })

    const { message } = await this.conversationRepository.insertMessage({
      establishmentId: input.establishmentId,
      whatsappNumber: input.whatsappNumber,
      direction: 'outbound',
      sender: 'agent',
      agentUserId: input.agentUserId,
      type: resolveMessageType(input.mimeType),
      content: input.caption,
      payload: { mimeType: input.mimeType, filename: input.filename },
      waMessageId: result.waMessageId ?? undefined,
    })

    await this.wsHub.publishBroadcast(input.establishmentId, WS_EVENTS.CONVERSATION_MESSAGE, message)

    return message
  }
}
