// Porte mecânico de src/shared/constants/{StateConstants,CartConstants}.ts.

import type { Cart } from './botEngine.types.ts';

export const BotState = {
  START: 'start',
  ORDERING: 'ordering',
  ORDERING_CAT: 'ordering_cat',
  BROWSING_CATEGORIES: 'browsing_categories',
  ORDERING_ITEMS: 'ordering_items',
  BROWSING_ITEMS: 'browsing_items',
  AWAITING_QTY: 'awaiting_qty',
  AWAITING_MORE: 'awaiting_more',
  CONFIRMING: 'confirming',
  AWAITING_TYPE: 'awaiting_type',
  AWAITING_ADDRESS: 'awaiting_address',
  AWAITING_ADDRESS_NUMBER: 'awaiting_address_number',
  AWAITING_COMPLEMENT: 'awaiting_complement',
  OFFER_PICKUP: 'offer_pickup',
  AWAITING_PAYMENT: 'awaiting_payment',
  AWAITING_CHANGE: 'awaiting_change',
  AWAITING_SPLIT_COUNT: 'awaiting_split_count',
  AWAITING_SPLIT_PAYMENT: 'awaiting_split_payment',
  AWAITING_SPLIT_CHANGE: 'awaiting_split_change',
  AWAITING_MIXED_METHOD: 'awaiting_mixed_method',
  AWAITING_MIXED_AMOUNT: 'awaiting_mixed_amount',
  AWAITING_MIXED_CHANGE: 'awaiting_mixed_change',
  REPEAT_ORDER: 'repeat_order',
  AWAITING_NAME: 'awaiting_name',
  HUMAN_HANDOFF: 'human_handoff',
  AWAITING_ORDER_DETAIL: 'awaiting_order_detail',
  NOTIFICATIONS_MENU: 'notifications_menu',
  AWAITING_MARKETING_OPT_IN: 'awaiting_marketing_opt_in',
  RESERVING: 'reserving',
  CONFIRMING_RESERVATION: 'confirming_reservation',
} as const;

export type BotState = (typeof BotState)[keyof typeof BotState];

export const ExpectingRawInputStates: ReadonlyArray<string> = [
  BotState.ORDERING_CAT,
  BotState.BROWSING_CATEGORIES,
  BotState.ORDERING_ITEMS,
  BotState.BROWSING_ITEMS,
  BotState.AWAITING_QTY,
  BotState.AWAITING_MORE,
  BotState.ORDERING,
  BotState.AWAITING_ADDRESS,
  BotState.AWAITING_ADDRESS_NUMBER,
  BotState.AWAITING_COMPLEMENT,
  BotState.AWAITING_CHANGE,
  BotState.AWAITING_SPLIT_COUNT,
  BotState.AWAITING_SPLIT_CHANGE,
  BotState.AWAITING_MIXED_AMOUNT,
  BotState.AWAITING_MIXED_CHANGE,
  BotState.AWAITING_NAME,
  BotState.RESERVING,
];

export const IDLE_STATES: ReadonlyArray<string> = [
  'start',
  'ordering',
  'repeat_order',
  'awaiting_name',
  'awaiting_marketing_opt_in',
];

export const GREETINGS: ReadonlyArray<string> = [
  'oi',
  'ola',
  'bom dia',
  'boa tarde',
  'boa noite',
  'inicio',
  'menu',
  'start',
  'hello',
  'hi',
];

export const ITEMS_PAGE_SIZE = 9;

export const CartConstants = {
  EMPTY: (): Cart => ({
    items: [],
    order_type: '',
    address: '',
    complement: '',
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
    browse_page: 0,
    pending_item_id: null,
    pending_item_name: '',
  }),
};
