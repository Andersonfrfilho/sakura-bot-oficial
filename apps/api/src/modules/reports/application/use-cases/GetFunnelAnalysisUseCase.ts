import { eq, and, count, gte, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'

type Database = NodePgDatabase<typeof schema>

interface FunnelAnalysisInput {
  establishmentId: string
  days: number
}

export interface StageBreakdown {
  stage: string
  averageMinutes: string
  orderCount: number
  label: string
}

export interface FunnelTypeGroup {
  orderType: string
  label: string
  stages: StageBreakdown[]
  bottleneck: string | null
}

export interface FunnelAnalysis {
  periodDays: number
  overall: {
    slowestStage: string | null
    slowestStageMins: string
  }
  byType: FunnelTypeGroup[]
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  delivery: 'Delivery',
  pickup: 'Retirada',
  table: 'Mesa',
}

const STAGE_LABELS: Record<string, string> = {
  received_to_production: 'Recebido → Produção',
  production_to_ready: 'Produção → Pronto',
  ready_to_completed: 'Pronto → Concluído',
}

export class GetFunnelAnalysisUseCase {
  constructor(private readonly db: Database) {}

  async execute(input: FunnelAnalysisInput): Promise<FunnelAnalysis> {
    const { establishmentId, days } = input

    const from = sql`NOW() - INTERVAL '${sql.raw(String(days))} days'`

    const funnelData = await this.db
      .select({
        type: schema.orders.type,
        avgReceivedToProduction: sql<number>`
          AVG(
            EXTRACT(EPOCH FROM (${schema.orders.productionStartedAt} - ${schema.orders.receivedAt})) / 60
          )
        `,
        avgProductionToReady: sql<number>`
          AVG(
            EXTRACT(EPOCH FROM (${schema.orders.readyAt} - ${schema.orders.productionStartedAt})) / 60
          )
        `,
        avgReadyToCompleted: sql<number>`
          AVG(
            EXTRACT(EPOCH FROM (${schema.orders.completedAt} - ${schema.orders.readyAt})) / 60
          )
        `,
        orderCount: count(),
      })
      .from(schema.orders)
      .where(and(
        eq(schema.orders.establishmentId, establishmentId),
        gte(schema.orders.receivedAt, from),
        eq(schema.orders.status, 'completed'),
      ))
      .groupBy(schema.orders.type)

    const byType = funnelData.map((row) => {
      const stage: 'delivery' | 'pickup' | 'table' = (
        ['delivery', 'pickup', 'table'] as const
      ).includes(row.type as 'delivery' | 'pickup' | 'table')
        ? (row.type as 'delivery' | 'pickup' | 'table')
        : 'table'

      const stages: StageBreakdown[] = [
        {
          stage: 'received_to_production',
          label: STAGE_LABELS['received_to_production'] ?? 'Recebido → Produção',
          averageMinutes: (row.avgReceivedToProduction ?? 0).toFixed(1),
          orderCount: row.orderCount,
        },
        {
          stage: 'production_to_ready',
          label: STAGE_LABELS['production_to_ready'] ?? 'Produção → Pronto',
          averageMinutes: (row.avgProductionToReady ?? 0).toFixed(1),
          orderCount: row.orderCount,
        },
        {
          stage: 'ready_to_completed',
          label: STAGE_LABELS['ready_to_completed'] ?? 'Pronto → Concluído',
          averageMinutes: (row.avgReadyToCompleted ?? 0).toFixed(1),
          orderCount: row.orderCount,
        },
      ]

      let bottleneck: string | null = null
      let maxMins = 0
      for (const s of stages) {
        const mins = Number(s.averageMinutes)
        if (mins > maxMins) {
          maxMins = mins
          bottleneck = s.label
        }
      }

      return {
        orderType: stage,
        label: ORDER_TYPE_LABELS[stage] ?? stage,
        stages,
        bottleneck,
      }
    })

    let overallSlowestStage: string | null = null
    let overallSlowestMins = 0
    for (const group of byType) {
      for (const s of group.stages) {
        const mins = Number(s.averageMinutes)
        if (mins > overallSlowestMins) {
          overallSlowestMins = mins
          overallSlowestStage = `${group.label}: ${s.label}`
        }
      }
    }

    return {
      periodDays: days,
      overall: {
        slowestStage: overallSlowestStage,
        slowestStageMins: overallSlowestMins.toFixed(1),
      },
      byType,
    }
  }
}
