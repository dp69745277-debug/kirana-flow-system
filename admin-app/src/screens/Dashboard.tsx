import React, { useEffect, useState } from 'react';
import {
  Store,
  CreditCard,
  Clock,
  AlertTriangle,
  TrendingUp,
  UserCheck,
  ChevronRight,
  Send,
  CalendarPlus,
  RefreshCw,
  ShoppingBag,
  ExternalLink,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Store as StoreModel, SaasPayment, PlatformSettings } from '@/lib/types';
import { Card, Badge, Button, SpotlightCard, CountUp, useToast } from '@/components/ui';
import { formatCurrency, formatDate, formatDateTime, formatExpiryCountdown } from '@/lib/format';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, PieChart, Pie } from 'recharts';

interface DashboardProps {
  onNavigateToStores: (filter?: { status?: string; type?: string }) => void;
  onNavigateToPayments: () => void;
  onSelectStore: (store: StoreModel) => void;
}

export const DashboardScreen: React.FC<DashboardProps> = ({
  onNavigateToStores,
  onNavigateToPayments,
  onSelectStore,
}) => {
  const { toast } = useToast();
  const [stores, setStores] = useState<StoreModel[]>([]);
  const [payments, setPayments] = useState<SaasPayment[]>([]);
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [extendingStoreId, setExtendingStoreId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Fetch stores with counts
      const { data: storeData, error: sErr } = await supabase
        .from('stores')
        .select('*')
        .order('created_at', { ascending: false });

      if (sErr) throw sErr;

      // Fetch recent SaaS payments with store join
      const { data: payData, error: pErr } = await supabase
        .from('saas_payments')
        .select('*, store:stores(shop_name, store_code, owner_name, phone)')
        .order('created_at', { ascending: false })
        .limit(10);

      if (pErr) console.warn('Payments fetch error:', pErr);

      // Fetch platform settings
      const { data: setRow } = await supabase
        .from('platform_settings')
        .select('*')
        .maybeSingle();

      setStores((storeData as StoreModel[]) || []);
      setPayments((payData as SaasPayment[]) || []);
      setSettings(setRow as PlatformSettings | null);
    } catch (err: unknown) {
      console.error('Error fetching dashboard data:', err);
      toast((err as Error).message || 'Failed to load dashboard data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Supabase Realtime subscription for live store updates
    const channel = supabase
      .channel('dashboard_realtime_feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stores' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newStore = payload.new as StoreModel;
            toast(`🎉 New Store Registered: ${newStore.shop_name} (${newStore.store_code})`, 'info');
            setStores((prev) => [newStore, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as StoreModel;
            setStores((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id: string }).id;
            setStores((prev) => prev.filter((s) => s.id !== deletedId));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'saas_payments' },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Quick 1-click trial extender (+3 days)
  const handleQuickExtend = async (store: StoreModel, daysToAdd: number = 3) => {
    try {
      setExtendingStoreId(store.id);
      const base = new Date(store.trial_ends_at && new Date(store.trial_ends_at) > new Date() ? store.trial_ends_at : new Date());
      base.setDate(base.getDate() + daysToAdd);
      const newTrialEndsAt = base.toISOString();

      const { error } = await supabase
        .from('stores')
        .update({
          trial_ends_at: newTrialEndsAt,
          subscription_status: 'trial',
          is_active: true,
        })
        .eq('id', store.id);

      if (error) throw error;

      toast(`Extended demo for ${store.shop_name} by +${daysToAdd} days!`, 'success');
      setStores((prev) =>
        prev.map((s) =>
          s.id === store.id
            ? { ...s, trial_ends_at: newTrialEndsAt, subscription_status: 'trial', is_active: true }
            : s
        )
      );
    } catch (err: unknown) {
      toast((err as Error).message || 'Failed to extend trial', 'error');
    } finally {
      setExtendingStoreId(null);
    }
  };

  // WhatsApp reminder generator
  const handleSendWhatsAppReminder = (store: StoreModel) => {
    const countdown = formatExpiryCountdown(store.trial_ends_at, store.subscription_status);
    const amount = store.custom_plan_price || settings?.default_monthly_price || 499;
    const adminUpi = settings?.admin_upi_id || 'kirana@upi';
    const cleanPhone = store.phone.replace(/\D/g, '');
    const phoneWithCountry = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;

    const text = `Namaste ${store.owner_name} ji! 🙏\n\nYour Kirana SaaS demo for *${store.shop_name}* (${store.store_code}) is ${countdown.label}.\n\nTo keep your billing, inventory, and customer apps running uninterrupted, renew your monthly plan for *₹${amount}/mo*.\n\n💳 Pay directly via UPI: *${adminUpi}*\n\nReply here if you need any assistance or customized setup!`;

    const url = `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Compute SaaS KPIs
  const totalStores = stores.length;
  const retailCount = stores.filter((s) => s.store_type === 'retail').length;
  const wholesaleCount = stores.filter((s) => s.store_type === 'wholesale').length;
  const mixCount = stores.filter((s) => s.store_type === 'mix').length;

  const activePaidStores = stores.filter(
    (s) => s.subscription_status === 'active' && s.is_active
  );
  const mrr = activePaidStores.reduce((acc, s) => acc + (Number(s.custom_plan_price) || 499), 0);

  const trialStores = stores.filter(
    (s) => s.subscription_status === 'trial' && s.is_active
  );

  const now = Date.now();
  const expiringTrialsSoon = trialStores.filter((s) => {
    if (!s.trial_ends_at) return false;
    const diffHours = (new Date(s.trial_ends_at).getTime() - now) / (1000 * 60 * 60);
    return diffHours >= 0 && diffHours <= 48; // Expiring in < 48 hours
  });

  const expiredOrSuspended = stores.filter(
    (s) => !s.is_active || s.subscription_status === 'expired' || s.subscription_status === 'suspended' || (s.trial_ends_at && new Date(s.trial_ends_at).getTime() < now && s.subscription_status !== 'active')
  );

  // Chart data: Store types
  const storeTypeChartData = [
    { name: 'Retail', count: retailCount, color: '#10b981' },
    { name: 'Wholesale', count: wholesaleCount, color: '#3b82f6' },
    { name: 'Mix (Both)', count: mixCount, color: '#8b5cf6' },
  ];

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Top Welcome & Quick Refresh Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <span>SaaS Platform Overview</span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
              Production Live
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time subscriber metrics, trial expirations, and platform revenue.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            loading={loading}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onNavigateToStores()}
            icon={<Store className="w-3.5 h-3.5" />}
          >
            Manage Stores
          </Button>
        </div>
      </div>

      {/* Top 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Registered Stores */}
        <SpotlightCard
          spotlightColor="#64748b"
          intensity={0.18}
          borderGlow={0.35}
          className="p-5 cursor-pointer hover:border-slate-300 dark:hover:border-slate-700"
          onClick={() => onNavigateToStores()}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Stores
            </span>
            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center">
              <Store className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight tabular-nums text-slate-900 dark:text-white">
              <CountUp to={totalStores} locale="en-IN" duration={0.85} trigger="load" />
            </span>
            <span className="text-xs text-slate-400">stores</span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 flex-wrap">
            <Badge variant="emerald" size="xs">
              Retail: {retailCount}
            </Badge>
            <Badge variant="blue" size="xs">
              Wholesale: {wholesaleCount}
            </Badge>
            <Badge variant="purple" size="xs">
              Mix: {mixCount}
            </Badge>
          </div>
        </SpotlightCard>

        {/* Active Paid Stores & MRR */}
        <SpotlightCard
          spotlightColor="#10b981"
          intensity={0.22}
          borderGlow={0.45}
          className="p-5 cursor-pointer hover:border-emerald-300 dark:hover:border-emerald-700 border-emerald-500/20"
          onClick={() => onNavigateToStores({ status: 'active' })}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Paid MRR & Active
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400">
              <CountUp to={mrr} prefix="₹" locale="en-IN" duration={0.85} trigger="load" />
            </span>
            <span className="text-xs text-slate-400">/mo</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>{activePaidStores.length} Active Paid Stores</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center">
              View <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </SpotlightCard>

        {/* Active 3-Day Demos & Trials */}
        <SpotlightCard
          spotlightColor="#3b82f6"
          intensity={0.2}
          borderGlow={0.4}
          className="p-5 cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 border-blue-500/20"
          onClick={() => onNavigateToStores({ status: 'trial' })}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Active Trials
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight tabular-nums text-blue-600 dark:text-blue-400">
              <CountUp to={trialStores.length} locale="en-IN" duration={0.85} trigger="load" />
            </span>
            <span className="text-xs text-slate-400">demos</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            {expiringTrialsSoon.length > 0 ? (
              <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                {expiringTrialsSoon.length} expiring soon!
              </span>
            ) : (
              <span className="text-slate-400">All trials healthy</span>
            )}
            <span className="text-blue-600 dark:text-blue-400 font-semibold flex items-center">
              Filter <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </SpotlightCard>

        {/* Expired / Suspended Stores */}
        <SpotlightCard
          spotlightColor="#f43f5e"
          intensity={0.2}
          borderGlow={0.4}
          className="p-5 cursor-pointer hover:border-rose-300 dark:hover:border-rose-700 border-rose-500/20"
          onClick={() => onNavigateToStores({ status: 'expired' })}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              Expired / Suspended
            </span>
            <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight tabular-nums text-rose-600 dark:text-rose-400">
              <CountUp to={expiredOrSuspended.length} locale="en-IN" duration={0.85} trigger="load" />
            </span>
            <span className="text-xs text-slate-400">stores</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Opportunity to recover</span>
            <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center">
              Review <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </SpotlightCard>
      </div>

      {/* Main Grid: Quick Attention Lists & Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 spans): Trials Expiring Soon & Recent Payments */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Attention: Trials Expiring Soon (< 48h) */}
          <Card className="p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Trials Expiring Soon ({expiringTrialsSoon.length})
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Stores ending in &lt; 48 hours. Extend demo or reach out on WhatsApp to close renewal.
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onNavigateToStores({ status: 'trial' })}
              >
                View All
              </Button>
            </div>

            {expiringTrialsSoon.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                🎉 No trials expiring in the next 48 hours! All demo timers are in good standing.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-2">
                {expiringTrialsSoon.map((store) => {
                  const countdown = formatExpiryCountdown(store.trial_ends_at, store.subscription_status);
                  const isBusy = extendingStoreId === store.id;

                  return (
                    <div
                      key={store.id}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 rounded-xl px-2 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            onClick={() => onSelectStore(store)}
                            className="font-bold text-sm text-slate-900 dark:text-slate-100 hover:text-emerald-600 dark:hover:text-emerald-400 cursor-pointer"
                          >
                            {store.shop_name}
                          </span>
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                            {store.store_code}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          <span>Owner: {store.owner_name}</span>
                          <span>•</span>
                          <span>Phone: {store.phone}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-lg border font-semibold ${countdown.badgeColor}`}>
                          {countdown.label}
                        </span>

                        <Button
                          variant="secondary"
                          size="xs"
                          loading={isBusy}
                          onClick={() => handleQuickExtend(store, 3)}
                          title="Extend demo timer by 3 days"
                          icon={<CalendarPlus className="w-3.5 h-3.5 text-blue-600" />}
                        >
                          +3 Days
                        </Button>

                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => handleSendWhatsAppReminder(store)}
                          className="text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800"
                          icon={<Send className="w-3.5 h-3.5" />}
                        >
                          WhatsApp
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Recent SaaS Payments Feed */}
          <Card className="p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Recent SaaS Subscription Payments
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Live payments collected from expired paywalls or recorded by admin.
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="xs" onClick={onNavigateToPayments}>
                View All
              </Button>
            </div>

            {payments.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No subscription payments recorded yet. Click &quot;SaaS Payments&quot; to log manual UPI/cash receipts.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-2">
                {payments.slice(0, 5).map((pay) => (
                  <div key={pay.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5">
                      <p className="font-semibold text-slate-800 dark:text-slate-200">
                        {pay.store?.shop_name || 'Store Payment'}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                        <span>{pay.store?.store_code || pay.gateway_order_id}</span>
                        {pay.utr_number && <span>UTR: {pay.utr_number}</span>}
                      </div>
                    </div>
                    <div className="text-right space-y-0.5">
                      <p className="font-bold text-slate-900 dark:text-white tabular-nums">
                        {formatCurrency(pay.amount)}
                      </p>
                      <Badge
                        variant={pay.status === 'success' ? 'emerald' : pay.status === 'pending' ? 'amber' : 'rose'}
                        size="xs"
                      >
                        {pay.status} ({pay.days_added}d)
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right Column (1 span): Live Registration Feed & Store Mix Chart */}
        <div className="space-y-6">
          {/* Realtime Live Registration Feed */}
          <Card className="p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Recent Store Registrations
                </h2>
              </div>
              <Badge variant="emerald" size="xs">Live Feed</Badge>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-2">
              {stores.slice(0, 6).map((store) => (
                <div
                  key={store.id}
                  onClick={() => onSelectStore(store)}
                  className="py-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/40 px-1 rounded-lg cursor-pointer transition-colors"
                >
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      {store.shop_name}
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono">
                      {store.store_code} • {store.owner_name}
                    </p>
                  </div>
                  <div className="text-right space-y-0.5">
                    <Badge
                      variant={store.store_type === 'wholesale' ? 'blue' : store.store_type === 'mix' ? 'purple' : 'emerald'}
                      size="xs"
                    >
                      {store.store_type}
                    </Badge>
                    <p className="text-[10px] text-slate-400">{formatDate(store.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Store Type Breakdown Chart */}
          <Card className="p-5">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
              Store Type Distribution
            </h2>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={storeTypeChartData} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={75} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                    {storeTypeChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-center text-xs">
              <div>
                <p className="text-[11px] text-slate-400">Retail</p>
                <p className="font-bold text-emerald-600 dark:text-emerald-400">{retailCount}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400">Wholesale</p>
                <p className="font-bold text-blue-600 dark:text-blue-400">{wholesaleCount}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400">Mix</p>
                <p className="font-bold text-purple-600 dark:text-purple-400">{mixCount}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
