# Kirana SaaS Super Admin Control Panel

A production-ready, mobile-responsive **Super Admin SaaS Control Panel** for the creator/owner of the Kirana Store multi-tenant platform. Connected to the **exact same Supabase production project** (PostgreSQL + Auth + Edge Functions + Realtime) shared with **App 1 (Owner & Staff App)** and **App 2 (Wholesale Customer App)**.

---

## 🚀 Quick Start

To launch the Super Admin dashboard locally:

```bash
# In c:\Users\dines\Downloads\kirana-super-admin
npm run dev
```

Or double-click `run.bat`. The app opens at `http://localhost:5175`.

---

## 🔐 1. Super Admin Authentication & Security

- **Strict Admin-Only Access:** Only accounts registered in the PostgreSQL table `platform_admins` can log in and view this portal.
- **Login Credentials:**
  - Phone or Email + Password (e.g., `9876543210` or `9876543210@kirana.app`).
  - Pre-seeded Primary Super Admin: **Dinesh Patel** (`9876543210`).
  - To seed or promote another admin, run:
    ```sql
    INSERT INTO platform_admins (auth_user_id, email, phone, name, role)
    SELECT id, email, '9876543210', 'Dinesh Patel', 'super_admin'
    FROM auth.users
    WHERE email = '9876543210@kirana.app'
    ON CONFLICT (email) DO NOTHING;
    ```
- **Realtime Session Verification:** If a non-admin attempts to log in, the dashboard immediately signs them out and denies entry with a strict error message.

---

## 🗄️ 2. Database Schema Extensions (Non-Breaking Additions to Shared Supabase)

### Added Columns to `stores`:
- `plan_name` (`'trial' | 'basic' | 'pro' | 'enterprise'`, default `'trial'`)
- `subscription_status` (`'trial' | 'active' | 'expired' | 'suspended'`, default `'trial'`)
- `trial_ends_at` (`timestamptz`, default `now() + interval '3 days'`)
- `subscription_ends_at` (`timestamptz`, nullable)
- `custom_plan_price` (`numeric`, default `499`)
- `billing_cycle` (`'monthly' | 'quarterly' | 'yearly'`, default `'monthly'`)
- `admin_notes` (`text`)

### Created Tables:
- `platform_admins` (`id`, `auth_user_id`, `email`, `phone`, `name`, `role`, `created_at`)
- `platform_settings` (`id`, `brand_name`, `support_phone`, `support_whatsapp`, `default_trial_days`, `default_monthly_price`, `default_yearly_price`, `gateway_provider`, `gateway_enabled`, `gateway_mode`, `gateway_base_url`, `gateway_merchant_id`, `gateway_api_key`, `gateway_api_secret`, `gateway_webhook_secret`, `admin_upi_id`, `updated_at`)
- `saas_payments` (`id`, `store_id`, `amount`, `plan_name`, `billing_cycle`, `gateway_order_id`, `utr_number`, `status`, `days_added`, `payment_method`, `notes`, `created_at`, `verified_at`)

### PostgreSQL RPCs:
1. `get_store_access_status(p_store_id uuid)`:
   - Callable by App 1 & App 2.
   - Evaluates `is_active`, `trial_ends_at`, and `subscription_ends_at`.
   - Returns `{ allowed, reason, days_left, amount_due, admin_whatsapp, admin_phone, admin_upi_id, gateway_enabled, gateway_provider }`.
2. `delete_store_permanently(p_store_id uuid)`:
   - Callable ONLY by Super Admins.
   - Safely cascades and wipes all associated store data (`orders`, `order_items`, `khata_transactions`, `wholesale_customers`, `stock_transactions`, `price_alerts`, `inventory_items`, `categories`, `daily_hisaab`, `agency_payments`, `pending_hisaab`, `agencies`, `store_payment_gateways`, `payment_transactions`, `store_users`, `saas_payments`, and auth users).
3. `record_saas_payment(p_store_id, p_amount, p_plan_name, p_billing_cycle, p_utr_number, p_days_to_add, p_notes)`:
   - Atomically records payment as `success`, activates store (`is_active = true`, `subscription_status = 'active'`), and adds days to `subscription_ends_at`.
4. `setup_platform_admin(p_email, p_phone, p_name, p_auth_user_id, p_role)`:
   - Helper to register and link platform admins.

---

## ⚡ 3. Deployed Supabase Edge Functions

1. **`create-saas-renewal-order`**:
   - Endpoint: `https://csfcnektkkxgzvinjayn.supabase.co/functions/v1/create-saas-renewal-order`
   - Triggered when a store owner clicks **"Pay Now"** on the expired demo paywall in App 1.
   - Automatically uses the **Admin's Master Gateway** (Manual UPI, Custom UPI, or Razorpay configured in `platform_settings`).
   - Returns NPCI Dynamic UPI QR payload and payment URL.
2. **`verify-saas-renewal-webhook`**:
   - Endpoint: `https://csfcnektkkxgzvinjayn.supabase.co/functions/v1/verify-saas-renewal-webhook`
   - Verifies incoming webhook from Razorpay or Custom UPI Gateway.
   - Automatically activates store (`is_active = true`, `subscription_status = 'active'`, `subscription_ends_at += 30 days`).

---

## 📱 4. Control Panel Modules & Screens

1. **Overview (Dashboard):**
   - KPI cards: Total Stores (Retail/Wholesale/Mix badges), Active Paid Stores & MRR (₹), Active 3-Day Trials, Expired/Suspended Stores.
   - Trials Expiring Soon list (< 48h / < 24h) with 1-click `+3 Days Demo` extender and `WhatsApp Reminder` generator.
   - Realtime live feed of new store registrations and recent SaaS payments.
   - Store type breakdown chart.
2. **Stores Management (Control Center):**
   - Search by Store Code (`KRN-XXXXXX`), Shop Name, Owner, Phone.
   - Filter by Store Type and Subscription Status.
   - 1-click Kill Switch toggle (`is_active`).
   - Store Detail Drawer:
     * Access & Timer Controls (`+3d`, `+7d`, `+1m`, `+1y`, Expire Now).
     * Custom negotiated price (e.g., ₹499/mo) which updates their paywall price.
     * Per-Store Feature Flags (wholesale, customer app, WhatsApp billing, PDF export, dead stock, daily hisaab, payment gateway).
     * Numeric limits (`max_staff_limit`, `max_customers_limit`).
     * Edit shop info and private Admin Notes.
     * Live read-only usage stats (items, orders, staff, customers).
     * WhatsApp follow-up button.
     * **Danger Zone:** Strict confirmation modal requiring the Admin to type the exact store code before permanently deleting the store and all child records.
3. **SaaS Payments:**
   - Audit trail of subscription payments.
   - Filter by status (`success`, `pending`, `failed`).
   - `+ Record Manual Cash/UPI Payment` button to quickly log offline cash/UPI renewals and activate stores.
4. **Platform & Gateway Settings:**
   - Configure Brand Name, Support Phone, Support WhatsApp, Default Demo Days, Default Monthly & Yearly Prices.
   - Admin's Payment Gateway configuration (`Manual UPI` | `Custom UPI Gateway` | `Razorpay`) with API Keys, Secrets, and Webhook URL.
   - Live NPCI UPI QR preview generator for the Admin's UPI ID.
5. **Platform Admins:**
   - Manage team members with Super Admin, Admin, and Support roles.
   - Add new admin or revoke access with self-deletion safeguards.
