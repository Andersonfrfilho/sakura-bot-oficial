import { pgTable, uuid, varchar, jsonb, text, timestamp, index } from 'drizzle-orm/pg-core'

import { establishments } from './establishments'
import { users } from './users'

export const conversationMessages = pgTable(
  'conversation_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    whatsappNumber: varchar('whatsapp_number', { length: 20 }).notNull(),
    direction: varchar('direction', { length: 10 }).notNull(),
    sender: varchar('sender', { length: 10 }).notNull(),
    agentUserId: uuid('agent_user_id').references(() => users.id, { onDelete: 'set null' }),
    type: varchar('type', { length: 20 }).notNull(),
    content: text('content'),
    payload: jsonb('payload').default({}).notNull(),
    waMessageId: varchar('wa_message_id', { length: 255 }),
    status: varchar('status', { length: 20 }).default('sent').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('conversation_messages_whatsapp_created_idx').on(table.whatsappNumber, table.createdAt),
    index('conversation_messages_wa_message_id_idx').on(table.waMessageId),
  ],
)

export type ConversationMessage = typeof conversationMessages.$inferSelect
export type NewConversationMessage = typeof conversationMessages.$inferInsert
