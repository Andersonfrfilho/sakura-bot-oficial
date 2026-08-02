import { eq, and, gt, asc, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { ConflictError } from '@/shared/errors/AppError'

type Database = NodePgDatabase<typeof schema>

export interface DeductStockForOrderInput {
  orderId: string
  establishmentId: string
  userId?: string
}

export interface DeductStockForOrderResult {
  alreadyProcessed: boolean
  movementsCreated: number
}

export class DeductStockForOrderUseCase {
  constructor(private readonly db: Database) {}

  async execute(input: DeductStockForOrderInput): Promise<DeductStockForOrderResult> {
    const alreadyProcessed = await this.db.query.stockMovements.findFirst({
      where: and(
        eq(schema.stockMovements.orderId, input.orderId),
        eq(schema.stockMovements.movementType, 'out')
      ),
      columns: { id: true },
    })
    if (alreadyProcessed) return { alreadyProcessed: true, movementsCreated: 0 }

    const items = await this.db.query.orderItems.findMany({
      where: eq(schema.orderItems.orderId, input.orderId),
    })

    let movementsCreated = 0

    await this.db.transaction(async (tx) => {
      for (const item of items) {
        if (!item.productId) continue

        const product = await tx.query.products.findFirst({
          where: and(
            eq(schema.products.id, item.productId),
            eq(schema.products.establishmentId, input.establishmentId)
          ),
        })
        if (!product) continue

        const recipe = await tx.query.productIngredients.findMany({
          where: eq(schema.productIngredients.productId, item.productId),
        })
        if (recipe.length === 0) continue

        for (const recipeLine of recipe) {
          const requiredQuantity = Number(recipeLine.quantity) * item.quantity

          const ingredient = await tx.query.ingredients.findFirst({
            where: eq(schema.ingredients.id, recipeLine.ingredientId),
            columns: { name: true },
          })

          const batches = await tx
            .select()
            .from(schema.stockBatches)
            .where(
              and(
                eq(schema.stockBatches.ingredientId, recipeLine.ingredientId),
                eq(schema.stockBatches.establishmentId, input.establishmentId),
                gt(schema.stockBatches.remainingQuantity, '0')
              )
            )
            .orderBy(asc(schema.stockBatches.expiresAt))

          let remainingToConsume = requiredQuantity

          for (const batch of batches) {
            if (remainingToConsume <= 0) break

            const batchRemaining = Number(batch.remainingQuantity)
            const consumeFromBatch = Math.min(batchRemaining, remainingToConsume)

            await tx
              .update(schema.stockBatches)
              .set({
                remainingQuantity: String(batchRemaining - consumeFromBatch),
                updatedAt: new Date(),
              })
              .where(eq(schema.stockBatches.id, batch.id))

            await tx.insert(schema.stockMovements).values({
              establishmentId: input.establishmentId,
              ingredientId: recipeLine.ingredientId,
              batchId: batch.id,
              orderId: input.orderId,
              movementType: 'out',
              quantity: String(consumeFromBatch),
              reason: `Baixa por pedido ${input.orderId}`,
              ...(input.userId ? { userId: input.userId } : {}),
            })
            movementsCreated += 1

            remainingToConsume -= consumeFromBatch
          }

          if (remainingToConsume > 0) {
            if (!product.allowNegativeStock) {
              throw new ConflictError(
                `Estoque insuficiente para o ingrediente ${ingredient?.name ?? recipeLine.ingredientId} do produto ${product.name}`
              )
            }

            await tx.insert(schema.stockMovements).values({
              establishmentId: input.establishmentId,
              ingredientId: recipeLine.ingredientId,
              orderId: input.orderId,
              movementType: 'out',
              quantity: String(remainingToConsume),
              reason: `Baixa por pedido ${input.orderId} — saldo negativo permitido para ${product.name}`,
              ...(input.userId ? { userId: input.userId } : {}),
            })
            movementsCreated += 1
          }

          await tx
            .update(schema.ingredients)
            .set({
              stockQuantity: sql`${schema.ingredients.stockQuantity} - ${requiredQuantity}`,
              updatedAt: new Date(),
            })
            .where(eq(schema.ingredients.id, recipeLine.ingredientId))
        }
      }
    })

    return { alreadyProcessed: false, movementsCreated }
  }
}
