import { eq, and, inArray, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { FiscalConfiguration } from '@/infra/database/schema'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'
import { NotFoundError, UnprocessableError } from '@/shared/errors/AppError'
import {
  createFiscalProvider,
  type FiscalConfig,
  type FiscalItem,
  type FiscalPayment,
  type FiscalResult,
} from '@adatechnology/fiscal-provider'
import { decryptSensitiveConfig } from './FiscalConfigCrypto'

type Database = NodePgDatabase<typeof schema>

export class FiscalEmissionService {
  constructor(
    private readonly database: Database,
    private readonly websocketHub: WebSocketHub
  ) {}

  async process(params: { fiscalDocumentId: string; establishmentId: string }): Promise<void> {
    const { fiscalDocumentId, establishmentId } = params

    const document = await this.database.query.fiscalDocuments.findFirst({
      where: eq(schema.fiscalDocuments.id, fiscalDocumentId),
    })
    if (!document) throw new NotFoundError('FiscalDocument')

    if (document.status === 'authorized' || document.status === 'cancelled') {
      return
    }

    const fiscalConfig = await this.database.query.fiscalConfigurations.findFirst({
      where: eq(schema.fiscalConfigurations.establishmentId, establishmentId),
    })

    if (!fiscalConfig || fiscalConfig.model === 'none' || !fiscalConfig.active) {
      await this.database.update(schema.fiscalDocuments)
        .set({
          status: 'rejected',
          errorMessage: 'Fiscal configuration not active for this establishment',
          updatedAt: new Date(),
        })
        .where(eq(schema.fiscalDocuments.id, fiscalDocumentId))

      await this.websocketHub.publishBroadcast(establishmentId, WS_EVENTS.FISCAL_REJECTED, {
        fiscalDocumentId,
        errorCode: 'CONFIG_INACTIVE',
        errorMessage: 'Fiscal configuration not active for this establishment',
      })
      return
    }

    // Atomic claim: only the update that transitions pending -> emitting wins.
    // A duplicate/concurrent job finds status != 'pending' and returns without re-emitting.
    const [claimed] = await this.database.update(schema.fiscalDocuments)
      .set({
        status: 'emitting',
        lastAttemptAt: new Date(),
        attemptCount: sql`${schema.fiscalDocuments.attemptCount} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.fiscalDocuments.id, fiscalDocumentId), eq(schema.fiscalDocuments.status, 'pending')))
      .returning()
    if (!claimed) return

    const order = await this.database.query.orders.findFirst({
      where: eq(schema.orders.id, document.orderId),
    })
    if (!order) throw new NotFoundError('Order')

    const orderItems = await this.database.query.orderItems.findMany({
      where: eq(schema.orderItems.orderId, document.orderId),
    })

    const fiscalItems = await this.buildFiscalItems(orderItems)

    const fiscalPayments: FiscalPayment[] = [
      {
        method: 'pix' as const,
        amount: Number(order.totalAmount),
      },
    ]

    const providerConfig = this.buildProviderConfig(fiscalConfig)

    let result: FiscalResult

    try {
      const provider = createFiscalProvider(providerConfig)
      result = await provider.emit({
        referenceId: fiscalDocumentId,
        items: fiscalItems,
        payments: fiscalPayments,
        totalAmount: Number(order.totalAmount),
        discountAmount: 0,
        config: providerConfig,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unexpected error'

      // Transient failure (network/timeout): reset to 'pending' so the next BullMQ attempt
      // can re-claim it. Do NOT broadcast REJECTED here — it is still retrying, not rejected.
      await this.database.update(schema.fiscalDocuments)
        .set({
          status: 'pending',
          errorMessage,
          lastAttemptAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.fiscalDocuments.id, fiscalDocumentId))

      throw error
    }

    if (result.success) {
      await this.database.update(schema.fiscalDocuments)
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
        .where(eq(schema.fiscalDocuments.id, fiscalDocumentId))

      await this.websocketHub.publishBroadcast(establishmentId, WS_EVENTS.FISCAL_AUTHORIZED, {
        fiscalDocumentId,
        chaveAcesso: result.chaveAcesso,
        numeroDocumento: result.numeroDocumento,
      })
    } else {
      await this.database.update(schema.fiscalDocuments)
        .set({
          status: 'rejected',
          errorCode: result.errorCode ?? 'UNKNOWN',
          errorMessage: result.errorMessage ?? 'Rejected by SEFAZ',
          providerResponse: result.rawResponse as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(schema.fiscalDocuments.id, fiscalDocumentId))

      await this.websocketHub.publishBroadcast(establishmentId, WS_EVENTS.FISCAL_REJECTED, {
        fiscalDocumentId,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      })
    }
  }

  private async buildFiscalItems(
    orderItems: Array<{ productId: string | null; productName: string; unitPrice: string; quantity: number; totalPrice: string }>
  ): Promise<FiscalItem[]> {
    const productIds = orderItems
      .map((item) => item.productId)
      .filter((id): id is string => id !== null)

    const productCategory = new Map<string, string | null>()
    if (productIds.length > 0) {
      const products = await this.database.query.products.findMany({
        where: inArray(schema.products.id, productIds),
        columns: { id: true, categoryId: true },
      })
      for (const product of products) {
        productCategory.set(product.id, product.categoryId)
      }
    }

    const categoryIds = [...new Set(productCategory.values())].filter((id): id is string => id !== null)
    const categoryMap = new Map<string, typeof schema.categories.$inferSelect>()
    if (categoryIds.length > 0) {
      const categories = await this.database.query.categories.findMany({
        where: inArray(schema.categories.id, categoryIds),
      })
      for (const category of categories) {
        categoryMap.set(category.id, category)
      }
    }

    return orderItems.map((item, index) => {
      let ncm = '21069090'
      let cfop = '5102'
      let cst = '400'

      if (item.productId) {
        const categoryId = productCategory.get(item.productId)
        if (categoryId) {
          const category = categoryMap.get(categoryId)
          if (category) {
            if (category.ncmCode) ncm = category.ncmCode
            if (category.cfopCode) cfop = category.cfopCode
            if (category.cstIcms) cst = category.cstIcms
          }
        }
      }

      return {
        codigo: String(index + 1).padStart(3, '0'),
        descricao: item.productName,
        ncm,
        cfop,
        cst,
        unidade: 'UN',
        quantidade: item.quantity,
        valorUnitario: Number(item.unitPrice),
        valorTotal: Number(item.totalPrice),
      }
    })
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
