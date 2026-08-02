import type { TableRepository } from '../../domain/repositories/TableRepository'
import type { RestaurantTable } from '@/infra/database/schema'
import { NotFoundError } from '@/shared/errors/AppError'

export class UpdateTablePositionUseCase {
  constructor(private readonly tableRepository: TableRepository) {}

  async execute(
    id: string,
    establishmentId: string,
    positionX: number,
    positionY: number
  ): Promise<RestaurantTable> {
    const existing = await this.tableRepository.findById(id, establishmentId)
    if (!existing) throw new NotFoundError('Mesa')

    return this.tableRepository.updatePosition(id, establishmentId, positionX, positionY)
  }
}
