import type { WhatsAppSender } from '../../infra/WhatsAppSender'
import type { FetchMediaResult } from '@adatechnology/whatsapp-provider'

interface FetchConversationMediaInput {
  mediaId: string
}

export class FetchConversationMediaUseCase {
  constructor(private readonly whatsAppSender: WhatsAppSender) {}

  async execute(input: FetchConversationMediaInput): Promise<FetchMediaResult> {
    return this.whatsAppSender.fetchMediaAsBase64(input.mediaId)
  }
}
