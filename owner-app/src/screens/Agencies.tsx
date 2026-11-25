import { useEffect, useState } from 'react';
import { Plus, Truck, ClipboardCheck } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/lib/supabase';
import {
  Button, Input, Select, Label, Card, Badge, Modal, ConfirmDialog, EmptyState, Spinner, useToast, cn,
  AnimatedContent, ClickSpark,
} from '@/components/ui';
import { formatINR, formatDateTime } from '@/lib/format';
import type { Agency, AgencyPayment, PendingHisaab, StoreUser, StaffAgencyPermission, StaffPermissions } from '@/lib/types';

export default function AgenciesScreen() {
  const { store, user, isOwner } = useApp();
  const { show, node: toastNode } = useToast();
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [payments, setPayments] = useState<AgencyPayment[]>([]);
  const [pending, setPending] = useState<PendingHisaab[]>([]);
  const [users, setUsers] = useState<StoreUser[]>([]);
  const [myAgencyPerms, setMyAgencyPerms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'agencies' | 'pending'>('agencies');

  const [agencyModal, setAgencyModal] = useState(false);
  const [editing, setEditing] = useState<Agency | null>(null);
  const [agForm, setAgForm] = useState({ name: '', phone: '', balance: '' });
  const [deleteAgency, setDeleteAgency] = useState<Agency | null>(null);

  const [payModal, setPayModal] = useState<Agency | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('Cash');
  const [payNotes, setPayNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const [reviewModal, setReviewModal] = useState<PendingHisaab | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  const canViewAgencies = isOwner || !!(user?.permissions as StaffPermissions)?.can_view_agencies;

  async function load() {
    if (!store || !user) return;
    const [a, p, ph, u] = await Promise.all([
      supabase.from('agencies').select('*').eq('store_id', store.id).order('name'),
      supabase.from('agency_payments').select('*').eq('store_id', store.id).order('created_at', { ascending: false }).limit(60),
      supabase.from('pending_hisaab').select('*').eq('store_id', store.id).order('created_at', { ascending: false }).limit(60),
      supabase.from('store_users').select('*').eq('store_id', store.id),
    ]);
    setAgencies((a.data as Agency[]) ?? []);
    setPayments((p.data as AgencyPayment[]) ?? []);
    setPending((ph.data as PendingHisaab[]) ?? []);
    setUsers((u.data as StoreUser[]) ?? []);
    if (!isOwner) {
      const { data: perms } = await supabase.from('staff_agency_permissions').select('agency_id').eq('staff_user_id', user.id);
      setMyAgencyPerms(((perms as Array<{ agency_id: string }>) ?? []).map((x) => x.agency_id));
    }
    setLoading(false);
  }

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [store?.id, isOwner]);

  if (!store || !user) return null;
  if (loading) return <Spinner label="Loading agencies…" />;
  if (!canViewAgencies) {
    return <EmptyState icon={<Truck size={32} />} title="No access" message="You don't have permission to view agencies." />;
  }

  const visibleAgencies = isOwner || (user.permissions as StaffPermissions)?.can_view_agencies
    ? agencies.filter((a) => isOwner || myAgencyPerms.length === 0 || myAgencyPerms.includes(a.id))
    : [];

  async function saveAgency() {
    if (!store) return;
    if (!agForm.name.trim()) return show('Agency name is required', true);
    setBusy(true);
    const payload = { store_id: store.id, name: agForm.name.trim(), phone: agForm.phone.trim() || null, balance: Number(agForm.balance) || 0 };
    const { error } = editing
      ? await supabase.from('agencies').update(payload).eq('id', editing.id)
      : await supabase.from('agencies').insert(payload);
    setBusy(false);
    if (error) return show(error.message, true);
    setAgencyModal(false); setEditing(null);
    setAgForm({ name: '', phone: '', balance: '' });
    show('Agency saved');
    void load();
  }

  async function submitPayment() {
    if (!store || !user || !payModal) return;
    const amt = Number(payAmount);
    if (!amt || amt <= 0) return show('Enter a valid amount', true);
    setBusy(true);
    const isStaff = !isOwner;
    const { error } = await supabase.from('agency_payments').insert({
      store_id: store.id, agency_id: payModal.id, amount: amt,
      payment_mode: payMode, paid_by_user_id: user.id,
      status: isStaff ? 'pending' : 'approved', notes: payNotes.trim() || null,
    });
    if (error) { setBusy(false); return show(error.message, true); }

    if (isStaff) {
      await supabase.from('pending_hisaab').insert({
        store_id: store.id, staff_user_id: user.id, entry_type: 'agency_payment',
        reference_id: payModal.id, amount: amt, payment_mode: payMode,
      });
      show('Payment submitted — awaiting owner approval');
    } else {
      await supabase.rpc('increment_agency_balance', { p_agency_id: payModal.id, p_delta: -amt });
      await supabase.from('agency_payments').update({ status: 'approved' }).eq('agency_id', payModal.id).eq('paid_by_user_id', user.id).eq('status', 'pending');
      await supabase.from('audit_logs').insert({
        store_id: store.id, actor_user_id: user.id,
        action: `Agency payment ${formatINR(amt)} to ${payModal.name} (${payMode})`, entity_type: 'agency_payment',
      });
      show('Payment recorded');
    }
    setBusy(false);
    setPayModal(null); setPayAmount(''); setPayNotes('');
    void load();
  }

  async function review(approve: boolean) {
    if (!reviewModal) return;
    setBusy(true);
    const { error } = await supabase.from('pending_hisaab').update({
      status: approve ? 'approved' : 'rejected',
      review_note: reviewNote.trim() || null,
      reviewed_by_user_id: user!.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', reviewModal.id);
    if (!error && approve) {
      if (reviewModal.entry_type === 'agency_payment' && reviewModal.reference_id) {
        await supabase.rpc('increment_agency_balance', { p_agency_id: reviewModal.reference_id, p_delta: -reviewModal.amount });
        await supabase.from('agency_payments').update({ status: 'approved' }).eq('agency_id', reviewModal.reference_id).eq('paid_by_user_id', reviewModal.staff_user_id).eq('status', 'pending');
      }
      await supabase.from('audit_logs').insert({
        store_id: store!.id, actor_user_id: user!.id,
        action: `Pending hisaab approved: ${formatINR(reviewModal.amount)} (${reviewModal.entry_type.replace(/_/g, ' ')})`, entity_type: 'pending_hisaab', entity_id: reviewModal.id,
      });
    }
    setBusy(false);
    if (error) return show(error.message, true);
    setReviewModal(null); setReviewNote('');
    show(approve ? 'Approved' : 'Rejected');
    void load();
  }

  const pendingQueue = pending.filter((p) => p.status === 'pending');
  const history = pending.filter((p) => p.status !== 'pending');

  return (
    <div className="space-y-4">
      {toastNode}
      <div className="flex gap-2">
        <button onClick={() => setTab('agencies')} className={cn('flex-1 sm:flex-none rounded-lg px-4 py-2 text-sm font-medium', tab === 'agencies' ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-600')}>
          <Truck size={15} className="inline mr-1.5 -mt-0.5" /> Agencies
        </button>
        {isOwner && (
          <button onClick={() => setTab('pending')} className={cn('flex-1 sm:flex-none rounded-lg px-4 py-2 text-sm font-medium', tab === 'pending' ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-600')}>
            <ClipboardCheck size={15} className="inline mr-1.5 -mt-0.5" /> Pending Hisaab
            {pendingQueue.length > 0 && <span className="ml-1.5 bg-amber-400 text-white rounded-full px-1.5 text-[11px]">{pendingQueue.length}</span>}
          </button>
        )}
      </div>

      {tab === 'agencies' && (
        <>
          {isOwner && (
            <div className="flex justify-end">
              <Button onClick={() => { setEditing(null); setAgForm({ name: '', phone: '', balance: '' }); setAgencyModal(true); }}>
                <Plus size={16} /> Add Agency
              </Button>
            </div>
          )}
          {visibleAgencies.length === 0 ? (
            <EmptyState icon={<Truck size={32} />} title="No agencies" message="Add suppliers to track payable balances." />
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {visibleAgencies.map((a, idx) => (
                <AnimatedContent key={a.id} index={idx}>
                  <Card className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">{a.name}</p>
                        <p className="text-xs text-slate-400">{a.phone ? `+91 ${a.phone}` : '—'}</p>
                      </div>
                      <Badge tone={a.balance > 0 ? 'red' : 'green'}>{a.balance > 0 ? 'Payable' : 'Clear'}</Badge>
                    </div>
                    <p className="mt-3 text-2xl font-semibold text-slate-900">{formatINR(a.balance)}</p>
                    <p className="text-xs text-slate-400">Payable balance</p>
                    <div className="mt-3 flex gap-1.5">
                      <Button className="flex-1 !py-2 text-xs" onClick={() => setPayModal(a)}>Submit Payment</Button>
                      {isOwner && (
                        <>
                          <Button variant="ghost" className="!py-2 text-xs" onClick={() => { setEditing(a); setAgForm({ name: a.name, phone: a.phone ?? '', balance: String(a.balance) }); setAgencyModal(true); }}>Edit</Button>
                          <Button variant="ghost" className="!py-2 text-red-500" onClick={() => setDeleteAgency(a)}>✕</Button>
                        </>
                      )}
                    </div>
                    {payments.filter((p) => p.agency_id === a.id).length > 0 && (
                      <div className="mt-3 border-t border-slate-100 pt-2">
                        <p className="text-[11px] font-medium text-slate-400 mb-1">Payment history</p>
                        <ul className="space-y-1 max-h-28 overflow-y-auto">
                          {payments.filter((p) => p.agency_id === a.id).slice(0, 5).map((p) => (
                            <li key={p.id} className="flex items-center justify-between text-xs">
                              <span className="text-slate-500">{formatDateTime(p.created_at)} · {users.find((u) => u.id === p.paid_by_user_id)?.name ?? '—'}</span>
                              <span className={cn('font-medium', p.status === 'approved' ? 'text-emerald-700' : p.status === 'pending' ? 'text-amber-600' : 'text-red-500')}>
                                {formatINR(p.amount)} {p.status !== 'approved' && `(${p.status})`}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </Card>
                </AnimatedContent>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'pending' && isOwner && (
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="font-semibold text-slate-800 mb-3">Approval Queue</h3>
            {pendingQueue.length === 0 ? <p className="text-sm text-slate-400 py-3">Nothing pending — all settled.</p> : (
              <ul className="space-y-2">
                {pendingQueue.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">
                        {users.find((u) => u.id === p.staff_user_id)?.name ?? 'Staff'} · {formatINR(p.amount)} · {p.payment_mode}
                      </p>
                      <p className="text-xs text-slate-500">
                        {p.entry_type === 'agency_payment'
                          ? `Agency payment — ${agencies.find((a) => a.id === p.reference_id)?.name ?? 'agency'}`
                          : 'Customer khata collection'} · {formatDateTime(p.created_at)}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <Button className="!py-1.5 text-xs" onClick={() => { setReviewModal(p); setReviewNote(''); }}>Review</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-4">
            <h3 className="font-semibold text-slate-800 mb-3">Reviewed History</h3>
            {history.length === 0 ? <p className="text-sm text-slate-400 py-3">No reviews yet</p> : (
              <ul className="space-y-2">
                {history.map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 truncate">
                      {users.find((u) => u.id === p.staff_user_id)?.name ?? 'Staff'} · {formatINR(p.amount)} · {formatDateTime(p.created_at)}
                      {p.review_note ? ` · "${p.review_note}"` : ''}
                    </span>
                    <Badge tone={p.status === 'approved' ? 'green' : 'red'}>{p.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {/* Agency modal */}
      <Modal open={agencyModal} onClose={() => setAgencyModal(false)} title={editing ? 'Edit Agency' : 'Add Agency'}>
        <div className="space-y-3">
          <div><Label required>Agency Name</Label><Input value={agForm.name} onChange={(e) => setAgForm({ ...agForm, name: e.target.value })} /></div>
          <div><Label>Phone</Label><Input inputMode="numeric" maxLength={10} value={agForm.phone} onChange={(e) => setAgForm({ ...agForm, phone: e.target.value.replace(/\D/g, '') })} /></div>
          <div><Label>Current Payable Balance (₹)</Label><Input type="number" value={agForm.balance} onChange={(e) => setAgForm({ ...agForm, balance: e.target.value })} /></div>
          <Button className="w-full" onClick={saveAgency} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      </Modal>

      {/* Payment modal */}
      <Modal open={!!payModal} onClose={() => setPayModal(null)} title={`Payment — ${payModal?.name ?? ''}`}>
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Current payable: <b className="text-slate-800">{formatINR(payModal?.balance ?? 0)}</b></p>
          <div><Label required>Amount (₹)</Label><Input type="number" inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></div>
          <div>
            <Label required>Payment Method</Label>
            <Select value={payMode} onChange={(e) => setPayMode(e.target.value)}>
              <option>Cash</option><option>UPI</option><option>Bank</option>
            </Select>
          </div>
          <div><Label>Notes</Label><Input value={payNotes} onChange={(e) => setPayNotes(e.target.value)} /></div>
          {!isOwner && <p className="text-xs text-amber-600">Staff payments go to the owner's Pending Hisaab for approval.</p>}
          <ClickSpark className="w-full" disabled={busy} sparkColor={['#10b981', '#34d399']}>
            <Button className="w-full" onClick={submitPayment} disabled={busy}>{busy ? 'Submitting…' : isOwner ? 'Record Payment' : 'Submit for Approval'}</Button>
          </ClickSpark>
        </div>
      </Modal>

      {/* Review modal */}
      <Modal open={!!reviewModal} onClose={() => setReviewModal(null)} title="Review Entry">
        {reviewModal && (
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-1">
              <p><span className="text-slate-500">Staff:</span> <b>{users.find((u) => u.id === reviewModal.staff_user_id)?.name}</b></p>
              <p><span className="text-slate-500">Amount:</span> <b>{formatINR(reviewModal.amount)}</b> · {reviewModal.payment_mode}</p>
              <p><span className="text-slate-500">Type:</span> {reviewModal.entry_type === 'agency_payment' ? 'Agency Payment' : 'Customer Collection'}</p>
              <p className="text-xs text-slate-400">{formatDateTime(reviewModal.created_at)}</p>
            </div>
            <div><Label>Review Note</Label><Input value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} /></div>
            <div className="flex gap-2">
              <Button variant="danger" className="flex-1" onClick={() => review(false)} disabled={busy}>Reject</Button>
              <ClickSpark className="flex-1" disabled={busy} sparkColor={['#10b981', '#34d399']}>
                <Button className="w-full" onClick={() => review(true)} disabled={busy}>Approve</Button>
              </ClickSpark>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteAgency} title="Delete Agency"
        message={`Delete ${deleteAgency?.name}? Payment history will be removed. This cannot be undone.`}
        onConfirm={async () => {
          if (!deleteAgency) return;
          await supabase.from('agencies').delete().eq('id', deleteAgency.id);
          show('Agency deleted');
          void load();
        }}
        onClose={() => setDeleteAgency(null)}
      />
    </div>
  );
}
