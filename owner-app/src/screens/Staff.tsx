import { useEffect, useState } from 'react';
import { UserPlus, History } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/lib/supabase';
import {
  Button, Input, Select, Label, Card, Badge, Modal, ConfirmDialog, EmptyState, Spinner, useToast, cn,
} from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import type { StoreUser, StaffPermissions, AuditLog, Agency, WholesaleCustomer, StaffAgencyPermission, StaffCustomerPermission } from '@/lib/types';

const PERM_DEFS: Array<{ key: keyof StaffPermissions; label: string }> = [
  { key: 'can_update_stock', label: 'Can Update Stock (Stock-In / Stock-Out)' },
  { key: 'can_manage_orders', label: 'Can Manage & Deliver Wholesale Orders' },
  { key: 'can_adjust_price', label: 'Can Adjust Price / Give Discount on Delivery' },
  { key: 'can_view_khata', label: 'Can View & Record Khata Entries' },
  { key: 'can_view_agencies', label: 'Can View Agency Balances & Submit Payments' },
  { key: 'can_view_reports', label: 'Can View Reports & Dead Stock' },
];

export default function Staff() {
  const { store, user } = useApp();
  const { show, node: toastNode } = useToast();
  const [staff, setStaff] = useState<StoreUser[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [customers, setCustomers] = useState<WholesaleCustomer[]>([]);
  const [agPerms, setAgPerms] = useState<StaffAgencyPermission[]>([]);
  const [custPerms, setCustPerms] = useState<StaffCustomerPermission[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [addModal, setAddModal] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', password: '', role: 'Staff' });
  const [busy, setBusy] = useState(false);

  const [permModal, setPermModal] = useState<StoreUser | null>(null);
  const [perms, setPerms] = useState<StaffPermissions>({});
  const [maxDiscount, setMaxDiscount] = useState(0);
  const [accessMode, setAccessMode] = useState<'all' | 'selected'>('all');
  const [selAgencies, setSelAgencies] = useState<string[]>([]);
  const [selCustomers, setSelCustomers] = useState<string[]>([]);
  const [fulfillmentOnly, setFulfillmentOnly] = useState<string[]>([]);

  const [historyOf, setHistoryOf] = useState<StoreUser | null>(null);
  const [removeStaff, setRemoveStaff] = useState<StoreUser | null>(null);

  async function load() {
    if (!store) return;
    const [s, a, c, ap, cp, au] = await Promise.all([
      supabase.from('store_users').select('*').eq('store_id', store.id).order('created_at'),
      supabase.from('agencies').select('*').eq('store_id', store.id).order('name'),
      supabase.from('wholesale_customers').select('*').eq('store_id', store.id).order('shop_name'),
      supabase.from('staff_agency_permissions').select('*'),
      supabase.from('staff_customer_permissions').select('*'),
      supabase.from('audit_logs').select('*').eq('store_id', store.id).order('created_at', { ascending: false }).limit(200),
    ]);
    setStaff((s.data as StoreUser[]) ?? []);
    setAgencies((a.data as Agency[]) ?? []);
    setCustomers((c.data as WholesaleCustomer[]) ?? []);
    setAgPerms((ap.data as StaffAgencyPermission[]) ?? []);
    setCustPerms((cp.data as StaffCustomerPermission[]) ?? []);
    setAudit((au.data as AuditLog[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [store?.id]);

  if (!store || !user) return null;
  if (loading) return <Spinner label="Loading staff…" />;
  if (user.role !== 'owner') {
    return <EmptyState title="Owner only" message="Staff management is available to the store owner." />;
  }

  const staffOnly = staff.filter((s) => s.role === 'staff');

  function openPerms(s: StoreUser) {
    setPermModal(s);
    setPerms(s.permissions ?? {});
    setMaxDiscount(s.max_discount_pct);
    setAccessMode(s.customer_access_mode === 'selected' ? 'selected' : 'all');
    setSelAgencies(agPerms.filter((p) => p.staff_user_id === s.id).map((p) => p.agency_id));
    setSelCustomers(custPerms.filter((p) => p.staff_user_id === s.id).map((p) => p.customer_id));
    setFulfillmentOnly(custPerms.filter((p) => p.staff_user_id === s.id && p.fulfillment_only).map((p) => p.customer_id));
  }

  async function savePerms() {
    if (!permModal || !store || !user) return;
    setBusy(true);
    await supabase.from('store_users').update({
      permissions: perms, max_discount_pct: maxDiscount, customer_access_mode: accessMode,
    }).eq('id', permModal.id);
    await supabase.from('staff_agency_permissions').delete().eq('staff_user_id', permModal.id);
    if (selAgencies.length) {
      await supabase.from('staff_agency_permissions').insert(selAgencies.map((a) => ({ staff_user_id: permModal.id, agency_id: a })));
    }
    await supabase.from('staff_customer_permissions').delete().eq('staff_user_id', permModal.id);
    const uniqueCust = new Set([...selCustomers, ...fulfillmentOnly]);
    if (uniqueCust.size) {
      await supabase.from('staff_customer_permissions').insert([...uniqueCust].map((c) => ({
        staff_user_id: permModal.id, customer_id: c, fulfillment_only: fulfillmentOnly.includes(c),
      })));
    }
    await supabase.from('audit_logs').insert({
      store_id: store.id, actor_user_id: user.id,
      action: `Updated permissions for ${permModal.name}`, entity_type: 'store_user', entity_id: permModal.id,
    });
    setBusy(false);
    setPermModal(null);
    show('Permissions saved');
    void load();
  }

  async function addStaff() {
    if (!store || !user) return;
    if (!form.name.trim() || !form.password) return show('Name and password are required', true);
    if (!/^\d{10}$/.test(form.phone)) return show('Enter a valid 10-digit mobile number', true);
    setBusy(true);
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-staff-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
      },
      body: JSON.stringify({
        name: form.name.trim(), phone: form.phone, password: form.password,
        role: form.role, permissions: perms, maxDiscountPct: maxDiscount, customerAccessMode: accessMode,
      }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return show(body.error ?? 'Failed to add staff', true);
    setAddModal(false);
    setForm({ name: '', phone: '', password: '', role: 'Staff' });
    show('Staff added — they can log in with mobile + password');
    await supabase.from('audit_logs').insert({
      store_id: store.id, actor_user_id: user.id,
      action: `Added staff ${form.name.trim()}`, entity_type: 'store_user',
    });
    void load();
  }

  const historyFor = historyOf ? audit.filter((a) => a.actor_user_id === historyOf.id) : [];

  return (
    <div className="space-y-4">
      {toastNode}
      <div className="flex justify-end">
        <Button onClick={() => setAddModal(true)}><UserPlus size={16} /> Add Staff</Button>
      </div>

      {staffOnly.length === 0 ? (
        <EmptyState icon={<UserPlus size={32} />} title="No staff yet" message="Add staff members with granular permissions." />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {staffOnly.map((s) => (
            <Card key={s.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">{s.name}</p>
                  <p className="text-xs text-slate-400">+91 {s.phone}</p>
                </div>
                <Badge tone={s.is_active ? 'blue' : 'red'}>{s.is_active ? 'Active' : 'Disabled'}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {Object.entries(s.permissions ?? {}).filter(([, v]) => v).map(([k]) => (
                  <span key={k} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">
                    {PERM_DEFS.find((d) => d.key === k)?.label.replace('Can ', '') ?? k}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Button variant="secondary" className="!py-2 text-xs" onClick={() => openPerms(s)}>Permissions</Button>
                <Button variant="ghost" className="!py-2 text-xs" onClick={() => setHistoryOf(s)}><History size={13} /> Activity</Button>
                <Button variant="ghost" className="!py-2 text-xs" onClick={async () => { await supabase.from('store_users').update({ is_active: !s.is_active }).eq('id', s.id); void load(); }}>
                  {s.is_active ? 'Disable' : 'Enable'}
                </Button>
                <Button variant="ghost" className="!py-2 text-xs text-red-500" onClick={() => setRemoveStaff(s)}>Remove</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add staff */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add Staff" wide>
        <div className="grid grid-cols-2 gap-3">
          <div><Label required>Full Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label required>Mobile Number (login)</Label><Input inputMode="numeric" maxLength={10} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })} /></div>
          <div><Label required>Password</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          <div><Label>Role</Label><Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option>Staff</option><option>Manager</option></Select></div>
        </div>
        <p className="mt-3 text-xs font-medium text-slate-500">Initial permissions (adjustable later)</p>
        <div className="mt-1.5 space-y-1.5">
          {PERM_DEFS.map((p) => (
            <label key={p.key} className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox" className="w-4 h-4 accent-emerald-600" checked={!!perms[p.key]}
                onChange={(e) => setPerms({ ...perms, [p.key]: e.target.checked })}
              /> {p.label}
            </label>
          ))}
        </div>
        <Button className="mt-4 w-full" onClick={addStaff} disabled={busy}>{busy ? 'Creating…' : 'Create Staff Account'}</Button>
      </Modal>

      {/* Permissions matrix */}
      <Modal open={!!permModal} onClose={() => setPermModal(null)} title={`Permissions — ${permModal?.name ?? ''}`} wide>
        {permModal && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              {PERM_DEFS.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={!!perms[p.key]}
                    onChange={(e) => setPerms({ ...perms, [p.key]: e.target.checked })} /> {p.label}
                </label>
              ))}
            </div>
            <div className="w-40">
              <Label>Max Discount % Limit</Label>
              <Input type="number" value={maxDiscount} onChange={(e) => setMaxDiscount(Number(e.target.value))} />
            </div>

            <div>
              <Label>Assigned Agencies (view/pay allowed)</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {agencies.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={selAgencies.includes(a.id)}
                      onChange={(e) => setSelAgencies(e.target.checked ? [...selAgencies, a.id] : selAgencies.filter((x) => x !== a.id))} />
                    <span className="truncate">{a.name}</span>
                  </label>
                ))}
                {agencies.length === 0 && <p className="text-xs text-slate-400">No agencies yet</p>}
              </div>
            </div>

            <div>
              <Label>Customer Visibility</Label>
              <div className="flex gap-2 mb-2">
                <button onClick={() => setAccessMode('all')} className={cn('rounded-lg px-3 py-1.5 text-xs font-medium border', accessMode === 'all' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-200 text-slate-500')}>All Customers</button>
                <button onClick={() => setAccessMode('selected')} className={cn('rounded-lg px-3 py-1.5 text-xs font-medium border', accessMode === 'selected' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-200 text-slate-500')}>Selected Customers Only</button>
              </div>
              {accessMode === 'selected' && (
                <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                  {customers.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm text-slate-600">
                      <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={selCustomers.includes(c.id)}
                        onChange={(e) => setSelCustomers(e.target.checked ? [...selCustomers, c.id] : selCustomers.filter((x) => x !== c.id))} />
                      <span className="truncate">{c.shop_name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Label>Restricted Mode — Hide Khata & Account Details (fulfillment only)</Label>
              <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                {customers.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" className="w-4 h-4 accent-amber-600" checked={fulfillmentOnly.includes(c.id)}
                      onChange={(e) => setFulfillmentOnly(e.target.checked ? [...fulfillmentOnly, c.id] : fulfillmentOnly.filter((x) => x !== c.id))} />
                    <span className="truncate">{c.shop_name}</span>
                  </label>
                ))}
                {customers.length === 0 && <p className="text-xs text-slate-400">No customers yet</p>}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">These customers' khata balances, ledger and phone analytics stay hidden from this staff member — they can still pack and deliver their orders.</p>
            </div>

            <Button className="w-full" onClick={savePerms} disabled={busy}>{busy ? 'Saving…' : 'Save Permissions'}</Button>
          </div>
        )}
      </Modal>

      {/* Activity history */}
      <Modal open={!!historyOf} onClose={() => setHistoryOf(null)} title={`Activity — ${historyOf?.name ?? ''}`} wide>
        {historyFor.length === 0 ? <p className="text-sm text-slate-400 py-4 text-center">No recorded actions</p> : (
          <ul className="space-y-2 max-h-96 overflow-y-auto">
            {historyFor.map((a) => (
              <li key={a.id} className="border-l-2 border-emerald-200 pl-3">
                <p className="text-sm text-slate-700">{a.action}</p>
                <p className="text-xs text-slate-400">{formatDateTime(a.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <ConfirmDialog
        open={!!removeStaff} title="Remove Staff" confirmLabel="Remove"
        message={`Remove ${removeStaff?.name}? They will lose access immediately. This cannot be undone.`}
        onConfirm={async () => {
          if (!removeStaff) return;
          await supabase.from('store_users').delete().eq('id', removeStaff.id);
          await supabase.from('audit_logs').insert({ store_id: store.id, actor_user_id: user.id, action: `Removed staff ${removeStaff.name}`, entity_type: 'store_user', entity_id: removeStaff.id });
          show('Staff removed');
          void load();
        }}
        onClose={() => setRemoveStaff(null)}
      />
    </div>
  );
}
