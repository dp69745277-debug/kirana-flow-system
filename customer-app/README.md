# Kirana B2B Wholesale Customer App (Retailer Companion Portal)

A production-ready, mobile-first **B2B Wholesale Ordering Web App (PWA-ready)** with a clean **Flipkart / Amazon-style shopping experience** designed for Kirana retailers who buy wholesale stock from their distributor/wholesaler.

Built with **React 18 + Vite + TypeScript + Tailwind CSS + Lucide Icons + jsPDF + Supabase Realtime**, connected to the **EXACT SAME Supabase backend** as App 1 (Owner & Staff App).

---

## 🚀 Quick Start

1. **Double-click `run.bat`** (or run `npm run dev`)
2. Open [http://localhost:5174](http://localhost:5174) in your browser (or on Android/iOS via local network IP)
3. Log in with your 10-digit mobile number and password created by your wholesaler in App 1.

---

## 🌟 Key Features

### 1. Multi-Tenant Backend & Security Rules
- **Shared Supabase Database:** Uses the exact same `stores`, `wholesale_customers`, `inventory_items`, `categories`, `orders`, `order_items`, and `khata_transactions` tables.
- **Row-Level Security (RLS):** Configured so retailers can read visible inventory items and their own khata, orders, and linked store information.
- **Kill-Switch Checks:**
  - Verifies `stores.is_active === true` (Super Admin kill switch).
  - Verifies `wholesale_customers.is_active === true` (Owner block toggle).
  - Verifies `stores.store_type === 'wholesale' | 'mix'`.

### 2. Top App Bar & Navigation
- **Connected Wholesaler:** Displays wholesaler name, store code, and customer's own shop name.
- **Live Pending Khata Pill:** Shows live due amount (e.g., `Due: ₹14,200`), tapping opens Khata statement.
- **Instant Language Switcher:** Switch between `English`, `Hinglish`, and `हिन्दी` at any time.
- **Navigation:** 4 tabs on mobile bottom bar / desktop left sidebar:
  1. **Shop**
  2. **Cart** (with live badge)
  3. **Orders** (with live active order count badge)
  4. **Khata** (Passbook & Profile)

### 3. Screen 1: Home / B2B Shop Catalog
- **Top Store Banner:** Quick **Call** (`tel:`) and **WhatsApp** (`wa.me`) buttons to wholesaler.
- **Active Order Live Banner:** Clickable banner tracking any current in-flight order.
- **Search & Category Chips:** Flipkart-style search bar + category chips (`30 kg / pota`, `50 kg / katta`, etc.) + `In Stock Only` filter.
- **1-Click "Buy Again / Frequent Items" Shelf:** Reorder frequently bought goods in seconds.
- **B2B Product Cards:** Item name, brand, pack size, unit price, stock badges (`In Stock`, `Low Stock`, `Out of Stock`), and fast B2B stepper with `+5` and `+10` quick add.

### 4. Screen 2: Cart & Smart Checkout
- **Smart "Add to Active Order" Feature:** If the retailer already has an open order in `placed` or `seen` status, the app lets them merge newly selected items into that active order instead of making repeated phone calls!
- **Fulfillment Mode:**
  - **`Staff Delivery`** (*"Deliver to my shop"* - with saved shop address)
  - **`Self-Pickup`** (*"I will pick it up myself from wholesaler's counter"*)
- **Estimated Bill & Order Notes:** Clear bill summary with disclaimer note.
- **Place Order CTA:** Creates order with Supabase RPC order numbering and fires celebratory confetti!

### 5. Screen 3: Orders & Real-Time Tracking
- **Two Sub-Tabs:** `Active Orders` and `Order History`.
- **Live Real-Time Stepper:** Updates via Supabase Realtime when Owner/Staff updates status in App 1:
  - `Order Placed` ➔ `Seen by [Staff Name]` ➔ `Packed` ➔ `Out for Delivery` / `Ready for Pickup` ➔ `Delivered by [Staff Name]`.
- **Billing Transparency:** Highlights any price adjustment made by the wholesaler (`Original ₹X -> Final ₹Y`).
- **Settlement Summary:** Displays cash, UPI, or Khata udhaar breakdown once completed.
- **PDF Invoice Download:** Client-side invoice generation via `jsPDF` + `jspdf-autotable`.
- **1-Click Reorder:** Reloads all items from past orders into cart.

### 6. Screen 4: Khata Passbook & Account Profile
- **Pending Balance Card:** Large total balance with monthly billed and paid stats.
- **1-Click Pay via UPI:** Opens `upi://pay` with wholesaler's UPI ID and balance on mobile + desktop copy button.
- **Transparent Passbook:** Date-filtered ledger entries with Running Balance (`balance_after`), handled by staff name, and tapping order entries opens the itemized bill.
- **Download Khata Statement PDF:** Formatted ledger statement PDF.
