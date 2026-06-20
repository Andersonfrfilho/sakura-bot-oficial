import { pgTable, uuid, integer, timestamp } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'
import { tableStatusEnum } from './enums'

export const restaurantTables = pgTable('tables', {
  id: uuid('id').primaryKey().defaultRandom(),
  establishmentId: uuid('establishment_id')
    .notNull()
    .references(() => establishments.id, { onDelete: 'cascade' }),
  number: integer('number').notNull(),
  capacity: integer('capacity').notNull(),
  status: tableStatusEnum('status').default('available').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export type RestaurantTable = typeof restaurantTables.$inferSelect
export type NewRestaurantTable = typeof restaurantTables.$inferInsert
