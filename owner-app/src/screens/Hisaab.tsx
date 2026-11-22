import { useEffect, useState } from 'react';
import { CalendarDays, Calculator } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/lib/supabase';
import { Button, Input, Label, Card, StatCard, Spinner, useToast, EmptyState } from '@/components/ui';
import { formatINR, todayISO } from '@/lib/format';
import type { DailyHisaab, KhataTransaction, StoreUser } from '@/lib/types';

export default function Hisaab() {
  const { store, user } = useApp();
  const { show, node: toastNode } = useToast();
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState<DailyHisaab[]>([]);
  const [khata, setKhata] = useState<KhataTransaction[]>([]);
  const [users, setUsers] = useState<StoreUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cash, setCash] = useState('');
  const [upi, setUpi] = useState('');
  const [expenses, setExpenses] = useState('');
  const [notes, setNotes] = useState('');

  async function load() {
    if (!store) return;
    const [h, k, u] = await Promise.all([
      supabase.from('daily_hisaab').select('*').eq('store_id', store.id).order('hisaab_date', { ascending: false }).limit(31),
      supabase.from('khata_transactions').select('*').eq('store_id', store.id).gte('created_at', new Date(Date.now() - 31 * 86400000).toISOString()),
      supabase.from('store_users').select('*').eq('store_id', store.id),
    ]);
    setRows((h.data as DailyHisaab[]) ?? []);
    setKhata((k.data as KhataTransaction[]) ?? []);
    setUsers((u.data as StoreUser[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [store?.id]);

  useEffect(() => {
    if (!store) return;
    const existing = rows.find((r) => r.hisaab_date === date);
    setCash(existing ? String(existing.cash_sales) : '');
    setUpi(existing ? String(existing.upi_sales) : '');
    setExpenses(existing ? String(existing.expenses) : '');
    setNotes(existing?.notes ?? '');
    // eslint-disable-next-line
  }, [date, rows.length]);

  if (!store) return null;
  if (loading) return <Spinner label="Loading hisaab…" />;

  const existing = rows.find((r) => r.hisaab_date === date);

  // Auto-calculated credit sales for the selected date
  const dayStart = new Date(date + 'T00:00:00');
  const dayEnd = new Date(date + 'T23:59:59');
  const autoCredit = khata
    .filter((k) => k.type !== 'credit_payment' && new Date(k.created_at) >= dayStart && new Date(k.created_at) <= dayEnd)
    .reduce((s, k) => s + k.amount, 0);
  const cashCollections = khata
    .filter((k) => k.type === 'credit_payment' && k.payment_mode === 'Cash' && new Date(k.created_at) >= dayStart && new Date(k.created_at) <= dayEnd)
    .reduce((s, k) => s + k.amount, 0);

  const cashN = Number(cash) || 0;
  const upiN = Number(upi) || 0;
  const expensesN = Number(expenses) || 0;
  const totalSales = cashN + upiN + autoCredit;
  const netDrawer = cashN + cashCollections - expensesN;

  async function save() {
    if (!store || !user) return;
    setBusy(true);
    const payload = {
      store_id: store.id, hisaab_date: date,
      cash_sales: cashN, upi_sales: upiN, auto_khata_sales: autoCredit,
      expenses: expensesN, notes: notes.trim() || null, updated_by_user_id: user.id,
    };
    const { error } = existing
      ? await supabase.from('daily_hisaab').update(payload).eq('id', existing.id)
      : await supabase.from('daily_hisaab').insert(payload);
    setBusy(false);
    if (error) return show(error.message, true);
    show('Daily hisaab saved');
    void load();
  }

  return (
    <div className="space-y-4">
      {toastNode}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label required>Date</Label>
            <Input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className="w-44" />
          </div>
          <p className="text-xs text-slate-400 flex items-center gap-1 pb-3">
            <CalendarDays size={13} /> {existing ? 'Editing existing entry' : 'New entry'}
          </p>
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label>Counter Cash Sales (₹)</Label>
            <Input type="number" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label>Counter UPI / Online Sales (₹)</Label>
            <Input type="number" inputMode="decimal" value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label>Daily Expenses / Cash Paid Out (₹)</Label>
            <Input type="number" inputMode="decimal" value={expenses} onChange={(e) => setExpenses(e.target.value)} placeholder="0" />
          </div>
          <div className="sm:col-span-3">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Expense details, remarks…" />
          </div>
        </div>
        <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-sm">
          <div className="flex justify-between py-0.5"><span className="text-slate-500">Cash</span><span>{formatINR(cashN)}</span></div>
          <div className="flex justify-between py-0.5"><span className="text-slate-500">UPI</span><span>{formatINR(upiN)}</span></div>
          <div className="flex justify-between py-0.5"><span className="text-slate-500">Auto-Calculated Udhaar Sales</span><span>{formatINR(autoCredit)}</span></div>
          <div className="flex justify-between py-1 font-semibold text-slate-900 border-t border-emerald-200 mt-1">
            <span>Total Daily Sales</span><span>{formatINR(totalSales)}</span>
          </div>
          <div className="flex justify-between py-1 mt-1 text-teal-700 font-medium border-t border-emerald-200">
            <span className="flex items-center gap-1"><Calculator size={13} /> Net Cash in Drawer</span>
            <span>{formatINR(netDrawer)}</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Drawer = Cash Sales {formatINR(cashN)} + Cash Khata Collections {formatINR(cashCollections)} − Cash Expenses {formatINR(expensesN)}</p>
        </div>
        <Button className="mt-3 w-full sm:w-auto" onClick={save} disabled={busy}>{busy ? 'Saving…' : existing ? 'Update Hisaab' : 'Save Hisaab'}</Button>
      </Card>

      <h3 className="font-semibold text-slate-800">Last 31 Days</h3>
      {rows.length === 0 ? (
        <EmptyState title="No hisaab entries yet" message="Save your first daily register above." />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.id} className="p-3.5">
              <button className="w-full text-left" onClick={() => setDate(r.hisaab_date)}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-800">{r.hisaab_date}</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-2 text-xs">
                  <span className="text-slate-500">Cash <b className="text-slate-800">{formatINR(r.cash_sales)}</b></span>
                  <span className="text-slate-500">UPI <b className="text-slate-800">{formatINR(r.upi_sales)}</b></span>
                  <span className="text-slate-500">Udhaar <b className="text-amber-700">{formatINR(r.auto_khata_sales)}</b></span>
                  <span className="text-slate-500">Expenses <b className="text-red-600">{formatINR(r.expenses)}</b></span>
                  <span className="text-slate-500">Total <b className="text-slate-900">{formatINR(r.cash_sales + r.upi_sales + r.auto_khata_sales)}</b></span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Updated by {users.find((u) => u.id === r.updated_by_user_id)?.name ?? '—'}
                  {r.notes ? ` · ${r.notes}` : ''}
                </p>
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
