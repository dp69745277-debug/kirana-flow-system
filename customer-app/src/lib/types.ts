export type StoreType = 'retail' | 'wholesale' | 'mix';
export type Lang = 'en' | 'hinglish' | 'hi';
export type OrderStatus = 'placed' | 'seen' | 'packed' | 'out_for_delivery' | 'ready_for_pickup' | 'delivered' | 'cancelled';
export type FulfillmentType = 'delivery' | 'pickup';

export interface Store {
  id: string;
  store_code: string;
  shop_name: string;
  owner_name: string;
  phone: string;
  address: string | null;
  upi_id: string | null;
  gstin: string | null;
  store_type: StoreType;
  is_active: boolean;
  feature_flags: Record<string, boolean | number | undefined>;
  dead_stock_days: number;
  language: Lang;
  created_at: string;
  plan_name?: string;
  subscription_status?: string;
  trial_ends_at?: string;
  subscription_ends_at?: string | null;
  custom_plan_price?: number;
  billing_cycle?: string;
  admin_notes?: string | null;
}

export interface WholesaleCustomer {
  id: string;
  auth_user_id: string | null;
  store_id: string;
  name: string;
  shop_name: string;
  phone: string;
  address: string | null;
  password_digest: string | null;
  credit_limit: number;
  current_khata_balance: number;
  is_active: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  store_id: string;
  name: string;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  store_id: string;
  category_id: string | null;
  default_agency_id: string | null;
  name: string;
  brand: string | null;
  unit_type: string;
  unit_value: number;
  metric: string;
  current_stock: number;
  low_stock_threshold: number;
  avg_base_price: number;
  latest_price: number;
  auto_update_threshold: number;
  wholesale_price: number;
  retail_price: number;
  is_visible_to_customers: boolean;
  last_movement_at: string;
  created_at: string;
}

export interface Order {
  id: string;
  store_id: string;
  customer_id: string;
  order_number: string;
  fulfillment_type: FulfillmentType;
  status: OrderStatus;
  subtotal: number;
  discount_amount: number;
  final_total: number;
  payment_mode: 'cash' | 'upi' | 'khata' | 'split' | null;
  paid_amount: number;
  khata_amount: number;
  seen_by_user_id: string | null;
  delivered_by_user_id: string | null;
  delivery_proof_url: string | null;
  delivery_notes: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  item_id: string | null;
  item_name_snapshot: string;
  quantity: number;
  original_unit_price: number;
  final_unit_price: number;
  line_total: number;
  price_adjusted_by_user_id: string | null;
  created_at: string;
}

export interface KhataTransaction {
  id: string;
  store_id: string;
  customer_id: string;
  order_id: string | null;
  type: 'debit_order' | 'debit_manual' | 'credit_payment';
  amount: number;
  payment_mode: string | null;
  balance_after: number;
  performed_by_user_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface StoreUser {
  id: string;
  auth_user_id: string | null;
  store_id: string;
  name: string;
  phone: string;
  role: 'owner' | 'staff';
  is_active: boolean;
  created_at: string;
}

export interface CartItem {
  item: InventoryItem;
  quantity: number;
}

export type PaymentGatewayProvider = 'manual_upi' | 'custom_upi' | 'razorpay';
export type PaymentGatewayMode = 'test' | 'live';
export type PaymentTransactionStatus = 'pending' | 'success' | 'failed' | 'expired';
export type PaymentTransactionPurpose = 'khata_payment' | 'order_delivery';

export interface StorePaymentMode {
  provider: PaymentGatewayProvider;
  is_enabled: boolean;
  mode: PaymentGatewayMode;
  public_key: string | null;
  merchant_id: string | null;
  api_base_url: string | null;
}

export interface PaymentTransaction {
  id: string;
  store_id: string;
  customer_id: string | null;
  order_id: string | null;
  purpose: PaymentTransactionPurpose;
  provider: string;
  amount: number;
  gateway_order_id: string | null;
  utr_number: string | null;
  qr_payload: string | null;
  payment_url: string | null;
  status: PaymentTransactionStatus;
  raw_response: Record<string, unknown>;
  created_at: string;
  verified_at: string | null;
}
