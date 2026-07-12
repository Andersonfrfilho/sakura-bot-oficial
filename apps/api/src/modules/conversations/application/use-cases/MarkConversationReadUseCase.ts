import type { ConversationRepository } from '../../domain/repositories/ConversationRepository'

interface MarkConversationReadInput {
  establishmentId: string
  whatsappNumber: string
}

export class MarkConversationReadUseCase {
  constructor(private readonly conversationRepository: ConversationRepository) {}

  async execute(input: MarkConversationReadInput): Promise<void> {
    await this.conversationRepository.markRead(input.establishmentId, input.whatsappNumber)
  }
}
