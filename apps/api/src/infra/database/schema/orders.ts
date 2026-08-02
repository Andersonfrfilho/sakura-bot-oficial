import { pgTable, uuid, varchar, text, numeric, timestamp, boolean } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'
import { customers } from './customers'
import { restaurantTables } from './tables'
import { orderStatusEnum, orderTypeEnum, orderChannelEnum } from './enums'

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  establishmentId: uuid('establishment_id')
    .notNull()
    .references(() => establishments.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  tableId: uuid('table_id').references(() => restaurantTables.id, { onDelete: 'set null' }),
  channel: orderChannelEnum('channel').default('manual').notNull(),
  status: orderStatusEnum('status').default('received').notNull(),
  type: orderTypeEnum('type').notNull(),
  totalAmount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(),
  notes: text('notes'),
  fiscalEnabled: boolean('fiscal_enabled').notNull().default(true),
  whatsappMessageId: varchar('whatsapp_message_id', { length: 255 }).unique(),
  // Retirada/entrega marcada para um horário futuro. `null` é o caso comum — pedido para agora.
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  productionStartedAt: timestamp('production_started_at', { withTimezone: true }),
  readyAt: timestamp('ready_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancellationReason: text('cancellation_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type Order = typeof orders.$inferSelect
export type NewOrder = typeof orders.$inferInsert
