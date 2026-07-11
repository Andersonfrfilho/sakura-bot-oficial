import type { ConversationRepository } from '../../domain/repositories/ConversationRepository'
import type { ConversationMessage } from '@/infra/database/schema'

interface ExportConversationInput {
  establishmentId: string
  whatsappNumber: string
}

export class ExportConversationUseCase {
  constructor(private readonly conversationRepository: ConversationRepository) {}

  async execute(input: ExportConversationInput): Promise<ConversationMessage[]> {
    return this.conversationRepository.exportMessages(input.establishmentId, input.whatsappNumber)
  }
}
