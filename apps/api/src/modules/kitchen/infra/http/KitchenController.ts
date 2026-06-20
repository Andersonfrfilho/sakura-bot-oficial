import type { RouteHandler } from '@/infra/http/router'
import type { GetKitchenQueueUseCase } from '../../application/use-cases/GetKitchenQueueUseCase'
import type { UpdateOrderStatusUseCase } from '@/modules/orders/application/use-cases/UpdateOrderStatusUseCase'
import { UnauthorizedError, ValidationError } from '@/shared/errors/AppError'
import { z } from 'zod'

const advanceSchema = z.object({
  status: z.enum(['in_production', 'ready']),
})

export class KitchenController {
  constructor(
    private readonly getKitchenQueueUseCase: GetKitchenQueueUseCase,
    private readonly updateStatusUseCase: UpdateOrderStatusUseCase
  ) {}

  queue: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const orders = await this.getKitchenQueueUseCase.execute(request.user.establishmentId)
    response.json(orders)
  }

  advance: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const parsed = advanceSchema.safeParse(request.body)
    if (!parsed.success) {
      throw new ValidationError('Validation failed', parsed.error.flatten().fieldErrors)
    }
    const order = await this.updateStatusUseCase.execute({
      orderId: request.params['id']!,
      establishmentId: request.user.establishmentId,
      newStatus: parsed.data.status,
    })
    response.json(order)
  }
}
