import React, { useState, useEffect } from 'react';
import {
  Store as StoreIcon,
  X,
  Clock,
  Power,
  Shield,
  Layers,
  FileText,
  DollarSign,
  Calendar,
  AlertTriangle,
  Trash2,
  Send,
  Save,
  CheckCircle2,
  Users,
  Package,
  ShoppingCart,
  Phone,
  Copy,
  Check,
  Zap,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Store as StoreModel, FeatureFlags, PlanName, SubscriptionStatus, BillingCycle } from '@/lib/types';
import { Modal, Button, Input, Label, Textarea, Select, Badge, ConfirmDialog, useToast } from '@/components/ui';
import { formatCurrency, formatDate, formatDateTime, formatExpiryCountdown } from '@/lib/format';

interface StoreDetailModalProps {
  store: StoreModel | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: (updatedStore: StoreModel) => void;
  onDeleted: (storeId: string) => void;
  adminUpiId?: string;
  adminWhatsApp?: string;
}

export const StoreDetailModal: React.FC<StoreDetailModalProps> = ({
  store,
  isOpen,
  onClose,
  onUpdated,
  onDeleted,
  adminUpiId = 'kirana@upi',
  adminWhatsApp = '9876543210',
}) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'access' | 'features' | 'details' | 'stats' | 'danger'>('access');
  const [saving, setSaving] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Access & subscription state
  const [isActive, setIsActive] = useState(true);
  const [planName, setPlanName] = useState<PlanName>('trial');
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>('trial');
  const [trialEndsAt, setTrialEndsAt] = useState('');
  const [subscriptionEndsAt, setSubscriptionEndsAt] = useState('');
  const [customPrice, setCustomPrice] = useState(499);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');

  // Feature flags state
  const [flags, setFlags] = useState<FeatureFlags>({});
  const [maxStaff, setMaxStaff] = useState<number>(5);
  const [maxCustomers, setMaxCustomers] = useState<number>(100);

  // Edit details state
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [storeType, setStoreType] = useState<'retail' | 'wholesale' | 'mix'>('retail');
  const [adminNotes, setAdminNotes] = useState('');

  // Live Usage Stats state
  const [stats, setStats] = useState({
    staffCount: 0,
    customerCount: 0,
    itemsCount: 0,
    ordersCount: 0,
    lastActivity: '',
    loading: true,
  });

  // Danger zone modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (store) {
      setIsActive(store.is_active);
      setPlanName(store.plan_name || 'trial');
      setSubscriptionStatus(store.subscription_status || 'trial');
      setTrialEndsAt(store.trial_ends_at ? new Date(store.trial_ends_at).toISOString().slice(0, 16) : '');
      setSubscriptionEndsAt(store.subscription_ends_at ? new Date(store.subscription_ends_at).toISOString().slice(0, 16) : '');
      setCustomPrice(Number(store.custom_plan_price) || 499);
      setBillingCycle(store.billing_cycle || 'monthly');

      const f = store.feature_flags || {};
      setFlags(f);
      setMaxStaff(Number(f.max_staff_limit) || 5);
      setMaxCustomers(Number(f.max_customers_limit) || 100);

      setShopName(store.shop_name || '');
      setOwnerName(store.owner_name || '');
      setPhone(store.phone || '');
      setAddress(store.address || '');
      setStoreType(store.store_type || 'retail');
      setAdminNotes(store.admin_notes || '');

      // Fetch live usage stats for this store
      loadStoreStats(store.id);
    }
  }, [store]);

  const loadStoreStats = async (storeId: string) => {
    try {
      setStats((prev) => ({ ...prev, loading: true }));
      const [staffRes, custRes, itemRes, ordRes] = await Promise.all([
        supabase.from('store_users').select('id', { count: 'exact', head: true }).eq('store_id', storeId),
        supabase.from('wholesale_customers').select('id', { count: 'exact', head: true }).eq('store_id', storeId),
        supabase.from('inventory_items').select('id', { count: 'exact', head: true }).eq('store_id', storeId),
        supabase.from('orders').select('id, created_at').eq('store_id', storeId).order('created_at', { ascending: false }).limit(1),
      ]);

      const lastOrder = ordRes.data && ordRes.data.length > 0 ? ordRes.data[0].created_at : '';

      setStats({
        staffCount: staffRes.count || 0,
        customerCount: custRes.count || 0,
        itemsCount: itemRes.count || 0,
        ordersCount: ordRes.data ? ordRes.data.length : 0,
        lastActivity: lastOrder || store?.created_at || '',
        loading: false,
      });
    } catch (err) {
      console.warn('Error loading stats:', err);
      setStats((prev) => ({ ...prev, loading: false }));
    }
  };

  if (!store) return null;

  const countdown = formatExpiryCountdown(
    subscriptionStatus === 'active' ? subscriptionEndsAt : trialEndsAt,
    subscriptionStatus
  );

  // Quick preset timer helpers
  const applyPreset = (type: '3d_trial' | '7d_trial' | '1m_paid' | '1y_paid' | 'expire_now') => {
    const now = new Date();
    if (type === '3d_trial') {
      const d = new Date(trialEndsAt ? new Date(trialEndsAt) : now);
      d.setDate(d.getDate() + 3);
      setTrialEndsAt(d.toISOString().slice(0, 16));
      setSubscriptionStatus('trial');
      setIsActive(true);
      toast('Added +3 Days Trial preset', 'info');
    } else if (type === '7d_trial') {
      const d = new Date(trialEndsAt ? new Date(trialEndsAt) : now);
      d.setDate(d.getDate() + 7);
      setTrialEndsAt(d.toISOString().slice(0, 16));
      setSubscriptionStatus('trial');
      setIsActive(true);
      toast('Added +7 Days Trial preset', 'info');
    } else if (type === '1m_paid') {
      const d = new Date(subscriptionEndsAt ? new Date(subscriptionEndsAt) : now);
      d.setDate(d.getDate() + 30);
      setSubscriptionEndsAt(d.toISOString().slice(0, 16));
      setSubscriptionStatus('active');
      setPlanName('pro');
      setIsActive(true);
      toast('Added +1 Month Paid Subscription preset', 'info');
    } else if (type === '1y_paid') {
      const d = new Date(subscriptionEndsAt ? new Date(subscriptionEndsAt) : now);
      d.setDate(d.getDate() + 365);
      setSubscriptionEndsAt(d.toISOString().slice(0, 16));
      setSubscriptionStatus('active');
      setPlanName('pro');
      setBillingCycle('yearly');
      setIsActive(true);
      toast('Added +1 Year Paid Subscription preset', 'info');
    } else if (type === 'expire_now') {
      const past = new Date(now.getTime() - 1000 * 60 * 60).toISOString().slice(0, 16);
      setTrialEndsAt(past);
      setSubscriptionEndsAt('');
      setSubscriptionStatus('expired');
      toast('Set timer to Expired Immediately (Paywall active)', 'info');
    }
  };

  // Toggle kill switch
  const handleToggleKillSwitch = async () => {
    const nextStatus = !isActive;
    setIsActive(nextStatus);
    if (!nextStatus) {
      setSubscriptionStatus('suspended');
    } else if (subscriptionStatus === 'suspended') {
      setSubscriptionStatus('trial');
    }
  };

  // Save all changes
  const handleSaveAll = async () => {
    try {
      setSaving(true);

      const updatedFeatureFlags: FeatureFlags = {
        ...flags,
        max_staff_limit: maxStaff,
        max_customers_limit: maxCustomers,
      };

      const payload = {
        is_active: isActive,
        plan_name: planName,
        subscription_status: subscriptionStatus,
        trial_ends_at: trialEndsAt ? new Date(trialEndsAt).toISOString() : store.trial_ends_at,
        subscription_ends_at: subscriptionEndsAt ? new Date(subscriptionEndsAt).toISOString() : null,
        custom_plan_price: Number(customPrice),
        billing_cycle: billingCycle,
        feature_flags: updatedFeatureFlags,
        shop_name: shopName.trim(),
        owner_name: ownerName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        store_type: storeType,
        admin_notes: adminNotes.trim(),
      };

      const { data, error } = await supabase
        .from('stores')
        .update(payload)
        .eq('id', store.id)
        .select('*')
        .single();

      if (error) throw error;

      toast(`Successfully saved settings for ${shopName}`, 'success');
      onUpdated(data as StoreModel);
      onClose();
    } catch (err: unknown) {
      toast((err as Error).message || 'Failed to save store changes', 'error');
    } finally {
      setSaving(false);
    }
  };

  // WhatsApp follow-up action
  const handleOpenWhatsApp = () => {
    const cleanPhone = phone.replace(/\D/g, '');
    const phoneWithCountry = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
    const text = `Namaste ${ownerName} ji! 🙏\n\nYour Kirana SaaS access for *${shopName}* (${store.store_code}) is currently *${countdown.label}*.\n\nYour custom renewal rate is *₹${customPrice}/${billingCycle === 'yearly' ? 'yr' : 'mo'}*.\n\n💳 Pay directly via UPI: *${adminUpiId}*\n\nPlease let us know if you have any questions or need setup help!`;

    window.open(`https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(text)}`, '_blank');
  };

  // Permanent Delete execution
  const handleDeleteStore = async () => {
    try {
      setDeleting(true);
      const { data, error } = await supabase.rpc('delete_store_permanently', {
        p_store_id: store.id,
      });

      if (error) throw error;

      toast(`Permanently deleted ${store.shop_name} and all data`, 'success');
      setDeleteModalOpen(false);
      onDeleted(store.id);
      onClose();
    } catch (err: unknown) {
      toast((err as Error).message || 'Failed to permanently delete store', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(store.store_code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        maxWidth="2xl"
        title={
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-xs">
              <StoreIcon className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold text-slate-900 dark:text-white">
                  {store.shop_name}
                </span>
                <button
                  onClick={copyCode}
                  className="font-mono text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-slate-400 flex items-center gap-1"
                  title="Click to copy store code"
                >
                  <span>{store.store_code}</span>
                  {copiedCode ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-slate-400" />}
                </button>
              </div>
            </div>
          </div>
        }
        description={`Owner: ${store.owner_name} • Phone: ${store.phone} • Registered: ${formatDate(store.created_at)}`}
      >
        {/* Navigation Tabs inside Drawer */}
        <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 pb-3 mb-4 overflow-x-auto">
          {[
            { id: 'access', label: 'Access & Timers', icon: <Clock className="w-3.5 h-3.5" /> },
            { id: 'features', label: 'Feature Flags & Limits', icon: <Layers className="w-3.5 h-3.5" /> },
            { id: 'details', label: 'Edit Info & Notes', icon: <FileText className="w-3.5 h-3.5" /> },
            { id: 'stats', label: 'Live Usage Stats', icon: <Users className="w-3.5 h-3.5" /> },
            { id: 'danger', label: 'Danger Zone', icon: <AlertTriangle className="w-3.5 h-3.5" /> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as never)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB 1: ACCESS & DEMO TIMER CONTROLS */}
        {activeTab === 'access' && (
          <div className="space-y-5 animate-fade-in">
            {/* Kill switch card */}
            <div className={`p-4 rounded-xl border flex items-center justify-between ${
              isActive
                ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                : 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'
            }`}>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Power className={`w-4 h-4 ${isActive ? 'text-emerald-600' : 'text-rose-600'}`} />
                  <span className="font-bold text-sm text-slate-900 dark:text-white">
                    Temporary Kill Switch: {isActive ? 'Store Active' : 'Store Suspended'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isActive
                    ? 'Store is enabled. Staff and customers can access their apps normally.'
                    : 'Store access blocked. Owner & staff see suspended notice upon opening app (data remains 100% safe).'}
                </p>
              </div>
              <Button
                variant={isActive ? 'danger' : 'success'}
                size="sm"
                onClick={handleToggleKillSwitch}
              >
                {isActive ? 'Suspend Temporarily' : 'Activate Store'}
              </Button>
            </div>

            {/* Current Status & Countdown Banner */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs text-slate-400 font-medium">Status & Countdown:</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs px-2.5 py-0.5 rounded-lg border font-bold ${countdown.badgeColor}`}>
                    {countdown.label}
                  </span>
                  <Badge variant={subscriptionStatus === 'active' ? 'emerald' : subscriptionStatus === 'trial' ? 'blue' : 'rose'}>
                    {subscriptionStatus.toUpperCase()}
                  </Badge>
                </div>
              </div>
              <Button
                variant="outline"
                size="xs"
                onClick={handleOpenWhatsApp}
                className="text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800"
                icon={<Send className="w-3.5 h-3.5" />}
              >
                WhatsApp Owner
              </Button>
            </div>

            {/* Presets Grid */}
            <div>
              <Label>Quick Demo / Subscription Presets</Label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-1">
                <Button variant="secondary" size="xs" onClick={() => applyPreset('3d_trial')}>
                  +3 Days Demo
                </Button>
                <Button variant="secondary" size="xs" onClick={() => applyPreset('7d_trial')}>
                  +7 Days Trial
                </Button>
                <Button variant="secondary" size="xs" onClick={() => applyPreset('1m_paid')}>
                  +1 Month Paid
                </Button>
                <Button variant="secondary" size="xs" onClick={() => applyPreset('1y_paid')}>
                  +1 Year Paid
                </Button>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => applyPreset('expire_now')}
                  className="text-rose-600 border-rose-300 dark:border-rose-800"
                >
                  Expire Immediately
                </Button>
              </div>
            </div>

            {/* Custom Expiry Date Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>
                <Label>Trial Expiry Date & Time</Label>
                <Input
                  type="datetime-local"
                  value={trialEndsAt}
                  onChange={(e) => {
                    setTrialEndsAt(e.target.value);
                    setSubscriptionStatus('trial');
                  }}
                />
              </div>

              <div>
                <Label>Paid Subscription Expiry Date & Time</Label>
                <Input
                  type="datetime-local"
                  value={subscriptionEndsAt}
                  onChange={(e) => {
                    setSubscriptionEndsAt(e.target.value);
                    if (e.target.value) setSubscriptionStatus('active');
                  }}
                />
              </div>
            </div>

            {/* Custom Negotiated Pricing & Plan */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div>
                <Label required>Custom Negotiated Price (₹)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 text-sm">₹</span>
                  <Input
                    type="number"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(Number(e.target.value))}
                    className="pl-7 font-bold"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Appears on store paywall screen upon demo expiration.
                </p>
              </div>

              <div>
                <Label>Billing Cycle</Label>
                <Select value={billingCycle} onChange={(e) => setBillingCycle(e.target.value as BillingCycle)}>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </Select>
              </div>

              <div>
                <Label>Plan Tier</Label>
                <Select value={planName} onChange={(e) => setPlanName(e.target.value as PlanName)}>
                  <option value="trial">Trial Plan</option>
                  <option value="basic">Basic (Counter & Billing)</option>
                  <option value="pro">Pro (All Features + App 2)</option>
                  <option value="enterprise">Enterprise</option>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: FEATURE FLAGS & LIMITS */}
        {activeTab === 'features' && (
          <div className="space-y-4 animate-fade-in">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Control module visibility and tier limits for this specific Kirana store. Changes apply instantly.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: 'wholesale_module', label: 'Wholesale Module (B2B Orders & Khata)', desc: 'Full wholesale order flow and udhaar ledger' },
                { key: 'customer_app_access', label: 'Customer App 2 Access', desc: 'Allows retail/wholesale buyers to log in via App 2' },
                { key: 'whatsapp_reminders', label: 'WhatsApp Reminders & Invoicing', desc: '1-click WhatsApp share button on bills and khata' },
                { key: 'pdf_exports', label: 'PDF Exports (Invoices & Khata Ledger)', desc: 'Branded PDF generation in client browser' },
                { key: 'dead_stock_tracker', label: 'Dead Stock Tracker', desc: 'Automatic highlights of slow-moving inventory items' },
                { key: 'daily_hisaab', label: 'Daily Hisaab / Cash Register', desc: 'Counter opening/closing tally & expenses' },
                { key: 'retail_module', label: 'Retail Counter Sales', desc: 'Point-of-sale barcode scanner & godown inventory' },
                { key: 'payment_gateway', label: 'Store Payment Gateway', desc: 'Allow store to collect UPI/QR payments from buyers' },
              ].map((item) => {
                const checked = flags[item.key] ?? true;
                return (
                  <div
                    key={item.key}
                    onClick={() => setFlags((prev) => ({ ...prev, [item.key]: !checked }))}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 select-none ${
                      checked
                        ? 'bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 opacity-60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {}}
                      className="mt-1 h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{item.label}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{item.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Numeric limits */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div>
                <Label>Max Staff Limit</Label>
                <Input
                  type="number"
                  value={maxStaff}
                  onChange={(e) => setMaxStaff(Number(e.target.value))}
                  placeholder="e.g. 5 (or 0 for unlimited)"
                />
                <p className="text-[10px] text-slate-400 mt-1">Maximum staff users the store owner can invite.</p>
              </div>

              <div>
                <Label>Max Wholesale Customers Limit</Label>
                <Input
                  type="number"
                  value={maxCustomers}
                  onChange={(e) => setMaxCustomers(Number(e.target.value))}
                  placeholder="e.g. 100 (or 0 for unlimited)"
                />
                <p className="text-[10px] text-slate-400 mt-1">Maximum B2B customer accounts allowed.</p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: EDIT INFO & ADMIN NOTES */}
        {activeTab === 'details' && (
          <div className="space-y-4 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label required>Shop Name</Label>
                <Input value={shopName} onChange={(e) => setShopName(e.target.value)} />
              </div>
              <div>
                <Label required>Owner Name</Label>
                <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label required>Owner Phone (Login Mobile)</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <Label required>Store Type</Label>
                <Select
                  value={storeType}
                  onChange={(e) => setStoreType(e.target.value as 'retail' | 'wholesale' | 'mix')}
                >
                  <option value="retail">Retail Only</option>
                  <option value="wholesale">Wholesale Only</option>
                  <option value="mix">Mix (Wholesale + Retail)</option>
                </Select>
              </div>
            </div>

            <div>
              <Label>Store Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Full shop address..." />
            </div>

            <div>
              <Label>Internal Admin Notes (Private to SaaS Owner)</Label>
              <Textarea
                rows={3}
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="e.g. Met owner in Jaipur market. Agreed on ₹500/mo after 3-day demo. Follow up on Monday..."
              />
            </div>
          </div>
        )}

        {/* TAB 4: LIVE USAGE STATS */}
        {activeTab === 'stats' && (
          <div className="space-y-4 animate-fade-in">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Live read-only usage metrics query direct from PostgreSQL production database.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-center">
                <Package className="w-5 h-5 mx-auto text-emerald-600 mb-1" />
                <p className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white">
                  {stats.itemsCount}
                </p>
                <p className="text-[11px] text-slate-400 font-medium">Inventory Items</p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-center">
                <ShoppingCart className="w-5 h-5 mx-auto text-blue-600 mb-1" />
                <p className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white">
                  {stats.ordersCount}
                </p>
                <p className="text-[11px] text-slate-400 font-medium">Total Orders</p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-center">
                <Users className="w-5 h-5 mx-auto text-purple-600 mb-1" />
                <p className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white">
                  {stats.staffCount}
                </p>
                <p className="text-[11px] text-slate-400 font-medium">Staff Members</p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-center">
                <Users className="w-5 h-5 mx-auto text-amber-600 mb-1" />
                <p className="text-2xl font-extrabold tabular-nums text-slate-900 dark:text-white">
                  {stats.customerCount}
                </p>
                <p className="text-[11px] text-slate-400 font-medium">Wholesale Buyers</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
              <div><span className="text-slate-400">Store Registered:</span> {formatDateTime(store.created_at)}</div>
              <div><span className="text-slate-400">Last Recorded Activity:</span> {formatDateTime(stats.lastActivity) || 'None recorded yet'}</div>
              <div><span className="text-slate-400">Store Code:</span> <code className="font-mono text-emerald-600">{store.store_code}</code></div>
              <div><span className="text-slate-400">Database ID:</span> <code className="font-mono text-slate-500 text-[10px]">{store.id}</code></div>
            </div>
          </div>
        )}

        {/* TAB 5: DANGER ZONE */}
        {activeTab === 'danger' && (
          <div className="space-y-4 animate-fade-in">
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-rose-800 dark:text-rose-300">
                    Permanent Store Deletion (Irreversible)
                  </h4>
                  <p className="text-xs text-rose-700/80 dark:text-rose-400/80 mt-1 leading-relaxed">
                    This action completely deletes <strong>{store.shop_name}</strong> ({store.store_code}) and all related records across every Kirana table (orders, items, ledger, staff, customers, daily hisaab, agencies, auth accounts). This cannot be undone.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setDeleteModalOpen(true)}
                  icon={<Trash2 className="w-4 h-4" />}
                >
                  Delete Store & All Data Permanently
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 mt-6 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSaveAll}
            loading={saving}
            icon={<Save className="w-4 h-4" />}
          >
            Save Store Settings
          </Button>
        </div>
      </Modal>

      {/* Strict Confirmation Modal for Permanent Store Deletion */}
      <ConfirmDialog
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDeleteStore}
        loading={deleting}
        variant="danger"
        title="Delete Store Permanently?"
        message={`Are you absolutely sure you want to permanently delete "${store.shop_name}"? All inventory items, customer khata transactions, orders, staff logins, and billing data will be completely wiped from PostgreSQL.`}
        requiredConfirmInput={store.store_code}
        confirmInputPlaceholder={store.store_code}
        confirmText="Yes, Permanently Delete Store"
      />
    </>
  );
};
