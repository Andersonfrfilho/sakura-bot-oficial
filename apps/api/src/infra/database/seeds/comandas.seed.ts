import { db } from '../connection'
import * as schema from '../schema'
import { daysAgo, requireItemAt } from './helpers/seed-helpers'

function comandaId(index: number): string {
  return `00000000-0000-0000-0006-${String(index).padStart(12, '0')}`
}

type SeedComandasParams = {
  establishmentId: string
  tableIds: string[]
  customerIds: string[]
}

export async function seedComandas({ establishmentId, tableIds, customerIds }: SeedComandasParams): Promise<void> {
  const comandas = [
    {
      id: comandaId(0),
      establishmentId,
      tableId: requireItemAt(tableIds, 2),
      code: 'CMD-001',
      status: 'open' as const,
      customerId: customerIds[0] ?? null,
      openedAt: daysAgo(0, 1),
    },
    {
      id: comandaId(1),
      establishmentId,
      tableId: requireItemAt(tableIds, 8),
      code: 'CMD-002',
      status: 'open' as const,
      customerName: 'Cliente balcão',
      openedAt: daysAgo(0, 0),
    },
    {
      id: comandaId(2),
      establishmentId,
      tableId: requireItemAt(tableIds, 0),
      code: 'CMD-003',
      status: 'paid' as const,
      customerId: customerIds[2] ?? null,
      openedAt: daysAgo(1, 3),
      closedAt: daysAgo(1, 1),
    },
  ]
  await db.insert(schema.comandas).values(comandas).onConflictDoNothing()
}
