export type StoreType = 'retail' | 'wholesale' | 'mix';
export type PlanName = 'trial' | 'basic' | 'pro' | 'enterprise';
export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'suspended';
export type BillingCycle = 'monthly' | 'quarterly' | 'yearly';
export type PaymentStatus = 'pending' | 'success' | 'failed';
export type AdminRole = 'super_admin' | 'admin' | 'support';
export type GatewayProvider = 'manual_upi' | 'custom_upi' | 'razorpay';
export type GatewayMode = 'test' | 'live';

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
  customer_app_access?: boolean;
  customer_app_accounts?: boolean;
  pdf_exports?: boolean;
  payment_gateway?: boolean;
  max_staff_limit?: number;
  max_customers_limit?: number;
  [key: string]: boolean | number | undefined;
}

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
  language: string;
  created_at: string;
  // SaaS columns
  plan_name: PlanName;
  subscription_status: SubscriptionStatus;
  trial_ends_at: string;
  subscription_ends_at: string | null;
  custom_plan_price: number;
  billing_cycle: BillingCycle;
  admin_notes: string | null;

  // Joined / computed usage stats
  staff_count?: number;
  customer_count?: number;
  items_count?: number;
  orders_count?: number;
  total_sales?: number;
  last_activity?: string;
}

export interface PlatformAdmin {
  id: string;
  auth_user_id: string | null;
  email: string | null;
  phone: string | null;
  name: string;
  role: AdminRole;
  created_at: string;
}

export interface PlatformSettings {
  id: string;
  brand_name: string;
  support_phone: string;
  support_whatsapp: string;
  default_trial_days: number;
  default_monthly_price: number;
  default_yearly_price: number;
  gateway_provider: GatewayProvider;
  gateway_enabled: boolean;
  gateway_mode: GatewayMode;
  gateway_base_url: string | null;
  gateway_merchant_id: string | null;
  gateway_api_key: string | null;
  gateway_api_secret: string | null;
  gateway_webhook_secret: string | null;
  admin_upi_id: string;
  updated_at: string;
}

export interface SaasPayment {
  id: string;
  store_id: string;
  amount: number;
  plan_name: PlanName;
  billing_cycle: BillingCycle;
  gateway_order_id: string | null;
  utr_number: string | null;
  status: PaymentStatus;
  days_added: number;
  payment_method: string;
  notes: string | null;
  created_at: string;
  verified_at: string | null;

  // joined
  store?: {
    shop_name: string;
    store_code: string;
    owner_name: string;
    phone: string;
  };
}

export interface StoreAccessStatus {
  allowed: boolean;
  reason: 'active' | 'trial_expired' | 'suspended' | 'not_found';
  days_left: number;
  amount_due: number;
  store_name?: string;
  store_code?: string;
  plan_name?: PlanName;
  subscription_status?: SubscriptionStatus;
  trial_ends_at?: string;
  subscription_ends_at?: string | null;
  admin_whatsapp: string;
  admin_phone: string;
  admin_upi_id: string;
  gateway_enabled: boolean;
  gateway_provider: GatewayProvider;
}
