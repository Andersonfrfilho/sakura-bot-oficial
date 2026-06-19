interface OrderItem {
  id: string;
  name: string;
  qty: number;
  price: number;
  menuIdx?: number;
}

interface Order {
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
}

interface Reservation {
  tel: string;
  date: string;
  time: string;
  party_size: number;
  table_id: string;
}
