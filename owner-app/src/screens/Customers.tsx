import { useEffect, useMemo, useState } from 'react';
import { Plus, MessageCircle, FileText, Phone, Users, Search } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/lib/supabase';
import {
  Button, Input, Select, Label, Card, Badge, Modal, EmptyState, Spinner, useToast, ConfirmDialog, cn,
  AnimatedContent, ClickSpark,
} from '@/components/ui';
import { formatINR, formatDateTime, waLink, agingBucket } from '@/lib/format';
import { generateKhataStatementPDF } from '@/lib/pdf';
import type { WholesaleCustomer, KhataTransaction, Order, StoreUser, StaffPermissions } from '@/lib/types';

export default function Customers() {
  const { store, user, isOwner, lang } = useApp();
  const { show, node: toastNode } = useToast();
  const [customers, setCustomers] = useState<WholesaleCustomer[]>([]);
  const [khata, setKhata] = useState<KhataTransaction[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<StoreUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<WholesaleCustomer | null>(null);

  const [addModal, setAddModal] = useState(false);
  const [form, setForm] = useState({ name: '', shop_name: '', phone: '', address: '', password: '', credit_limit: '', opening_balance: '' });
  const [khataModal, setKhataModal] = useState(false);
  const [khataType, setKhataType] = useState<'debit_manual' | 'credit_payment'>('debit_manual');
  const [khataAmount, setKhataAmount] = useState('');
  const [khataMode, setKhataMode] = useState('Cash');
  const [khataNotes, setKhataNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteCustomer, setDeleteCustomer] = useState<WholesaleCustomer | null>(null);

  const canViewKhata = isOwner || !!(user?.permissions as StaffPermissions)?.can_view_khata;

  async function load() {
    if (!store) return;
    const [c, k, o, u] = await Promise.all([
      supabase.from('wholesale_customers').select('*').eq('store_id', store.id).order('shop_name'),
      supabase.from('khata_transactions').select('*').eq('store_id', store.id).order('created_at', { ascending: false }),
      supabase.from('orders').select('*').eq('store_id', store.id),
      supabase.from('store_users').select('*').eq('store_id', store.id),
    ]);
    setCustomers((c.data as WholesaleCustomer[]) ?? []);
    setKhata((k.data as KhataTransaction[]) ?? []);
    setOrders((o.data as Order[]) ?? []);
    setUsers((u.data as StoreUser[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [store?.id]);

  const filtered = useMemo(() => customers.filter((c) =>
    `${c.name} ${c.shop_name} ${c.phone}`.toLowerCase().includes(q.toLowerCase())
  ), [customers, q]);

  const reminderTemplates = {
    en: (c: WholesaleCustomer, lastOrder: string) =>
      `Dear ${c.name}, gentle reminder from ${store?.shop_name}: your pending khata balance is ${formatINR(c.current_khata_balance)}.${lastOrder ? ` Last order: ${lastOrder}.` : ''}${store?.upi_id ? ` Pay via UPI: ${store.upi_id}` : ''} Thank you!`,
    hinglish: (c: WholesaleCustomer, lastOrder: string) =>
      `Namaste ${c.name} ji, ${store?.shop_name} se yaad dilana tha — aapka khata balance ${formatINR(c.current_khata_balance)} pending hai.${lastOrder ? ` Last order: ${lastOrder}.` : ''}${store?.upi_id ? ` UPI pe bhejein: ${store.upi_id}` : ''} Dhanyawad!`,
    hi: (c: WholesaleCustomer, lastOrder: string) =>
      `नमस्ते ${c.name} जी, ${store?.shop_name} की ओर से स्मरण — आपका खाता बैलेंस ${formatINR(c.current_khata_balance)} बाकी है।${lastOrder ? ` अंतिम ऑर्डर: ${lastOrder}.` : ''}${store?.upi_id ? ` UPI: ${store.upi_id}` : ''} धन्यवाद!`,
  };

  async function addCustomer() {
    if (!store) return;
    if (!form.name.trim() || !form.shop_name.trim() || !form.password) return show('Name, shop name and password are required', true);
    if (!/^\d{10}$/.test(form.phone)) return show('Enter a valid 10-digit mobile number', true);
    setBusy(true);
    const { error } = await supabase.from('wholesale_customers').insert({
      store_id: store.id,
      name: form.name.trim(), shop_name: form.shop_name.trim(),
      phone: form.phone, address: form.address.trim() || null,
      password_digest: form.password,
      credit_limit: Number(form.credit_limit) || 0,
      current_khata_balance: Number(form.opening_balance) || 0,
    });
    if (!error && Number(form.opening_balance) > 0) {
      await supabase.from('khata_transactions').insert({
        store_id: store.id, customer_id: (await supabase.from('wholesale_customers').select('id').eq('store_id', store.id).eq('phone', form.phone).maybeSingle()).data!.id,
        type: 'debit_manual', amount: Number(form.opening_balance), balance_after: Number(form.opening_balance),
        performed_by_user_id: user?.id, notes: 'Opening balance',
      });
    }
    setBusy(false);
    if (error) return show(error.message, true);
    setAddModal(false);
    setForm({ name: '', shop_name: '', phone: '', address: '', password: '', credit_limit: '', opening_balance: '' });
    show('Customer added — their Customer App login is ready');
    void load();
  }

  async function submitKhataEntry() {
    if (!store || !user || !selected) return;
    const amt = Number(khataAmount);
    if (!amt || amt <= 0) return show('Enter a valid amount', true);
    setBusy(true);
    const newBal = khataType === 'debit_manual'
      ? selected.current_khata_balance + amt
      : selected.current_khata_balance - amt;
    const { error } = await supabase.from('khata_transactions').insert({
      store_id: store.id, customer_id: selected.id, type: khataType,
      amount: amt, payment_mode: khataType === 'credit_payment' ? khataMode : null,
      balance_after: newBal, performed_by_user_id: user.id,
      notes: khataNotes.trim() || null,
    });
    if (!error) {
      await supabase.from('wholesale_customers').update({ current_khata_balance: newBal }).eq('id', selected.id);
      if (!isOwner && khataType === 'credit_payment') {
        await supabase.from('pending_hisaab').insert({
          store_id: store.id, staff_user_id: user.id, entry_type: 'customer_collection',
          reference_id: selected.id, amount: amt, payment_mode: khataMode,
        });
      }
      await supabase.from('audit_logs').insert({
        store_id: store.id, actor_user_id: user.id,
        action: `Khata ${khataType === 'debit_manual' ? 'udhaar' : 'payment'} ${formatINR(amt)} — ${selected.shop_name}`,
        entity_type: 'khata_transaction',
      });
    }
    setBusy(false);
    if (error) return show(error.message, true);
    setKhataModal(false); setKhataAmount(''); setKhataNotes('');
    show('Khata entry recorded');
    void load();
  }

  function downloadStatement(rangeKey: 'all' | 'month' | 'custom', customStart?: string, customEnd?: string) {
    if (!store || !selected) return;
    let start: Date | null = null;
    let end: Date | null = null;
    let label = 'All Time';
    if (rangeKey === 'month') { start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0); label = 'This Month'; }
    if (rangeKey === 'custom' && customStart && customEnd) {
      start = new Date(customStart); end = new Date(customEnd); end.setHours(23, 59, 59);
      label = `${customStart} to ${customEnd}`;
    }
    const entries = khata
      .filter((k) => k.customer_id === selected.id)
      .filter((k) => (!start || new Date(k.created_at) >= start) && (!end || new Date(k.created_at) <= end))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    let running = 0;
    const rows = entries.map((k) => {
      const debit = k.type !== 'credit_payment';
      running = debit ? running + k.amount : running - k.amount;
      const order = orders.find((o) => o.id === k.order_id);
      return {
        date: formatDateTime(k.created_at),
        ref: order?.order_number ?? (k.type === 'credit_payment' ? 'Payment' : 'Manual'),
        detail: k.notes ?? '',
        debit: debit ? k.amount : 0,
        credit: debit ? 0 : k.amount,
        balance: k.balance_after,
      };
    });
    generateKhataStatementPDF({
      store, customerName: selected.name, customerShop: selected.shop_name, customerPhone: selected.phone,
      rangeLabel: label, openingBalance: 0, entries: rows, closingBalance: running,
    });
  }

  if (!store) return null;
  if (loading) return <Spinner label="Loading customers…" />;
  if (!canViewKhata) {
    return <EmptyState icon={<Users size={32} />} title="No access" message="You don't have permission to view the customer directory." />;
  }

  return (
    <div className="space-y-4">
      {toastNode}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search customers…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => setAddModal(true)}><Plus size={16} /> Add Customer</Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Users size={32} />} title="No wholesale customers" message="Add customers to start taking orders and maintaining khata." />
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((c, idx) => {
            const custOrders = orders.filter((o) => o.customer_id === c.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
            const lastOrder = custOrders[0];
            const aging = agingBucket(lastOrder?.created_at);
            return (
              <AnimatedContent key={c.id} index={idx}>
                <Card className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 truncate">{c.shop_name}</p>
                      <p className="text-xs text-slate-400 truncate">{c.name} · +91 {c.phone}</p>
                    </div>
                    <Badge tone={c.current_khata_balance > 0 ? aging.severity === 'danger' ? 'red' : aging.severity === 'warn' ? 'amber' : 'green' : 'green'}>
                      {c.current_khata_balance > 0 ? aging.label : 'Clear'}
                    </Badge>
                  </div>
                  <p className="mt-3 text-2xl font-semibold text-slate-900">{formatINR(c.current_khata_balance)}</p>
                  <p className="text-xs text-slate-400">Khata balance · limit {formatINR(c.credit_limit)}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Button variant="secondary" className="!py-2 text-xs flex-1" onClick={() => { setSelected(c); void load(); }}>
                      Khata
                    </Button>
                    <a href={waLink(c.phone, reminderTemplates[lang](c, lastOrder ? formatDateTime(lastOrder.created_at) : ''))} target="_blank" rel="noreferrer">
                      <Button variant="secondary" className="!py-2 text-xs text-emerald-700"><MessageCircle size={14} /></Button>
                    </a>
                    <a href={`tel:+91${c.phone}`}><Button variant="ghost" className="!py-2"><Phone size={14} /></Button></a>
                    {isOwner && <Button variant="ghost" className="!py-2 text-red-500" onClick={() => setDeleteCustomer(c)}>✕</Button>}
                  </div>
                </Card>
              </AnimatedContent>
            );
          })}
        </div>
      )}

      {/* Customer ledger */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={`Khata — ${selected?.shop_name ?? ''}`} wide>
        {selected && (() => {
          const entries = khata.filter((k) => k.customer_id === selected.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
          return (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-2xl font-semibold text-slate-900">{formatINR(selected.current_khata_balance)}</p>
                  <p className="text-xs text-slate-400">Current balance · Credit limit {formatINR(selected.credit_limit)}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button className="!py-2 text-xs" onClick={() => { setKhataType('debit_manual'); setKhataModal(true); }}>+ Udhaar</Button>
                  <Button variant="secondary" className="!py-2 text-xs" onClick={() => { setKhataType('credit_payment'); setKhataModal(true); }}>+ Payment</Button>
                  <Button variant="secondary" className="!py-2 text-xs" onClick={() => downloadStatement('all')}><FileText size={13} /> PDF</Button>
                  <Button variant="secondary" className="!py-2 text-xs" onClick={() => downloadStatement('month')}>This Month</Button>
                </div>
              </div>
              {entries.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">No khata entries yet</p>
              ) : (
                <ul className="space-y-2 max-h-80 overflow-y-auto">
                  {entries.map((k) => {
                    const order = orders.find((o) => o.id === k.order_id);
                    const isCredit = k.type === 'credit_payment';
                    return (
                      <li key={k.id} className={cn('flex items-start justify-between gap-3 rounded-lg border px-3 py-2', isCredit ? 'border-emerald-100 bg-emerald-50/50' : 'border-amber-100 bg-amber-50/40')}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-700">
                            {order ? order.order_number : isCredit ? 'Payment Received' : 'Udhaar / Manual'}
                            {k.payment_mode ? ` · ${k.payment_mode}` : ''}
                          </p>
                          <p className="text-xs text-slate-400">
                            {formatDateTime(k.created_at)} · {users.find((u) => u.id === k.performed_by_user_id)?.name ?? '—'}
                            {k.notes ? ` · ${k.notes}` : ''}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={cn('text-sm font-semibold', isCredit ? 'text-emerald-700' : 'text-amber-700')}>
                            {isCredit ? '+' : ''}{formatINR(k.amount)}
                          </p>
                          <p className="text-[11px] text-slate-400">bal {formatINR(k.balance_after)}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })()}
      </Modal>

      {/* Add customer */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add Wholesale Customer" wide>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label required>Customer Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label required>Customer Shop Name</Label><Input value={form.shop_name} onChange={(e) => setForm({ ...form, shop_name: e.target.value })} /></div>
          <div><Label required>Mobile Number</Label><Input inputMode="numeric" maxLength={10} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })} /></div>
          <div><Label required>Password (Customer App login)</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          <div className="col-span-1 sm:col-span-2"><Label>Shop Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div><Label>Credit Limit (₹, optional)</Label><Input type="number" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} /></div>
          <div><Label>Opening Khata Balance (₹)</Label><Input type="number" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} /></div>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">The customer can log in to the Wholesale Customer App with this mobile number and password.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setAddModal(false)}>Cancel</Button>
          <ClickSpark disabled={busy} sparkColor={['#10b981', '#34d399']}>
            <Button onClick={() => addCustomer()} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
          </ClickSpark>
        </div>
      </Modal>

      {/* Khata entry */}
      <Modal open={khataModal} onClose={() => setKhataModal(false)} title={khataType === 'debit_manual' ? 'Add Udhaar (Debit)' : 'Payment Received (Credit)'}>
        <div className="space-y-3">
          <div>
            <Label required>Amount (₹)</Label>
            <Input type="number" inputMode="decimal" value={khataAmount} onChange={(e) => setKhataAmount(e.target.value)} />
          </div>
          {khataType === 'credit_payment' && (
            <div>
              <Label required>Payment Mode</Label>
              <Select value={khataMode} onChange={(e) => setKhataMode(e.target.value)}>
                <option>Cash</option><option>UPI</option><option>Bank Transfer</option>
              </Select>
            </div>
          )}
          <div>
            <Label>Notes / itemized details</Label>
            <Input value={khataNotes} onChange={(e) => setKhataNotes(e.target.value)} placeholder="e.g. 2 pota chawal, 1 box oil" />
          </div>
          <ClickSpark className="w-full" disabled={busy} sparkColor={['#10b981', '#34d399']}>
            <Button className="w-full" onClick={() => submitKhataEntry()} disabled={busy}>{busy ? 'Saving…' : 'Save Entry'}</Button>
          </ClickSpark>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteCustomer} title="Delete Customer"
        message={`Delete ${deleteCustomer?.shop_name}? Their khata history will be removed. This cannot be undone.`}
        onConfirm={async () => {
          if (!deleteCustomer) return;
          await supabase.from('wholesale_customers').delete().eq('id', deleteCustomer.id);
          show('Customer deleted');
          void load();
        }}
        onClose={() => setDeleteCustomer(null)}
      />
    </div>
  );
}
