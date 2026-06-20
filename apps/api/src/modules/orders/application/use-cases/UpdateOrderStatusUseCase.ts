import { eq, and } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { NewOrder } from '@/infra/database/schema'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'
import { NotFoundError, UnprocessableError } from '@/shared/errors/AppError'
import { canTransitionTo } from '../../domain/entities/Order'
import { MessagesConstants } from '@/shared/constants/MessagesConstants'
import type { OrderStatus } from '@/shared/types'

type Database = NodePgDatabase<typeof schema>

interface UpdateStatusInput {
  orderId: string
  establishmentId: string
  newStatus: OrderStatus
  cancellationReason?: string
}


export class UpdateOrderStatusUseCase {
  constructor(
    private readonly db: Database,
    private readonly wsHub: WebSocketHub
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

    await this.wsHub.publishBroadcast(input.establishmentId, WS_EVENTS.ORDER_STATUS_CHANGED, {
      orderId: input.orderId,
      previousStatus: order.status,
      newStatus: input.newStatus,
    })

    return updated!
  }
}
