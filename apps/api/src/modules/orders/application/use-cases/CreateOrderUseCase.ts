import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'
import { ConflictError } from '@/shared/errors/AppError'
import type { OrderType, OrderChannel } from '@/shared/types'

type Database = NodePgDatabase<typeof schema>

interface CreateOrderItemInput {
  productId?: string
  productName: string
  unitPrice: number
  quantity: number
  notes?: string
}

interface CreateOrderInput {
  establishmentId: string
  customerId?: string
  tableId?: string
  channel: OrderChannel
  type: OrderType
  items: CreateOrderItemInput[]
  notes?: string
  whatsappMessageId?: string
}

export class CreateOrderUseCase {
  constructor(
    private readonly db: Database,
    private readonly wsHub: WebSocketHub
  ) {}

  async execute(input: CreateOrderInput) {
    // Idempotency: skip duplicate webhook deliveries
    if (input.whatsappMessageId) {
      const duplicate = await this.db.query.orders.findFirst({
        where: eq(schema.orders.whatsappMessageId, input.whatsappMessageId),
      })
      if (duplicate) return duplicate
    }

    if (input.items.length === 0) {
      throw new ConflictError('Order must have at least one item')
    }

    const totalAmount = input.items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    )

    const [order] = await this.db
      .insert(schema.orders)
      .values({
        establishmentId: input.establishmentId,
        customerId: input.customerId ?? null,
        tableId: input.tableId ?? null,
        channel: input.channel,
        type: input.type,
        status: 'received',
        totalAmount: totalAmount.toFixed(2),
        notes: input.notes ?? null,
        whatsappMessageId: input.whatsappMessageId ?? null,
      })
      .returning()

    if (!order) throw new ConflictError('Failed to create order')

    const itemValues = input.items.map((item) => ({
      orderId: order.id,
      productId: item.productId ?? null,
      productName: item.productName,
      unitPrice: item.unitPrice.toFixed(2),
      quantity: item.quantity,
      totalPrice: (item.unitPrice * item.quantity).toFixed(2),
      notes: item.notes ?? null,
    }))

    await this.db.insert(schema.orderItems).values(itemValues)

    // Broadcast to all connected clients in this establishment
    await this.wsHub.publishBroadcast(input.establishmentId, WS_EVENTS.ORDER_CREATED, {
      orderId: order.id,
      type: order.type,
      channel: order.channel,
      status: order.status,
      totalAmount: order.totalAmount,
    })

    return order
  }
}
