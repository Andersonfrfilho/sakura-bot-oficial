export const WS_EVENTS = {
  // Client → Server
  AUTH: 'auth',
  PING: 'ping',

  // Server → Client
  AUTH_SUCCESS: 'auth:success',
  AUTH_FAILURE: 'auth:failure',
  PONG: 'pong',

  // Order lifecycle
  ORDER_CREATED: 'order:created',
  ORDER_UPDATED: 'order:updated',
  ORDER_STATUS_CHANGED: 'order:status_changed',
  ORDER_CANCELLED: 'order:cancelled',

  // Kitchen
  KITCHEN_ORDER_QUEUED: 'kitchen:order_queued',
  KITCHEN_ORDER_STARTED: 'kitchen:order_started',
  KITCHEN_ORDER_READY: 'kitchen:order_ready',

  // Delivery
  DELIVERY_ASSIGNED: 'delivery:assigned',
  DELIVERY_DISPATCHED: 'delivery:dispatched',
  DELIVERY_COMPLETED: 'delivery:completed',

  // Cashier
  CASHIER_REGISTER_OPENED: 'cashier:register_opened',
  CASHIER_REGISTER_CLOSED: 'cashier:register_closed',
  CASHIER_PAYMENT_RECEIVED: 'cashier:payment_received',
} as const

export type WsEventType = (typeof WS_EVENTS)[keyof typeof WS_EVENTS]

export interface WsMessage {
  type: WsEventType | string
  payload?: unknown
}

export interface WsAuthMessage {
  type: 'auth'
  token: string
}

export interface WsServerMessage {
  type: string
  payload?: unknown
  timestamp: string
}
