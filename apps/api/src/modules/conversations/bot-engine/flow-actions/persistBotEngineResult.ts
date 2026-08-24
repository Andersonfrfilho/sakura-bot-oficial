/**
 * Copyright (c) 2026 Ada Technology. All rights reserved.
 *
 * This source code is proprietary and confidential. Unauthorized copying,
 * modification, distribution, or use of this file, via any medium, is
 * strictly prohibited without prior written permission from Ada Technology.
 *
 * Author: Anderson Filho <andersonfrfilho@gmail.com>
 *
 * Aplica as flags de `BotEngineResult` no Postgres: sessão sempre, pedido/reserva/nome/opt-in só
 * quando a flag correspondente vier ligada. Reaproveita `CreateOrderUseCase` (mesmo caminho usado
 * pelo painel) em vez de duplicar o INSERT de pedido.
 */

import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { CreateOrderUseCase } from '@/modules/orders/application/use-cases/CreateOrderUseCase'
import type { OrderType } from '@/shared/types'
import type { BotEngineResult } from '../shared/botEngine.types'
import type { BotEngineSessionRepositoryInterface } from './BotEngineSessionRepository'

type Database = NodePgDatabase<typeof schema>

const ORDER_TYPE_VALUES: readonly OrderType[] = ['delivery', 'pickup', 'table']

function toOrderType(value: string): OrderType {
  const match = ORDER_TYPE_VALUES.find((orderType) => orderType === value)
  return match ?? 'pickup'
}

export interface PersistBotEngineResultParams {
  readonly establishmentId: string
  readonly whatsappNumber: string
  readonly customerId: string
  readonly result: BotEngineResult
}

export interface BotEngineResultPersisterInterface {
  persist(params: PersistBotEngineResultParams): Promise<void>
}

export class BotEngineResultPersister implements BotEngineResultPersisterInterface {
  constructor(
    private readonly db: Database,
    private readonly sessionRepository: BotEngineSessionRepositoryInterface,
    private readonly createOrderUseCase: CreateOrderUseCase
  ) {}

  async persist(params: PersistBotEngineResultParams): Promise<void> {
    const { establishmentId, whatsappNumber, customerId, result } = params

    await this.sessionRepository.upsertSession(whatsappNumber, {
      state: result.state,
      cart: result.cart,
      reservation_temp: result.reservation_temp,
    })

    if (result.save_order && result.order) {
      await this.persistOrder(establishmentId, customerId, result.order)
    }

    if (result.save_reservation && result.reservation) {
      await this.sessionRepository.createReservation({
        customerId,
        tableId: result.reservation.table_id,
        date: result.reservation.date,
        time: result.reservation.time,
        partySize: result.reservation.party_size,
      })
    }

    if (result.save_customer_name && result.customer_name_to_save) {
      await this.db
        .update(schema.customers)
        .set({ name: result.customer_name_to_save })
        .where(eq(schema.customers.id, customerId))
    }

    if (result.save_marketing_opt_in && result.marketing_opt_in_value !== null) {
      await this.sessionRepository.setMarketingOptIn(customerId, result.marketing_opt_in_value)
    }
  }

  private async persistOrder(
    establishmentId: string,
    customerId: string,
    order: NonNullable<BotEngineResult['order']>
  ): Promise<void> {
    await this.createOrderUseCase.execute({
      establishmentId,
      customerId,
      channel: 'whatsapp',
      type: toOrderType(order.order_type),
      items: order.items.map((item) => ({
        productId: item.id,
        productName: item.name,
        unitPrice: item.price,
        quantity: item.qty,
      })),
      ...(order.payment_method
        ? {
            payments: [
              {
                paymentTypeName: order.payment_method,
                amount: order.total,
                ...(order.change_for !== null ? { changeFor: order.change_for } : {}),
              },
            ],
          }
        : {}),
      ...(order.order_type === 'delivery' && order.address ? { delivery: { address: order.address } } : {}),
    })
  }
}
