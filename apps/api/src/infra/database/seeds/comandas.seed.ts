import { db } from '../connection'
import * as schema from '../schema'
import { daysAgo, requireItemAt } from './helpers/seed-helpers'

function comandaId(index: number): string {
  return `00000000-0000-0000-0006-${String(index).padStart(12, '0')}`
}

type ClosedComandaBlueprint = {
  tableIndex: number
  customerName: string
  daysAgo: number
  durationMinutes: number
}

const CLOSED_COMANDAS: ClosedComandaBlueprint[] = [
  { tableIndex: 1, customerName: 'Mesa família', daysAgo: 2, durationMinutes: 74 },
  { tableIndex: 3, customerName: 'Casal', daysAgo: 3, durationMinutes: 58 },
  { tableIndex: 4, customerName: 'Almoço executivo', daysAgo: 4, durationMinutes: 41 },
  { tableIndex: 5, customerName: 'Grupo de amigos', daysAgo: 5, durationMinutes: 96 },
  { tableIndex: 9, customerName: 'Jantar', daysAgo: 6, durationMinutes: 83 },
]

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
    // Comandas fechadas em mesas distintas, para a taxa de ocupação e o tempo
    // médio terem mais de uma amostra. Cada mesa aqui recebe um pedido de mesa
    // correspondente no orders.seed — comanda sem pedido derrubaria o
    // ticket/comanda e faria a tela mentir de novo.
    ...CLOSED_COMANDAS.map((comanda, offset) => ({
      id: comandaId(3 + offset),
      establishmentId,
      tableId: requireItemAt(tableIds, comanda.tableIndex),
      code: `CMD-${String(4 + offset).padStart(3, '0')}`,
      status: 'paid' as const,
      customerName: comanda.customerName,
      openedAt: daysAgo(comanda.daysAgo, 4),
      closedAt: new Date(daysAgo(comanda.daysAgo, 4).getTime() + comanda.durationMinutes * 60 * 1000),
    })),
  ]
  await db.insert(schema.comandas).values(comandas).onConflictDoNothing()
}
