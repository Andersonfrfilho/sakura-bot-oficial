import { z } from 'zod'
import type { RouteHandler } from '@/infra/http/router'
import { UnauthorizedError, ValidationError } from '@/shared/errors/AppError'
import type { CreateStockMovementUseCase } from '@/modules/products/application/use-cases/CreateStockMovementUseCase'

const createStockMovementSchema = z.object({
  ingredientId: z.string().uuid(),
  movementType: z.enum(['adjustment', 'loss']),
  direction: z.enum(['increase', 'decrease']).optional(),
  quantity: z.number().positive(),
  reason: z.string().min(1).max(255),
})

export class StockMovementController {
  constructor(private readonly createStockMovementUseCase: CreateStockMovementUseCase) {}

  create: RouteHandler = async (request, response) => {
    if (!request.user) throw new UnauthorizedError()
    const { establishmentId, id: userId } = request.user

    const parsed = createStockMovementSchema.safeParse(request.body)
    if (!parsed.success) throw new ValidationError('Dados inválidos', parsed.error.flatten())

    if (parsed.data.movementType === 'adjustment' && !parsed.data.direction) {
      throw new ValidationError('direction é obrigatório para movementType adjustment')
    }

    const movement = await this.createStockMovementUseCase.execute({
      establishmentId,
      ingredientId: parsed.data.ingredientId,
      movementType: parsed.data.movementType,
      direction: parsed.data.direction ?? 'decrease',
      quantity: parsed.data.quantity,
      reason: parsed.data.reason,
      userId,
    })

    response.json(movement, 201)
  }
}
