import { eq, and, count, sum, avg, gte, isNotNull, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { toNumber } from '../../shared/numeric.util'

type Database = NodePgDatabase<typeof schema>

interface TableMetricsInput {
  establishmentId: string
  days: number
}

export interface TableBreakdown {
  tableId: string
  tableNumber: number
  comandaCount: number
  avgTimeMinutes: string
  totalRevenue: string
  avgSpendPerComanda: string
}

export interface TableMetrics {
  periodDays: number
  averageTimeAtTableMinutes: string
  averageSpendPerComanda: string
  averageSpendPerTable: string
  occupancyRatePercent: string
  totalTables: number
  totalComandasClosed: number
  tables: TableBreakdown[]
}

export class GetTableMetricsUseCase {
  constructor(private readonly db: Database) {}

  async execute(input: TableMetricsInput): Promise<TableMetrics> {
    const { establishmentId, days } = input

    const from = sql`NOW() - INTERVAL '${sql.raw(String(days))} days'`

    const tablesList = await this.db
      .select({ id: schema.restaurantTables.id, number: schema.restaurantTables.number })
      .from(schema.restaurantTables)
      .where(eq(schema.restaurantTables.establishmentId, establishmentId))

    const totalTables = tablesList.length

    const closedComandas = await this.db
      .select({
        id: schema.comandas.id,
        tableId: schema.comandas.tableId,
        openedAt: schema.comandas.openedAt,
        closedAt: schema.comandas.closedAt,
        durationMinutes: sql<number>`
          EXTRACT(EPOCH FROM (${schema.comandas.closedAt} - ${schema.comandas.openedAt})) / 60
        `,
      })
      .from(schema.comandas)
      .where(and(
        eq(schema.comandas.establishmentId, establishmentId),
        gte(schema.comandas.openedAt, from),
        isNotNull(schema.comandas.closedAt),
      ))

    const totalComandasClosed = closedComandas.length

    const avgTimeMinutes = closedComandas.length > 0
      ? closedComandas.reduce((acc, c) => acc + toNumber(c.durationMinutes), 0) / closedComandas.length
      : 0

    const tableComandaSummary = new Map<string, {
      tableNumber: number
      comandaCount: number
      totalDurationMinutes: number
      revenue: number
    }>()

    for (const t of tablesList) {
      tableComandaSummary.set(t.id, {
        tableNumber: t.number,
        comandaCount: 0,
        totalDurationMinutes: 0,
        revenue: 0,
      })
    }

    for (const c of closedComandas) {
      if (!c.tableId) continue
      const entry = tableComandaSummary.get(c.tableId)
      if (entry) {
        entry.comandaCount++
        entry.totalDurationMinutes += toNumber(c.durationMinutes)
      }
    }

    const ordersRevenue = await this.db
      .select({
        tableId: schema.orders.tableId,
        revenue: sum(schema.orders.totalAmount),
      })
      .from(schema.orders)
      .where(and(
        eq(schema.orders.establishmentId, establishmentId),
        eq(schema.orders.type, 'table'),
        gte(schema.orders.receivedAt, from),
        sql`${schema.orders.status} NOT IN ('cancelled')`,
      ))
      .groupBy(schema.orders.tableId)

    for (const row of ordersRevenue) {
      if (!row.tableId) continue
      const entry = tableComandaSummary.get(row.tableId)
      if (entry) {
        entry.revenue = Number(row.revenue ?? 0)
      }
    }

    const tables: TableBreakdown[] = []
    for (const [tableId, summary] of tableComandaSummary) {
      tables.push({
        tableId,
        tableNumber: summary.tableNumber,
        comandaCount: summary.comandaCount,
        avgTimeMinutes:
          summary.comandaCount > 0
            ? (summary.totalDurationMinutes / summary.comandaCount).toFixed(1)
            : '0',
        totalRevenue: summary.revenue.toFixed(2),
        avgSpendPerComanda:
          summary.comandaCount > 0
            ? (summary.revenue / summary.comandaCount).toFixed(2)
            : '0',
      })
    }

    tables.sort((a, b) => a.tableNumber - b.tableNumber)

    const totalRevenue = tables.reduce((acc, t) => acc + Number(t.totalRevenue), 0)
    const avgSpendPerComanda = totalComandasClosed > 0
      ? totalRevenue / totalComandasClosed
      : 0

    const avgSpendPerTable = totalTables > 0
      ? totalRevenue / totalTables
      : 0

    const totalOccupiedMinutes = closedComandas.reduce((acc, c) => acc + toNumber(c.durationMinutes), 0)
    const totalPeriodMinutes = totalTables * days * 24 * 60
    const occupancyRate = totalPeriodMinutes > 0
      ? (totalOccupiedMinutes / totalPeriodMinutes) * 100
      : 0

    return {
      periodDays: days,
      averageTimeAtTableMinutes: avgTimeMinutes.toFixed(1),
      averageSpendPerComanda: avgSpendPerComanda.toFixed(2),
      averageSpendPerTable: avgSpendPerTable.toFixed(2),
      occupancyRatePercent: Math.min(occupancyRate, 100).toFixed(1),
      totalTables,
      totalComandasClosed,
      tables,
    }
  }
}
