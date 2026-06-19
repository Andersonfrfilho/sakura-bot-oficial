interface CartItem {
  id: string;
  name: string;
  qty: number;
  price: number;
  menuIdx?: number;
}

interface SplitPayment {
  person: number;
  label: string;
  change_for: number | null;
}

interface Cart {
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
}
