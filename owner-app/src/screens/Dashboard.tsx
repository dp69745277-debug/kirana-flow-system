import { useEffect, useState } from 'react';
import {
  Package, TrendingUp, TrendingDown, Truck, ShoppingCart, BookOpen,
  ArrowDownToLine, ArrowUpFromLine, IndianRupee, Wallet, Activity, Users,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Line } from 'recharts';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/lib/supabase';
import { Card, StatCard, Badge, Spinner, EmptyState } from '@/components/ui';
import { formatINR, formatDateTime, daysAgo } from '@/lib/format';
import { playClick } from '@/lib/sound';
import type { InventoryItem, StockTransaction, Agency, WholesaleCustomer, Order, AuditLog, StoreUser } from '@/lib/types';

interface DaySales { key: string; date: string; cash: number; upi: number; credit: number }

export default function Dashboard({ setPage }: { setPage: (p: import('@/components/Shell').PageKey) => void }) {
  const { store, isOwner, hasFeature } = useApp();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [customers, setCustomers] = useState<WholesaleCustomer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [txs, setTxs] = useState<StockTransaction[]>([]);
  const [users, setUsers] = useState<StoreUser[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [range, setRange] = useState<7 | 30>(7);

  const wholesale = store?.store_type !== 'retail';

  useEffect(() => {
    if (!store) return;
    let mounted = true;
    async function load() {
      const [itemsRes, agRes, txRes, userRes, auditRes] = await Promise.all([
        supabase.from('inventory_items').select('*').eq('store_id', store!.id),
        supabase.from('agencies').select('*').eq('store_id', store!.id),
        supabase.from('stock_transactions').select('*').eq('store_id', store!.id).gte('created_at', new Date(Date.now() - 31 * 86400000).toISOString()).order('created_at', { ascending: false }),
        supabase.from('store_users').select('*').eq('store_id', store!.id),
        supabase.from('audit_logs').select('*').eq('store_id', store!.id).gte('created_at', new Date().setHours(0, 0, 0, 0)).order('created_at', { ascending: false }).limit(30),
      ]);
      if (!mounted) return;
      setItems((itemsRes.data as InventoryItem[]) ?? []);
      setAgencies((agRes.data as Agency[]) ?? []);
      setTxs((txRes.data as StockTransaction[]) ?? []);
      setUsers((userRes.data as StoreUser[]) ?? []);
      setAudit((auditRes.data as AuditLog[]) ?? []);
      if (wholesale) {
        const [custRes, ordRes] = await Promise.all([
          supabase.from('wholesale_customers').select('*').eq('store_id', store!.id),
          supabase.from('orders').select('*').eq('store_id', store!.id).gte('created_at', new Date(Date.now() - 31 * 86400000).toISOString()),
        ]);
        setCustomers((custRes.data as WholesaleCustomer[]) ?? []);
        setOrders((ordRes.data as Order[]) ?? []);
      }
      setLoading(false);
    }
    void load();
    return () => { mounted = false; };
  }, [store, wholesale]);

  if (!store) return null;
  if (loading) return <Spinner label="Loading dashboard…" />;

  const godownValue = items.reduce((s, i) => s + i.current_stock * (i.avg_base_price || 0), 0);
  const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
  const todayIn = txs.filter((t) => t.type === 'stock_in' && isToday(t.created_at));
  const todayOut = txs.filter((t) => t.type !== 'stock_in' && isToday(t.created_at));
  const lowStock = items.filter((i) => i.current_stock <= i.low_stock_threshold);

  const agencyPayable = agencies.reduce((s, a) => s + a.balance, 0);
  const pendingOrders = orders.filter((o) => !['delivered', 'cancelled'].includes(o.status)).length;
  const totalKhata = customers.reduce((s, c) => s + c.current_khata_balance, 0);
  const overdueCustomers = customers.filter((c) => {
    const last = orders.filter((o) => o.customer_id === c.id && o.status === 'delivered')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    return c.current_khata_balance > 0 && last && daysAgo(last.created_at) > 30;
  }).length;

  // Sales trend: manual cash/UPI come from khata credits (payments) + khata manual debits as credit proxy
  const days: DaySales[] = [];
  for (let d = range - 1; d >= 0; d--) {
    const date = new Date(Date.now() - d * 86400000);
    const key = date.toISOString().slice(0, 10);
    days.push({ date: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), cash: 0, upi: 0, credit: 0, key } as DaySales);
  }
  if (wholesale) {
    for (const o of orders) {
      if (o.status !== 'delivered') continue;
      const day = days.find((d) => d.key === o.created_at.slice(0, 10));
      if (!day) continue;
      const mode = o.payment_mode;
      if (mode === 'cash') day.cash += o.final_total;
      else if (mode === 'upi') day.upi += o.final_total;
      else if (mode === 'khata') day.credit += o.khata_amount || o.final_total;
      else if (mode === 'split') {
        day.cash += o.paid_amount;
        day.credit += o.khata_amount;
      }
    }
  }

  const topCustomers = [...customers].sort((a, b) => b.current_khata_balance - a.current_khata_balance).slice(0, 5);
  const overdueList = customers
    .filter((c) => c.current_khata_balance > 0)
    .map((c) => {
      const last = orders.filter((o) => o.customer_id === c.id).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      return { c, days: last ? daysAgo(last.created_at) : 999 };
    })
    .sort((a, b) => b.days - a.days)
    .slice(0, 5);

  const userName = (id: string | null) => users.find((u) => u.id === id)?.name ?? 'System';

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard className="stagger-item stagger-1" label="Total Inventory Items" value={String(items.length)} icon={<Package size={18} />} tone="teal" />
        <StatCard className="stagger-item stagger-2" label="Live Godown Value" value={formatINR(godownValue)} icon={<Wallet size={18} />} tone="green" />
        <StatCard className="stagger-item stagger-3" label="Today's Stock In" value={`+${todayIn.reduce((s, t) => s + t.quantity, 0).toLocaleString('en-IN')}`} sub={`${todayIn.length} entries`} icon={<ArrowDownToLine size={18} />} tone="blue" />
        <StatCard className="stagger-item stagger-4" label="Today's Stock Out" value={`-${todayOut.reduce((s, t) => s + t.quantity, 0).toLocaleString('en-IN')}`} sub={`${todayOut.length} entries`} icon={<ArrowUpFromLine size={18} />} tone="amber" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard className="stagger-item stagger-2" label="Agency Payable" value={formatINR(agencyPayable)} sub={`${agencies.length} agencies`} icon={<Truck size={18} />} tone="red" />
        {wholesale && (
          <>
            <StatCard className="stagger-item stagger-3" label="Pending Orders" value={String(pendingOrders)} icon={<ShoppingCart size={18} />} tone="amber" />
            <StatCard className="stagger-item stagger-4" label="Total Khata" value={formatINR(totalKhata)} sub={`${overdueCustomers} overdue`} icon={<BookOpen size={18} />} tone="red" />
          </>
        )}
        {!wholesale && (
          <StatCard className="stagger-item stagger-3" label="Low Stock Items" value={String(lowStock.length)} icon={<Package size={18} />} tone="amber" />
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Sales trend */}
        <Card className="lg:col-span-2 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800">Sales Trend</h3>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
              <button
                onClick={() => {
                  playClick();
                  setRange(7);
                }}
                className={range === 7 ? 'bg-emerald-600 text-white px-2.5 py-1' : 'px-2.5 py-1 text-slate-500'}
              >
                7d
              </button>
              <button
                onClick={() => {
                  playClick();
                  setRange(30);
                }}
                className={range === 30 ? 'bg-emerald-600 text-white px-2.5 py-1' : 'px-2.5 py-1 text-slate-500'}
              >
                30d
              </button>
            </div>
          </div>
          {wholesale ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart key={range} data={days}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={Math.floor(days.length / 7)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => formatINR(Number(v ?? 0))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar isAnimationActive animationDuration={600} animationEasing="ease-out" dataKey="cash" name="Cash" stackId="s" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar isAnimationActive animationDuration={600} animationEasing="ease-out" dataKey="upi" name="UPI" stackId="s" fill="#0ea5e9" />
                <Bar isAnimationActive animationDuration={600} animationEasing="ease-out" dataKey="credit" name="Khata (Udhaar)" stackId="s" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState
              icon={<TrendingUp size={28} />}
              title="Retail counter sales"
              message="Record daily counter cash and UPI sales in Daily Hisaab to build your trend."
              action={<button className="mt-2 text-sm font-medium text-emerald-700 hover:underline" onClick={() => setPage('hisaab')}>Open Daily Hisaab</button>}
            />
          )}
        </Card>

        {/* Today's activity */}
        <Card className="p-4">
          <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2"><Activity size={16} /> Today's Activity</h3>
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

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Low stock */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-slate-800">Low Stock Alerts</h3>
            <Badge tone={lowStock.length ? 'amber' : 'green'}>{lowStock.length}</Badge>
          </div>
          {lowStock.length === 0 ? (
            <p className="text-sm text-slate-400 py-3">All items healthy</p>
          ) : (
            <ul className="space-y-2 max-h-56 overflow-y-auto">
              {lowStock.slice(0, 8).map((i) => (
                <li key={i.id} className="flex items-center justify-between text-sm">
                  <span className="truncate text-slate-700">{i.name} {i.brand ? `· ${i.brand}` : ''}</span>
                  <Badge tone={i.current_stock === 0 ? 'red' : 'amber'}>{i.current_stock} {i.unit_type}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Quick inventory snapshot */}
        <Card className="p-4">
          <h3 className="font-semibold text-slate-800 mb-3">Inventory Snapshot</h3>
          {items.length === 0 ? (
            <EmptyState title="No items yet" message="Add items in Inventory." />
          ) : (
            <ul className="space-y-2 max-h-56 overflow-y-auto">
              {items.slice(0, 8).map((i) => (
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

        {/* Wholesale widgets */}
        {wholesale && (
          <div className="space-y-4">
            <Card className="p-4">
              <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2"><Users size={16} /> Top Buying Customers</h3>
              {topCustomers.length === 0 ? <p className="text-sm text-slate-400 py-2">No customers yet</p> : (
                <ul className="space-y-2">
                  {topCustomers.map((c, idx) => (
                    <li key={c.id} className="flex items-center justify-between text-sm">
                      <span className="truncate text-slate-700">{idx + 1}. {c.shop_name}</span>
                      <span className="text-xs font-medium text-slate-600">{formatINR(c.current_khata_balance)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2"><IndianRupee size={16} /> Longest Overdue</h3>
              {overdueList.length === 0 ? <p className="text-sm text-slate-400 py-2">No outstanding khata</p> : (
                <ul className="space-y-2">
                  {overdueList.map(({ c, days }) => (
                    <li key={c.id} className="flex items-center justify-between text-sm">
                      <span className="truncate text-slate-700">{c.shop_name}</span>
                      <Badge tone={days > 30 ? 'red' : days > 7 ? 'amber' : 'slate'}>
                        {formatINR(c.current_khata_balance)} · {days === 999 ? 'no orders' : `${days}d`}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
