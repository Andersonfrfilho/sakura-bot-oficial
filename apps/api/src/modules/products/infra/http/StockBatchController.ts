import { and, eq, lte, gt, asc } from 'drizzle-orm'
import { z } from 'zod'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { RouteHandler } from '@/infra/http/router'
import * as schema from '@/infra/database/schema'
import { UnauthorizedError, ValidationError } from '@/shared/errors/AppError'

type Database = NodePgDatabase<typeof schema>

const DEFAULT_EXPIRY_ALERT_DAYS = 7

export class StockBatchController {
  constructor(private readonly db: Database) {}

  listExpiring: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const daysStr = (request as { query?: Record<string, string> }).query?.['days'] ?? String(DEFAULT_EXPIRY_ALERT_DAYS)
    const days = parseInt(daysStr, 10)
    if (isNaN(days) || days < 1) throw new ValidationError('Parâmetro days deve ser número positivo')

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() + days)

    const batches = await this.db
      .select({
        id: schema.stockBatches.id,
        ingredientId: schema.stockBatches.ingredientId,
        ingredientName: schema.ingredients.name,
        batchNumber: schema.stockBatches.batchNumber,
        quantity: schema.stockBatches.quantity,
        remainingQuantity: schema.stockBatches.remainingQuantity,
        costPerUnit: schema.stockBatches.costPerUnit,
        expiresAt: schema.stockBatches.expiresAt,
        createdAt: schema.stockBatches.createdAt,
      })
      .from(schema.stockBatches)
      .leftJoin(schema.ingredients, eq(schema.stockBatches.ingredientId, schema.ingredients.id))
      .where(
        and(
          eq(schema.stockBatches.establishmentId, establishmentId),
          lte(schema.stockBatches.expiresAt, cutoffDate),
          gt(schema.stockBatches.remainingQuantity, '0')
        )
      )
      .orderBy(asc(schema.stockBatches.expiresAt))

    response.json(batches)
  }

  countExpiring: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId } = request.user

    const settingsRows = await this.db
      .select({ value: schema.settings.value })
      .from(schema.settings)
      .where(and(
        eq(schema.settings.establishmentId, establishmentId),
        eq(schema.settings.key, 'stock')
      ))
      .limit(1)

    const stockSettings = (settingsRows[0]?.value as Record<string, unknown>) ?? {}
    const alertDays = (stockSettings.expiry_alert_days as number) ?? DEFAULT_EXPIRY_ALERT_DAYS

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() + alertDays)

    const batches = await this.db
      .select({ id: schema.stockBatches.id })
      .from(schema.stockBatches)
      .where(
        and(
          eq(schema.stockBatches.establishmentId, establishmentId),
          lte(schema.stockBatches.expiresAt, cutoffDate),
          gt(schema.stockBatches.remainingQuantity, '0')
        )
      )

    response.json({ count: batches.length, alertDays })
  }
}
