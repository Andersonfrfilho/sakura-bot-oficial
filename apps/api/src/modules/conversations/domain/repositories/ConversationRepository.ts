import type { ConversationSession, ConversationMessage } from '@/infra/database/schema'

export type ConversationMode = 'bot' | 'human'
export type MessageDirection = 'inbound' | 'outbound'
export type MessageSender = 'customer' | 'bot' | 'agent'

export interface ConversationSummary extends ConversationSession {
  lastMessage: Pick<ConversationMessage, 'content' | 'type' | 'direction' | 'createdAt'> | null
  unreadCount: number
}

export interface ListConversationsParams {
  establishmentId: string
  page?: number
  pageSize?: number
  waitingHuman?: boolean
  hasUnread?: boolean
  search?: string
}

export interface ListConversationsResult {
  data: ConversationSummary[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ListMessagesParams {
  establishmentId: string
  whatsappNumber: string
  before?: string
  limit?: number
}

export interface ListMessagesResult {
  data: ConversationMessage[]
  hasMore: boolean
}

export interface InsertMessageInput {
  establishmentId: string
  whatsappNumber: string
  direction: MessageDirection
  sender: MessageSender
  agentUserId?: string
  type: string
  content?: string
  payload?: Record<string, unknown>
  waMessageId?: string
  status?: string
}

export interface InsertMessageResult {
  message: ConversationMessage
  isDuplicate: boolean
}

export interface UpdateSessionContextInput {
  establishmentId: string
  whatsappNumber: string
  currentState?: string
  context?: Record<string, unknown>
}

export interface ConversationRepository {
  listConversations(params: ListConversationsParams): Promise<ListConversationsResult>
  listMessages(params: ListMessagesParams): Promise<ListMessagesResult>
  findSession(establishmentId: string, whatsappNumber: string): Promise<ConversationSession | null>
  getOrCreateSession(establishmentId: string, whatsappNumber: string): Promise<ConversationSession>
  insertMessage(input: InsertMessageInput): Promise<InsertMessageResult>
  updateMessageStatus(establishmentId: string, waMessageId: string, status: string): Promise<ConversationMessage | null>
  updateSessionContext(input: UpdateSessionContextInput): Promise<ConversationSession>
  setMode(
    establishmentId: string,
    whatsappNumber: string,
    mode: ConversationMode,
    assignedUserId: string | null,
  ): Promise<ConversationSession>
  requestHuman(establishmentId: string, whatsappNumber: string): Promise<ConversationSession>
  markRead(establishmentId: string, whatsappNumber: string): Promise<void>
  markAllRead(establishmentId: string): Promise<void>
  exportMessages(establishmentId: string, whatsappNumber: string): Promise<ConversationMessage[]>
}
