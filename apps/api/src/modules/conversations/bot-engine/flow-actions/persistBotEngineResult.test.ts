/**
 * Copyright (c) 2026 Ada Technology. All rights reserved.
 *
 * This source code is proprietary and confidential. Unauthorized copying,
 * modification, distribution, or use of this file, via any medium, is
 * strictly prohibited without prior written permission from Ada Technology.
 *
 * Author: Anderson Filho <andersonfrfilho@gmail.com>
 */

import { describe, expect, mock, test } from 'bun:test';

import { BotEngineResultPersister } from './persistBotEngineResult.ts';
import type {
  BotEngineSessionRepositoryInterface,
  CreateReservationInput,
} from './BotEngineSessionRepository.ts';
import type { BotEngineResult, Cart } from '../shared/botEngine.types.ts';

const ESTABLISHMENT_ID = 'establishment-1';
const CUSTOMER_ID = 'customer-1';
const WHATSAPP_NUMBER = '5511999999999';

const EMPTY_CART: Cart = {
  items: [],
  order_type: '',
  address: '',
  delivery_fee: 0,
  payment_method: '',
  change_for: null,
  split_count: 0,
  split_current: 0,
  split_payments: [],
  mixed_method: '',
  mixed_label: '',
  mixed_amount: 0,
  address_street_temp: null,
  browse_category: '',
  pending_item_id: null,
  pending_item_name: '',
};

function buildResult(overrides: Partial<BotEngineResult> = {}): BotEngineResult {
  return {
    tel: WHATSAPP_NUMBER,
    instancia: ESTABLISHMENT_ID,
    respostas: [],
    state: 'idle',
    cart: EMPTY_CART,
    reservation_temp: {},
    save_order: false,
    order: null,
    save_reservation: false,
    reservation: null,
    save_customer_name: false,
    customer_name_to_save: null,
    save_marketing_opt_in: false,
    marketing_opt_in_value: null,
    kitchen_phone: '',
    request_human_handoff: false,
    handoff_customer_name: '',
    ...overrides,
  };
}

function buildSessionRepository(
  overrides: Partial<BotEngineSessionRepositoryInterface> = {}
): BotEngineSessionRepositoryInterface {
  return {
    getSession: mock(async () => undefined),
    upsertSession: mock(async () => undefined),
    getUpcomingReservations: mock(async () => []),
    createReservation: mock(async () => ({ code: 'RES-000' })),
    getMarketingOptIn: mock(async () => null),
    setMarketingOptIn: mock(async () => undefined),
    ...overrides,
  };
}

describe('BotEngineResultPersister', () => {
  test('sempre grava a sessão, mesmo sem pedido ou reserva', async () => {
    const sessionRepository = buildSessionRepository();
    const createOrderUseCase = { execute: mock(async (_input: Record<string, unknown>) => ({ id: 'order-1' })) };
    const persister = new BotEngineResultPersister(
      {} as never,
      sessionRepository,
      createOrderUseCase as never
    );

    await persister.persist({
      establishmentId: ESTABLISHMENT_ID,
      whatsappNumber: WHATSAPP_NUMBER,
      customerId: CUSTOMER_ID,
      result: buildResult({ state: 'awaiting_menu' }),
    });

    expect(sessionRepository.upsertSession).toHaveBeenCalledTimes(1);
    expect(createOrderUseCase.execute).not.toHaveBeenCalled();
    expect(sessionRepository.createReservation).not.toHaveBeenCalled();
  });

  test('persiste o pedido via CreateOrderUseCase quando save_order vem ligado', async () => {
    const sessionRepository = buildSessionRepository();
    const createOrderUseCase = { execute: mock(async (_input: Record<string, unknown>) => ({ id: 'order-1' })) };
    const persister = new BotEngineResultPersister(
      {} as never,
      sessionRepository,
      createOrderUseCase as never
    );

    const order: NonNullable<BotEngineResult['order']> = {
      tel: WHATSAPP_NUMBER,
      customer_name: 'Anderson',
      code: 'PED-001',
      items: [{ id: 'p1', name: 'Temaki Salmão', qty: 2, price: 30 }],
      subtotal: 60,
      delivery_fee: 0,
      total: 60,
      order_type: 'retirada',
      address: '',
      maps_link: '',
      payment_method: 'pix',
      change_for: null,
    };

    await persister.persist({
      establishmentId: ESTABLISHMENT_ID,
      whatsappNumber: WHATSAPP_NUMBER,
      customerId: CUSTOMER_ID,
      result: buildResult({ save_order: true, order }),
    });

    expect(createOrderUseCase.execute).toHaveBeenCalledTimes(1);
    const call = createOrderUseCase.execute.mock.calls[0]?.[0];
    expect(call?.establishmentId).toBe(ESTABLISHMENT_ID);
    expect(call?.customerId).toBe(CUSTOMER_ID);
    // `order_type` não bate com nenhum valor do enum ('retirada' não é 'delivery'/'pickup'/'table'),
    // então o mapeamento cai no default seguro 'pickup'.
    expect(call?.type).toBe('pickup');
    expect(call?.items).toEqual([
      { productId: 'p1', productName: 'Temaki Salmão', unitPrice: 30, quantity: 2 },
    ]);
  });

  test('persiste a reserva via sessionRepository quando save_reservation vem ligado', async () => {
    const createReservation = mock(async (_input: CreateReservationInput) => ({ code: 'RES-000' }));
    const sessionRepository = buildSessionRepository({ createReservation });
    const createOrderUseCase = { execute: mock(async (_input: Record<string, unknown>) => ({ id: 'order-1' })) };
    const persister = new BotEngineResultPersister(
      {} as never,
      sessionRepository,
      createOrderUseCase as never
    );

    await persister.persist({
      establishmentId: ESTABLISHMENT_ID,
      whatsappNumber: WHATSAPP_NUMBER,
      customerId: CUSTOMER_ID,
      result: buildResult({
        save_reservation: true,
        reservation: {
          tel: WHATSAPP_NUMBER,
          date: '2026-08-10',
          time: '20:00',
          party_size: 4,
          table_id: 'table-1',
        },
      }),
    });

    expect(createReservation).toHaveBeenCalledTimes(1);
    const call = createReservation.mock.calls[0]?.[0];
    expect(call).toEqual({
      customerId: CUSTOMER_ID,
      tableId: 'table-1',
      date: '2026-08-10',
      time: '20:00',
      partySize: 4,
    });
  });
});
