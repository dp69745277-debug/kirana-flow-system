import { useEffect, useState } from 'react';
import {
  ShoppingCart, Package, Clock, CheckCircle2,
  ArrowDownToLine, ArrowUpFromLine, AlertTriangle, Activity,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/lib/supabase';
import { Card, StatCard, Badge, Spinner, EmptyState } from '@/components/ui';
import { formatINR, formatDateTime } from '@/lib/format';
import { t } from '@/lib/i18n';
import type { InventoryItem, StockTransaction, Order, AuditLog, StoreUser } from '@/lib/types';

export default function StaffDashboard({ setPage }: { setPage: (p: import('@/components/Shell').PageKey) => void }) {
  const { store, lang, hasFeature } = useApp();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [txs, setTxs] = useState<StockTransaction[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<StoreUser[]>([]);

  const wholesale = store?.store_type !== 'retail' && hasFeature('wholesale_module');

  useEffect(() => {
    if (!store) return;
    let mounted = true;
    async function load() {
      const queries: Promise<unknown>[] = [
        supabase.from('inventory_items').select('*').eq('store_id', store!.id),
        supabase.from('stock_transactions').select('*').eq('store_id', store!.id)
          .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
          .order('created_at', { ascending: false }),
        supabase.from('audit_logs').select('*').eq('store_id', store!.id)
          .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
          .order('created_at', { ascending: false }).limit(30),
        supabase.from('store_users').select('*').eq('store_id', store!.id),
      ];
      if (wholesale) {
        queries.push(
          supabase.from('orders').select('*').eq('store_id', store!.id)
            .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
        );
      }
      const results = await Promise.all(queries);
      if (!mounted) return;
      setItems(((results[0] as any).data as InventoryItem[]) ?? []);
      setTxs(((results[1] as any).data as StockTransaction[]) ?? []);
      setAudit(((results[2] as any).data as AuditLog[]) ?? []);
      setUsers(((results[3] as any).data as StoreUser[]) ?? []);
      if (wholesale && results[4]) {
        setOrders(((results[4] as any).data as Order[]) ?? []);
      }
      setLoading(false);
    }
    void load();
    return () => { mounted = false; };
  }, [store, wholesale]);

  if (!store) return null;
  if (loading) return <Spinner label="Loading dashboard…" />;

  const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
  const todayIn = txs.filter((tx) => tx.type === 'stock_in');
  const todayOut = txs.filter((tx) => tx.type !== 'stock_in');
  const lowStock = items.filter((i) => i.current_stock <= i.low_stock_threshold);

  // Order KPIs (last 7 days for wholesale/mix stores)
  const pendingOrders = orders.filter((o) => !['delivered', 'cancelled'].includes(o.status)).length;
  const todayOrders = orders.filter((o) => isToday(o.created_at)).length;
  const completedToday = orders.filter((o) => o.status === 'delivered' && isToday(o.updated_at)).length;

  const userName = (id: string | null) => users.find((u) => u.id === id)?.name ?? 'System';

  return (
    <div className="space-y-5">
      {/* KPI row 1 - Orders & Stock */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {wholesale && (
          <>
            <StatCard
              className="stagger-item stagger-1"
              label={t('todayOrders', lang)}
              value={String(todayOrders)}
              icon={<ShoppingCart size={18} />}
              tone="teal"
            />
            <StatCard
              className="stagger-item stagger-2"
              label={t('pendingOrders', lang)}
              value={String(pendingOrders)}
              icon={<Clock size={18} />}
              tone="amber"
            />
            <StatCard
              className="stagger-item stagger-3"
              label={t('completedToday', lang)}
              value={String(completedToday)}
              icon={<CheckCircle2 size={18} />}
              tone="green"
            />
          </>
        )}
        <StatCard
          className="stagger-item stagger-4"
          label={t('lowStockAlerts', lang)}
          value={String(lowStock.length)}
          icon={<AlertTriangle size={18} />}
          tone={lowStock.length > 0 ? 'amber' : 'green'}
        />
      </div>

      {/* KPI row 2 - Today's stock movement */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          className="stagger-item stagger-2"
          label={t('todayStockIn', lang)}
          value={`+${todayIn.reduce((s, tx) => s + tx.quantity, 0).toLocaleString('en-IN')}`}
          sub={`${todayIn.length} entries`}
          icon={<ArrowDownToLine size={18} />}
          tone="blue"
        />
        <StatCard
          className="stagger-item stagger-3"
          label={t('todayStockOut', lang)}
          value={`-${todayOut.reduce((s, tx) => s + tx.quantity, 0).toLocaleString('en-IN')}`}
          sub={`${todayOut.length} entries`}
          icon={<ArrowUpFromLine size={18} />}
          tone="amber"
        />
        <StatCard
          className="stagger-item stagger-4"
          label={t('totalItems', lang)}
          value={String(items.length)}
          icon={<Package size={18} />}
          tone="teal"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Low stock alerts */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800">{t('lowStockAlerts', lang)}</h3>
            <Badge tone={lowStock.length ? 'amber' : 'green'}>{lowStock.length}</Badge>
          </div>
          {lowStock.length === 0 ? (
            <p className="text-sm text-slate-400 py-3">All items healthy</p>
          ) : (
            <ul className="space-y-2 max-h-56 overflow-y-auto">
              {lowStock.slice(0, 10).map((i) => (
                <li key={i.id} className="flex items-center justify-between text-sm">
                  <span className="truncate text-slate-700">{i.name} {i.brand ? `· ${i.brand}` : ''}</span>
                  <Badge tone={i.current_stock === 0 ? 'red' : 'amber'}>{i.current_stock} {i.unit_type}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Today's activity */}
        <Card className="p-4">
          <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2"><Activity size={16} /> {t('activityFeed', lang)}</h3>
          {audit.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No activity yet today</p>
          ) : (
            <ul className="space-y-2.5 max-h-64 overflow-y-auto">
              {audit.map((a) => (
                <li key={a.id} className="text-xs border-l-2 border-emerald-200 pl-2.5">
                  <p className="text-slate-700">{a.action}</p>
                  <p className="text-slate-400">{userName(a.actor_user_id)} · {formatDateTime(a.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Inventory snapshot */}
      <Card className="p-4">
        <h3 className="font-semibold text-slate-800 mb-3">Inventory Snapshot</h3>
        {items.length === 0 ? (
          <EmptyState title="No items yet" message="Add items in Inventory." />
        ) : (
          <ul className="space-y-2 max-h-56 overflow-y-auto">
            {items.slice(0, 10).map((i) => (
              <li key={i.id} className="flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <p className="truncate text-slate-700">{i.name}</p>
                  <p className="text-[11px] text-slate-400">{i.brand ?? '—'} · {(i.current_stock * i.unit_value).toLocaleString('en-IN')} {i.metric}</p>
                </div>
                <span className="text-xs font-medium text-slate-600 shrink-0 ml-2">{i.current_stock} {i.unit_type}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
