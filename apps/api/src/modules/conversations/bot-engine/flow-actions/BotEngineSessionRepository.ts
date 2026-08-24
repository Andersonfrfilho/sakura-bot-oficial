/**
 * Copyright (c) 2026 Ada Technology. All rights reserved.
 *
 * This source code is proprietary and confidential. Unauthorized copying,
 * modification, distribution, or use of this file, via any medium, is
 * strictly prohibited without prior written permission from Ada Technology.
 *
 * Author: Anderson Filho <andersonfrfilho@gmail.com>
 *
 * Acesso a `sessions` e `reservations` — tabelas do schema legado (`database/schema.sql`) que
 * ainda não foram portadas para o Drizzle (mesmo padrão de `BotConfigRepository` para
 * `payment_types`/`order_types`/`bot_settings`: SQL manual parametrizado, motivo documentado aqui).
 */

import { randomUUID } from 'crypto'
import { sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '@/infra/database/schema'
import type { Cart, ReservationTemp, SessionRaw, UpcomingReservation } from '../shared/botEngine.types'

type Database = NodePgDatabase<typeof schema>

type SessionRow = {
  state: string | null
  cart: Cart | null
  reservation_temp: ReservationTemp | null
  last_activity_at: string | null
}

export interface CreateReservationInput {
  readonly customerId: string
  readonly tableId: string
  readonly date: string
  readonly time: string
  readonly partySize: number
}

export interface BotEngineSessionRepositoryInterface {
  getSession(whatsappNumber: string): Promise<SessionRaw | undefined>
  upsertSession(whatsappNumber: string, session: SessionRaw): Promise<void>
  getUpcomingReservations(customerId: string): Promise<UpcomingReservation[]>
  createReservation(input: CreateReservationInput): Promise<{ code: string }>
  getMarketingOptIn(customerId: string): Promise<boolean | null>
  setMarketingOptIn(customerId: string, value: boolean): Promise<void>
}

/** `RES-<10 chars>` — a coluna é `unique`, e um prefixo curto continua legível para o balcão. */
function buildReservationCode(): string {
  return `RES-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`
}

export class DrizzleBotEngineSessionRepository implements BotEngineSessionRepositoryInterface {
  constructor(private readonly db: Database) {}

  async getSession(whatsappNumber: string): Promise<SessionRaw | undefined> {
    const result = await this.db.execute(sql`
      SELECT state, cart, reservation_temp, last_activity_at
      FROM sessions
      WHERE phone = ${whatsappNumber} AND deleted_at IS NULL
    `)
    const row = result.rows[0] as SessionRow | undefined
    if (!row) return undefined

    return {
      // `exactOptionalPropertyTypes` rejeita `undefined` explícito em campo opcional — a chave
      // precisa ficar ausente, não presente com valor `undefined`.
      ...(row.state !== null ? { state: row.state } : {}),
      ...(row.cart !== null ? { cart: row.cart } : {}),
      ...(row.reservation_temp !== null ? { reservation_temp: row.reservation_temp } : {}),
      ...(row.last_activity_at !== null ? { last_activity_at: row.last_activity_at } : {}),
    }
  }

  async upsertSession(whatsappNumber: string, session: SessionRaw): Promise<void> {
    await this.db.execute(sql`
      INSERT INTO sessions (phone, state, cart, reservation_temp, last_activity_at)
      VALUES (
        ${whatsappNumber},
        ${session.state ?? 'start'},
        ${JSON.stringify(session.cart ?? {})}::jsonb,
        ${JSON.stringify(session.reservation_temp ?? {})}::jsonb,
        now()
      )
      ON CONFLICT (phone) DO UPDATE SET
        state = EXCLUDED.state,
        cart = EXCLUDED.cart,
        reservation_temp = EXCLUDED.reservation_temp,
        last_activity_at = EXCLUDED.last_activity_at,
        updated_at = now()
    `)
  }

  async getUpcomingReservations(customerId: string): Promise<UpcomingReservation[]> {
    const result = await this.db.execute(sql`
      SELECT date::text AS date, time::text AS time, table_id AS "tableId"
      FROM reservations
      WHERE customer_id = ${customerId}
        AND status NOT IN ('cancelled', 'completed')
        AND deleted_at IS NULL
        AND date >= CURRENT_DATE
      ORDER BY date, time
    `)
    return (result.rows as { date: string; time: string; tableId: string | null }[]).map((row) => ({
      date: row.date,
      time: row.time,
      table_id: row.tableId ?? '',
    }))
  }

  async createReservation(input: CreateReservationInput): Promise<{ code: string }> {
    const code = buildReservationCode()
    await this.db.execute(sql`
      INSERT INTO reservations (code, customer_id, table_id, date, time, party_size, status)
      VALUES (${code}, ${input.customerId}, ${input.tableId}, ${input.date}, ${input.time}, ${input.partySize}, 'pending')
    `)
    return { code }
  }

  /**
   * `customers.marketing_opt_in` existe no banco mas ainda não está no schema Drizzle
   * (`apps/api/src/infra/database/schema/customers.ts`) — SQL parametrizado até a migration ser
   * portada, seguindo o mesmo padrão de `BotConfigRepository`.
   */
  async getMarketingOptIn(customerId: string): Promise<boolean | null> {
    const result = await this.db.execute(sql`
      SELECT marketing_opt_in AS "marketingOptIn" FROM customers WHERE id = ${customerId}
    `)
    const row = result.rows[0] as { marketingOptIn: boolean | null } | undefined
    return row?.marketingOptIn ?? null
  }

  async setMarketingOptIn(customerId: string, value: boolean): Promise<void> {
    await this.db.execute(sql`
      UPDATE customers SET marketing_opt_in = ${value}, updated_at = now() WHERE id = ${customerId}
    `)
  }
}
