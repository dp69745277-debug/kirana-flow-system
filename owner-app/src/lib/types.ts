export type StoreType = 'retail' | 'wholesale' | 'mix';
export type UserRole = 'owner' | 'staff';
export type Lang = 'en' | 'hinglish' | 'hi';

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
  feature_flags: FeatureFlags;
  dead_stock_days: number;
  language: Lang;
  created_at: string;
}

export interface FeatureFlags {
  retail_module?: boolean;
  godown_inventory?: boolean;
  daily_hisaab?: boolean;
  agencies?: boolean;
  dead_stock_tracker?: boolean;
  reports?: boolean;
  staff_module?: boolean;
  wholesale_module?: boolean;
  wholesale_orders?: boolean;
  customer_directory?: boolean;
  khata_ledger?: boolean;
  whatsapp_reminders?: boolean;
  customer_app_accounts?: boolean;
  pdf_exports?: boolean;
  max_staff_limit?: number;
  [key: string]: boolean | number | undefined;
}

export interface StaffPermissions {
  can_update_stock?: boolean;
  can_manage_orders?: boolean;
  can_adjust_price?: boolean;
  can_view_khata?: boolean;
  can_view_agencies?: boolean;
  can_view_reports?: boolean;
  [key: string]: boolean | undefined;
}

export interface StoreUser {
  id: string;
  auth_user_id: string | null;
  store_id: string;
  name: string;
  phone: string;
  role: UserRole;
  permissions: StaffPermissions;
  max_discount_pct: number;
  customer_access_mode: 'all' | 'selected';
  is_active: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  store_id: string;
  name: string;
  created_at: string;
}

export interface Agency {
  id: string;
  store_id: string;
  name: string;
  phone: string | null;
  balance: number;
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

export interface StockTransaction {
  id: string;
  store_id: string;
  item_id: string;
  type: 'stock_in' | 'stock_out_retail' | 'stock_out_wholesale' | 'adjustment';
  quantity: number;
  unit_price: number;
  agency_id: string | null;
  order_id: string | null;
  performed_by_user_id: string | null;
  payment_status: string | null;
  notes: string | null;
  bill_photo_url: string | null;
  created_at: string;
}

export interface PriceAlert {
  id: string;
  store_id: string;
  item_id: string;
  old_price: number;
  new_price: number;
  diff_amount: number;
  is_read: boolean;
  created_at: string;
}

export interface WholesaleCustomer {
  id: string;
  auth_user_id: string | null;
  store_id: string;
  name: string;
  shop_name: string;
  phone: string;
  address: string | null;
  credit_limit: number;
  current_khata_balance: number;
  is_active: boolean;
  created_at: string;
}

export type OrderStatus = 'placed' | 'seen' | 'packed' | 'out_for_delivery' | 'ready_for_pickup' | 'delivered' | 'cancelled';

export interface Order {
  id: string;
  store_id: string;
  customer_id: string;
  order_number: string;
  fulfillment_type: 'delivery' | 'pickup';
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

export interface DailyHisaab {
  id: string;
  store_id: string;
  hisaab_date: string;
  cash_sales: number;
  upi_sales: number;
  auto_khata_sales: number;
  expenses: number;
  notes: string | null;
  updated_by_user_id: string | null;
  updated_at: string;
}

export interface AgencyPayment {
  id: string;
  store_id: string;
  agency_id: string;
  amount: number;
  payment_mode: string;
  paid_by_user_id: string | null;
  status: 'approved' | 'pending' | 'rejected';
  notes: string | null;
  created_at: string;
}

export interface PendingHisaab {
  id: string;
  store_id: string;
  staff_user_id: string | null;
  entry_type: 'customer_collection' | 'agency_payment';
  reference_id: string | null;
  amount: number;
  payment_mode: string | null;
  status: 'pending' | 'approved' | 'rejected';
  review_note: string | null;
  reviewed_by_user_id: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface StaffAgencyPermission {
  staff_user_id: string;
  agency_id: string;
}

export interface StaffCustomerPermission {
  staff_user_id: string;
  customer_id: string;
  fulfillment_only: boolean;
}

export interface AuditLog {
  id: string;
  store_id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export const UNIT_TYPES = ['Pota', 'Katta', 'Bag', 'Box', 'Carton', 'Kg', 'Litre', 'Pcs'] as const;
export const METRICS = ['kg', 'g', 'L', 'ml', 'pcs'] as const;
export const STOCK_OUT_REASONS = ['Retail Counter', 'Walk-in Sale', 'Damaged/Expired', 'Adjustment'] as const;

export type PaymentGatewayProvider = 'manual_upi' | 'custom_upi' | 'razorpay';
export type PaymentGatewayMode = 'test' | 'live';
export type PaymentTransactionStatus = 'pending' | 'success' | 'failed' | 'expired';
export type PaymentTransactionPurpose = 'khata_payment' | 'order_delivery';

export interface StorePaymentGateway {
  id: string;
  store_id: string;
  provider: PaymentGatewayProvider;
  is_enabled: boolean;
  mode: PaymentGatewayMode;
  api_base_url: string | null;
  merchant_id: string | null;
  api_key: string | null;
  api_secret: string | null;
  webhook_secret: string | null;
  updated_at: string;
}

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
