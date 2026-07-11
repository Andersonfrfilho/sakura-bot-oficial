import { eq, and, lt, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { FiscalConfiguration } from '@/infra/database/schema'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'
import { NotFoundError, UnprocessableError } from '@/shared/errors/AppError'
import {
  createFiscalProvider,
  type FiscalProvider,
  type FiscalConfig,
  type FiscalItem,
  type FiscalPayment,
  type FiscalResult,
} from '@adatechnology/fiscal-provider'
import { decryptSensitiveConfig } from '../FiscalConfigCrypto'

type Database = NodePgDatabase<typeof schema>

const MAX_RETRY_ATTEMPTS = 5

export class RetryFiscalDocumentUseCase {
  constructor(
    private readonly database: Database,
    private readonly websocketHub: WebSocketHub
  ) {}

  async retrySingle(fiscalDocumentId: string, establishmentId: string): Promise<schema.FiscalDocument> {
    const document = await this.database.query.fiscalDocuments.findFirst({
      where: and(
        eq(schema.fiscalDocuments.id, fiscalDocumentId),
        eq(schema.fiscalDocuments.establishmentId, establishmentId)
      ),
    })
    if (!document) throw new NotFoundError('Fiscal document')

    if (document.status !== 'rejected') {
      throw new UnprocessableError('Only rejected documents can be retried')
    }

    if (document.attemptCount >= MAX_RETRY_ATTEMPTS) {
      throw new UnprocessableError(`Max retry attempts (${MAX_RETRY_ATTEMPTS}) exceeded`)
    }

    const fiscalConfig = await this.database.query.fiscalConfigurations.findFirst({
      where: eq(schema.fiscalConfigurations.establishmentId, establishmentId),
    })
    if (!fiscalConfig || fiscalConfig.model === 'none' || !fiscalConfig.active) {
      throw new UnprocessableError('Fiscal configuration not active')
    }

    return this.retryDocument(document, fiscalConfig)
  }

  async retryAllPending(): Promise<{ retried: number; failed: number }> {
    const documents = await this.database.query.fiscalDocuments.findMany({
      where: and(
        eq(schema.fiscalDocuments.status, 'rejected'),
        lt(schema.fiscalDocuments.attemptCount, MAX_RETRY_ATTEMPTS)
      ),
      limit: 20,
    })

    if (documents.length === 0) return { retried: 0, failed: 0 }

    const configCache = new Map<string, FiscalConfiguration>()
    let retried = 0
    let failed = 0

    for (const document of documents) {
      try {
        let fiscalConfig = configCache.get(document.establishmentId)
        if (!fiscalConfig) {
          fiscalConfig = await this.database.query.fiscalConfigurations.findFirst({
            where: eq(schema.fiscalConfigurations.establishmentId, document.establishmentId),
          })
          if (fiscalConfig) configCache.set(document.establishmentId, fiscalConfig)
        }

        if (!fiscalConfig || fiscalConfig.model === 'none' || !fiscalConfig.active) continue

        await this.retryDocument(document, fiscalConfig)
        retried++
      } catch {
        failed++
      }
    }

    return { retried, failed }
  }

  private async retryDocument(
    document: schema.FiscalDocument,
    fiscalConfig: FiscalConfiguration
  ): Promise<schema.FiscalDocument> {
    // Mark as emitting
    await this.database.update(schema.fiscalDocuments)
      .set({
        status: 'emitting',
        attemptCount: document.attemptCount + 1,
        lastAttemptAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.fiscalDocuments.id, document.id))

    await this.websocketHub.publishBroadcast(
      document.establishmentId,
      WS_EVENTS.FISCAL_EMITTING,
      { fiscalDocumentId: document.id, orderId: document.orderId, retry: true }
    )

    // Rebuild provider config and re-emit
    const providerConfig = this.buildProviderConfig(fiscalConfig)
    const provider: FiscalProvider = createFiscalProvider(providerConfig)

    const orderItems = await this.database.query.orderItems.findMany({
      where: eq(schema.orderItems.orderId, document.orderId),
    })

    const fiscalItems: FiscalItem[] = orderItems.map((item, index) => ({
      codigo: String(index + 1).padStart(3, '0'),
      descricao: item.productName,
      ncm: '21069090',
      cfop: '5102',
      cst: '400',
      unidade: 'UN',
      quantidade: item.quantity,
      valorUnitario: Number(item.unitPrice),
      valorTotal: Number(item.totalPrice),
    }))

    const fiscalPayments: FiscalPayment[] = [{
      method: 'pix' as const,
      amount: Number(document.totalLiquido ?? document.totalBruto ?? 0),
    }]

    let result: FiscalResult
    try {
      result = await provider.emit({
        referenceId: document.id,
        items: fiscalItems,
        payments: fiscalPayments,
        totalAmount: Number(document.totalBruto ?? 0),
        discountAmount: Number(document.totalDesconto ?? 0),
        config: providerConfig,
      })
    } catch (error) {
      const errorCode = error instanceof Error ? error.name : 'UNKNOWN'
      const errorMessage = error instanceof Error ? error.message : 'Unexpected error'

      const [updated] = await this.database.update(schema.fiscalDocuments)
        .set({
          status: 'rejected',
          errorCode,
          errorMessage,
          updatedAt: new Date(),
        })
        .where(eq(schema.fiscalDocuments.id, document.id))
        .returning()

      await this.websocketHub.publishBroadcast(document.establishmentId, WS_EVENTS.FISCAL_REJECTED, {
        fiscalDocumentId: document.id,
        errorCode,
        errorMessage,
      })

      return updated!
    }

    if (result.success) {
      const [updated] = await this.database.update(schema.fiscalDocuments)
        .set({
          status: 'authorized',
          chaveAcesso: result.chaveAcesso ?? null,
          protocolo: result.protocolo ?? null,
          numeroDocumento: result.numeroDocumento ?? null,
          serie: result.serie ?? null,
          xmlAutorizado: result.xmlAutorizado ?? null,
          qrCodeUrl: result.qrCodeUrl ?? null,
          danfePdfUrl: result.danfePdfUrl ?? null,
          providerResponse: result.rawResponse as Record<string, unknown>,
          authorizedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.fiscalDocuments.id, document.id))
        .returning()

      await this.websocketHub.publishBroadcast(document.establishmentId, WS_EVENTS.FISCAL_AUTHORIZED, {
        fiscalDocumentId: document.id,
        chaveAcesso: result.chaveAcesso,
        numeroDocumento: result.numeroDocumento,
      })

      return updated!
    }

    const [updated] = await this.database.update(schema.fiscalDocuments)
      .set({
        status: 'rejected',
        errorCode: result.errorCode ?? 'UNKNOWN',
        errorMessage: result.errorMessage ?? 'Rejected by SEFAZ',
        providerResponse: result.rawResponse as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(schema.fiscalDocuments.id, document.id))
      .returning()

    await this.websocketHub.publishBroadcast(document.establishmentId, WS_EVENTS.FISCAL_REJECTED, {
      fiscalDocumentId: document.id,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    })

    return updated!
  }

  private buildProviderConfig(config: FiscalConfiguration): FiscalConfig {
    const base = {
      model: config.model as 'nfce' | 'nfe' | 'sat',
      environment: config.environment as 'homologacao' | 'producao',
      cnpj: config.cnpj ?? '',
      inscricaoEstadual: config.inscricaoEstadual ?? '',
      razaoSocial: config.razaoSocial ?? '',
      uf: config.uf ?? '',
      municipio: config.municipio ?? '',
      cep: config.cep ?? '',
      logradouro: config.logradouro ?? '',
      numero: config.numero ?? '',
      bairro: config.bairro ?? '',
      complemento: config.complemento ?? undefined,
      crt: (config.crt ?? '1') as '1' | '2' | '3',
    }

    const providerConfig = decryptSensitiveConfig((config.providerConfig ?? {}) as Record<string, unknown>)

    if (config.model === 'nfce' || config.model === 'nfe') {
      return {
        ...base,
        certificadoBase64: String(providerConfig['certificadoBase64'] ?? ''),
        certificadoSenha: String(providerConfig['certificadoSenha'] ?? ''),
        serie: String(providerConfig['serie'] ?? '1'),
        numeroNf: Number(providerConfig['numeroNf'] ?? 1),
        codigoMunicipio: String(providerConfig['codigoMunicipio'] ?? ''),
        cscId: String(providerConfig['cscId'] ?? ''),
        cscToken: String(providerConfig['cscToken'] ?? ''),
      } as FiscalConfig
    }

    if (config.model === 'sat') {
      return {
        ...base,
        satUrl: String(providerConfig['satUrl'] ?? ''),
        activationCode: String(providerConfig['activationCode'] ?? ''),
        signatureAC: String(providerConfig['signatureAC'] ?? ''),
      } as FiscalConfig
    }

    throw new UnprocessableError(`Unsupported fiscal model: ${config.model}`)
  }
}
