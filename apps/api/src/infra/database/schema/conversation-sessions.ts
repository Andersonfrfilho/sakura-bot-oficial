import { pgTable, uuid, varchar, jsonb, timestamp, unique } from 'drizzle-orm/pg-core'

import { establishments } from './establishments'
import { users } from './users'

export const conversationSessions = pgTable(
  'conversation_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    whatsappNumber: varchar('whatsapp_number', { length: 20 }).notNull(),
    currentState: varchar('current_state', { length: 50 }).default('start').notNull(),
    context: jsonb('context').default({}).notNull(),
    mode: varchar('mode', { length: 10 }).default('bot').notNull(),
    assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'set null' }),
    humanRequestedAt: timestamp('human_requested_at', { withTimezone: true }),
    lastInboundAt: timestamp('last_inbound_at', { withTimezone: true }),
    lastAgentReadAt: timestamp('last_agent_read_at', { withTimezone: true }),
    lastActivity: timestamp('last_activity', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique('conversation_sessions_establishment_whatsapp_unique').on(table.establishmentId, table.whatsappNumber)],
)

export type ConversationSession = typeof conversationSessions.$inferSelect
export type NewConversationSession = typeof conversationSessions.$inferInsert
