import type { ConversationRepository, ListMessagesParams, ListMessagesResult } from '../../domain/repositories/ConversationRepository'

export class GetConversationHistoryUseCase {
  constructor(private readonly conversationRepository: ConversationRepository) {}

  async execute(input: ListMessagesParams): Promise<ListMessagesResult> {
    return this.conversationRepository.listMessages(input)
  }
}
