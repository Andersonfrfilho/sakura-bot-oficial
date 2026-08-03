import { eq, and, isNull, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { NewOrder } from '@/infra/database/schema'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'
import { NotFoundError, UnprocessableError } from '@/shared/errors/AppError'
import { canTransitionTo } from '../../domain/entities/Order'
import { MessagesConstants } from '@/shared/constants/MessagesConstants'
import type { OrderStatus } from '@/shared/types'
import type { TriggerFiscalEmissionUseCase } from '@/modules/fiscal/application/use-cases/TriggerFiscalEmissionUseCase'
import type { DeductStockForOrderUseCase } from '@/modules/products/application/use-cases/DeductStockForOrderUseCase'

type Database = NodePgDatabase<typeof schema>

interface UpdateStatusInput {
  orderId: string
  establishmentId: string
  newStatus: OrderStatus
  cancellationReason?: string
  userId?: string
}


export class UpdateOrderStatusUseCase {
  constructor(
    private readonly db: Database,
    private readonly wsHub: WebSocketHub,
    private readonly triggerFiscal?: TriggerFiscalEmissionUseCase,
    private readonly deductStock?: DeductStockForOrderUseCase
  ) {}

  async execute(input: UpdateStatusInput) {
    const order = await this.db.query.orders.findFirst({
      where: and(
        eq(schema.orders.id, input.orderId),
        eq(schema.orders.establishmentId, input.establishmentId)
      ),
    })

    if (!order) throw new NotFoundError('Order')

    if (!canTransitionTo(order.status, input.newStatus)) {
      throw new UnprocessableError(
        MessagesConstants.order.invalidStatusTransition(order.status, input.newStatus)
      )
    }

    // Baixa de estoque bloqueia a transição quando o produto não permite saldo negativo —
    // é aqui que o pedido efetivamente começa a consumir receita.
    if (input.newStatus === 'in_production' && this.deductStock) {
      await this.deductStock.execute({
        orderId: input.orderId,
        establishmentId: input.establishmentId,
        ...(input.userId ? { userId: input.userId } : {}),
      })
    }

    const now = new Date()
    const updateValues: Partial<NewOrder> = { status: input.newStatus }

    if (input.newStatus === 'in_production') updateValues.productionStartedAt = now
    else if (input.newStatus === 'ready') updateValues.readyAt = now
    else if (input.newStatus === 'completed') updateValues.completedAt = now
    else if (input.newStatus === 'cancelled') {
      updateValues.cancelledAt = now
      if (input.cancellationReason) updateValues.cancellationReason = input.cancellationReason
    }

    const [updated] = await this.db
      .update(schema.orders)
      .set(updateValues)
      .where(
        and(
          eq(schema.orders.id, input.orderId),
          eq(schema.orders.establishmentId, input.establishmentId)
        )
      )
      .returning()

    await this.stampItemPreparation(input.orderId, input.newStatus, now)

    await this.wsHub.publishBroadcast(input.establishmentId, WS_EVENTS.ORDER_STATUS_CHANGED, {
      orderId: input.orderId,
      previousStatus: order.status,
      newStatus: input.newStatus,
    })

    // Fire-and-forget: a fiscal hiccup must never block the order status change.
    if (input.newStatus === 'completed' && this.triggerFiscal) {
      this.triggerFiscal
        .execute({ orderId: input.orderId, establishmentId: input.establishmentId, event: 'on_completed' })
        .catch((error) => console.error('[Fiscal] trigger on_completed failed', error))
    }

    return updated!
  }

  /**
   * O tempo de preparo real é medido por item, não pelo pedido — um pedido com
   * refrigerante e marmita atribuía a mesma duração aos dois. Avançar o pedido
   * inteiro continua carimbando todos os itens que ainda não foram marcados na
   * cozinha, para que nenhum item fique sem medição.
   */
  private async stampItemPreparation(orderId: string, newStatus: OrderStatus, now: Date): Promise<void> {
    if (newStatus === 'in_production') {
      await this.db
        .update(schema.orderItems)
        .set({ productionStartedAt: now })
        .where(and(eq(schema.orderItems.orderId, orderId), isNull(schema.orderItems.productionStartedAt)))
      return
    }

    if (newStatus === 'ready') {
      await this.db
        .update(schema.orderItems)
        .set({ readyAt: now, productionStartedAt: sql`coalesce(${schema.orderItems.productionStartedAt}, ${now})` })
        .where(and(eq(schema.orderItems.orderId, orderId), isNull(schema.orderItems.readyAt)))
    }
  }
}
