import { relations } from 'drizzle-orm'
import { establishments } from './establishments'
import { roles } from './roles'
import { permissions } from './permissions'
import { users } from './users'
import { customers } from './customers'
import { addresses } from './addresses'
import { categories } from './categories'
import { products } from './products'
import { restaurantTables } from './tables'
import { comandas } from './comandas'
import { orders } from './orders'
import { orderItems } from './order-items'
import { deliveries } from './deliveries'
import { cashRegisters } from './cash-registers'
import { cashMovements } from './cash-movements'
import { settings } from './settings'
import { auditLogs } from './audit-logs'

export const establishmentsRelations = relations(establishments, ({ many }) => ({
  roles: many(roles),
  users: many(users),
  customers: many(customers),
  categories: many(categories),
  products: many(products),
  restaurantTables: many(restaurantTables),
  comandas: many(comandas),
  orders: many(orders),
  cashRegisters: many(cashRegisters),
  settings: many(settings),
  auditLogs: many(auditLogs),
}))

export const rolesRelations = relations(roles, ({ one, many }) => ({
  establishment: one(establishments, {
    fields: [roles.establishmentId],
    references: [establishments.id],
  }),
  permissions: many(permissions),
  users: many(users),
}))

export const permissionsRelations = relations(permissions, ({ one }) => ({
  role: one(roles, { fields: [permissions.roleId], references: [roles.id] }),
}))

export const usersRelations = relations(users, ({ one, many }) => ({
  establishment: one(establishments, {
    fields: [users.establishmentId],
    references: [establishments.id],
  }),
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  cashRegisters: many(cashRegisters),
  deliveries: many(deliveries),
  auditLogs: many(auditLogs),
}))

export const customersRelations = relations(customers, ({ one, many }) => ({
  establishment: one(establishments, {
    fields: [customers.establishmentId],
    references: [establishments.id],
  }),
  addresses: many(addresses),
  orders: many(orders),
}))

export const addressesRelations = relations(addresses, ({ one }) => ({
  customer: one(customers, {
    fields: [addresses.customerId],
    references: [customers.id],
  }),
}))

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  establishment: one(establishments, {
    fields: [categories.establishmentId],
    references: [establishments.id],
  }),
  products: many(products),
}))

export const productsRelations = relations(products, ({ one, many }) => ({
  establishment: one(establishments, {
    fields: [products.establishmentId],
    references: [establishments.id],
  }),
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  orderItems: many(orderItems),
}))

export const restaurantTablesRelations = relations(restaurantTables, ({ one, many }) => ({
  establishment: one(establishments, {
    fields: [restaurantTables.establishmentId],
    references: [establishments.id],
  }),
  orders: many(orders),
  comandas: many(comandas),
}))

export const comandasRelations = relations(comandas, ({ one }) => ({
  establishment: one(establishments, {
    fields: [comandas.establishmentId],
    references: [establishments.id],
  }),
  table: one(restaurantTables, {
    fields: [comandas.tableId],
    references: [restaurantTables.id],
  }),
  customer: one(customers, {
    fields: [comandas.customerId],
    references: [customers.id],
  }),
}))

export const ordersRelations = relations(orders, ({ one, many }) => ({
  establishment: one(establishments, {
    fields: [orders.establishmentId],
    references: [establishments.id],
  }),
  customer: one(customers, {
    fields: [orders.customerId],
    references: [customers.id],
  }),
  table: one(restaurantTables, {
    fields: [orders.tableId],
    references: [restaurantTables.id],
  }),
  items: many(orderItems),
  delivery: many(deliveries),
  cashMovements: many(cashMovements),
}))

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}))

export const deliveriesRelations = relations(deliveries, ({ one }) => ({
  order: one(orders, { fields: [deliveries.orderId], references: [orders.id] }),
  establishment: one(establishments, {
    fields: [deliveries.establishmentId],
    references: [establishments.id],
  }),
  deliverer: one(users, {
    fields: [deliveries.delivererId],
    references: [users.id],
  }),
}))

export const cashRegistersRelations = relations(cashRegisters, ({ one, many }) => ({
  establishment: one(establishments, {
    fields: [cashRegisters.establishmentId],
    references: [establishments.id],
  }),
  user: one(users, { fields: [cashRegisters.userId], references: [users.id] }),
  movements: many(cashMovements),
}))

export const cashMovementsRelations = relations(cashMovements, ({ one }) => ({
  cashRegister: one(cashRegisters, {
    fields: [cashMovements.cashRegisterId],
    references: [cashRegisters.id],
  }),
  order: one(orders, { fields: [cashMovements.orderId], references: [orders.id] }),
}))

export const settingsRelations = relations(settings, ({ one }) => ({
  establishment: one(establishments, {
    fields: [settings.establishmentId],
    references: [establishments.id],
  }),
}))

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  establishment: one(establishments, {
    fields: [auditLogs.establishmentId],
    references: [establishments.id],
  }),
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}))
