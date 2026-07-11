import { Worker, type ConnectionOptions } from 'bullmq'
import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'
import { queueConnection } from '@/infra/queue/redisConnection'
import { FISCAL_QUEUE, FISCAL_JOB, type FiscalEmitJobData } from '@/infra/queue/QueueNames.constant'
import { FiscalEmissionService } from '../FiscalEmissionService'

type Database = NodePgDatabase<typeof schema>

export function startFiscalWorker(params: { database: Database; websocketHub: WebSocketHub }): Worker {
  const { database, websocketHub } = params
  const service = new FiscalEmissionService(database, websocketHub)

  const worker = new Worker(
    FISCAL_QUEUE,
    async (job) => {
      if (job.name === FISCAL_JOB.EMIT) {
        await service.process(job.data as FiscalEmitJobData)
      }
    },
    { connection: queueConnection as unknown as ConnectionOptions, concurrency: 2 }
  )

  worker.on('failed', (job, err) => {
    console.error('[FiscalWorker] job failed', job?.id, err?.message)
    if (!job || job.name !== FISCAL_JOB.EMIT) return
    const attemptsExhausted = job.attemptsMade >= (job.opts.attempts ?? 1)
    if (!attemptsExhausted) return

    // Retries exhausted: leave the document as rejected so it stops looping and surfaces the error.
    const { fiscalDocumentId, establishmentId } = job.data as FiscalEmitJobData
    void markExhaustedAsRejected({ database, websocketHub, fiscalDocumentId, establishmentId, errorMessage: err?.message })
  })

  worker.on('error', (err) => console.error('[FiscalWorker] error', err.message))

  return worker
}

async function markExhaustedAsRejected(params: {
  database: Database
  websocketHub: WebSocketHub
  fiscalDocumentId: string
  establishmentId: string
  errorMessage: string | undefined
}): Promise<void> {
  const { database, websocketHub, fiscalDocumentId, establishmentId, errorMessage } = params
  const message = errorMessage ?? 'Emissão falhou após esgotar as tentativas'

  await database.update(schema.fiscalDocuments)
    .set({ status: 'rejected', errorCode: 'RETRIES_EXHAUSTED', errorMessage: message, updatedAt: new Date() })
    .where(eq(schema.fiscalDocuments.id, fiscalDocumentId))

  await websocketHub.publishBroadcast(establishmentId, WS_EVENTS.FISCAL_REJECTED, {
    fiscalDocumentId,
    errorCode: 'RETRIES_EXHAUSTED',
    errorMessage: message,
  })
}
