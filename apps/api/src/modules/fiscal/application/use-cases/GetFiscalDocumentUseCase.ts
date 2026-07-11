import { eq, and, desc } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import { NotFoundError } from '@/shared/errors/AppError'

type Database = NodePgDatabase<typeof schema>

export class GetFiscalDocumentUseCase {
  constructor(private readonly db: Database) {}

  async execute(input: { orderId: string; establishmentId: string }) {
    const doc = await this.db.query.fiscalDocuments.findFirst({
      where: and(
        eq(schema.fiscalDocuments.orderId, input.orderId),
        eq(schema.fiscalDocuments.establishmentId, input.establishmentId)
      ),
    })
    if (!doc) throw new NotFoundError('Fiscal document')

    return doc
  }

  async findById(id: string, establishmentId: string) {
    const doc = await this.db.query.fiscalDocuments.findFirst({
      where: and(
        eq(schema.fiscalDocuments.id, id),
        eq(schema.fiscalDocuments.establishmentId, establishmentId)
      ),
    })
    if (!doc) throw new NotFoundError('Fiscal document')

    return doc
  }

  async listByEstablishment(establishmentId: string, limit = 50) {
    return this.db.query.fiscalDocuments.findMany({
      where: eq(schema.fiscalDocuments.establishmentId, establishmentId),
      orderBy: desc(schema.fiscalDocuments.createdAt),
      limit,
    })
  }
}
