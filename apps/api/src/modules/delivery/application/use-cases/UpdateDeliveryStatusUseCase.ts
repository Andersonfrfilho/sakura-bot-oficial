import { eq, and } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { NewDelivery } from '@/infra/database/schema'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'
import { NotFoundError, UnprocessableError } from '@/shared/errors/AppError'
import type { DeliveryStatus } from '@/shared/types'

type Database = NodePgDatabase<typeof schema>

const STATUS_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  pending: ['dispatched'],
  dispatched: ['delivered', 'failed'],
  delivered: [],
  failed: ['pending'],
}

interface UpdateDeliveryStatusInput {
  deliveryId: string
  establishmentId: string
  newStatus: DeliveryStatus
  delivererId?: string
}

export class UpdateDeliveryStatusUseCase {
  constructor(
    private readonly db: Database,
    private readonly wsHub: WebSocketHub
  ) {}

  async execute(input: UpdateDeliveryStatusInput) {
    const delivery = await this.db.query.deliveries.findFirst({
      where: and(
        eq(schema.deliveries.id, input.deliveryId),
        eq(schema.deliveries.establishmentId, input.establishmentId)
      ),
    })

    if (!delivery) throw new NotFoundError('Delivery')

    const allowed = STATUS_TRANSITIONS[delivery.status]
    if (!allowed?.includes(input.newStatus)) {
      throw new UnprocessableError(
        `Cannot transition delivery from '${delivery.status}' to '${input.newStatus}'`
      )
    }

    const now = new Date()
    const updateValues: Partial<NewDelivery> = { status: input.newStatus }
    if (input.newStatus === 'dispatched') {
      updateValues.dispatchedAt = now
      if (input.delivererId) updateValues.delivererId = input.delivererId
    } else if (input.newStatus === 'delivered') {
      updateValues.deliveredAt = now
    } else if (input.newStatus === 'failed') {
      updateValues.failedAt = now
    }

    const [updated] = await this.db
      .update(schema.deliveries)
      .set(updateValues)
      .where(
        and(
          eq(schema.deliveries.id, input.deliveryId),
          eq(schema.deliveries.establishmentId, input.establishmentId)
        )
      )
      .returning()

    const eventType =
      input.newStatus === 'dispatched'
        ? WS_EVENTS.DELIVERY_DISPATCHED
        : input.newStatus === 'delivered'
          ? WS_EVENTS.DELIVERY_COMPLETED
          : WS_EVENTS.DELIVERY_ASSIGNED

    await this.wsHub.publishBroadcast(input.establishmentId, eventType, {
      deliveryId: input.deliveryId,
      status: input.newStatus,
    })

    return updated!
  }
}
