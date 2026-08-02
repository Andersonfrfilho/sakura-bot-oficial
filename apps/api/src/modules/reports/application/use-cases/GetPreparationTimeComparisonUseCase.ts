import { eq, and, gte, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { alias } from 'drizzle-orm/pg-core'
import * as schema from '@/infra/database/schema'
import { toNumber } from '../../shared/numeric.util'

type Database = NodePgDatabase<typeof schema>

interface PreparationTimeInput {
  establishmentId: string
  days: number
}

export interface PreparationTimeComparison {
  productId: string
  productName: string
  cadastradoMinutes: number
  realAverageMinutes: string
  differenceMinutes: string
  differencePercent: string
  sampleSize: number
}

export interface PreparationTimeReport {
  periodDays: number
  products: PreparationTimeComparison[]
  overallAccuracy: string
  totalProductsCompared: number
}

export class GetPreparationTimeComparisonUseCase {
  constructor(private readonly db: Database) {}

  async execute(input: PreparationTimeInput): Promise<PreparationTimeReport> {
    const { establishmentId, days } = input

    const from = sql`NOW() - INTERVAL '${sql.raw(String(days))} days'`

    const productsWithTimes = await this.db
      .select({
        productId: schema.orderItems.productId,
        productName: schema.orderItems.productName,
        cadastradoMinutes: schema.products.preparationTimeMinutes,
      })
      .from(schema.orderItems)
      .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
      .innerJoin(schema.products, eq(schema.orderItems.productId, schema.products.id))
      .where(and(
        eq(schema.orders.establishmentId, establishmentId),
        gte(schema.orders.receivedAt, from),
        eq(schema.orders.status, 'completed'),
        sql`${schema.products.preparationTimeMinutes} IS NOT NULL`,
      ))
      .groupBy(
        schema.orderItems.productId,
        schema.orderItems.productName,
        schema.products.preparationTimeMinutes,
      )

    const productIds = [...new Set(productsWithTimes.map((p) => p.productId).filter(Boolean))]

    if (productIds.length === 0) {
      return {
        periodDays: days,
        products: [],
        overallAccuracy: '0',
        totalProductsCompared: 0,
      }
    }

    // Auto-join entre o log de entrada em produção e o de "pronto" do mesmo
    // pedido. A versão anterior usava subquery correlacionada num `innerJoin`
    // comum — sem `LATERAL` o Postgres recusa a referência à tabela externa, e
    // o erro só aparecia quando havia log para comparar.
    const productionLogs = alias(schema.orderStatusLogs, 'production_logs')
    const readyLogs = alias(schema.orderStatusLogs, 'ready_logs')

    const durationMinutes = sql<number>`
      AVG(EXTRACT(EPOCH FROM (${readyLogs.createdAt} - ${productionLogs.createdAt})) / 60)
    `

    const logsByProduct = await this.db
      .select({
        productId: schema.orderItems.productId,
        realDurationMinutes: durationMinutes,
        sampleSize: sql<number>`COUNT(DISTINCT ${schema.orders.id})`,
      })
      .from(schema.orders)
      .innerJoin(schema.orderItems, eq(schema.orders.id, schema.orderItems.orderId))
      .innerJoin(productionLogs, and(
        eq(productionLogs.orderId, schema.orders.id),
        eq(productionLogs.status, 'in_production'),
      ))
      .innerJoin(readyLogs, and(
        eq(readyLogs.orderId, schema.orders.id),
        eq(readyLogs.status, 'ready'),
        sql`${readyLogs.createdAt} > ${productionLogs.createdAt}`,
      ))
      .where(and(
        eq(schema.orders.establishmentId, establishmentId),
        gte(schema.orders.receivedAt, from),
        eq(schema.orders.status, 'completed'),
      ))
      .groupBy(schema.orderItems.productId)
      .having(sql`${durationMinutes} IS NOT NULL`)

    const comparisonMap = new Map<string, { realMin: number; sampleSize: number }>()
    for (const log of logsByProduct) {
      if (log.productId) {
        // AVG volta como string do driver — sem converter, o `.toFixed` abaixo
        // quebra assim que existir amostra.
        comparisonMap.set(log.productId, {
          realMin: toNumber(log.realDurationMinutes),
          sampleSize: toNumber(log.sampleSize),
        })
      }
    }

    const comparisons: PreparationTimeComparison[] = productsWithTimes
      .filter((p) => p.productId && comparisonMap.has(p.productId))
      .map((p) => {
        const realData = comparisonMap.get(p.productId!)!
        const cad = p.cadastradoMinutes ?? 0
        const real = realData.realMin
        const diff = real - cad
        const pct = cad > 0 ? ((diff / cad) * 100) : 0

        return {
          productId: p.productId!,
          productName: p.productName,
          cadastradoMinutes: cad,
          realAverageMinutes: real.toFixed(1),
          differenceMinutes: diff.toFixed(1),
          differencePercent: pct.toFixed(1),
          sampleSize: realData.sampleSize,
        }
      })
      .sort((a, b) => Number(b.differenceMinutes) - Number(a.differenceMinutes))

    const accuracies = comparisons
      .filter((c) => !isNaN(Number(c.differencePercent)))
      .map((c) => {
        const pct = Math.abs(Number(c.differencePercent))
        return Math.max(0, 100 - pct)
      })

    const overallAccuracy = accuracies.length > 0
      ? (accuracies.reduce((a, b) => a + b, 0) / accuracies.length).toFixed(1)
      : '0'

    return {
      periodDays: days,
      products: comparisons,
      overallAccuracy,
      totalProductsCompared: comparisons.length,
    }
  }
}
