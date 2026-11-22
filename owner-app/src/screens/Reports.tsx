import { useEffect, useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/lib/supabase';
import { Card, StatCard, Input, EmptyState, Spinner, cn } from '@/components/ui';
import { formatINR, todayISO } from '@/lib/format';
import type { InventoryItem, StockTransaction, WholesaleCustomer, Order, KhataTransaction } from '@/lib/types';

type RangeKey = 'week' | 'month' | 'custom';

export default function Reports() {
  const { store, isOwner, hasFeature } = useApp();
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>('week');
  const [customStart, setCustomStart] = useState(todayISO());
  const [customEnd, setCustomEnd] = useState(todayISO());
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [txs, setTxs] = useState<StockTransaction[]>([]);
  const [customers, setCustomers] = useState<WholesaleCustomer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [khata, setKhata] = useState<KhataTransaction[]>([]);
  const [search, setSearch] = useState('');

  const wholesale = store?.store_type !== 'retail';

  useEffect(() => {
    if (!store) return;
    async function load() {
      const [i, t, k] = await Promise.all([
        supabase.from('inventory_items').select('*').eq('store_id', store!.id),
        supabase.from('stock_transactions').select('*').eq('store_id', store!.id).order('created_at', { ascending: false }),
        supabase.from('khata_transactions').select('*').eq('store_id', store!.id),
      ]);
      setItems((i.data as InventoryItem[]) ?? []);
      setTxs((t.data as StockTransaction[]) ?? []);
      setKhata((k.data as KhataTransaction[]) ?? []);
      if (wholesale) {
        const [c, o] = await Promise.all([
          supabase.from('wholesale_customers').select('*').eq('store_id', store!.id),
          supabase.from('orders').select('*').eq('store_id', store!.id).eq('status', 'delivered'),
        ]);
        setCustomers((c.data as WholesaleCustomer[]) ?? []);
        setOrders((o.data as Order[]) ?? []);
      }
      setLoading(false);
    }
    void load();
  }, [store, wholesale]);

  const { start, end } = useMemo(() => {
    const s = new Date(); const e = new Date();
    if (range === 'week') s.setDate(s.getDate() - 6);
    if (range === 'month') { s.setDate(1); }
    if (range === 'custom') { return { start: new Date(customStart + 'T00:00:00'), end: new Date(customEnd + 'T23:59:59') }; }
    s.setHours(0, 0, 0, 0);
    return { start: s, end: e };
  }, [range, customStart, customEnd]);

  const inRange = (iso: string) => { const d = new Date(iso); return d >= start && d <= end; };

  const godownValue = items.reduce((s, i) => s + i.current_stock * i.avg_base_price, 0);
  const dispatchedValue = txs.filter((t) => t.type !== 'stock_in' && inRange(t.created_at)).reduce((s, t) => s + t.quantity * t.unit_price, 0);
  const collections = khata.filter((k) => k.type === 'credit_payment' && inRange(k.created_at)).reduce((s, k) => s + k.amount, 0);
  const khataChange = khata.filter((k) => k.type !== 'credit_payment' && inRange(k.created_at)).reduce((s, k) => s + k.amount, 0)
    - collections;

  // Per-item consumption ranking
  const consumption = useMemo(() => {
    const map = new Map<string, { name: string; brand: string; qty: number; value: number; unit: string }>();
    for (const t of txs.filter((t) => t.type !== 'stock_in' && inRange(t.created_at))) {
      const item = items.find((i) => i.id === t.item_id);
      if (!item) continue;
      const prev = map.get(t.item_id) ?? { name: item.name, brand: item.brand ?? '', qty: 0, value: 0, unit: item.unit_type };
      prev.qty += t.quantity;
      prev.value += t.quantity * t.unit_price;
      map.set(t.item_id, prev);
    }
    return [...map.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .filter((r) => !search || `${r.name} ${r.brand}`.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.value - a.value);
  }, [txs, items, start, end, search]);

  const leaderboard = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders.filter((o) => inRange(o.created_at))) {
      map.set(o.customer_id, (map.get(o.customer_id) ?? 0) + o.final_total);
    }
    return [...map.entries()]
      .map(([cid, total]) => ({ customer: customers.find((c) => c.id === cid), total }))
      .filter((r) => r.customer)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [orders, customers, start, end]);

  const aging = useMemo(() => customers
    .filter((c) => c.current_khata_balance > 0)
    .map((c) => {
      const debits = khata.filter((k) => k.customer_id === c.id && k.type !== 'credit_payment');
      const oldest = debits.length ? debits.reduce((m, k) => k.created_at < m ? k.created_at : m, debits[0].created_at) : null;
      const days = oldest ? Math.floor((Date.now() - new Date(oldest).getTime()) / 86400000) : 0;
      return { c, days };
    })
    .sort((a, b) => b.days - a.days), [customers, khata]);

  if (loading) return <Spinner label="Building reports…" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        {(['week', 'month', 'custom'] as RangeKey[]).map((r) => (
          <button key={r} onClick={() => setRange(r)}
            className={cn('rounded-full px-3.5 py-1.5 text-xs font-medium border', range === r ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-200 bg-white text-slate-500')}>
            {r === 'week' ? 'This Week' : r === 'month' ? 'This Month' : 'Custom Range'}
          </button>
        ))}
        {range === 'custom' && (
          <div className="flex gap-2">
            <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-36" />
            <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-36" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Live Godown Value" value={formatINR(godownValue)} tone="green" />
        <StatCard label="Total Dispatched Value" value={formatINR(dispatchedValue)} tone="amber" />
        <StatCard label="Total Collections" value={formatINR(collections)} tone="teal" />
        <StatCard label="Net Khata Change" value={formatINR(khataChange)} tone={khataChange > 0 ? 'red' : 'green'} />
      </div>

      <Card className="p-4">
        <h3 className="font-semibold text-slate-800 mb-3">Per-Item Consumption (Khapat) Ranking</h3>
        <Input placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3" />
        {consumption.length === 0 ? (
          <EmptyState icon={<BarChart3 size={28} />} title="No dispatches in this range" />
        ) : (
          <ul className="space-y-1.5">
            {consumption.map((r, idx) => (
              <li key={r.id} className="flex items-center justify-between gap-3 text-sm border-b border-slate-50 pb-1.5">
                <span className="truncate text-slate-700">
                  <span className="text-slate-400 mr-2">#{idx + 1}</span>{r.name} {r.brand && <span className="text-slate-400">· {r.brand}</span>}
                </span>
                <span className="shrink-0 text-xs text-slate-500">
                  {r.qty.toLocaleString('en-IN')} {r.unit} · <b className="text-slate-800">{formatINR(r.value)}</b>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {wholesale && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <h3 className="font-semibold text-slate-800 mb-3">Customer Leaderboard</h3>
            {leaderboard.length === 0 ? <p className="text-sm text-slate-400">No delivered orders in range</p> : (
              <ul className="space-y-1.5">
                {leaderboard.map((r, idx) => (
                  <li key={r.customer!.id} className="flex items-center justify-between text-sm">
                    <span className="truncate text-slate-700"><span className="text-slate-400 mr-2">#{idx + 1}</span>{r.customer!.shop_name}</span>
                    <b className="text-slate-800">{formatINR(r.total)}</b>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-4">
            <h3 className="font-semibold text-slate-800 mb-3">Overdue Khata Aging Report</h3>
            {aging.length === 0 ? <p className="text-sm text-slate-400">No outstanding khata</p> : (
              <ul className="space-y-1.5">
                {aging.map(({ c, days }) => (
                  <li key={c.id} className="flex items-center justify-between text-sm">
                    <span className="truncate text-slate-700">{c.shop_name}</span>
                    <span className={cn('text-xs font-medium', days > 30 ? 'text-red-600' : days > 7 ? 'text-amber-600' : 'text-slate-500')}>
                      {formatINR(c.current_khata_balance)} · {days}d
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
