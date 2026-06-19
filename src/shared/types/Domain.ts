// Interfaces para objetos de domínio vindos do banco/n8n

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  emoji?: string;
  description?: string;
}

interface PaymentType {
  name: string;
  label: string;
  config?: Record<string, string>;
}

interface PixConfig {
  chave: string;
  nome: string;
}

interface OrderType {
  name: string;
  label: string;
  active?: boolean;
}

interface FeeZone {
  type: 'km' | 'min';
  min: number;
  max: number;
  fee: number;
}

interface DeliveryFeeRule {
  mode: string;
  base_fee?: number;
  per_km_rate?: number;
  per_min_rate?: number;
  free_above?: number;
  max_radius_km?: number;
  zones?: FeeZone[];
}

interface RecentOrder {
  code: string;
  status: string;
  order_type: string;
  total: number;
  created_at: string;
  payment_method?: string;
  items_count?: number;
}

interface LastOrder {
  code?: string;
  items: OrderItem[];
  total: number;
  status?: string;
}

interface RestaurantTable {
  id: string;
  number: string | number;
  capacity: number;
}

interface UpcomingReservation {
  date: string;
  time: string;
  table_id: string;
}

interface CepResponse {
  erro?: boolean;
  cep: string;
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

interface NominatimReverseResult {
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
}

interface OsrmRoute {
  distance: number;
  duration: number;
}

interface OsrmResponse {
  routes?: OsrmRoute[];
}

interface N8nInputData {
  config: Record<string, string>;
  products: Product[];
  recent_orders: RecentOrder[];
  session: SessionRaw;
  last_order: LastOrder | null;
  payment_types: PaymentType[];
  order_types: OrderType[];
  customer_name: string | null;
  marketing_opt_in: boolean | null;
  delivery_fee_rule: DeliveryFeeRule;
  restaurant_tables: RestaurantTable[];
  upcoming_reservations: UpcomingReservation[];
}

interface MsgData {
  tel: string;
  instancia: string;
  texto: string;
  horaAtual: string;
  diaSemana: string;
  location_lat: number | null;
  location_lng: number | null;
  push_name?: string;
}
