import type { ConversationRepository } from '../../domain/repositories/ConversationRepository'

interface MarkAllConversationsReadInput {
  establishmentId: string
}

export class MarkAllConversationsReadUseCase {
  constructor(private readonly conversationRepository: ConversationRepository) {}

  async execute(input: MarkAllConversationsReadInput): Promise<void> {
    await this.conversationRepository.markAllRead(input.establishmentId)
  }
}
