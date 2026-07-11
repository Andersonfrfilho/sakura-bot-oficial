import { eq, and, inArray } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { FiscalConfiguration, FiscalDocument } from '@/infra/database/schema'
import type { WebSocketHub } from '@/infra/websocket/WebSocketHub'
import { WS_EVENTS } from '@/infra/websocket/WebSocketEvents'
import { NotFoundError, ConflictError, UnprocessableError } from '@/shared/errors/AppError'
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

    const orderItems = await this.database.query.orderItems.findMany({
      where: eq(schema.orderItems.orderId, orderId),
    })

    const fiscalItems = await this.buildFiscalItems(orderItems)

    const fiscalPayments: FiscalPayment[] = [
      {
        method: 'pix' as const,
        amount: Number(order.totalAmount),
      },
    ]

    const providerConfig = this.buildProviderConfig(fiscalConfig)

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

    this.processEmission(document.id, establishmentId, providerConfig, fiscalItems, fiscalPayments, order.totalAmount)

    return document
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

  private async processEmission(
    fiscalDocumentId: string,
    establishmentId: string,
    providerConfig: FiscalConfig,
    items: FiscalItem[],
    payments: FiscalPayment[],
    totalAmount: string
  ): Promise<void> {
    let result: FiscalResult

    try {
      const provider: FiscalProvider = createFiscalProvider(providerConfig)
      result = await provider.emit({
        referenceId: fiscalDocumentId,
        items,
        payments,
        totalAmount: Number(totalAmount),
        discountAmount: 0,
        config: providerConfig,
      })
    } catch (error) {
      const errorCode = error instanceof Error ? error.name : 'UNKNOWN'
      const errorMessage = error instanceof Error ? error.message : 'Unexpected error'

      await this.database.update(schema.fiscalDocuments)
        .set({
          status: 'rejected',
          errorCode,
          errorMessage,
          lastAttemptAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.fiscalDocuments.id, fiscalDocumentId))

      await this.websocketHub.publishBroadcast(establishmentId, WS_EVENTS.FISCAL_REJECTED, {
        fiscalDocumentId,
        errorCode,
        errorMessage,
      })
      return
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
