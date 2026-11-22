import { useEffect, useMemo, useState } from 'react';
import { Skull } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/lib/supabase';
import { Card, Badge, EmptyState, Spinner, cn } from '@/components/ui';
import { daysAgo, formatDate } from '@/lib/format';
import type { InventoryItem } from '@/lib/types';

export default function DeadStock() {
  const { store } = useApp();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<number>(store?.dead_stock_days ?? 10);

  useEffect(() => {
    if (!store) return;
    supabase.from('inventory_items').select('*').eq('store_id', store.id).then(({ data }) => {
      setItems((data as InventoryItem[]) ?? []);
      setLoading(false);
    });
  }, [store]);

  const dead = useMemo(() => items.filter((i) => {
    const d = daysAgo(i.last_movement_at);
    return i.current_stock > 0 && d >= days;
  }).sort((a, b) => daysAgo(b.last_movement_at) - daysAgo(a.last_movement_at)), [items, days]);

  if (loading) return <Spinner label="Scanning stock movement…" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[7, 10, 15, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={cn('rounded-full px-3.5 py-1.5 text-xs font-medium border transition-colors', days === d ? 'bg-red-600 text-white border-red-600' : 'border-slate-200 bg-white text-slate-500')}
          >
            {d} days
          </button>
        ))}
      </div>

      <p className="text-sm text-slate-500">Items with <b>zero stock movement in the last {days} days</b> — stock sitting dead in the godown.</p>

      {dead.length === 0 ? (
        <EmptyState icon={<Skull size={32} />} title="No dead stock" message={`Everything moved in the last ${days} days. Good going!`} />
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {dead.map((i) => (
            <Card key={i.id} className="p-4 border-red-100">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">{i.name}</p>
                  <p className="text-xs text-slate-400">{i.brand ?? '—'}</p>
                </div>
                <Badge tone="red">Dead</Badge>
              </div>
              <p className="mt-3 text-lg font-semibold text-slate-900">{i.current_stock} {i.unit_type}</p>
              <p className="text-xs text-slate-400">Last activity: {formatDate(i.last_movement_at)} ({daysAgo(i.last_movement_at)}d ago)</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
