/*
# Kirana Store Management — Initial Schema

1. Purpose
Multi-tenant kirana store management backend. Every table is scoped by `store_id`
(the tenant key). Owners/staff log in with mobile + password; wholesale customers
log in to a companion app with credentials created by the store owner.

2. New Tables
- `stores`, `store_users`, `categories`, `agencies`, `inventory_items`,
  `stock_transactions`, `price_alerts`, `wholesale_customers`, `orders`,
  `order_items`, `khata_transactions`, `daily_hisaab`, `agency_payments`,
  `pending_hisaab`, `staff_agency_permissions`, `staff_customer_permissions`,
  `audit_logs` — as specified in the shared schema (17 tables).

3. Enums
store_type, user_role, stock_tx_type, order_status, fulfillment_type,
order_payment_mode, khata_tx_type, agency_payment_status, hisaab_entry_type,
hisaab_status — created via guarded DO blocks (idempotent).

4. Functions & Triggers
- `set_updated_at()` — generic updated_at maintainer.
- `is_store_member/owner(store)` — SECURITY DEFINER RLS helpers.
- `generate_store_code()`, `next_order_number(store)`.
- `bump_item_stock()` — after-insert trigger on stock_transactions applying
  the stock delta and refreshing `last_movement_at`.

5. Security
- RLS on all 17 tables; policies scoped `TO authenticated` via the helper
  functions (avoids recursion). Grants to `authenticated` only (anon revoked);
  `service_role` grants for the signup edge function.
*/

-- ============ enums ============
DO $$ BEGIN
  CREATE TYPE public.store_type AS ENUM ('retail', 'wholesale', 'mix');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('owner', 'staff');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.stock_tx_type AS ENUM ('stock_in', 'stock_out_retail', 'stock_out_wholesale', 'adjustment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM ('placed','seen','packed','out_for_delivery','ready_for_pickup','delivered','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.fulfillment_type AS ENUM ('delivery','pickup');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.order_payment_mode AS ENUM ('cash','upi','khata','split');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.khata_tx_type AS ENUM ('debit_order','debit_manual','credit_payment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.agency_payment_status AS ENUM ('approved','pending','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.hisaab_entry_type AS ENUM ('customer_collection','agency_payment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.hisaab_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ tables ============
CREATE TABLE IF NOT EXISTS public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_code text UNIQUE NOT NULL,
  shop_name text NOT NULL,
  owner_name text NOT NULL,
  phone text UNIQUE NOT NULL,
  address text,
  upi_id text,
  gstin text,
  store_type public.store_type NOT NULL DEFAULT 'retail',
  is_active boolean NOT NULL DEFAULT true,
  feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  dead_stock_days int NOT NULL DEFAULT 10,
  language text NOT NULL DEFAULT 'en',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.store_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  role public.user_role NOT NULL DEFAULT 'staff',
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  max_discount_pct numeric NOT NULL DEFAULT 0,
  customer_access_mode text NOT NULL DEFAULT 'all',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, phone)
);

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, name)
);

CREATE TABLE IF NOT EXISTS public.agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  balance numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  default_agency_id uuid REFERENCES public.agencies(id) ON DELETE SET NULL,
  name text NOT NULL,
  brand text,
  unit_type text NOT NULL DEFAULT 'Pcs',
  unit_value numeric NOT NULL DEFAULT 1,
  metric text NOT NULL DEFAULT 'pcs',
  current_stock numeric NOT NULL DEFAULT 0,
  low_stock_threshold numeric NOT NULL DEFAULT 10,
  avg_base_price numeric NOT NULL DEFAULT 0,
  latest_price numeric NOT NULL DEFAULT 0,
  auto_update_threshold numeric NOT NULL DEFAULT 5,
  wholesale_price numeric NOT NULL DEFAULT 0,
  retail_price numeric NOT NULL DEFAULT 0,
  is_visible_to_customers boolean NOT NULL DEFAULT true,
  last_movement_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stock_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  type public.stock_tx_type NOT NULL,
  quantity numeric NOT NULL,
  unit_price numeric NOT NULL DEFAULT 0,
  agency_id uuid REFERENCES public.agencies(id) ON DELETE SET NULL,
  order_id uuid,
  performed_by_user_id uuid REFERENCES public.store_users(id) ON DELETE SET NULL,
  payment_status text,
  notes text,
  bill_photo_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.price_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  old_price numeric NOT NULL,
  new_price numeric NOT NULL,
  diff_amount numeric NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wholesale_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  shop_name text NOT NULL,
  phone text NOT NULL,
  address text,
  password_digest text,
  credit_limit numeric NOT NULL DEFAULT 0,
  current_khata_balance numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, phone)
);

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.wholesale_customers(id) ON DELETE CASCADE,
  order_number text NOT NULL,
  fulfillment_type public.fulfillment_type NOT NULL DEFAULT 'delivery',
  status public.order_status NOT NULL DEFAULT 'placed',
  subtotal numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  final_total numeric NOT NULL DEFAULT 0,
  payment_mode public.order_payment_mode,
  paid_amount numeric NOT NULL DEFAULT 0,
  khata_amount numeric NOT NULL DEFAULT 0,
  seen_by_user_id uuid REFERENCES public.store_users(id) ON DELETE SET NULL,
  delivered_by_user_id uuid REFERENCES public.store_users(id) ON DELETE SET NULL,
  delivery_proof_url text,
  delivery_notes text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  item_name_snapshot text NOT NULL,
  quantity numeric NOT NULL,
  original_unit_price numeric NOT NULL,
  final_unit_price numeric NOT NULL,
  line_total numeric NOT NULL,
  price_adjusted_by_user_id uuid REFERENCES public.store_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.khata_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.wholesale_customers(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  type public.khata_tx_type NOT NULL,
  amount numeric NOT NULL,
  payment_mode text,
  balance_after numeric NOT NULL DEFAULT 0,
  performed_by_user_id uuid REFERENCES public.store_users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_hisaab (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  hisaab_date date NOT NULL,
  cash_sales numeric NOT NULL DEFAULT 0,
  upi_sales numeric NOT NULL DEFAULT 0,
  auto_khata_sales numeric NOT NULL DEFAULT 0,
  expenses numeric NOT NULL DEFAULT 0,
  notes text,
  updated_by_user_id uuid REFERENCES public.store_users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, hisaab_date)
);

CREATE TABLE IF NOT EXISTS public.agency_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  payment_mode text NOT NULL DEFAULT 'cash',
  paid_by_user_id uuid REFERENCES public.store_users(id) ON DELETE SET NULL,
  status public.agency_payment_status NOT NULL DEFAULT 'approved',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pending_hisaab (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  staff_user_id uuid REFERENCES public.store_users(id) ON DELETE SET NULL,
  entry_type public.hisaab_entry_type NOT NULL,
  reference_id uuid,
  amount numeric NOT NULL,
  payment_mode text,
  status public.hisaab_status NOT NULL DEFAULT 'pending',
  review_note text,
  reviewed_by_user_id uuid REFERENCES public.store_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.staff_agency_permissions (
  staff_user_id uuid NOT NULL REFERENCES public.store_users(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  PRIMARY KEY (staff_user_id, agency_id)
);

CREATE TABLE IF NOT EXISTS public.staff_customer_permissions (
  staff_user_id uuid NOT NULL REFERENCES public.store_users(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.wholesale_customers(id) ON DELETE CASCADE,
  fulfillment_only boolean NOT NULL DEFAULT false,
  PRIMARY KEY (staff_user_id, customer_id)
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES public.store_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ indexes ============
CREATE INDEX IF NOT EXISTS idx_store_users_store ON public.store_users(store_id);
CREATE INDEX IF NOT EXISTS idx_store_users_auth ON public.store_users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_categories_store ON public.categories(store_id);
CREATE INDEX IF NOT EXISTS idx_agencies_store ON public.agencies(store_id);
CREATE INDEX IF NOT EXISTS idx_items_store ON public.inventory_items(store_id);
CREATE INDEX IF NOT EXISTS idx_stock_tx_store ON public.stock_transactions(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_tx_item ON public.stock_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_store ON public.price_alerts(store_id, is_read);
CREATE INDEX IF NOT EXISTS idx_customers_store ON public.wholesale_customers(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_store ON public.orders(store_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_khata_store ON public.khata_transactions(store_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hisaab_store_date ON public.daily_hisaab(store_id, hisaab_date DESC);
CREATE INDEX IF NOT EXISTS idx_agency_payments_store ON public.agency_payments(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_hisaab_store ON public.pending_hisaab(store_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_store ON public.audit_logs(store_id, created_at DESC);

-- ============ functions ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_store_member(p_store_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.store_users
    WHERE store_id = p_store_id
      AND auth_user_id = auth.uid()
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_store_owner(p_store_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.store_users
    WHERE store_id = p_store_id
      AND auth_user_id = auth.uid()
      AND role = 'owner'
      AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.generate_store_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  LOOP
    v_code := 'KRN-' || lpad((floor(random() * 900000) + 100000)::int::text, 6, '0');
    IF NOT EXISTS (SELECT 1 FROM public.stores WHERE store_code = v_code) THEN
      RETURN v_code;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.next_order_number(p_store_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) + 1 INTO v_count FROM public.orders WHERE store_id = p_store_id;
  RETURN 'ORD-' || lpad(v_count::text, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.bump_item_stock()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_delta numeric;
BEGIN
  IF NEW.type = 'stock_in' THEN
    v_delta := NEW.quantity;
  ELSIF NEW.type = 'adjustment' THEN
    v_delta := 0;
  ELSE
    v_delta := -NEW.quantity;
  END IF;
  IF v_delta <> 0 THEN
    UPDATE public.inventory_items
       SET current_stock = current_stock + v_delta,
           last_movement_at = now()
     WHERE id = NEW.item_id;
  ELSE
    UPDATE public.inventory_items
       SET last_movement_at = now()
     WHERE id = NEW.item_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_item_stock ON public.stock_transactions;
CREATE TRIGGER trg_bump_item_stock
AFTER INSERT ON public.stock_transactions
FOR EACH ROW EXECUTE FUNCTION public.bump_item_stock();

DROP TRIGGER IF EXISTS trg_touch_orders ON public.orders;
CREATE TRIGGER trg_touch_orders
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_touch_hisaab ON public.daily_hisaab;
CREATE TRIGGER trg_touch_hisaab
BEFORE UPDATE ON public.daily_hisaab
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ RLS ============
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wholesale_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.khata_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_hisaab ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_hisaab ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_agency_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_customer_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ---- stores ----
DROP POLICY IF EXISTS "members_read_store" ON public.stores;
CREATE POLICY "members_read_store" ON public.stores FOR SELECT
TO authenticated USING (public.is_store_member(id));

DROP POLICY IF EXISTS "owner_updates_store" ON public.stores;
CREATE POLICY "owner_updates_store" ON public.stores FOR UPDATE
TO authenticated USING (public.is_store_owner(id))
WITH CHECK (public.is_store_owner(id));

-- ---- store_users ----
DROP POLICY IF EXISTS "members_read_users" ON public.store_users;
CREATE POLICY "members_read_users" ON public.store_users FOR SELECT
TO authenticated USING (public.is_store_member(store_id));

DROP POLICY IF EXISTS "owner_inserts_users" ON public.store_users;
CREATE POLICY "owner_inserts_users" ON public.store_users FOR INSERT
TO authenticated WITH CHECK (public.is_store_owner(store_id));

DROP POLICY IF EXISTS "owner_updates_users" ON public.store_users;
CREATE POLICY "owner_updates_users" ON public.store_users FOR UPDATE
TO authenticated
USING (public.is_store_owner(store_id) OR auth_user_id = auth.uid())
WITH CHECK (public.is_store_owner(store_id) OR auth_user_id = auth.uid());

DROP POLICY IF EXISTS "owner_deletes_users" ON public.store_users;
CREATE POLICY "owner_deletes_users" ON public.store_users FOR DELETE
TO authenticated USING (public.is_store_owner(store_id));

-- ---- categories ----
DROP POLICY IF EXISTS "member_select" ON public.categories;
CREATE POLICY "member_select" ON public.categories FOR SELECT TO authenticated USING (public.is_store_member(store_id));
DROP POLICY IF EXISTS "member_insert" ON public.categories;
CREATE POLICY "member_insert" ON public.categories FOR INSERT TO authenticated WITH CHECK (public.is_store_member(store_id));
DROP POLICY IF EXISTS "member_update" ON public.categories;
CREATE POLICY "member_update" ON public.categories FOR UPDATE TO authenticated USING (public.is_store_member(store_id)) WITH CHECK (public.is_store_member(store_id));
DROP POLICY IF EXISTS "member_delete" ON public.categories;
CREATE POLICY "member_delete" ON public.categories FOR DELETE TO authenticated USING (public.is_store_member(store_id));

-- ---- agencies ----
DROP POLICY IF EXISTS "member_select" ON public.agencies;
CREATE POLICY "member_select" ON public.agencies FOR SELECT TO authenticated USING (public.is_store_member(store_id));
DROP POLICY IF EXISTS "member_insert" ON public.agencies;
CREATE POLICY "member_insert" ON public.agencies FOR INSERT TO authenticated WITH CHECK (public.is_store_member(store_id));
DROP POLICY IF EXISTS "member_update" ON public.agencies;
CREATE POLICY "member_update" ON public.agencies FOR UPDATE TO authenticated USING (public.is_store_member(store_id)) WITH CHECK (public.is_store_member(store_id));
DROP POLICY IF EXISTS "owner_delete" ON public.agencies;
CREATE POLICY "owner_delete" ON public.agencies FOR DELETE TO authenticated USING (public.is_store_owner(store_id));

-- ---- inventory_items ----
DROP POLICY IF EXISTS "member_select" ON public.inventory_items;
CREATE POLICY "member_select" ON public.inventory_items FOR SELECT TO authenticated USING (public.is_store_member(store_id));
DROP POLICY IF EXISTS "member_insert" ON public.inventory_items;
CREATE POLICY "member_insert" ON public.inventory_items FOR INSERT TO authenticated WITH CHECK (public.is_store_member(store_id));
DROP POLICY IF EXISTS "member_update" ON public.inventory_items;
CREATE POLICY "member_update" ON public.inventory_items FOR UPDATE TO authenticated USING (public.is_store_member(store_id)) WITH CHECK (public.is_store_member(store_id));
DROP POLICY IF EXISTS "owner_delete" ON public.inventory_items;
CREATE POLICY "owner_delete" ON public.inventory_items FOR DELETE TO authenticated USING (public.is_store_owner(store_id));

-- ---- stock_transactions ----
DROP POLICY IF EXISTS "member_select" ON public.stock_transactions;
CREATE POLICY "member_select" ON public.stock_transactions FOR SELECT TO authenticated USING (public.is_store_member(store_id));
DROP POLICY IF EXISTS "member_insert" ON public.stock_transactions;
CREATE POLICY "member_insert" ON public.stock_transactions FOR INSERT TO authenticated WITH CHECK (public.is_store_member(store_id));
DROP POLICY IF EXISTS "member_update" ON public.stock_transactions;
CREATE POLICY "member_update" ON public.stock_transactions FOR UPDATE TO authenticated USING (public.is_store_member(store_id)) WITH CHECK (public.is_store_member(store_id));
DROP POLICY IF EXISTS "owner_delete" ON public.stock_transactions;
CREATE POLICY "owner_delete" ON public.stock_transactions FOR DELETE TO authenticated USING (public.is_store_owner(store_id));

-- ---- price_alerts ----
DROP POLICY IF EXISTS "member_select" ON public.price_alerts;
CREATE POLICY "member_select" ON public.price_alerts FOR SELECT TO authenticated USING (public.is_store_member(store_id));
DROP POLICY IF EXISTS "member_insert" ON public.price_alerts;
CREATE POLICY "member_insert" ON public.price_alerts FOR INSERT TO authenticated WITH CHECK (public.is_store_member(store_id));
DROP POLICY IF EXISTS "member_update" ON public.price_alerts;
CREATE POLICY "member_update" ON public.price_alerts FOR UPDATE TO authenticated USING (public.is_store_member(store_id)) WITH CHECK (public.is_store_member(store_id));
DROP POLICY IF EXISTS "owner_delete" ON public.price_alerts;
CREATE POLICY "owner_delete" ON public.price_alerts FOR DELETE TO authenticated USING (public.is_store_owner(store_id));

-- ---- wholesale_customers ----
DROP POLICY IF EXISTS "member_select" ON public.wholesale_customers;
CREATE POLICY "member_select" ON public.wholesale_customers FOR SELECT TO authenticated USING (public.is_store_member(store_id));
DROP POLICY IF EXISTS "member_insert" ON public.wholesale_customers;
CREATE POLICY "member_insert" ON public.wholesale_customers FOR INSERT TO authenticated WITH CHECK (public.is_store_member(store_id));
DROP POLICY IF EXISTS "member_update" ON public.wholesale_customers;
CREATE POLICY "member_update" ON public.wholesale_customers FOR UPDATE TO authenticated USING (public.is_store_member(store_id)) WITH CHECK (public.is_store_member(store_id));
DROP POLICY IF EXISTS "owner_delete" ON public.wholesale_customers;
CREATE POLICY "owner_delete" ON public.wholesale_customers FOR DELETE TO authenticated USING (public.is_store_owner(store_id));

-- ---- orders ----
DROP POLICY IF EXISTS "member_select" ON public.orders;
CREATE POLICY "member_select" ON public.orders FOR SELECT TO authenticated USING (public.is_store_member(store_id));
DROP POLICY IF EXISTS "member_insert" ON public.orders;
CREATE POLICY "member_insert" ON public.orders FOR INSERT TO authenticated WITH CHECK (public.is_store_member(store_id));
DROP POLICY IF EXISTS "member_update" ON public.orders;
CREATE POLICY "member_update" ON public.orders FOR UPDATE TO authenticated USING (public.is_store_member(store_id)) WITH CHECK (public.is_store_member(store_id));
DROP POLICY IF EXISTS "member_cancel" ON public.orders;
CREATE POLICY "member_cancel" ON public.orders FOR DELETE TO authenticated USING (public.is_store_member(store_id));

-- ---- order_items ----
DROP POLICY IF EXISTS "member_select" ON public.order_items;
CREATE POLICY "member_select" ON public.order_items FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND public.is_store_member(o.store_id)));
DROP POLICY IF EXISTS "member_insert" ON public.order_items;
CREATE POLICY "member_insert" ON public.order_items FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND public.is_store_member(o.store_id)));
DROP POLICY IF EXISTS "member_update" ON public.order_items;
CREATE POLICY "member_update" ON public.order_items FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND public.is_store_member(o.store_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND public.is_store_member(o.store_id)));
DROP POLICY IF EXISTS "member_delete" ON public.order_items;
CREATE POLICY "member_delete" ON public.order_items FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND public.is_store_member(o.store_id)));

-- ---- khata_transactions ----
DROP POLICY IF EXISTS "member_select" ON public.khata_transactions;
CREATE POLICY "member_select" ON public.khata_transactions FOR SELECT TO authenticated USING (public.is_store_member(store_id));
DROP POLICY IF EXISTS "member_insert" ON public.khata_transactions;
CREATE POLICY "member_insert" ON public.khata_transactions FOR INSERT TO authenticated WITH CHECK (public.is_store_member(store_id));
DROP POLICY IF EXISTS "member_update" ON public.khata_transactions;
CREATE POLICY "member_update" ON public.khata_transactions FOR UPDATE TO authenticated USING (public.is_store_member(store_id)) WITH CHECK (public.is_store_member(store_id));
DROP POLICY IF EXISTS "owner_delete" ON public.khata_transactions;
CREATE POLICY "owner_delete" ON public.khata_transactions FOR DELETE TO authenticated USING (public.is_store_owner(store_id));

-- ---- daily_hisaab ----
DROP POLICY IF EXISTS "member_select" ON public.daily_hisaab;
CREATE POLICY "member_select" ON public.daily_hisaab FOR SELECT TO authenticated USING (public.is_store_member(store_id));
DROP POLICY IF EXISTS "member_insert" ON public.daily_hisaab;
CREATE POLICY "member_insert" ON public.daily_hisaab FOR INSERT TO authenticated WITH CHECK (public.is_store_member(store_id));
DROP POLICY IF EXISTS "member_update" ON public.daily_hisaab;
CREATE POLICY "member_update" ON public.daily_hisaab FOR UPDATE TO authenticated USING (public.is_store_member(store_id)) WITH CHECK (public.is_store_member(store_id));

-- ---- agency_payments ----
DROP POLICY IF EXISTS "member_select" ON public.agency_payments;
CREATE POLICY "member_select" ON public.agency_payments FOR SELECT TO authenticated USING (public.is_store_member(store_id));
DROP POLICY IF EXISTS "member_insert" ON public.agency_payments;
CREATE POLICY "member_insert" ON public.agency_payments FOR INSERT TO authenticated WITH CHECK (public.is_store_member(store_id));
DROP POLICY IF EXISTS "member_update" ON public.agency_payments;
CREATE POLICY "member_update" ON public.agency_payments FOR UPDATE TO authenticated USING (public.is_store_member(store_id)) WITH CHECK (public.is_store_member(store_id));
DROP POLICY IF EXISTS "owner_delete" ON public.agency_payments;
CREATE POLICY "owner_delete" ON public.agency_payments FOR DELETE TO authenticated USING (public.is_store_owner(store_id));

-- ---- pending_hisaab ----
DROP POLICY IF EXISTS "member_select" ON public.pending_hisaab;
CREATE POLICY "member_select" ON public.pending_hisaab FOR SELECT TO authenticated USING (public.is_store_member(store_id));
DROP POLICY IF EXISTS "member_insert" ON public.pending_hisaab;
CREATE POLICY "member_insert" ON public.pending_hisaab FOR INSERT TO authenticated WITH CHECK (public.is_store_member(store_id));
DROP POLICY IF EXISTS "owner_update" ON public.pending_hisaab;
CREATE POLICY "owner_update" ON public.pending_hisaab FOR UPDATE TO authenticated USING (public.is_store_owner(store_id)) WITH CHECK (public.is_store_owner(store_id));

-- ---- staff_agency_permissions ----
DROP POLICY IF EXISTS "member_select" ON public.staff_agency_permissions;
CREATE POLICY "member_select" ON public.staff_agency_permissions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.store_users su WHERE su.id = staff_user_id AND public.is_store_member(su.store_id)));
DROP POLICY IF EXISTS "member_insert" ON public.staff_agency_permissions;
CREATE POLICY "member_insert" ON public.staff_agency_permissions FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.store_users su WHERE su.id = staff_user_id AND public.is_store_member(su.store_id)));
DROP POLICY IF EXISTS "member_delete" ON public.staff_agency_permissions;
CREATE POLICY "member_delete" ON public.staff_agency_permissions FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.store_users su WHERE su.id = staff_user_id AND public.is_store_member(su.store_id)));

-- ---- staff_customer_permissions ----
DROP POLICY IF EXISTS "member_select" ON public.staff_customer_permissions;
CREATE POLICY "member_select" ON public.staff_customer_permissions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.store_users su WHERE su.id = staff_user_id AND public.is_store_member(su.store_id)));
DROP POLICY IF EXISTS "member_insert" ON public.staff_customer_permissions;
CREATE POLICY "member_insert" ON public.staff_customer_permissions FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.store_users su WHERE su.id = staff_user_id AND public.is_store_member(su.store_id)));
DROP POLICY IF EXISTS "member_delete" ON public.staff_customer_permissions;
CREATE POLICY "member_delete" ON public.staff_customer_permissions FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.store_users su WHERE su.id = staff_user_id AND public.is_store_member(su.store_id)));

-- ---- audit_logs ----
DROP POLICY IF EXISTS "member_select" ON public.audit_logs;
CREATE POLICY "member_select" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_store_member(store_id));
DROP POLICY IF EXISTS "member_insert" ON public.audit_logs;
CREATE POLICY "member_insert" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (public.is_store_member(store_id));

-- ============ grants ============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agencies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_alerts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wholesale_customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.khata_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_hisaab TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_hisaab TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_agency_permissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_customer_permissions TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.store_users TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO service_role;
GRANT EXECUTE ON FUNCTION public.is_store_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_store_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_order_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_store_code() TO service_role;
REVOKE ALL ON public.audit_logs FROM anon;
REVOKE ALL ON public.stores FROM anon;
REVOKE ALL ON public.audit_logs FROM PUBLIC;
REVOKE ALL ON public.stores FROM PUBLIC;