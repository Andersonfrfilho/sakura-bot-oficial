import { pgTable, uuid, varchar, boolean, integer, timestamp } from 'drizzle-orm/pg-core'
import { establishments } from './establishments'

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  establishmentId: uuid('establishment_id')
    .notNull()
    .references(() => establishments.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  active: boolean('active').default(true).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  ncmCode: varchar('ncm_code', { length: 8 }).default('21069090'),
  cfopCode: varchar('cfop_code', { length: 4 }).default('5102'),
  cstIcms: varchar('cst_icms', { length: 3 }).default('400'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type Category = typeof categories.$inferSelect
export type NewCategory = typeof categories.$inferInsert
