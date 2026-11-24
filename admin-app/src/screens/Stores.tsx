import React, { useState, useEffect, useMemo } from 'react';
import {
  Store as StoreIcon,
  Search,
  Filter,
  Plus,
  ArrowUpDown,
  Power,
  CalendarPlus,
  Send,
  MoreVertical,
  ExternalLink,
  Users,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Phone,
  Copy,
  Check,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Store as StoreModel, StoreType, SubscriptionStatus } from '@/lib/types';
import { Card, Button, Input, Select, Badge, useToast } from '@/components/ui';
import { formatCurrency, formatDate, formatDateTime, formatExpiryCountdown } from '@/lib/format';
import { StoreDetailModal } from '@/components/StoreDetailModal';

interface StoresScreenProps {
  initialFilter?: { status?: string; type?: string };
  selectedStore: StoreModel | null;
  onSelectStore: (store: StoreModel | null) => void;
}

export const StoresScreen: React.FC<StoresScreenProps> = ({
  initialFilter,
  selectedStore,
  onSelectStore,
}) => {
  const { toast } = useToast();
  const [stores, setStores] = useState<StoreModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>(initialFilter?.type || 'all');
  const [statusFilter, setStatusFilter] = useState<string>(initialFilter?.status || 'all');
  const [sortBy, setSortBy] = useState<'newest' | 'expiry' | 'name' | 'price'>('newest');
  const [copiedStoreId, setCopiedStoreId] = useState<string | null>(null);
  const [togglingStoreId, setTogglingStoreId] = useState<string | null>(null);

  const fetchStores = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Enhance with staff & customer counts in batch
      const storeList = (data as StoreModel[]) || [];
      const storeIds = storeList.map((s) => s.id);

      if (storeIds.length > 0) {
        const [staffRes, custRes] = await Promise.all([
          supabase.from('store_users').select('store_id'),
          supabase.from('wholesale_customers').select('store_id'),
        ]);

        const staffMap: Record<string, number> = {};
        const custMap: Record<string, number> = {};

        (staffRes.data || []).forEach((r) => {
          staffMap[r.store_id] = (staffMap[r.store_id] || 0) + 1;
        });
        (custRes.data || []).forEach((r) => {
          custMap[r.store_id] = (custMap[r.store_id] || 0) + 1;
        });

        const enhanced = storeList.map((s) => ({
          ...s,
          staff_count: staffMap[s.id] || 0,
          customer_count: custMap[s.id] || 0,
        }));

        setStores(enhanced);
      } else {
        setStores(storeList);
      }
    } catch (err: unknown) {
      toast((err as Error).message || 'Failed to fetch stores', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStores();
  }, []);

  // Filter & Search logic
  const filteredStores = useMemo(() => {
    return stores
      .filter((s) => {
        // Search text
        if (search.trim()) {
          const q = search.toLowerCase();
          const matchCode = s.store_code.toLowerCase().includes(q);
          const matchShop = s.shop_name.toLowerCase().includes(q);
          const matchOwner = s.owner_name.toLowerCase().includes(q);
          const matchPhone = s.phone.includes(q);
          if (!matchCode && !matchShop && !matchOwner && !matchPhone) return false;
        }

        // Type filter
        if (typeFilter !== 'all' && s.store_type !== typeFilter) {
          return false;
        }

        // Status filter
        if (statusFilter !== 'all') {
          if (statusFilter === 'active' && (s.subscription_status !== 'active' || !s.is_active)) return false;
          if (statusFilter === 'trial' && (s.subscription_status !== 'trial' || !s.is_active)) return false;
          if (statusFilter === 'suspended' && s.is_active) return false;
          if (statusFilter === 'expired') {
            const isTrialExp = s.trial_ends_at && new Date(s.trial_ends_at).getTime() < Date.now() && s.subscription_status !== 'active';
            const isSubExp = s.subscription_ends_at && new Date(s.subscription_ends_at).getTime() < Date.now();
            if (!isTrialExp && !isSubExp && s.subscription_status !== 'expired') return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        if (sortBy === 'name') {
          return a.shop_name.localeCompare(b.shop_name);
        }
        if (sortBy === 'price') {
          return (Number(b.custom_plan_price) || 0) - (Number(a.custom_plan_price) || 0);
        }
        if (sortBy === 'expiry') {
          const expA = a.subscription_status === 'active' ? (a.subscription_ends_at || '9999') : (a.trial_ends_at || '9999');
          const expB = b.subscription_status === 'active' ? (b.subscription_ends_at || '9999') : (b.trial_ends_at || '9999');
          return new Date(expA).getTime() - new Date(expB).getTime();
        }
        return 0;
      });
  }, [stores, search, typeFilter, statusFilter, sortBy]);

  // Quick 1-click kill switch toggle from table
  const handleToggleStoreActive = async (e: React.MouseEvent, store: StoreModel) => {
    e.stopPropagation();
    try {
      setTogglingStoreId(store.id);
      const nextActive = !store.is_active;
      const nextStatus = nextActive ? (store.subscription_status === 'suspended' ? 'trial' : store.subscription_status) : 'suspended';

      const { error } = await supabase
        .from('stores')
        .update({
          is_active: nextActive,
          subscription_status: nextStatus,
        })
        .eq('id', store.id);

      if (error) throw error;

      toast(nextActive ? `Activated ${store.shop_name}` : `Suspended ${store.shop_name}`, 'info');
      setStores((prev) =>
        prev.map((s) => (s.id === store.id ? { ...s, is_active: nextActive, subscription_status: nextStatus } : s))
      );
    } catch (err: unknown) {
      toast((err as Error).message || 'Failed to update store status', 'error');
    } finally {
      setTogglingStoreId(null);
    }
  };

  const handleCopyCode = (e: React.MouseEvent, code: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopiedStoreId(code);
    setTimeout(() => setCopiedStoreId(null), 2000);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <span>All Stores Control Center</span>
            <Badge variant="slate" size="sm">
              {filteredStores.length} of {stores.length}
            </Badge>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Manage store demo timers, module feature flags, kill switches, and negotiated renewal pricing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchStores}
            loading={loading}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by KRN-ID, Shop, Owner, Phone..."
              className="pl-9"
            />
          </div>

          {/* Type Filter */}
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="all">All Store Types</option>
            <option value="retail">Retail Only</option>
            <option value="wholesale">Wholesale Only</option>
            <option value="mix">Mix (Wholesale + Retail)</option>
          </Select>

          {/* Status Filter */}
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Subscription Statuses</option>
            <option value="trial">Active 3-Day Trials</option>
            <option value="active">Active Paid Plans</option>
            <option value="expired">Expired Demos / Subs</option>
            <option value="suspended">Suspended by Admin</option>
          </Select>

          {/* Sort By */}
          <Select value={sortBy} onChange={(e) => setSortBy(e.target.value as never)}>
            <option value="newest">Sort: Newest Registered</option>
            <option value="expiry">Sort: Expiry Soonest</option>
            <option value="name">Sort: Shop Name (A-Z)</option>
            <option value="price">Sort: Price (Highest)</option>
          </Select>
        </div>
      </Card>

      {/* Stores List: Desktop Table + Mobile Cards */}
      <Card className="overflow-hidden">
        {filteredStores.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            No stores match the selected filters or search query.
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 px-4">Store Code</th>
                    <th className="py-3.5 px-4">Shop & Owner</th>
                    <th className="py-3.5 px-4">Phone</th>
                    <th className="py-3.5 px-4">Type</th>
                    <th className="py-3.5 px-4">Users</th>
                    <th className="py-3.5 px-4">Plan & Expiry</th>
                    <th className="py-3.5 px-4">Renewal Price</th>
                    <th className="py-3.5 px-4 text-center">Kill Switch</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredStores.map((store) => {
                    const countdown = formatExpiryCountdown(
                      store.subscription_status === 'active' ? store.subscription_ends_at : store.trial_ends_at,
                      store.subscription_status
                    );
                    const isBusy = togglingStoreId === store.id;

                    return (
                      <tr
                        key={store.id}
                        onClick={() => onSelectStore(store)}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                      >
                        {/* Store Code */}
                        <td className="py-3 px-4">
                          <button
                            onClick={(e) => handleCopyCode(e, store.store_code)}
                            className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-slate-400 flex items-center gap-1.5"
                            title="Click to copy store code"
                          >
                            <span>{store.store_code}</span>
                            {copiedStoreId === store.store_code ? (
                              <Check className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <Copy className="w-3 h-3 text-slate-400" />
                            )}
                          </button>
                        </td>

                        {/* Shop Name & Owner */}
                        <td className="py-3 px-4">
                          <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                            {store.shop_name}
                          </p>
                          <p className="text-[11px] text-slate-400">{store.owner_name}</p>
                        </td>

                        {/* Phone with WhatsApp shortcut */}
                        <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                          <a
                            href={`tel:${store.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:underline hover:text-emerald-600"
                          >
                            {store.phone}
                          </a>
                        </td>

                        {/* Store Type Badge */}
                        <td className="py-3 px-4">
                          <Badge
                            variant={
                              store.store_type === 'wholesale'
                                ? 'blue'
                                : store.store_type === 'mix'
                                ? 'purple'
                                : 'emerald'
                            }
                            size="xs"
                          >
                            {store.store_type}
                          </Badge>
                        </td>

                        {/* Users (Staff + Customers) */}
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                          <div className="flex items-center gap-1.5">
                            <span title="Staff users">{store.staff_count || 1} staff</span>
                            <span>•</span>
                            <span title="Wholesale customers">{store.customer_count || 0} buyers</span>
                          </div>
                        </td>

                        {/* Plan & Expiry Countdown */}
                        <td className="py-3 px-4">
                          <div className="space-y-0.5">
                            <span className={`text-[11px] px-2 py-0.5 rounded border font-bold inline-block ${countdown.badgeColor}`}>
                              {countdown.label}
                            </span>
                            <p className="text-[10px] text-slate-400 capitalize">
                              {store.plan_name} • {store.billing_cycle}
                            </p>
                          </div>
                        </td>

                        {/* Negotiated Price */}
                        <td className="py-3 px-4 font-bold tabular-nums text-slate-900 dark:text-slate-100">
                          {formatCurrency(store.custom_plan_price || 499)}
                          <span className="text-[10px] text-slate-400 font-normal">/mo</span>
                        </td>

                        {/* Quick Kill Switch */}
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={(e) => handleToggleStoreActive(e, store)}
                            disabled={isBusy}
                            title={store.is_active ? 'Click to Suspend Store' : 'Click to Activate Store'}
                            className={`p-1.5 rounded-lg border transition-colors ${
                              store.is_active
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-600'
                                : 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-700 text-rose-600'
                            }`}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                        </td>

                        {/* Action Drawer Button */}
                        <td className="py-3 px-4 text-right">
                          <Button variant="ghost" size="xs">
                            Manage
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {filteredStores.map((store) => {
                const countdown = formatExpiryCountdown(
                  store.subscription_status === 'active' ? store.subscription_ends_at : store.trial_ends_at,
                  store.subscription_status
                );

                return (
                  <div
                    key={store.id}
                    onClick={() => onSelectStore(store)}
                    className="p-4 space-y-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                            {store.shop_name}
                          </span>
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                            {store.store_code}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {store.owner_name} • {store.phone}
                        </p>
                      </div>

                      <Badge
                        variant={
                          store.store_type === 'wholesale'
                            ? 'blue'
                            : store.store_type === 'mix'
                            ? 'purple'
                            : 'emerald'
                        }
                        size="xs"
                      >
                        {store.store_type}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-slate-800">
                      <span className={`px-2 py-0.5 rounded border font-semibold ${countdown.badgeColor}`}>
                        {countdown.label}
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                        {formatCurrency(store.custom_plan_price || 499)}/mo
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-slate-400">
                        {store.staff_count || 1} staff • {store.customer_count || 0} buyers
                      </span>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => handleToggleStoreActive(e, store)}
                          className={`text-xs px-2.5 py-1 rounded-lg border font-semibold ${
                            store.is_active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {store.is_active ? 'Active' : 'Suspended'}
                        </button>
                        <Button variant="secondary" size="xs" onClick={() => onSelectStore(store)}>
                          Manage
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      {/* Store Detail & Control Drawer */}
      {selectedStore && (
        <StoreDetailModal
          store={selectedStore}
          isOpen={Boolean(selectedStore)}
          onClose={() => onSelectStore(null)}
          onUpdated={(updated) => {
            setStores((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
            onSelectStore(updated);
          }}
          onDeleted={(deletedId) => {
            setStores((prev) => prev.filter((s) => s.id !== deletedId));
            onSelectStore(null);
          }}
        />
      )}
    </div>
  );
};
