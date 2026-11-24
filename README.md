# Kirana Flow System (Multi-App Ecosystem)

A complete SaaS & B2B/B2C retail ecosystem for Indian Kirana stores, wholesale businesses, and platform administrators.

---

## 🏗️ Architecture Overview

The repository consists of 3 integrated web applications powered by **Supabase (PostgreSQL, Auth, Edge Functions, Realtime)** and **Vite + React + Tailwind CSS**:

```
kirana-flow-system/
├── owner-app/       # App 1: Kirana Store Owner & Staff Management App
├── customer-app/    # App 2: Kirana Wholesale B2B Customer Mobile Web App
└── admin-app/       # App 3: Kirana Super Admin SaaS Control Panel
```

---

## 📱 Applications

### 1. `owner-app` (Store Owner & Staff App)
- **Role**: Store Owners, Cashiers, and Staff members.
- **Key Features**:
  - Fast billing & point of sale (POS) with barcode/search
  - Inventory management & Low-stock alerts
  - Customer Khata & Udhar credit ledger with PDF statements
  - Agency/Vendor management & purchase order history
  - Dead stock tracker & recovery discount automation
  - Daily/Monthly sales reports & analytics
  - Subscription paywall & automatic Razorpay/Custom UPI renewal integration
  - Edge Functions for staff signup, payments, and SaaS renewal webhooks

### 2. `customer-app` (Customer B2B Ordering & Khata App)
- **Role**: Registered retail customers and wholesale buyers.
- **Key Features**:
  - Storefront catalog browsing by category & quick search
  - Cart, real-time totals, and checkout
  - Real-time order placement & live status tracking
  - Digital Khata passbook with payment receipts & PDF statements
  - Store subscription & trial verification guard

### 3. `admin-app` (Super Admin SaaS Control Panel)
- **Role**: Platform Administrators & Super Admins.
- **Key Features**:
  - Multi-store fleet overview (active, trialing, suspended, revenue KPIs)
  - Full store management (trial extension, plan switching, activation/suspension, permanent wipe)
  - SaaS Payments ledger with verification and manual payment recording
  - Platform & Gateway settings (Razorpay keys, UPI gateway config, trial duration, plan pricing)
  - Platform Admin RBAC (Super Admin, Support Admin, Finance Viewer)

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js (v18+)
- npm or pnpm

### Running Any App Locally

#### 1. Store Owner App:
```bash
cd owner-app
npm install
npm run dev
```

#### 2. Customer App:
```bash
cd customer-app
npm install
npm run dev
```

#### 3. Super Admin App:
```bash
cd admin-app
npm install
npm run dev
```
