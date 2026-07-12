import type { ConversationRepository } from '../../domain/repositories/ConversationRepository'

interface GetConversationContextInput {
  establishmentId: string
  whatsappNumber: string
}

interface GetConversationContextOutput {
  currentState: string
  context: unknown
}

export class GetConversationContextUseCase {
  constructor(private readonly conversationRepository: ConversationRepository) {}

  async execute(input: GetConversationContextInput): Promise<GetConversationContextOutput> {
    const session = await this.conversationRepository.getOrCreateSession(input.establishmentId, input.whatsappNumber)
    return { currentState: session.currentState, context: session.context }
  }
}
