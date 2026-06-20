import { eq, and, inArray, asc } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'

type Database = NodePgDatabase<typeof schema>

const KITCHEN_STATUSES = ['received', 'in_production'] as const

// SLA thresholds in minutes
const SLA_WARNING_MINUTES = 15
const SLA_CRITICAL_MINUTES = 25

export class GetKitchenQueueUseCase {
  constructor(private readonly db: Database) {}

  async execute(establishmentId: string) {
    const orders = await this.db.query.orders.findMany({
      where: and(
        eq(schema.orders.establishmentId, establishmentId),
        inArray(schema.orders.status, [...KITCHEN_STATUSES])
      ),
      orderBy: [asc(schema.orders.receivedAt)],
      with: { items: true },
    })

    const now = Date.now()

    return orders.map((order) => {
      const ageMinutes = Math.floor((now - new Date(order.receivedAt).getTime()) / 60000)
      const slaStatus =
        ageMinutes >= SLA_CRITICAL_MINUTES
          ? 'critical'
          : ageMinutes >= SLA_WARNING_MINUTES
            ? 'warning'
            : 'ok'

      return { ...order, ageMinutes, slaStatus }
    })
  }
}
