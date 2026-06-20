import { eq, and } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { NotFoundError } from '@/shared/errors/AppError'
import { MessagesConstants } from '@/shared/constants/MessagesConstants'
import type { CashMovementType, PaymentMethod } from '@/shared/types'

type Database = NodePgDatabase<typeof schema>

interface AddMovementInput {
  establishmentId: string
  type: CashMovementType
  paymentMethod?: PaymentMethod
  amount: number
  orderId?: string
  notes?: string
}

export class AddCashMovementUseCase {
  constructor(private readonly db: Database) {}

  async execute(input: AddMovementInput) {
    const openRegister = await this.db.query.cashRegisters.findFirst({
      where: and(
        eq(schema.cashRegisters.establishmentId, input.establishmentId),
        eq(schema.cashRegisters.status, 'open')
      ),
    })

    if (!openRegister) {
      throw new NotFoundError(MessagesConstants.cashRegister.notOpen)
    }

    const [movement] = await this.db
      .insert(schema.cashMovements)
      .values({
        cashRegisterId: openRegister.id,
        orderId: input.orderId ?? null,
        type: input.type,
        paymentMethod: input.paymentMethod ?? null,
        amount: input.amount.toFixed(2),
        notes: input.notes ?? null,
      })
      .returning()

    return movement!
  }
}
