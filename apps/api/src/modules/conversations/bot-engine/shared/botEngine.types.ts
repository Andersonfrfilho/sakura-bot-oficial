// Porte mecânico de src/shared/types/*.ts (script mode do n8n) para módulos ESM.

export type CartItem = {
  id: string;
  name: string;
  qty: number;
  price: number;
  menuIdx?: number;
};

export type SplitPayment = {
  person: number;
  label: string;
  change_for: number | null;
};

export type Cart = {
  items: CartItem[];
  order_type: string;
  address: string;
  complement?: string;
  delivery_fee: number;
  payment_method: string;
  change_for: number | null;
  split_count: number;
  split_current: number;
  split_payments: SplitPayment[];
  mixed_method: string;
  mixed_label: string;
  mixed_amount: number;
  address_street_temp: string | null;
  browse_category: string;
  browse_page?: number;
  pending_item_id: string | null;
  pending_item_name: string;
};

export type ReservationTemp = {
  date?: string;
  time?: string;
  party_size?: number;
  table_id?: string;
  table_number?: string | number;
};

export type SessionRaw = {
  state?: string;
  cart?: Partial<Cart> | CartItem[];
  last_activity_at?: string;
  reservation_temp?: ReservationTemp;
};

export type ButtonMessage = {
  type: 'buttons';
  body: string;
  buttons: Array<{ id: string; title: string }>;
};

export type ListRow = {
  id: string;
  title: string;
  description?: string;
};

export type ListMessage = {
  type: 'list';
  body: string;
  button: string;
  sections: Array<{ title: string; rows: ListRow[] }>;
};

export type TextMenuMessage = {
  type: 'text_menu';
  body: string;
  items: Array<{ num: number; id: string; name: string }>;
  categoryName: string;
  context: string;
  page: number;
  hasMore: boolean;
};

export type LocationMessage = {
  type: 'location';
  latitude: number;
  longitude: number;
  name: string;
  address: string;
};

export type OutgoingMessage =
  | string
  | ButtonMessage
  | ListMessage
  | TextMenuMessage
  | LocationMessage;

export type OrderItem = {
  id: string;
  name: string;
  qty: number;
  price: number;
  menuIdx?: number;
};

export type Order = {
  tel: string;
  customer_name: string | null;
  code: string;
  items: OrderItem[];
  subtotal: number;
  delivery_fee: number;
  total: number;
  order_type: string;
  address: string;
  maps_link: string;
  payment_method: string;
  change_for: number | null;
  split_count?: number;
  split_payments?: SplitPayment[];
};

export type Reservation = {
  tel: string;
  date: string;
  time: string;
  party_size: number;
  table_id: string;
};

export type Product = {
  id: string;
  name: string;
  price: number;
  category: string;
  emoji?: string;
  description?: string;
};

export type PaymentType = {
  name: string;
  label: string;
  config?: Record<string, string>;
};

export type OrderType = {
  name: string;
  label: string;
  active?: boolean;
};

export type FeeZone = {
  type: 'km' | 'min';
  min: number;
  max: number;
  fee: number;
};

export type DeliveryFeeRule = {
  mode?: string;
  base_fee?: number;
  per_km_rate?: number;
  per_min_rate?: number;
  free_above?: number;
  max_radius_km?: number;
  zones?: FeeZone[];
};

export type RecentOrder = {
  code: string;
  status: string;
  order_type: string;
  total: number;
  created_at: string;
  payment_method?: string;
  items_count?: number;
};

export type LastOrder = {
  code?: string;
  items: OrderItem[];
  total: number;
  status?: string;
};

export type RestaurantTable = {
  id: string;
  number: string | number;
  capacity: number;
};

export type UpcomingReservation = {
  date: string;
  time: string;
  table_id: string;
};

export type CepResponse = {
  erro?: boolean;
  cep: string;
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
};

export type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
};

export type NominatimReverseResult = {
  address?: {
    road?: string;
    house_number?: string;
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
    village?: string;
    state_code?: string;
    state?: string;
  };
};

export type OsrmRoute = {
  distance: number;
  duration: number;
};

export type OsrmResponse = {
  routes?: OsrmRoute[];
};

export type EstablishmentConfig = {
  id?: string;
  slug?: string;
  whatsapp_number?: string;
  name?: string;
  phone?: string | null;
  logo_url?: string | null;
  address?: string | null;
  lat?: number;
  lng?: number;
  city?: string | null;
  opening_time?: string;
  closing_time?: string;
  working_days?: string;
  msg_welcome?: string;
  msg_closed?: string;
  min_order_value?: number;
  prep_time_min?: number;
  session_ttl_min?: number;
  ignore_hours?: boolean;
  feature_delivery?: boolean;
  feature_retirada?: boolean;
  feature_reservas?: boolean;
  feature_pedido_mesa?: boolean;
  kitchen_phone?: string | null;
  agent_phone?: string | null;
  active?: boolean;
};

export type CartSummaryResult = {
  lines: string[];
  total: number;
};

export type ValidateNameResult = {
  valid: boolean;
  reason?: 'short' | 'numbers' | 'invalid_chars' | 'repeated' | 'bad_word';
};

export type BuildRepeatOrderLinesParams = {
  lastOrder: { items: OrderItem[]; total: number };
  products: Product[];
  header: string;
};

/** Mensagem inbound já normalizada — equivalente ao nó "Calcular Hora" do n8n. */
export type IncomingMessage = {
  tel: string;
  instancia: string;
  texto: string;
  horaAtual: string;
  diaSemana: string;
  location_lat?: number | null;
  location_lng?: number | null;
  push_name?: string;
};

/** Dados de contexto do estabelecimento — vêm do contexto autenticado, nunca do cliente. */
export type BotEngineData = {
  establishment?: EstablishmentConfig;
  config?: Record<string, string>;
  products?: Product[];
  recent_orders?: RecentOrder[];
  session?: SessionRaw;
  last_order?: LastOrder | null;
  payment_types?: PaymentType[];
  order_types?: OrderType[];
  customer_name?: string | null;
  marketing_opt_in?: boolean | null;
  delivery_fee_rule?: DeliveryFeeRule;
  restaurant_tables?: RestaurantTable[];
  upcoming_reservations?: UpcomingReservation[];
};

/** Saída da engine — mesmo formato que `buildPayload()` de src/setup.ts devolve ao n8n. */
export type BotEngineResult = {
  tel: string;
  instancia: string;
  respostas: OutgoingMessage[];
  state: string;
  cart: Cart;
  reservation_temp: ReservationTemp;
  save_order: boolean;
  order: Order | null;
  save_reservation: boolean;
  reservation: Reservation | null;
  save_customer_name: boolean;
  customer_name_to_save: string | null;
  save_marketing_opt_in: boolean;
  marketing_opt_in_value: boolean | null;
  kitchen_phone: string;
  request_human_handoff: boolean;
  handoff_customer_name: string;
};
