import { eq, and } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { FiscalDocument } from '@/infra/database/schema'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'
import { NotFoundError, ConflictError, UnprocessableError } from '@/shared/errors/AppError'
import { fiscalQueue } from '@/infra/queue/fiscalQueue'
import { FISCAL_JOB } from '@/infra/queue/QueueNames.constant'

type Database = NodePgDatabase<typeof schema>

export class EmitFiscalDocumentUseCase {
  constructor(
    private readonly database: Database,
    private readonly websocketHub: WebSocketHub
  ) {}

  async execute(params: { orderId: string; establishmentId: string }): Promise<FiscalDocument> {
    const { orderId, establishmentId } = params

    const order = await this.database.query.orders.findFirst({
      where: and(
        eq(schema.orders.id, orderId),
        eq(schema.orders.establishmentId, establishmentId)
      ),
    })
    if (!order) throw new NotFoundError('Order')
    if (order.status !== 'completed') {
      throw new UnprocessableError('Order must be completed to emit fiscal document')
    }

    const existingDocument = await this.database.query.fiscalDocuments.findFirst({
      where: eq(schema.fiscalDocuments.orderId, orderId),
    })
    if (existingDocument) throw new ConflictError('Fiscal document already exists for this order')

    const fiscalConfig = await this.database.query.fiscalConfigurations.findFirst({
      where: eq(schema.fiscalConfigurations.establishmentId, establishmentId),
    })
    if (!fiscalConfig || fiscalConfig.model === 'none' || !fiscalConfig.active) {
      throw new UnprocessableError('Fiscal configuration not active for this establishment')
    }

    const [document] = await this.database.insert(schema.fiscalDocuments).values({
      establishmentId,
      orderId,
      model: fiscalConfig.model as FiscalDocument['model'],
      status: 'pending',
      totalBruto: order.totalAmount,
      totalLiquido: order.totalAmount,
      totalDesconto: '0',
      attemptCount: 0,
    }).returning()

    if (!document) throw new ConflictError('Failed to create fiscal document')

    await this.websocketHub.publishBroadcast(establishmentId, WS_EVENTS.FISCAL_EMITTING, {
      fiscalDocumentId: document.id,
      orderId,
    })

    await fiscalQueue.add(FISCAL_JOB.EMIT, { fiscalDocumentId: document.id, establishmentId })

    return document
  }
}
