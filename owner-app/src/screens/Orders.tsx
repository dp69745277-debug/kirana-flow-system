import { useEffect, useMemo, useState } from 'react';
import { Plus, ShoppingCart, Phone, MessageCircle, FileText, Trash2, QrCode, CheckCircle2, RefreshCw, ExternalLink, ShieldCheck } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/lib/supabase';
import {
  Button, Input, Select, Label, Card, Badge, Modal, ConfirmDialog, EmptyState, Spinner, useToast, cn,
} from '@/components/ui';
import { formatINR, formatDateTime, waLink } from '@/lib/format';
import { generateInvoicePDF } from '@/lib/pdf';
import { playSuccess, playAlert } from '@/lib/sound';
import type { Order, OrderItem, WholesaleCustomer, InventoryItem, StoreUser, StaffPermissions, StorePaymentMode, PaymentTransaction } from '@/lib/types';

const STATUS_FLOW: Record<string, { next: string; label: string }> = {
  placed: { next: 'seen', label: 'Mark Seen' },
  seen: { next: 'packed', label: 'Mark Packed' },
  packed: { next: '', label: '' }, // branch depends on fulfillment_type
};

function statusBadge(s: Order['status']) {
  const map: Record<string, { tone: 'blue' | 'amber' | 'teal' | 'green' | 'red' | 'slate'; label: string }> = {
    placed: { tone: 'amber', label: 'Placed' },
    seen: { tone: 'blue', label: 'Seen' },
    packed: { tone: 'teal', label: 'Packed' },
    out_for_delivery: { tone: 'teal', label: 'Out for Delivery' },
    ready_for_pickup: { tone: 'teal', label: 'Ready for Pickup' },
    delivered: { tone: 'green', label: 'Delivered' },
    cancelled: { tone: 'red', label: 'Cancelled' },
  };
  const m = map[s] ?? { tone: 'slate' as const, label: s };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

interface NewLine { item_id: string; quantity: string }

export default function Orders() {
  const { store, user, isOwner } = useApp();
  const { show, node: toastNode } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<WholesaleCustomer[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [users, setUsers] = useState<StoreUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [orderLines, setOrderLines] = useState<Record<string, OrderItem[]>>({});

  // manual order modal
  const [createModal, setCreateModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState('');
  const [newFulfillment, setNewFulfillment] = useState<'delivery' | 'pickup'>('delivery');
  const [newNotes, setNewNotes] = useState('');
  const [newLines, setNewLines] = useState<NewLine[]>([{ item_id: '', quantity: '' }]);

  // settlement modal
  const [settleOrder, setSettleOrder] = useState<Order | null>(null);
  const [settleLines, setSettleLines] = useState<OrderItem[]>([]);
  const [discountInput, setDiscountInput] = useState('');
  const [discountType, setDiscountType] = useState<'flat' | 'pct'>('flat');
  const [payMode, setPayMode] = useState<'cash' | 'upi' | 'khata' | 'split'>('cash');
  const [splitPaid, setSplitPaid] = useState('');
  const [settleNotes, setSettleNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const [deleteOrder, setDeleteOrder] = useState<Order | null>(null);
  const [addLineItem, setAddLineItem] = useState<string | null>(null);
  const [addLineQty, setAddLineQty] = useState('');

  // Payment Gateway & Dynamic QR
  const [gatewayMode, setGatewayMode] = useState<StorePaymentMode | null>(null);
  const [collectingUpi, setCollectingUpi] = useState(false);
  const [checkingTxStatus, setCheckingTxStatus] = useState(false);
  const [qrModal, setQrModal] = useState<{
    open: boolean;
    transactionId?: string;
    gatewayOrderId?: string;
    qrPayload?: string;
    paymentUrl?: string;
    amount: number;
    status: 'pending' | 'success' | 'failed';
    utr?: string;
    provider?: string;
    mode?: string;
  }>({ open: false, amount: 0, status: 'pending' });

  const canManage = isOwner || !!(user?.permissions as StaffPermissions)?.can_manage_orders;
  const canAdjustPrice = isOwner || !!(user?.permissions as StaffPermissions)?.can_adjust_price;

  async function load() {
    if (!store) return;
    const [o, c, i, u] = await Promise.all([
      supabase.from('orders').select('*').eq('store_id', store.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('wholesale_customers').select('*').eq('store_id', store.id).order('shop_name'),
      supabase.from('inventory_items').select('*').eq('store_id', store.id).order('name'),
      supabase.from('store_users').select('*').eq('store_id', store.id),
    ]);
    setOrders((o.data as Order[]) ?? []);
    setCustomers((c.data as WholesaleCustomer[]) ?? []);
    setItems((i.data as InventoryItem[]) ?? []);
    setUsers((u.data as StoreUser[]) ?? []);
    setLoading(false);
  }

  async function loadLines(orderId: string) {
    const { data } = await supabase.from('order_items').select('*').eq('order_id', orderId);
    setOrderLines((prev) => ({ ...prev, [orderId]: (data as OrderItem[]) ?? [] }));
  }

  useEffect(() => {
    void load();
    if (!store) return;
    const channel = supabase
      .channel('orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `store_id=eq.${store.id}` }, () => void load())
      .subscribe();

    async function loadGatewayMode() {
      const { data } = await supabase.rpc('get_store_payment_mode', { p_store_id: store!.id });
      if (data && data.length > 0) {
        setGatewayMode(data[0] as StorePaymentMode);
      }
    }
    void loadGatewayMode();

    return () => { void supabase.removeChannel(channel); };
    // eslint-disable-next-line
  }, [store?.id]);

  // Realtime subscription for dynamic UPI QR payment completion
  useEffect(() => {
    if (!qrModal.open || !qrModal.transactionId) return;

    const channel = supabase
      .channel(`qr-tx-${qrModal.transactionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'payment_transactions',
          filter: `id=eq.${qrModal.transactionId}`,
        },
        (payload) => {
          const row = payload.new as PaymentTransaction;
          if (row.status === 'success') {
            playSuccess();
            setQrModal((prev) => ({ ...prev, status: 'success', utr: row.utr_number || undefined }));
            show(`Payment Received! UTR: ${row.utr_number}`);
            setTimeout(() => {
              const utrStr = row.utr_number || 'UPI_ONLINE';
              setQrModal({ open: false, amount: 0, status: 'pending' });
              void applySettlement(utrStr);
            }, 1200);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qrModal.open, qrModal.transactionId]);

  const filtered = useMemo(() => orders.filter((o) => !statusFilter || o.status === statusFilter), [orders, statusFilter]);

  if (loading) return <Spinner label="Loading orders…" />;
  if (!store || !user) return null;

  async function advance(o: Order) {
    let next: string | null = STATUS_FLOW[o.status]?.next ?? null;
    if (o.status === 'packed') {
      next = o.fulfillment_type === 'pickup' ? 'ready_for_pickup' : 'out_for_delivery';
    }
    if (!next) return;
    const patch: Partial<Order> = { status: next as Order['status'] };
    if (next === 'seen') patch.seen_by_user_id = user!.id;
    const { error } = await supabase.from('orders').update(patch).eq('id', o.id);
    if (error) return show(error.message, true);
    await supabase.from('audit_logs').insert({
      store_id: store!.id, actor_user_id: user!.id,
      action: `Order ${o.order_number} → ${next.replace(/_/g, ' ')}`, entity_type: 'order', entity_id: o.id,
    });
    void load();
  }

  function openSettle(o: Order) {
    const lines = orderLines[o.id] ?? [];
    if (lines.length === 0) void loadLines(o.id).then(() => {
      setSettleLines(((orderLines[o.id] ?? []) as OrderItem[]));
      setDiscountInput(o.discount_amount ? String(o.discount_amount) : '');
      setPayMode(o.payment_mode ?? 'cash');
      setSplitPaid(String(o.paid_amount || ''));
      setSettleNotes('');
      setSettleOrder(o);
    });
    else {
      setSettleLines(lines);
      setDiscountInput(o.discount_amount ? String(o.discount_amount) : '');
      setPayMode(o.payment_mode ?? 'cash');
      setSplitPaid(String(o.paid_amount || ''));
      setSettleNotes('');
      setSettleOrder(o);
    }
  }

  function computedTotals() {
    const lines = settleLines.map((l) => ({ ...l, line_total: l.final_unit_price * l.quantity }));
    const subtotal = lines.reduce((s, l) => s + l.line_total, 0);
    const discount = discountType === 'pct'
      ? Math.min(subtotal, (subtotal * (Number(discountInput) || 0)) / 100)
      : Math.min(subtotal, Number(discountInput) || 0);
    const total = Math.max(0, subtotal - discount);
    const paid = payMode === 'khata' ? 0 : payMode === 'split' ? Math.min(total, Number(splitPaid) || 0) : total;
    const khata = total - paid;
    return { lines, subtotal, discount, total, paid, khata };
  }

  async function updateLinePrice(line: OrderItem, newPrice: number) {
    if (!user) return;
    const pctDiff = line.original_unit_price > 0 ? Math.abs((newPrice - line.original_unit_price) / line.original_unit_price) * 100 : 0;
    if (!isOwner && pctDiff > (user.max_discount_pct ?? 0)) {
      return show(`Price change of ${pctDiff.toFixed(1)}% exceeds your ${user.max_discount_pct}% limit`, true);
    }
    setSettleLines((prev) => prev.map((l) => l.id === line.id ? { ...l, final_unit_price: newPrice, price_adjusted_by_user_id: user.id } : l));
    await supabase.from('order_items').update({
      final_unit_price: newPrice,
      line_total: newPrice * line.quantity,
      price_adjusted_by_user_id: user.id,
    }).eq('id', line.id);
    await supabase.from('audit_logs').insert({
      store_id: store!.id, actor_user_id: user.id,
      action: `Price adjusted on ${line.item_name_snapshot}: ${formatINR(line.original_unit_price)} → ${formatINR(newPrice)}`,
      entity_type: 'order_item', entity_id: line.id,
      metadata: { original_price: line.original_unit_price, final_price: newPrice },
    });
  }

  async function initiateUpiCollection() {
    if (!store || !settleOrder) return;
    const { total, paid } = computedTotals();
    const upiAmount = payMode === 'split' ? Math.min(total, Number(splitPaid) || 0) : total;

    if (upiAmount <= 0) {
      return show('Amount must be greater than 0', true);
    }

    setCollectingUpi(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-payment-order', {
        body: {
          store_id: store.id,
          order_id: settleOrder.id,
          customer_id: settleOrder.customer_id,
          purpose: 'order_delivery',
          amount: upiAmount,
        },
      });

      setCollectingUpi(false);

      if (error || !data?.ok) {
        return show(error?.message || data?.error || 'Failed to generate UPI payment order', true);
      }

      setQrModal({
        open: true,
        transactionId: data.transactionId,
        gatewayOrderId: data.gatewayOrderId,
        qrPayload: data.qrPayload,
        paymentUrl: data.paymentUrl,
        amount: upiAmount,
        status: 'pending',
        provider: data.provider,
        mode: data.mode,
      });
      playClick();
    } catch (err: unknown) {
      setCollectingUpi(false);
      const msg = err instanceof Error ? err.message : 'Error generating QR';
      show(msg, true);
    }
  }

  async function checkManualPaymentStatus(simulate = false) {
    if (!qrModal.transactionId) return;
    setCheckingTxStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-payment-status', {
        body: {
          transaction_id: qrModal.transactionId,
          simulate_success: simulate,
        },
      });
      setCheckingTxStatus(false);
      if (error || !data?.ok) {
        return show(error?.message || 'Status check failed', true);
      }
      if (data.status === 'success') {
        playSuccess();
        setQrModal((prev) => ({ ...prev, status: 'success', utr: data.utr }));
        show(`Payment Confirmed! UTR: ${data.utr}`);
        setTimeout(() => {
          const utrStr = data.utr || 'UPI_ONLINE';
          setQrModal({ open: false, amount: 0, status: 'pending' });
          void applySettlement(utrStr);
        }, 1200);
      } else {
        show('Payment is still pending. Ask customer to approve in their UPI app.');
      }
    } catch (err: unknown) {
      setCheckingTxStatus(false);
      const msg = err instanceof Error ? err.message : 'Error checking status';
      show(msg, true);
    }
  }

  async function applySettlement(directUtr?: string) {
    if (!store || !user || !settleOrder) return;
    const { lines, subtotal, discount, total, paid, khata } = computedTotals();
    setBusy(true);

    const actualPaymentMode = directUtr ? (payMode === 'split' ? 'split' : 'upi') : payMode;
    const finalNotes = directUtr
      ? (settleNotes.trim() ? `${settleNotes.trim()} | UPI UTR: ${directUtr}` : `UPI Verified • UTR: ${directUtr}`)
      : settleNotes.trim() || null;

    const { error } = await supabase.from('orders').update({
      status: 'delivered',
      subtotal,
      discount_amount: discount,
      final_total: total,
      payment_mode: actualPaymentMode,
      paid_amount: paid,
      khata_amount: khata,
      delivered_by_user_id: user.id,
      delivery_notes: finalNotes,
      updated_at: new Date().toISOString(),
    }).eq('id', settleOrder.id);
    if (error) { setBusy(false); return show(error.message, true); }

    // stock deduction per line
    for (const l of lines) {
      if (!l.item_id) continue;
      await supabase.from('stock_transactions').insert({
        store_id: store.id, item_id: l.item_id, type: 'stock_out_wholesale',
        quantity: l.quantity, unit_price: l.final_unit_price, order_id: settleOrder.id,
        performed_by_user_id: user.id, notes: settleOrder.order_number,
      });
    }

    // khata posting: ONLY the remaining balance (khata = total - paid) goes to Khata!
    // The UPI paid portion is NEVER added to Khata.
    if (khata > 0) {
      const customer = customers.find((c) => c.id === settleOrder.customer_id);
      const newBal = (customer?.current_khata_balance ?? 0) + khata;
      await supabase.from('khata_transactions').insert({
        store_id: store.id, customer_id: settleOrder.customer_id, order_id: settleOrder.id,
        type: 'debit_order', amount: khata, payment_mode: null, balance_after: newBal,
        performed_by_user_id: user.id, notes: settleOrder.order_number,
      });
      await supabase.from('wholesale_customers').update({ current_khata_balance: newBal }).eq('id', settleOrder.customer_id);
    }

    // Only physical cash collection by staff goes to pending hisaab (owner approves it).
    // Online verified UPI goes directly to store gateway / bank!
    if (!isOwner && paid > 0 && actualPaymentMode === 'cash' && !directUtr) {
      await supabase.from('pending_hisaab').insert({
        store_id: store.id, staff_user_id: user.id, entry_type: 'customer_collection',
        reference_id: settleOrder.id, amount: paid, payment_mode: actualPaymentMode,
      });
    }

    await supabase.from('audit_logs').insert({
      store_id: store.id, actor_user_id: user.id,
      action: `Order ${settleOrder.order_number} delivered — ${formatINR(total)} (${actualPaymentMode})`,
      entity_type: 'order', entity_id: settleOrder.id,
    });
    setBusy(false);
    setSettleOrder(null);
    show('Order delivered & settled successfully');
    void load();
  }

  function buildInvoiceMessage(o: Order, lines: OrderItem[]) {
    const customer = customers.find((c) => c.id === o.customer_id);
    const itemLines = lines.map((l) => `${l.item_name_snapshot} × ${l.quantity} = ${formatINR(l.line_total)}`).join('\n');
    return [
      `*${store!.shop_name}* — Invoice ${o.order_number}`,
      `Customer: ${customer?.shop_name ?? ''}`,
      '', itemLines, '',
      `Total: *${formatINR(o.final_total)}*`,
      `Payment: ${o.payment_mode?.toUpperCase()}${o.khata_amount ? ` (Khata: ${formatINR(o.khata_amount)})` : ' — PAID'}`,
      `Delivered by: ${users.find((u) => u.id === o.delivered_by_user_id)?.name ?? 'Staff'}`,
      formatDateTime(o.updated_at),
      store!.upi_id ? `Pay via UPI: ${store!.upi_id}` : '',
    ].filter(Boolean).join('\n');
  }

  async function createManualOrder() {
    if (!store || !user) return;
    if (!newCustomer) return show('Select a customer', true);
    const valid = newLines.filter((l) => l.item_id && Number(l.quantity) > 0);
    if (valid.length === 0) return show('Add at least one item', true);
    setBusy(true);
    const { data: numData, error: numErr } = await supabase.rpc('next_order_number', { p_store_id: store.id });
    const orderNumber = (numData as string) ?? `ORD-${Date.now()}`;
    if (numErr) { setBusy(false); return show(numErr.message, true); }

    const linesPayload = valid.map((l) => {
      const item = items.find((i) => i.id === l.item_id)!;
      return {
        item_id: item.id,
        item_name_snapshot: `${item.name}${item.brand ? ` (${item.brand})` : ''}`,
        quantity: Number(l.quantity),
        original_unit_price: item.wholesale_price,
        final_unit_price: item.wholesale_price,
        line_total: item.wholesale_price * Number(l.quantity),
      };
    });
    const subtotal = linesPayload.reduce((s, l) => s + l.line_total, 0);

    const { data: orderData, error } = await supabase.from('orders').insert({
      store_id: store.id, customer_id: newCustomer, order_number: orderNumber,
      fulfillment_type: newFulfillment, status: 'placed', subtotal,
      discount_amount: 0, final_total: subtotal, notes: newNotes.trim() || null,
    }).select().single();
    if (error || !orderData) { setBusy(false); return show(error?.message ?? 'Failed', true); }

    await supabase.from('order_items').insert(linesPayload.map((l) => ({ ...l, order_id: orderData.id })));
    await supabase.from('audit_logs').insert({
      store_id: store.id, actor_user_id: user.id,
      action: `Manual order ${orderNumber} created (${formatINR(subtotal)})`, entity_type: 'order', entity_id: orderData.id,
    });
    setBusy(false);
    setCreateModal(false);
    setNewLines([{ item_id: '', quantity: '' }]);
    setNewCustomer(''); setNewNotes('');
    show('Order created');
    void load();
  }

  async function appendLine(order: Order) {
    if (!user || !addLineItem) return;
    const qty = Number(addLineQty);
    const item = items.find((i) => i.id === addLineItem);
    if (!item || !qty || qty <= 0) return show('Select item and quantity', true);
    if (!['placed', 'seen'].includes(order.status)) return show('Can only add items before packing', true);
    const { error } = await supabase.from('order_items').insert({
      order_id: order.id, item_id: item.id,
      item_name_snapshot: `${item.name}${item.brand ? ` (${item.brand})` : ''}`,
      quantity: qty, original_unit_price: item.wholesale_price,
      final_unit_price: item.wholesale_price, line_total: item.wholesale_price * qty,
    });
    if (error) return show(error.message, true);
    // recalc order totals
    const { data: all } = await supabase.from('order_items').select('*').eq('order_id', order.id);
    const lines = (all as OrderItem[]) ?? [];
    const subtotal = lines.reduce((s, l) => s + l.line_total, 0);
    const discount = order.discount_amount;
    await supabase.from('orders').update({ subtotal, final_total: Math.max(0, subtotal - discount) }).eq('id', order.id);
    await supabase.from('audit_logs').insert({
      store_id: store!.id, actor_user_id: user.id,
      action: `Added ${qty} ${item.name} to ${order.order_number}`, entity_type: 'order', entity_id: order.id,
    });
    setAddLineItem(null); setAddLineQty('');
    show('Item added to order');
    void loadLines(order.id);
    void load();
  }

  if (!canManage) {
    return <EmptyState icon={<ShoppingCart size={32} />} title="No access" message="You don't have permission to manage wholesale orders." />;
  }

  return (
    <div className="space-y-4">
      {toastNode}
      <div className="flex flex-wrap gap-2">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-auto min-w-[150px]">
          <option value="">All Statuses</option>
          <option value="placed">Placed</option>
          <option value="seen">Seen</option>
          <option value="packed">Packed</option>
          <option value="out_for_delivery">Out for Delivery</option>
          <option value="ready_for_pickup">Ready for Pickup</option>
          <option value="delivered">Delivered</option>
        </Select>
        <Button onClick={() => setCreateModal(true)}><Plus size={16} /> Create Manual Order</Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<ShoppingCart size={32} />} title="No orders" message="New orders from the Customer App appear here in realtime." />
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => {
            const customer = customers.find((c) => c.id === o.customer_id);
            const lines = orderLines[o.id] ?? [];
            const nextAction = o.status === 'packed'
              ? (o.fulfillment_type === 'pickup' ? 'Mark Ready for Pickup' : 'Mark Out for Delivery')
              : STATUS_FLOW[o.status]?.label;
            return (
              <Card key={o.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-slate-900">{o.order_number}</p>
                      {statusBadge(o.status)}
                      <Badge tone={o.fulfillment_type === 'pickup' ? 'blue' : 'teal'}>
                        {o.fulfillment_type === 'pickup' ? 'Self-Pickup (At Shop)' : 'Staff Delivery'}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {customer?.shop_name ?? 'Unknown customer'} · {formatDateTime(o.created_at)}
                    </p>
                  </div>
                  <p className="text-lg font-semibold text-slate-900">{formatINR(o.final_total)}</p>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <Button variant="ghost" className="!py-1.5 text-xs" onClick={() => { setExpanded(expanded === o.id ? null : o.id); if (!orderLines[o.id]) void loadLines(o.id); }}>
                    {expanded === o.id ? 'Hide items' : 'View items'}
                  </Button>
                  {customer && <a href={`tel:+91${customer.phone}`}><Button variant="ghost" className="!py-1.5 text-xs"><Phone size={13} /> Call</Button></a>}
                  {o.status === 'delivered' && (
                    <>
                      <Button variant="ghost" className="!py-1.5 text-xs" onClick={() => {
                        const cust = customers.find((c) => c.id === o.customer_id);
                        generateInvoicePDF({
                          store: store!, orderNumber: o.order_number,
                          customerName: cust?.name ?? '', customerShop: cust?.shop_name ?? '', customerPhone: cust?.phone ?? '',
                          items: lines.map((l) => ({ name: l.item_name_snapshot, qty: l.quantity, rate: l.final_unit_price, total: l.line_total })),
                          subtotal: o.subtotal, discount: o.discount_amount, total: o.final_total,
                          paymentMode: (o.payment_mode ?? 'cash').toUpperCase(), paidAmount: o.paid_amount, khataAmount: o.khata_amount,
                          deliveredBy: users.find((u) => u.id === o.delivered_by_user_id)?.name ?? 'Staff', dateISO: o.updated_at,
                        });
                      }}><FileText size={13} /> Invoice PDF</Button>
                      <a href={waLink(customer?.phone ?? '', buildInvoiceMessage(o, lines))} target="_blank" rel="noreferrer">
                        <Button variant="ghost" className="!py-1.5 text-xs text-emerald-700"><MessageCircle size={13} /> Send on WhatsApp</Button>
                      </a>
                    </>
                  )}
                  {['placed', 'seen', 'packed'].includes(o.status) && (
                    <>
                      {o.status === 'placed' && (
                        <Button variant="ghost" className="!py-1.5 text-xs" onClick={() => { setAddLineItem(o.id); setAddLineQty(''); }}>
                          <Plus size={13} /> Add Item
                        </Button>
                      )}
                      <Button variant="ghost" className="!py-1.5 text-xs text-red-500" onClick={() => setDeleteOrder(o)}><Trash2 size={13} /> Cancel</Button>
                    </>
                  )}
                </div>

                {expanded === o.id && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    {lines.length === 0 ? <p className="text-xs text-slate-400">Loading…</p> : (
                      <div className="overflow-x-auto -mx-1 px-1">
                        <table className="w-full text-xs min-w-[280px]">
                          <thead><tr className="text-slate-400 text-left">
                            <th className="pb-1">Item</th><th className="pb-1 text-right">Qty</th>
                            <th className="pb-1 text-right">Rate</th><th className="pb-1 text-right">Total</th>
                          </tr></thead>
                          <tbody>
                            {lines.map((l) => (
                              <tr key={l.id} className="border-t border-slate-50">
                                <td className="py-1.5 text-slate-700">{l.item_name_snapshot}{l.final_unit_price !== l.original_unit_price && <Badge tone="amber" className="ml-1.5">adjusted</Badge>}</td>
                                <td className="py-1.5 text-right">{l.quantity}</td>
                                <td className="py-1.5 text-right">{formatINR(l.final_unit_price)}</td>
                                <td className="py-1.5 text-right font-medium">{formatINR(l.line_total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {o.payment_mode && (
                      <p className="mt-2 text-xs text-slate-500">
                        Settled via {(o.payment_mode ?? '').toUpperCase()}
                        {o.khata_amount ? ` · Khata ${formatINR(o.khata_amount)}` : ' · Fully paid'}
                        {o.delivered_by_user_id && ` · by ${users.find((u) => u.id === o.delivered_by_user_id)?.name}`}
                      </p>
                    )}
                  </div>
                )}

                {['placed', 'seen', 'packed', 'out_for_delivery', 'ready_for_pickup'].includes(o.status) && (
                  <div className="mt-3 flex gap-2">
                    {nextAction && <Button className="flex-1 !py-2 text-xs" onClick={() => advance(o)}>{nextAction}</Button>}
                    {['out_for_delivery', 'ready_for_pickup'].includes(o.status) && (
                      <Button variant="amber" className="flex-1 !py-2 text-xs" onClick={() => openSettle(o)}>Complete / Settle</Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Add item before packing */}
      <Modal open={!!addLineItem} onClose={() => setAddLineItem(null)} title="Add Item to Order">
        <div className="space-y-3">
          <div>
            <Label required>Item</Label>
            <Select value={''} onChange={(e) => setAddLineItem(e.target.value)}>
              <option value="">Select item…</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name} {i.brand ? `(${i.brand})` : ''} — {formatINR(i.wholesale_price)}</option>)}
            </Select>
          </div>
          <div>
            <Label required>Quantity</Label>
            <Input type="number" inputMode="decimal" value={addLineQty} onChange={(e) => setAddLineQty(e.target.value)} />
          </div>
          <Button className="w-full" onClick={() => { const o = orders.find((x) => x.id === addLineItem); if (o) void appendLine(o); }}>
            Add to Order
          </Button>
        </div>
      </Modal>

      {/* Settlement */}
      <Modal open={!!settleOrder} onClose={() => setSettleOrder(null)} title={`Settle ${settleOrder?.order_number ?? ''}`} wide>
        {settleOrder && (() => {
          const { subtotal, discount, total, paid, khata } = computedTotals();
          return (
            <div className="space-y-3">
              <div className="overflow-x-auto -mx-1 px-1">
                <table className="w-full text-sm min-w-[300px]">
                  <thead><tr className="text-xs text-slate-400 text-left"><th className="pb-1">Item</th><th className="pb-1 text-right">Qty</th><th className="pb-1 text-right">Rate</th><th className="pb-1 text-right">Total</th></tr></thead>
                  <tbody>
                    {settleLines.map((l) => (
                      <tr key={l.id} className="border-t border-slate-50">
                        <td className="py-1.5">{l.item_name_snapshot}</td>
                        <td className="py-1.5 text-right">{l.quantity}</td>
                        <td className="py-1.5 text-right">
                          {canAdjustPrice ? (
                            <input
                              type="number" className="w-20 text-right rounded border border-slate-200 px-1.5 py-0.5 text-sm"
                              defaultValue={l.final_unit_price}
                              onBlur={(e) => {
                                const v = Number(e.target.value);
                                if (v > 0 && v !== l.final_unit_price) void updateLinePrice(l, v);
                              }}
                            />
                          ) : formatINR(l.final_unit_price)}
                        </td>
                        <td className="py-1.5 text-right font-medium">{formatINR(l.final_unit_price * l.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Discount</Label>
                  <div className="flex gap-1">
                    <Input type="number" value={discountInput} onChange={(e) => setDiscountInput(e.target.value)} placeholder="0" />
                    <Select value={discountType} onChange={(e) => setDiscountType(e.target.value as 'flat' | 'pct')} className="w-24">
                      <option value="flat">₹</option>
                      <option value="pct">%</option>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Payment Mode</Label>
                  <Select value={payMode} onChange={(e) => setPayMode(e.target.value as 'cash' | 'upi' | 'khata' | 'split')}>
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="khata">Khata (Credit)</option>
                    <option value="split">Split Payment</option>
                  </Select>
                </div>
                {payMode === 'split' && (
                  <div>
                    <Label>Cash/UPI Paid Now (₹)</Label>
                    <Input type="number" value={splitPaid} onChange={(e) => setSplitPaid(e.target.value)} />
                  </div>
                )}
                <div>
                  <Label>Delivery Proof / Notes</Label>
                  <Input value={settleNotes} onChange={(e) => setSettleNotes(e.target.value)} placeholder="Confirmation note…" />
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-1">
                <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatINR(subtotal)}</span></div>
                <div className="flex justify-between text-slate-500"><span>Discount</span><span>- {formatINR(discount)}</span></div>
                <div className="flex justify-between font-semibold text-slate-900"><span>Total</span><span>{formatINR(total)}</span></div>
                <div className="flex justify-between text-slate-500"><span>Paid now</span><span>{formatINR(paid)}</span></div>
                {khata > 0 && <div className="flex justify-between text-amber-700 font-medium"><span>To Khata</span><span>{formatINR(khata)}</span></div>}
              </div>

              {(payMode === 'upi' || (payMode === 'split' && Number(splitPaid) > 0)) && gatewayMode?.is_enabled && gatewayMode?.provider !== 'manual_upi' && (
                <div className="pt-1">
                  <Button
                    type="button"
                    variant="primary"
                    className="w-full bg-emerald-600 hover:bg-emerald-700 font-semibold shadow-sm flex items-center justify-center gap-2 !py-3"
                    onClick={initiateUpiCollection}
                    disabled={collectingUpi}
                  >
                    <QrCode size={18} />
                    {collectingUpi ? 'Generating Dynamic QR…' : `Collect ${formatINR(payMode === 'split' ? Math.min(total, Number(splitPaid) || 0) : total)} via UPI QR`}
                  </Button>
                  <p className="text-[11px] text-center text-slate-400 mt-1">
                    Shows dynamic QR on screen. Auto-completes order as soon as customer pays.
                  </p>
                </div>
              )}

              <p className="text-[11px] text-slate-400">Stock auto-deducts and credit posts to Khata on completion. Price changes are audit-logged.</p>
              <Button className="w-full" onClick={() => applySettlement()} disabled={busy}>{busy ? 'Completing…' : 'Complete Order'}</Button>
            </div>
          );
        })()}
      </Modal>

      {/* Dynamic UPI QR Modal */}
      <Modal open={qrModal.open} onClose={() => setQrModal({ open: false, amount: 0, status: 'pending' })} title="Scan & Pay via UPI">
        <div className="flex flex-col items-center text-center p-2 space-y-3">
          <div className="bg-white p-3 rounded-2xl border-2 border-emerald-500/20 shadow-md">
            {qrModal.qrPayload ? (
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=4&data=${encodeURIComponent(qrModal.qrPayload)}`}
                alt="UPI QR Code"
                className="w-56 h-56 object-contain rounded-xl"
              />
            ) : (
              <div className="w-56 h-56 flex items-center justify-center bg-slate-50 rounded-xl">
                <Spinner label="Loading QR…" />
              </div>
            )}
          </div>

          <div>
            <p className="text-2xl font-bold text-slate-900">{formatINR(qrModal.amount)}</p>
            <p className="text-xs text-slate-500 font-medium">{store?.shop_name}</p>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">Order ID: {qrModal.gatewayOrderId}</p>
          </div>

          {qrModal.status === 'success' ? (
            <div className="w-full rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-emerald-800 text-xs flex items-center justify-center gap-2 font-medium">
              <CheckCircle2 size={16} className="text-emerald-600" />
              Payment Confirmed! UTR: {qrModal.utr}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-1.5 rounded-full font-medium animate-pulse">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Waiting for customer payment…
            </div>
          )}

          {qrModal.paymentUrl && (
            <a
              href={qrModal.paymentUrl}
              className="w-full text-xs font-medium text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 py-2.5 rounded-lg border border-emerald-200 flex items-center justify-center gap-1.5 transition-colors"
            >
              <ExternalLink size={14} /> Open in PhonePe / GPay / Paytm
            </a>
          )}

          <div className="w-full pt-2 flex flex-col gap-2">
            <Button
              variant="secondary"
              className="w-full text-xs"
              onClick={() => checkManualPaymentStatus(false)}
              disabled={checkingTxStatus}
            >
              <RefreshCw size={14} className={checkingTxStatus ? 'animate-spin' : ''} />
              {checkingTxStatus ? 'Checking Bank Status…' : 'Check Payment Status'}
            </Button>

            {qrModal.mode === 'test' && (
              <Button
                variant="ghost"
                className="w-full text-xs text-amber-700 border border-amber-200 hover:bg-amber-50"
                onClick={() => checkManualPaymentStatus(true)}
                disabled={checkingTxStatus}
              >
                ⚡ Simulate Payment Success (Test Mode)
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* Manual order */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Create Manual Order" wide>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label required>Customer</Label>
              <Select value={newCustomer} onChange={(e) => setNewCustomer(e.target.value)}>
                <option value="">Select customer…</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.shop_name} — {c.name}</option>)}
              </Select>
            </div>
            <div>
              <Label required>Fulfillment</Label>
              <Select value={newFulfillment} onChange={(e) => setNewFulfillment(e.target.value as 'delivery' | 'pickup')}>
                <option value="delivery">Staff Delivery</option>
                <option value="pickup">Self-Pickup (At Shop)</option>
              </Select>
            </div>
          </div>
          {newLines.map((l, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_90px] gap-2">
              <Select value={l.item_id} onChange={(e) => setNewLines(newLines.map((x, i) => i === idx ? { ...x, item_id: e.target.value } : x))}>
                <option value="">Select item…</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name} — {formatINR(i.wholesale_price)}</option>)}
              </Select>
              <Input type="number" placeholder="Qty" value={l.quantity} onChange={(e) => setNewLines(newLines.map((x, i) => i === idx ? { ...x, quantity: e.target.value } : x))} />
            </div>
          ))}
          <Button variant="ghost" className="text-sm" onClick={() => setNewLines([...newLines, { item_id: '', quantity: '' }])}>
            <Plus size={14} /> Add another item
          </Button>
          <div>
            <Label>Notes</Label>
            <Input value={newNotes} onChange={(e) => setNewNotes(e.target.value)} />
          </div>
          <Button className="w-full" onClick={createManualOrder} disabled={busy}>{busy ? 'Creating…' : 'Create Order'}</Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteOrder} title="Cancel Order" confirmLabel="Cancel Order"
        message={`Cancel ${deleteOrder?.order_number}? This cannot be undone.`}
        onConfirm={async () => {
          if (!deleteOrder) return;
          await supabase.from('orders').delete().eq('id', deleteOrder.id);
          await supabase.from('audit_logs').insert({ store_id: store!.id, actor_user_id: user!.id, action: `Order ${deleteOrder.order_number} cancelled`, entity_type: 'order', entity_id: deleteOrder.id });
          show('Order cancelled');
          void load();
        }}
        onClose={() => setDeleteOrder(null)}
      />
    </div>
  );
}
