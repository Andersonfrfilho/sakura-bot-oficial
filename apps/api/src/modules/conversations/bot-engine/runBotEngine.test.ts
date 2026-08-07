import { describe, expect, test } from 'bun:test';

import { runBotEngine, type RunBotEngineParams } from './runBotEngine.ts';
import { BotState } from './shared/botEngine.constant.ts';
import type {
  BotEngineData,
  Cart,
  CartItem,
  BotEngineResult,
} from './shared/botEngine.types.ts';
import type { CepProvider } from './providers/contracts/CepProvider.ts';
import type { GeocodingProvider } from './providers/contracts/GeocodingProvider.ts';
import type { RoutingProvider } from './providers/contracts/RoutingProvider.ts';

const PRODUCTS = [
  { id: 'p1', name: 'Temaki Salmão', price: 30, category: 'Temakis', description: 'Fresco' },
  { id: 'p2', name: 'Uramaki Filadélfia', price: 20, category: 'Uramakis' },
];

const PAYMENT_TYPES = [
  { name: 'dinheiro', label: 'Dinheiro' },
  { name: 'pix', label: 'Pix', config: { chave: 'chave-pix', nome: 'Sakura' } },
  { name: 'credito', label: 'Cartão de Crédito' },
];

const ORDER_TYPES = [
  { name: 'delivery', label: 'Delivery' },
  { name: 'retirada', label: 'Retirada' },
];

function buildCart(overrides: Partial<Cart> = {}): Partial<Cart> {
  const items: CartItem[] = [{ id: 'p1', name: 'Temaki Salmão', qty: 2, price: 30, menuIdx: 1 }];
  return { items, order_type: 'retirada', delivery_fee: 0, split_count: 0, split_current: 0, ...overrides };
}

const noopCepProvider: CepProvider = { lookup: async () => null };
const noopGeocodingProvider: GeocodingProvider = { search: async () => null, reverse: async () => null };
const noopRoutingProvider: RoutingProvider = { route: async () => null };

function buildParams(texto: string, state: string, data: BotEngineData = {}): RunBotEngineParams {
  return {
    message: {
      tel: '5511999999999',
      instancia: 'sakura',
      texto,
      horaAtual: '19:00',
      diaSemana: 'sex',
      push_name: 'Anderson',
    },
    data: {
      establishment: { name: 'Sakura', ignore_hours: true, city: 'São Paulo' },
      products: PRODUCTS,
      payment_types: PAYMENT_TYPES,
      order_types: ORDER_TYPES,
      marketing_opt_in: true,
      customer_name: 'Anderson',
      ...data,
      session: { state, ...(data.session ?? {}) },
    },
    providers: {
      cepProvider: noopCepProvider,
      geocodingProvider: noopGeocodingProvider,
      routingProvider: noopRoutingProvider,
    },
  };
}

function textOf(result: BotEngineResult): string {
  return result.respostas
    .map((resposta) => {
      if (typeof resposta === 'string') return resposta;
      return 'body' in resposta ? resposta.body : '';
    })
    .join('\n');
}

describe('PaymentHandler', () => {
  test('pix fecha o pedido com chave, total e código', async () => {
    const result = await runBotEngine(buildParams('2', BotState.AWAITING_PAYMENT, {
      session: { cart: buildCart() },
    }));

    expect(result.save_order).toBe(true);
    expect(result.order?.total).toBe(60);
    expect(result.order?.payment_method).toBe('pix');
    expect(result.order?.change_for).toBeNull();
    expect(result.state).toBe(BotState.START);
    expect(result.cart.items).toHaveLength(0);
    expect(textOf(result)).toContain('chave-pix');
  });

  test('dinheiro pede troco antes de fechar', async () => {
    const result = await runBotEngine(buildParams('1', BotState.AWAITING_PAYMENT, {
      session: { cart: buildCart() },
    }));

    expect(result.save_order).toBe(false);
    expect(result.state).toBe(BotState.AWAITING_CHANGE);
  });

  test('troco menor que o total é rejeitado e o pedido não é salvo', async () => {
    const result = await runBotEngine(buildParams('50', BotState.AWAITING_CHANGE, {
      session: { cart: buildCart({ payment_method: 'dinheiro' }) },
    }));

    expect(result.save_order).toBe(false);
    expect(result.state).toBe(BotState.AWAITING_CHANGE);
  });

  test('troco maior que o total fecha o pedido com change_for', async () => {
    const result = await runBotEngine(buildParams('100', BotState.AWAITING_CHANGE, {
      session: { cart: buildCart({ payment_method: 'dinheiro' }) },
    }));

    expect(result.save_order).toBe(true);
    expect(result.order?.change_for).toBe(100);
    expect(result.order?.payment_method).toBe('Dinheiro');
  });

  test('taxa de entrega entra no total do pedido', async () => {
    const result = await runBotEngine(buildParams('2', BotState.AWAITING_PAYMENT, {
      session: { cart: buildCart({ order_type: 'delivery', address: 'Rua A, 10', delivery_fee: 7 }) },
    }));

    expect(result.order?.subtotal).toBe(60);
    expect(result.order?.delivery_fee).toBe(7);
    expect(result.order?.total).toBe(67);
    expect(result.order?.address).toBe('Rua A, 10');
  });

  test('conta dividida acumula um pagamento por pessoa e fecha na última', async () => {
    const firstPerson = await runBotEngine(buildParams('2', BotState.AWAITING_SPLIT_COUNT, {
      session: { cart: buildCart() },
    }));
    expect(firstPerson.state).toBe(BotState.AWAITING_SPLIT_PAYMENT);
    expect(firstPerson.cart.split_count).toBe(2);
    expect(firstPerson.cart.split_current).toBe(1);

    const secondPerson = await runBotEngine(buildParams('2', BotState.AWAITING_SPLIT_PAYMENT, {
      session: { cart: { ...buildCart(), split_count: 2, split_current: 1, split_payments: [] } },
    }));
    expect(secondPerson.save_order).toBe(false);
    expect(secondPerson.cart.split_current).toBe(2);

    const closing = await runBotEngine(buildParams('2', BotState.AWAITING_SPLIT_PAYMENT, {
      session: {
        cart: {
          ...buildCart(),
          split_count: 2,
          split_current: 2,
          split_payments: [{ person: 1, label: '📱 Pix', change_for: null }],
        },
      },
    }));
    expect(closing.save_order).toBe(true);
    expect(closing.order?.split_count).toBe(2);
    expect(closing.order?.split_payments).toHaveLength(2);
    expect(closing.order?.payment_method).toContain('dividido:');
    expect(closing.order?.total).toBe(60);
  });

  test('pagamento misto guarda a parte não-dinheiro e cobra o restante em dinheiro', async () => {
    const amount = await runBotEngine(buildParams('20', BotState.AWAITING_MIXED_AMOUNT, {
      session: { cart: { ...buildCart(), mixed_method: 'pix', mixed_label: 'Pix' } },
    }));
    expect(amount.state).toBe(BotState.AWAITING_MIXED_CHANGE);
    expect(amount.cart.mixed_amount).toBe(20);

    const closing = await runBotEngine(buildParams('não', BotState.AWAITING_MIXED_CHANGE, {
      session: { cart: { ...buildCart(), mixed_method: 'pix', mixed_label: 'Pix', mixed_amount: 20 } },
    }));
    expect(closing.save_order).toBe(true);
    expect(closing.order?.total).toBe(60);
    expect(closing.order?.payment_method).toBe('Pix + dinheiro');
    expect(textOf(closing)).toContain('40,00');
  });

  test('valor misto maior ou igual ao total é recusado', async () => {
    const result = await runBotEngine(buildParams('60', BotState.AWAITING_MIXED_AMOUNT, {
      session: { cart: { ...buildCart(), mixed_method: 'pix', mixed_label: 'Pix' } },
    }));
    expect(result.state).toBe(BotState.AWAITING_MIXED_AMOUNT);
    expect(result.cart.mixed_amount).toBe(0);
  });

  test('escolher a forma no menu misto avança para o valor', async () => {
    const result = await runBotEngine(buildParams('1', BotState.AWAITING_MIXED_METHOD, {
      session: { cart: buildCart() },
    }));
    expect(result.state).toBe(BotState.AWAITING_MIXED_AMOUNT);
    expect(result.cart.mixed_method).toBe('pix');
  });

  test('conta dividida entre 3 pessoas fecha só na terceira, com um pagamento em dinheiro e troco', async () => {
    const first = await runBotEngine(buildParams('3', BotState.AWAITING_SPLIT_COUNT, {
      session: { cart: buildCart() },
    }));
    expect(first.state).toBe(BotState.AWAITING_SPLIT_PAYMENT);
    expect(first.cart.split_count).toBe(3);
    expect(first.cart.split_current).toBe(1);

    const second = await runBotEngine(buildParams('2', BotState.AWAITING_SPLIT_PAYMENT, {
      session: { cart: { ...buildCart(), split_count: 3, split_current: 1, split_payments: [] } },
    }));
    expect(second.save_order).toBe(false);
    expect(second.cart.split_current).toBe(2);

    const third = await runBotEngine(buildParams('1', BotState.AWAITING_SPLIT_PAYMENT, {
      session: {
        cart: {
          ...buildCart(),
          split_count: 3,
          split_current: 2,
          split_payments: [{ person: 1, label: '📱 Pix', change_for: null }],
        },
      },
    }));
    expect(third.save_order).toBe(false);
    expect(third.state).toBe(BotState.AWAITING_SPLIT_CHANGE);
    expect(third.cart.payment_method).toBe('dinheiro');

    const closing = await runBotEngine(buildParams('40', BotState.AWAITING_SPLIT_CHANGE, {
      session: {
        cart: {
          ...buildCart(),
          split_count: 3,
          split_current: 3,
          payment_method: 'dinheiro',
          split_payments: [
            { person: 1, label: '📱 Pix', change_for: null },
            { person: 2, label: '📱 Pix', change_for: null },
          ],
        },
      },
    }));
    expect(closing.save_order).toBe(true);
    expect(closing.order?.split_count).toBe(3);
    expect(closing.order?.split_payments).toHaveLength(3);
    expect(closing.order?.split_payments?.[2]?.change_for).toBe(40);
  });

  test('troco da divisão menor ou igual à parte por pessoa é rejeitado', async () => {
    const result = await runBotEngine(buildParams('20', BotState.AWAITING_SPLIT_CHANGE, {
      session: {
        cart: {
          ...buildCart(),
          split_count: 3,
          split_current: 3,
          payment_method: 'dinheiro',
          split_payments: [
            { person: 1, label: '📱 Pix', change_for: null },
            { person: 2, label: '📱 Pix', change_for: null },
          ],
        },
      },
    }));
    expect(result.save_order).toBe(false);
    expect(result.state).toBe(BotState.AWAITING_SPLIT_CHANGE);
  });
});

describe('DeliveryHandler', () => {
  test('escolher delivery pede o endereço', async () => {
    const result = await runBotEngine(buildParams('1', BotState.AWAITING_TYPE, {
      session: { cart: buildCart({ order_type: '' }) },
    }));
    expect(result.state).toBe(BotState.AWAITING_ADDRESS);
    expect(result.cart.order_type).toBe('delivery');
  });

  test('escolher retirada zera a taxa e vai para pagamento', async () => {
    const result = await runBotEngine(buildParams('2', BotState.AWAITING_TYPE, {
      session: { cart: buildCart({ order_type: '' }) },
    }));
    expect(result.state).toBe(BotState.AWAITING_PAYMENT);
    expect(result.cart.delivery_fee).toBe(0);
  });

  test('CEP sozinho guarda a rua e pede o número', async () => {
    const params = buildParams('01001000', BotState.AWAITING_ADDRESS, {
      session: { cart: buildCart({ order_type: 'delivery' }) },
    });
    const result = await runBotEngine({
      ...params,
      providers: {
        ...params.providers,
        cepProvider: {
          lookup: async () => ({
            cep: '01001-000', logradouro: 'Praça da Sé', bairro: 'Sé', localidade: 'São Paulo', uf: 'SP',
          }),
        },
      },
    });

    expect(result.state).toBe(BotState.AWAITING_ADDRESS_NUMBER);
    expect(result.cart.address_street_temp).toContain('Praça da Sé');
  });

  test('endereço fora do raio oferece retirada', async () => {
    const params = buildParams('Rua Distante, 10', BotState.AWAITING_ADDRESS, {
      delivery_fee_rule: { mode: 'fixed', base_fee: 5, max_radius_km: 1 },
      establishment: { name: 'Sakura', ignore_hours: true, city: 'São Paulo', lat: -23.55, lng: -46.63 },
      session: { cart: buildCart({ order_type: 'delivery' }) },
    });
    const result = await runBotEngine({
      ...params,
      providers: {
        ...params.providers,
        geocodingProvider: {
          search: async () => ({ lat: '-23.90', lon: '-46.90', display_name: 'Endereço de teste' }),
          reverse: async () => null,
        },
      },
    });

    expect(result.state).toBe(BotState.OFFER_PICKUP);
  });

  test('endereço dentro do raio aplica taxa e pede complemento', async () => {
    const params = buildParams('Rua Perto, 10', BotState.AWAITING_ADDRESS, {
      delivery_fee_rule: { mode: 'fixed', base_fee: 5, max_radius_km: 20 },
      establishment: { name: 'Sakura', ignore_hours: true, city: 'São Paulo', lat: -23.55, lng: -46.63 },
      session: { cart: buildCart({ order_type: 'delivery' }) },
    });
    const result = await runBotEngine({
      ...params,
      providers: {
        ...params.providers,
        geocodingProvider: {
          search: async () => ({ lat: '-23.56', lon: '-46.64', display_name: 'Endereço de teste' }),
          reverse: async () => null,
        },
      },
    });

    expect(result.state).toBe(BotState.AWAITING_COMPLEMENT);
    expect(result.cart.delivery_fee).toBe(5);
  });

  test('recusar retirada volta a pedir endereço', async () => {
    const result = await runBotEngine(buildParams('não', BotState.OFFER_PICKUP, {
      session: { cart: buildCart({ order_type: 'delivery' }) },
    }));
    expect(result.state).toBe(BotState.AWAITING_ADDRESS);
  });
});

describe('ReservationHandler', () => {
  const TABLES = [
    { id: 't1', number: 1, capacity: 2 },
    { id: 't2', number: 2, capacity: 6 },
  ];

  test('data, hora e pessoas alocam a menor mesa disponível', async () => {
    const result = await runBotEngine(buildParams('25/12 20:00 4 pessoas', BotState.RESERVING, {
      restaurant_tables: TABLES,
      upcoming_reservations: [],
    }));

    expect(result.state).toBe(BotState.CONFIRMING_RESERVATION);
    expect(result.reservation_temp.table_id).toBe('t2');
    expect(result.reservation_temp.party_size).toBe(4);
  });

  test('faltando informação a reserva não avança', async () => {
    const result = await runBotEngine(buildParams('quero reservar', BotState.RESERVING, {
      restaurant_tables: TABLES,
    }));
    expect(result.state).toBe(BotState.RESERVING);
    expect(result.reservation_temp.table_id).toBeUndefined();
  });

  test('sem mesa com capacidade suficiente avisa e não reserva', async () => {
    const result = await runBotEngine(buildParams('25/12 20:00 12 pessoas', BotState.RESERVING, {
      restaurant_tables: TABLES,
    }));
    expect(result.state).toBe(BotState.RESERVING);
    expect(result.save_reservation).toBe(false);
  });

  test('confirmar grava a reserva e limpa o temporário', async () => {
    const result = await runBotEngine(buildParams('sim', BotState.CONFIRMING_RESERVATION, {
      restaurant_tables: TABLES,
      session: {
        reservation_temp: { date: '2026-12-25', time: '20:00', party_size: 4, table_id: 't2', table_number: 2 },
      },
    }));

    expect(result.save_reservation).toBe(true);
    expect(result.reservation?.table_id).toBe('t2');
    expect(result.reservation?.party_size).toBe(4);
    expect(result.reservation_temp).toEqual({});
    expect(result.state).toBe(BotState.START);
  });

  test('recusar cancela a reserva', async () => {
    const result = await runBotEngine(buildParams('não', BotState.CONFIRMING_RESERVATION, {
      session: {
        reservation_temp: { date: '2026-12-25', time: '20:00', party_size: 4, table_id: 't2', table_number: 2 },
      },
    }));
    expect(result.save_reservation).toBe(false);
    expect(result.reservation_temp).toEqual({});
    expect(result.state).toBe(BotState.START);
  });

  test('mesa já reservada no mesmo horário é pulada em favor da próxima disponível', async () => {
    const result = await runBotEngine(buildParams('25/12 20:00 4 pessoas', BotState.RESERVING, {
      restaurant_tables: [...TABLES, { id: 't3', number: 3, capacity: 4 }],
      upcoming_reservations: [{ date: '2026-12-25', time: '20:00:00', table_id: 't2' }],
    }));

    expect(result.state).toBe(BotState.CONFIRMING_RESERVATION);
    expect(result.reservation_temp.table_id).toBe('t3');
  });

  test('todas as mesas com capacidade já reservadas no horário não avança', async () => {
    const result = await runBotEngine(buildParams('25/12 20:00 4 pessoas', BotState.RESERVING, {
      restaurant_tables: TABLES,
      upcoming_reservations: [{ date: '2026-12-25', time: '20:00:00', table_id: 't2' }],
    }));

    expect(result.state).toBe(BotState.RESERVING);
    expect(result.reservation_temp.table_id).toBeUndefined();
    expect(result.save_reservation).toBe(false);
  });
});

describe('OrderingHandler', () => {
  test('escolher categoria lista os itens', async () => {
    const result = await runBotEngine(buildParams('Temakis', BotState.ORDERING_CAT));
    expect(result.state).toBe(BotState.ORDERING_ITEMS);
    expect(result.cart.browse_category).toBe('Temakis');
  });

  test('escolher item pede a quantidade', async () => {
    const result = await runBotEngine(buildParams('1', BotState.ORDERING_ITEMS, {
      session: { cart: { items: [], browse_category: 'Temakis' } },
    }));
    expect(result.state).toBe(BotState.AWAITING_QTY);
    expect(result.cart.pending_item_id).toBe('p1');
  });

  test('quantidade adiciona o item ao carrinho', async () => {
    const result = await runBotEngine(buildParams('3', BotState.AWAITING_QTY, {
      session: { cart: { items: [], browse_category: 'Temakis', pending_item_id: 'p1' } },
    }));
    expect(result.state).toBe(BotState.AWAITING_MORE);
    expect(result.cart.items).toHaveLength(1);
    expect(result.cart.items[0]?.qty).toBe(3);
  });

  test('quantidade repetida soma no item existente', async () => {
    const result = await runBotEngine(buildParams('2', BotState.AWAITING_QTY, {
      session: { cart: { items: [{ id: 'p1', name: 'Temaki Salmão', qty: 1, price: 30, menuIdx: 1 }], pending_item_id: 'p1' } },
    }));
    expect(result.cart.items).toHaveLength(1);
    expect(result.cart.items[0]?.qty).toBe(3);
  });

  test('finalizar abaixo do pedido mínimo não confirma', async () => {
    const result = await runBotEngine(buildParams('finalizar', BotState.AWAITING_MORE, {
      establishment: { name: 'Sakura', ignore_hours: true, min_order_value: 200 },
      session: { cart: buildCart() },
    }));
    expect(result.state).toBe(BotState.AWAITING_MORE);
  });

  test('finalizar acima do mínimo vai para confirmação', async () => {
    const result = await runBotEngine(buildParams('finalizar', BotState.AWAITING_MORE, {
      session: { cart: buildCart() },
    }));
    expect(result.state).toBe(BotState.CONFIRMING);
  });

  const manyProducts = Array.from({ length: 11 }, (_, index) => ({
    id: 'm' + (index + 1),
    name: 'Item ' + (index + 1),
    price: 10,
    category: 'Temakis',
  }));

  test('próxima página avança quando há mais itens além da página atual', async () => {
    const result = await runBotEngine(buildParams('próxima', BotState.ORDERING_ITEMS, {
      products: manyProducts,
      session: { cart: { items: [], browse_category: 'Temakis', browse_page: 0 } },
    }));

    expect(result.state).toBe(BotState.ORDERING_ITEMS);
    expect(result.cart.browse_page).toBe(1);
  });

  test('próxima página na última página volta para a primeira', async () => {
    const result = await runBotEngine(buildParams('próxima', BotState.ORDERING_ITEMS, {
      products: manyProducts,
      session: { cart: { items: [], browse_category: 'Temakis', browse_page: 1 } },
    }));

    expect(result.state).toBe(BotState.ORDERING_ITEMS);
    expect(result.cart.browse_page).toBe(1);
  });

  test('escolher item pelo número exibido na segunda página adiciona o produto correto', async () => {
    const result = await runBotEngine(buildParams('10', BotState.ORDERING_ITEMS, {
      products: manyProducts,
      session: { cart: { items: [], browse_category: 'Temakis', browse_page: 1 } },
    }));

    expect(result.state).toBe(BotState.AWAITING_QTY);
    expect(result.cart.pending_item_id).toBe('m10');
  });
});

describe('MiscHandler', () => {
  test('pedir atendente marca handoff', async () => {
    const result = await runBotEngine(buildParams('4', BotState.START));
    expect(result.request_human_handoff).toBe(true);
    expect(result.state).toBe(BotState.HUMAN_HANDOFF);
    expect(result.handoff_customer_name).toBe('Anderson');
  });

  test('nome válido é salvo capitalizado', async () => {
    const result = await runBotEngine(buildParams('maria souza', BotState.AWAITING_NAME, {
      customer_name: null,
    }));
    expect(result.save_customer_name).toBe(true);
    expect(result.customer_name_to_save).toBe('Maria Souza');
  });

  test('nome inválido continua pedindo o nome', async () => {
    const result = await runBotEngine(buildParams('1', BotState.AWAITING_NAME, { customer_name: null }));
    expect(result.save_customer_name).toBe(false);
    expect(result.state).toBe(BotState.AWAITING_NAME);
  });

  test('complemento avança para pagamento', async () => {
    const result = await runBotEngine(buildParams('apto 42', BotState.AWAITING_COMPLEMENT, {
      session: { cart: buildCart({ order_type: 'delivery' }) },
    }));
    expect(result.cart.complement).toBe('apto 42');
    expect(result.state).toBe(BotState.AWAITING_PAYMENT);
  });

  test('opt-in de marketing é persistido', async () => {
    const result = await runBotEngine(buildParams('sim', BotState.AWAITING_MARKETING_OPT_IN, {
      marketing_opt_in: null,
    }));
    expect(result.save_marketing_opt_in).toBe(true);
    expect(result.marketing_opt_in_value).toBe(true);
    expect(result.state).toBe(BotState.START);
  });

  test('sem pedidos recentes avisa que não há histórico', async () => {
    const result = await runBotEngine(buildParams('5', BotState.START, { recent_orders: [] }));
    expect(result.state).toBe(BotState.START);
    expect(result.respostas.length).toBeGreaterThan(0);
  });
});

describe('runBotEngine', () => {
  test('fora do horário responde a mensagem de fechado sem tocar no estado', async () => {
    const result = await runBotEngine(buildParams('oi', BotState.ORDERING_ITEMS, {
      establishment: {
        name: 'Sakura',
        ignore_hours: false,
        opening_time: '18:00',
        closing_time: '23:00',
        working_days: 'seg',
        msg_closed: 'Estamos fechados!',
      },
      session: { cart: buildCart() },
    }));

    expect(result.respostas).toEqual(['Estamos fechados!']);
    expect(result.state).toBe(BotState.ORDERING_ITEMS);
    expect(result.save_order).toBe(false);
    expect(result.kitchen_phone).toBe('');
  });
});
