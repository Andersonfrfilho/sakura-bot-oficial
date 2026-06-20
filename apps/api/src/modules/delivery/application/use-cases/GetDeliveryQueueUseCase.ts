import { eq, and, inArray } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'

type Database = NodePgDatabase<typeof schema>

export class GetDeliveryQueueUseCase {
  constructor(private readonly db: Database) {}

  async execute(establishmentId: string) {
    return this.db.query.deliveries.findMany({
      where: and(
        eq(schema.deliveries.establishmentId, establishmentId),
        inArray(schema.deliveries.status, ['pending', 'dispatched'])
      ),
      with: { order: { with: { items: true } } },
    })
  }
}
