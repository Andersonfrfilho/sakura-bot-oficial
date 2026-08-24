/**
 * Copyright (c) 2026 Ada Technology. All rights reserved.
 *
 * This source code is proprietary and confidential. Unauthorized copying,
 * modification, distribution, or use of this file, via any medium, is
 * strictly prohibited without prior written permission from Ada Technology.
 *
 * Author: Anderson Filho <andersonfrfilho@gmail.com>
 *
 * Monta `BotEngineData` a partir do Postgres para uma mensagem inbound — o equivalente aos nós de
 * leitura ("Buscar Estabelecimento", "Buscar Sessão" etc.) que hoje vivem no workflow n8n. Reaproveita
 * `BotConfigRepository` (payment_types/order_types/delivery_fee_rule) e `FindOrCreateCustomerUseCase`
 * em vez de duplicar as queries.
 */

import { and, desc, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { BotConfigRepository } from '@/infra/database/BotConfigRepository'
import type { FindOrCreateCustomerUseCase } from '@/modules/customers/application/use-cases/FindOrCreateCustomerUseCase'
import type {
  BotEngineData,
  DeliveryFeeRule,
  EstablishmentConfig,
  OrderType,
  PaymentType,
  Product,
  RecentOrder,
  RestaurantTable,
} from '../shared/botEngine.types'
import type { BotEngineSessionRepositoryInterface } from './BotEngineSessionRepository'

type Database = NodePgDatabase<typeof schema>

const RECENT_ORDERS_LIMIT = 5

export interface LoadBotEngineDataParams {
  readonly establishmentId: string
  readonly whatsappNumber: string
}

export interface LoadedBotEngineData {
  readonly data: BotEngineData
  readonly customerId: string
}

export interface BotEngineDataLoaderInterface {
  load(params: LoadBotEngineDataParams): Promise<LoadedBotEngineData>
}

export class DrizzleBotEngineDataLoader implements BotEngineDataLoaderInterface {
  constructor(
    private readonly db: Database,
    private readonly botConfigRepository: BotConfigRepository,
    private readonly sessionRepository: BotEngineSessionRepositoryInterface,
    private readonly findOrCreateCustomerUseCase: FindOrCreateCustomerUseCase
  ) {}

  async load(params: LoadBotEngineDataParams): Promise<LoadedBotEngineData> {
    const { establishmentId, whatsappNumber } = params

    const establishmentRow = await this.db.query.establishments.findFirst({
      where: eq(schema.establishments.id, establishmentId),
    })

    const customer = await this.findOrCreateCustomerUseCase.execute({ establishmentId, whatsappNumber })

    const [productRows, tableRows, session, paymentTypeRows, orderTypeRows, deliveryFeeRuleRow, upcomingReservations, marketingOptIn, recentOrderRows] =
      await Promise.all([
        this.db.query.products.findMany({
          where: and(eq(schema.products.establishmentId, establishmentId), eq(schema.products.active, true)),
          with: { catalog: true },
        }),
        this.db.query.restaurantTables.findMany({
          where: eq(schema.restaurantTables.establishmentId, establishmentId),
        }),
        this.sessionRepository.getSession(whatsappNumber),
        this.botConfigRepository.listActivePaymentTypes(),
        this.botConfigRepository.listActiveOrderTypes(),
        this.botConfigRepository.getActiveDeliveryFeeRule(),
        this.sessionRepository.getUpcomingReservations(customer.id),
        this.sessionRepository.getMarketingOptIn(customer.id),
        this.db.query.orders.findMany({
          where: and(eq(schema.orders.establishmentId, establishmentId), eq(schema.orders.customerId, customer.id)),
          orderBy: desc(schema.orders.receivedAt),
          limit: RECENT_ORDERS_LIMIT,
          with: { items: true },
        }),
      ])

    const establishment: EstablishmentConfig = establishmentRow
      ? {
          id: establishmentRow.id,
          name: establishmentRow.name,
          // `exactOptionalPropertyTypes` rejeita `undefined` explícito — omite a chave em vez de
          // atribuir `?? undefined`.
          ...(establishmentRow.whatsappNumber !== null
            ? { whatsapp_number: establishmentRow.whatsappNumber }
            : {}),
          ...((establishmentRow.settings ?? {}) as Partial<EstablishmentConfig>),
        }
      : {}

    const products: Product[] = productRows.map((row) => ({
      id: row.id,
      name: row.name,
      price: Number(row.price),
      category: row.catalog?.name ?? '',
      ...(row.description !== null ? { description: row.description } : {}),
    }))

    const restaurantTables: RestaurantTable[] = tableRows.map((row) => ({
      id: row.id,
      number: row.number,
      capacity: row.capacity,
    }))

    const paymentTypes: PaymentType[] = paymentTypeRows.map((row) => ({ name: row.name, label: row.label }))
    const orderTypes: OrderType[] = orderTypeRows.map((row) => ({ name: row.name, label: row.label, active: true }))

    const deliveryFeeRule: DeliveryFeeRule | undefined = deliveryFeeRuleRow
      ? {
          mode: deliveryFeeRuleRow.mode,
          base_fee: deliveryFeeRuleRow.baseFee,
          per_km_rate: deliveryFeeRuleRow.perKmRate,
          per_min_rate: deliveryFeeRuleRow.perMinRate,
          free_above: deliveryFeeRuleRow.freeAbove,
          max_radius_km: deliveryFeeRuleRow.maxRadiusKm,
          zones: deliveryFeeRuleRow.zones.map((zone) => ({
            type: zone.zoneType,
            min: zone.minValue,
            max: zone.maxValue,
            fee: zone.fee,
          })),
        }
      : undefined

    const recentOrders: RecentOrder[] = recentOrderRows.map((order) => ({
      // `code` legível ainda não existe no schema novo (ver docs/PONTOS_DE_ATENCAO.md) — o id
      // supre até a coluna existir.
      code: order.id,
      status: order.status,
      order_type: order.type,
      total: Number(order.totalAmount),
      created_at: order.receivedAt.toISOString(),
      items_count: order.items.length,
    }))
    const lastOrder = recentOrders[0]
      ? {
          code: recentOrders[0].code,
          items: recentOrderRows[0]!.items.map((item) => ({
            id: item.productId ?? item.id,
            name: item.productName,
            qty: item.quantity,
            price: Number(item.unitPrice),
          })),
          total: recentOrders[0].total,
          status: recentOrders[0].status,
        }
      : null

    return {
      customerId: customer.id,
      data: {
        establishment,
        config: {},
        products,
        recent_orders: recentOrders,
        ...(session !== undefined ? { session } : {}),
        last_order: lastOrder,
        payment_types: paymentTypes,
        order_types: orderTypes,
        customer_name: customer.name,
        marketing_opt_in: marketingOptIn,
        ...(deliveryFeeRule !== undefined ? { delivery_fee_rule: deliveryFeeRule } : {}),
        restaurant_tables: restaurantTables,
        upcoming_reservations: upcomingReservations,
      },
    }
  }
}
