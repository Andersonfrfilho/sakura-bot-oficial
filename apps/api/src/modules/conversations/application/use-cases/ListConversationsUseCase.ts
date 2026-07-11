import type { ConversationRepository, ListConversationsParams, ListConversationsResult } from '../../domain/repositories/ConversationRepository'

export class ListConversationsUseCase {
  constructor(private readonly conversationRepository: ConversationRepository) {}

  async execute(input: ListConversationsParams): Promise<ListConversationsResult> {
    return this.conversationRepository.listConversations(input)
  }
}
