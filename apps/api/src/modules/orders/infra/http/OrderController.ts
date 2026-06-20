import { z } from 'zod'
import type { RouteHandler } from '@/infra/http/router'
import type { CreateOrderUseCase } from '../../application/use-cases/CreateOrderUseCase'
import type { UpdateOrderStatusUseCase } from '../../application/use-cases/UpdateOrderStatusUseCase'
import type { GetOrderUseCase } from '../../application/use-cases/GetOrderUseCase'
import type { ListOrdersUseCase } from '../../application/use-cases/ListOrdersUseCase'
import { ValidationError, UnauthorizedError } from '@/shared/errors/AppError'

const orderItemSchema = z.object({
  productId: z.string().uuid().optional(),
  productName: z.string().min(1).max(255),
  unitPrice: z.number().positive(),
  quantity: z.number().int().positive(),
  notes: z.string().max(500).optional(),
})

const createOrderSchema = z.object({
  customerId: z.string().uuid().optional(),
  tableId: z.string().uuid().optional(),
  channel: z.enum(['whatsapp', 'ifood', 'manual']),
  type: z.enum(['delivery', 'pickup', 'table']),
  items: z.array(orderItemSchema).min(1),
  notes: z.string().max(1000).optional(),
  whatsappMessageId: z.string().max(255).optional(),
})

const updateStatusSchema = z.object({
  status: z.enum(['received', 'in_production', 'ready', 'in_delivery', 'picked_up', 'completed', 'cancelled']),
  cancellationReason: z.string().max(500).optional(),
})

export class OrderController {
  constructor(
    private readonly createOrderUseCase: CreateOrderUseCase,
    private readonly updateStatusUseCase: UpdateOrderStatusUseCase,
    private readonly getOrderUseCase: GetOrderUseCase,
    private readonly listOrdersUseCase: ListOrdersUseCase
  ) {}

  list: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { status, page, pageSize } = request.query
    const result = await this.listOrdersUseCase.execute({
      establishmentId: request.user.establishmentId,
      statuses: status ? (status.split(',') as never) : undefined,
      page: page ? parseInt(page) : undefined,
      pageSize: pageSize ? parseInt(pageSize) : undefined,
    })
    response.json(result)
  }

  get: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const order = await this.getOrderUseCase.execute(
      request.params['id']!,
      request.user.establishmentId
    )
    response.json(order)
  }

  create: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = createOrderSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }
    const order = await this.createOrderUseCase.execute({
      ...parsed.data,
      establishmentId: request.user.establishmentId,
    })
    response.json(order, 201)
  }

  updateStatus: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = updateStatusSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }
    const order = await this.updateStatusUseCase.execute({
      orderId: request.params['id']!,
      establishmentId: request.user.establishmentId,
      newStatus: parsed.data.status,
      cancellationReason: parsed.data.cancellationReason,
    })
    response.json(order)
  }
}
