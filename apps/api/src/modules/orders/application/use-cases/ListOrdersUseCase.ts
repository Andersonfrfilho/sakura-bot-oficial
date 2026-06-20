import { eq, and, desc, inArray, count } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { OrderStatus } from '@/shared/types'

type Database = NodePgDatabase<typeof schema>

interface ListOrdersInput {
  establishmentId: string
  statuses?: OrderStatus[]
  page?: number
  pageSize?: number
}

export class ListOrdersUseCase {
  constructor(private readonly db: Database) {}

  async execute(input: ListOrdersInput) {
    const page = Math.max(1, input.page ?? 1)
    const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20))
    const offset = (page - 1) * pageSize

    const baseWhere = input.statuses?.length
      ? and(
          eq(schema.orders.establishmentId, input.establishmentId),
          inArray(schema.orders.status, input.statuses)
        )
      : eq(schema.orders.establishmentId, input.establishmentId)

    const [ordersRows, [countRow]] = await Promise.all([
      this.db.query.orders.findMany({
        where: baseWhere,
        orderBy: [desc(schema.orders.receivedAt)],
        limit: pageSize,
        offset,
        with: { items: true, customer: true },
      }),
      this.db.select({ total: count() }).from(schema.orders).where(baseWhere),
    ])

    const data = ordersRows.map((order) => ({
      ...order,
      customer: order.customer
        ? { name: order.customer.name, phone: order.customer.whatsappNumber }
        : null,
    }))

    return { data, total: countRow?.total ?? 0, page, pageSize }
  }
}
