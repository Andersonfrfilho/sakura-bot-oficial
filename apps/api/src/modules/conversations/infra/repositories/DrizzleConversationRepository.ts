import { eq, and, ilike, lt, desc, asc, inArray, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type {
  ConversationRepository,
  ConversationSummary,
  ListConversationsParams,
  ListConversationsResult,
  ListMessagesParams,
  ListMessagesResult,
  InsertMessageInput,
  InsertMessageResult,
  UpdateSessionContextInput,
  ConversationMode,
} from '../../domain/repositories/ConversationRepository'
import * as schema from '@/infra/database/schema'
import type { ConversationSession, ConversationMessage } from '@/infra/database/schema'

const UNREAD_MESSAGE_CONDITION = and(
  eq(schema.conversationMessages.direction, 'inbound'),
  sql`${schema.conversationMessages.readAt} IS NULL`,
)

export class DrizzleConversationRepository implements ConversationRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async listConversations(params: ListConversationsParams): Promise<ListConversationsResult> {
    const page = params.page ?? 1
    const pageSize = params.pageSize ?? 20
    const offset = (page - 1) * pageSize

    const waitingHumanCondition = params.waitingHuman
      ? and(sql`${schema.conversationSessions.humanRequestedAt} IS NOT NULL`, eq(schema.conversationSessions.mode, 'bot'))
      : undefined

    const searchCondition = params.search ? ilike(schema.conversationSessions.whatsappNumber, `%${params.search}%`) : undefined

    const hasUnreadCondition = params.hasUnread
      ? sql`EXISTS (
          SELECT 1 FROM conversation_messages cm
          WHERE cm.establishment_id = ${schema.conversationSessions.establishmentId}
            AND cm.whatsapp_number = ${schema.conversationSessions.whatsappNumber}
            AND cm.direction = 'inbound'
            AND cm.read_at IS NULL
        )`
      : undefined

    const whereClause = and(
      eq(schema.conversationSessions.establishmentId, params.establishmentId),
      waitingHumanCondition,
      searchCondition,
      hasUnreadCondition,
    )

    const [totalResult, sessions] = await Promise.all([
      this.db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(schema.conversationSessions).where(whereClause),
      this.db
        .select()
        .from(schema.conversationSessions)
        .where(whereClause)
        .orderBy(desc(schema.conversationSessions.lastActivity))
        .limit(pageSize)
        .offset(offset),
    ])

    const total = totalResult[0]?.count ?? 0
    const totalPages = Math.ceil(total / pageSize)
    const data = await this.attachSummaryData(params.establishmentId, sessions)

    return { data, total, page, pageSize, totalPages }
  }

  private async attachSummaryData(establishmentId: string, sessions: ConversationSession[]): Promise<ConversationSummary[]> {
    if (sessions.length === 0) return []

    const whatsappNumbers = sessions.map((session) => session.whatsappNumber)

    const [lastMessages, unreadRows] = await Promise.all([
      this.db
        .selectDistinctOn([schema.conversationMessages.whatsappNumber], {
          whatsappNumber: schema.conversationMessages.whatsappNumber,
          content: schema.conversationMessages.content,
          type: schema.conversationMessages.type,
          direction: schema.conversationMessages.direction,
          createdAt: schema.conversationMessages.createdAt,
        })
        .from(schema.conversationMessages)
        .where(
          and(eq(schema.conversationMessages.establishmentId, establishmentId), inArray(schema.conversationMessages.whatsappNumber, whatsappNumbers)),
        )
        .orderBy(schema.conversationMessages.whatsappNumber, desc(schema.conversationMessages.createdAt)),

      this.db
        .select({
          whatsappNumber: schema.conversationMessages.whatsappNumber,
          unreadCount: sql<number>`count(*)`.mapWith(Number),
        })
        .from(schema.conversationMessages)
        .where(
          and(
            eq(schema.conversationMessages.establishmentId, establishmentId),
            inArray(schema.conversationMessages.whatsappNumber, whatsappNumbers),
            UNREAD_MESSAGE_CONDITION,
          ),
        )
        .groupBy(schema.conversationMessages.whatsappNumber),
    ])

    const lastMessageByNumber = new Map(lastMessages.map((row) => [row.whatsappNumber, row]))
    const unreadByNumber = new Map(unreadRows.map((row) => [row.whatsappNumber, row.unreadCount]))

    return sessions.map((session) => ({
      ...session,
      lastMessage: lastMessageByNumber.get(session.whatsappNumber) ?? null,
      unreadCount: unreadByNumber.get(session.whatsappNumber) ?? 0,
    }))
  }

  async listMessages(params: ListMessagesParams): Promise<ListMessagesResult> {
    const limit = params.limit ?? 30

    const cursorCondition = params.before ? lt(schema.conversationMessages.createdAt, new Date(params.before)) : undefined

    const rows = await this.db
      .select()
      .from(schema.conversationMessages)
      .where(
        and(
          eq(schema.conversationMessages.establishmentId, params.establishmentId),
          eq(schema.conversationMessages.whatsappNumber, params.whatsappNumber),
          cursorCondition,
        ),
      )
      .orderBy(desc(schema.conversationMessages.createdAt))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const page = rows.slice(0, limit).reverse()

    return { data: page, hasMore }
  }

  async findSession(establishmentId: string, whatsappNumber: string): Promise<ConversationSession | null> {
    const [session] = await this.db
      .select()
      .from(schema.conversationSessions)
      .where(and(eq(schema.conversationSessions.establishmentId, establishmentId), eq(schema.conversationSessions.whatsappNumber, whatsappNumber)))
    return session ?? null
  }

  async getOrCreateSession(establishmentId: string, whatsappNumber: string): Promise<ConversationSession> {
    const existing = await this.findSession(establishmentId, whatsappNumber)
    if (existing) return existing

    const [session] = await this.db
      .insert(schema.conversationSessions)
      .values({ establishmentId, whatsappNumber })
      .onConflictDoNothing()
      .returning()

    return session ?? (await this.findSession(establishmentId, whatsappNumber))!
  }

  async insertMessage(input: InsertMessageInput): Promise<InsertMessageResult> {
    if (input.waMessageId) {
      const [existing] = await this.db
        .select()
        .from(schema.conversationMessages)
        .where(
          and(
            eq(schema.conversationMessages.establishmentId, input.establishmentId),
            eq(schema.conversationMessages.waMessageId, input.waMessageId),
          ),
        )
      if (existing) return { message: existing, isDuplicate: true }
    }

    const [message] = await this.db
      .insert(schema.conversationMessages)
      .values({
        establishmentId: input.establishmentId,
        whatsappNumber: input.whatsappNumber,
        direction: input.direction,
        sender: input.sender,
        agentUserId: input.agentUserId ?? null,
        type: input.type,
        content: input.content ?? null,
        payload: input.payload ?? {},
        waMessageId: input.waMessageId ?? null,
        status: input.status ?? 'sent',
      })
      .returning()

    return { message: message!, isDuplicate: false }
  }

  async updateMessageStatus(establishmentId: string, waMessageId: string, status: string): Promise<ConversationMessage | null> {
    const [message] = await this.db
      .update(schema.conversationMessages)
      .set({ status })
      .where(and(eq(schema.conversationMessages.establishmentId, establishmentId), eq(schema.conversationMessages.waMessageId, waMessageId)))
      .returning()
    return message ?? null
  }

  async updateSessionContext(input: UpdateSessionContextInput): Promise<ConversationSession> {
    const now = new Date()

    const [session] = await this.db
      .insert(schema.conversationSessions)
      .values({
        establishmentId: input.establishmentId,
        whatsappNumber: input.whatsappNumber,
        currentState: input.currentState ?? 'start',
        context: input.context ?? {},
        lastInboundAt: now,
        lastActivity: now,
      })
      .onConflictDoUpdate({
        target: [schema.conversationSessions.establishmentId, schema.conversationSessions.whatsappNumber],
        set: {
          ...(input.currentState !== undefined && { currentState: input.currentState }),
          ...(input.context !== undefined && { context: input.context }),
          lastInboundAt: now,
          lastActivity: now,
          updatedAt: now,
        },
      })
      .returning()

    return session!
  }

  async setMode(establishmentId: string, whatsappNumber: string, mode: ConversationMode, assignedUserId: string | null): Promise<ConversationSession> {
    await this.getOrCreateSession(establishmentId, whatsappNumber)

    const [session] = await this.db
      .update(schema.conversationSessions)
      .set({
        mode,
        assignedUserId,
        ...(mode === 'bot' && { humanRequestedAt: null }),
        updatedAt: new Date(),
      })
      .where(and(eq(schema.conversationSessions.establishmentId, establishmentId), eq(schema.conversationSessions.whatsappNumber, whatsappNumber)))
      .returning()

    return session!
  }

  async requestHuman(establishmentId: string, whatsappNumber: string): Promise<ConversationSession> {
    await this.getOrCreateSession(establishmentId, whatsappNumber)

    const [session] = await this.db
      .update(schema.conversationSessions)
      .set({ humanRequestedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.conversationSessions.establishmentId, establishmentId), eq(schema.conversationSessions.whatsappNumber, whatsappNumber)))
      .returning()

    return session!
  }

  async markRead(establishmentId: string, whatsappNumber: string): Promise<void> {
    const now = new Date()

    await Promise.all([
      this.db
        .update(schema.conversationMessages)
        .set({ readAt: now })
        .where(
          and(
            eq(schema.conversationMessages.establishmentId, establishmentId),
            eq(schema.conversationMessages.whatsappNumber, whatsappNumber),
            UNREAD_MESSAGE_CONDITION,
          ),
        ),
      this.db
        .update(schema.conversationSessions)
        .set({ lastAgentReadAt: now })
        .where(and(eq(schema.conversationSessions.establishmentId, establishmentId), eq(schema.conversationSessions.whatsappNumber, whatsappNumber))),
    ])
  }

  async markAllRead(establishmentId: string): Promise<void> {
    const now = new Date()

    await Promise.all([
      this.db
        .update(schema.conversationMessages)
        .set({ readAt: now })
        .where(and(eq(schema.conversationMessages.establishmentId, establishmentId), UNREAD_MESSAGE_CONDITION)),
      this.db.update(schema.conversationSessions).set({ lastAgentReadAt: now }).where(eq(schema.conversationSessions.establishmentId, establishmentId)),
    ])
  }

  async exportMessages(establishmentId: string, whatsappNumber: string): Promise<ConversationMessage[]> {
    return this.db
      .select()
      .from(schema.conversationMessages)
      .where(and(eq(schema.conversationMessages.establishmentId, establishmentId), eq(schema.conversationMessages.whatsappNumber, whatsappNumber)))
      .orderBy(asc(schema.conversationMessages.createdAt))
  }
}
