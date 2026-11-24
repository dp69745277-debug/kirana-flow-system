import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Settings2, ArrowDownToLine, ArrowUpFromLine, Package, Pencil } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/lib/supabase';
import {
  Button, Input, Select, Label, Card, Badge, Modal, ConfirmDialog, EmptyState, Spinner, useToast, cn,
} from '@/components/ui';
import { formatINR } from '@/lib/format';
import { UNIT_TYPES, METRICS } from '@/lib/types';
import type { Category, Agency, InventoryItem, StockTransaction, AuditLog } from '@/lib/types';

const emptyForm = {
  name: '', brand: '', category_id: '', default_agency_id: '',
  unit_type: 'Pota', unit_value: 30, metric: 'kg', current_stock: 0,
  low_stock_threshold: 10, avg_base_price: 0, auto_update_threshold: 5,
  wholesale_price: 0, retail_price: 0, is_visible_to_customers: true,
};

export default function Inventory() {
  const { store, user, isOwner, hasFeature } = useApp();
  const { show, node: toastNode } = useToast();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [outOnly, setOutOnly] = useState(false);

  const [itemModal, setItemModal] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [catModal, setCatModal] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [deleteCat, setDeleteCat] = useState<Category | null>(null);
  const [deleteItem, setDeleteItem] = useState<InventoryItem | null>(null);

  const [stockInModal, setStockInModal] = useState<InventoryItem | null>(null);
  const [stockOutModal, setStockOutModal] = useState<InventoryItem | null>(null);
  const [txQty, setTxQty] = useState('');
  const [txRate, setTxRate] = useState('');
  const [txAgency, setTxAgency] = useState('');
  const [txPay, setTxPay] = useState('Paid Cash');
  const [txReason, setTxReason] = useState('Retail Counter');
  const [txNotes, setTxNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const wholesale = store?.store_type !== 'retail';

  async function load() {
    if (!store) return;
    const [i, c, a] = await Promise.all([
      supabase.from('inventory_items').select('*').eq('store_id', store.id).order('name'),
      supabase.from('categories').select('*').eq('store_id', store.id).order('name'),
      supabase.from('agencies').select('*').eq('store_id', store.id).order('name'),
    ]);
    setItems((i.data as InventoryItem[]) ?? []);
    setCategories((c.data as Category[]) ?? []);
    setAgencies((a.data as Agency[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [store?.id]);

  const filtered = useMemo(() => items.filter((i) => {
    const hay = `${i.name} ${i.brand ?? ''}`.toLowerCase();
    if (q && !hay.includes(q.toLowerCase())) return false;
    if (catFilter && i.category_id !== catFilter) return false;
    if (lowOnly && i.current_stock > i.low_stock_threshold) return false;
    if (outOnly && i.current_stock !== 0) return false;
    return true;
  }), [items, q, catFilter, lowOnly, outOnly]);

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm });
    setItemModal(true);
  }
  function openEdit(i: InventoryItem) {
    setEditing(i);
    setForm({
      name: i.name, brand: i.brand ?? '', category_id: i.category_id ?? '', default_agency_id: i.default_agency_id ?? '',
      unit_type: i.unit_type, unit_value: i.unit_value, metric: i.metric, current_stock: i.current_stock,
      low_stock_threshold: i.low_stock_threshold, avg_base_price: i.avg_base_price, auto_update_threshold: i.auto_update_threshold,
      wholesale_price: i.wholesale_price, retail_price: i.retail_price, is_visible_to_customers: i.is_visible_to_customers,
    });
    setItemModal(true);
  }

  async function saveItem() {
    if (!store || !user) return;
    if (!form.name.trim()) return show('Item name is required', true);
    setBusy(true);
    const payload = {
      store_id: store.id,
      name: form.name.trim(),
      brand: form.brand.trim() || null,
      category_id: form.category_id || null,
      default_agency_id: form.default_agency_id || null,
      unit_type: form.unit_type,
      unit_value: Number(form.unit_value) || 1,
      metric: form.metric,
      current_stock: Number(form.current_stock) || 0,
      low_stock_threshold: Number(form.low_stock_threshold) || 0,
      avg_base_price: Number(form.avg_base_price) || 0,
      latest_price: Number(form.avg_base_price) || 0,
      auto_update_threshold: Number(form.auto_update_threshold) || 5,
      wholesale_price: Number(form.wholesale_price) || 0,
      retail_price: Number(form.retail_price) || 0,
      is_visible_to_customers: form.is_visible_to_customers,
    };
    let error;
    if (editing) {
      ({ error } = await supabase.from('inventory_items').update(payload).eq('id', editing.id));
    } else {
      ({ error } = await supabase.from('inventory_items').insert(payload));
      if (!error) {
        await supabase.from('audit_logs').insert({
          store_id: store.id, actor_user_id: user.id,
          action: `Added item "${payload.name}"`, entity_type: 'inventory_item',
        });
      }
    }
    setBusy(false);
    if (error) return show(error.message, true);
    setItemModal(false);
    show(editing ? 'Item updated' : 'Item added');
    void load();
  }

  async function addCategory() {
    if (!store || !newCat.trim()) return;
    const { error } = await supabase.from('categories').insert({ store_id: store.id, name: newCat.trim() });
    if (error) return show(error.message, true);
    setNewCat('');
    show('Category added');
    void load();
  }

  async function removeCategory() {
    if (!deleteCat) return;
    const { error } = await supabase.from('categories').delete().eq('id', deleteCat.id);
    if (error) return show('Could not delete (category may be in use)', true);
    show('Category deleted');
    void load();
  }

  async function removeItem() {
    if (!deleteItem) return;
    const { error } = await supabase.from('inventory_items').delete().eq('id', deleteItem.id);
    if (error) return show(error.message, true);
    show('Item deleted');
    void load();
  }

  async function submitStockIn() {
    if (!store || !user || !stockInModal) return;
    const qty = Number(txQty);
    if (!qty || qty <= 0) return show('Enter a valid quantity', true);
    const rate = Number(txRate) || stockInModal.latest_price;
    setBusy(true);
    const { error } = await supabase.from('stock_transactions').insert({
      store_id: store.id,
      item_id: stockInModal.id,
      type: 'stock_in',
      quantity: qty,
      unit_price: rate,
      agency_id: txAgency || stockInModal.default_agency_id || null,
      performed_by_user_id: user.id,
      payment_status: txPay,
      notes: txNotes.trim() || null,
    });
    if (!error) {
      // Price fluctuation alert
      const base = stockInModal.avg_base_price;
      if (base > 0 && Math.abs(rate - base) >= stockInModal.auto_update_threshold) {
        await supabase.from('price_alerts').insert({
          store_id: store.id, item_id: stockInModal.id,
          old_price: base, new_price: rate, diff_amount: rate - base,
        });
      }
      const newAvg = base === 0 ? rate : (base + rate) / 2;
      await supabase.from('inventory_items').update({ avg_base_price: Math.round(newAvg * 100) / 100, latest_price: rate }).eq('id', stockInModal.id);
      if (txPay === 'Added to Agency Balance' && (txAgency || stockInModal.default_agency_id)) {
        const agId = txAgency || stockInModal.default_agency_id;
        await supabase.rpc('increment_agency_balance', { p_agency_id: agId, p_delta: qty * rate });
      }
      await supabase.from('audit_logs').insert({
        store_id: store.id, actor_user_id: user.id,
        action: `Stock In: ${qty} ${stockInModal.unit_type} ${stockInModal.name} @ ${formatINR(rate)}`,
        entity_type: 'stock_transaction',
      });
    }
    setBusy(false);
    if (error) return show(error.message, true);
    setStockInModal(null); setTxQty(''); setTxRate(''); setTxNotes('');
    show('Stock added');
    void load();
  }

  async function submitStockOut() {
    if (!store || !user || !stockOutModal) return;
    const qty = Number(txQty);
    if (!qty || qty <= 0) return show('Enter a valid quantity', true);
    if (qty > stockOutModal.current_stock) return show('Not enough stock in godown', true);
    setBusy(true);
    const { error } = await supabase.from('stock_transactions').insert({
      store_id: store.id,
      item_id: stockOutModal.id,
      type: 'stock_out_retail',
      quantity: qty,
      unit_price: stockOutModal.retail_price,
      performed_by_user_id: user.id,
      notes: `${txReason}${txNotes.trim() ? ` — ${txNotes.trim()}` : ''}`,
    });
    if (!error) {
      await supabase.from('audit_logs').insert({
        store_id: store.id, actor_user_id: user.id,
        action: `Stock Out: ${qty} ${stockOutModal.unit_type} ${stockOutModal.name} (${txReason})`,
        entity_type: 'stock_transaction',
      });
    }
    setBusy(false);
    if (error) return show(error.message, true);
    setStockOutModal(null); setTxQty(''); setTxNotes('');
    show('Stock deducted');
    void load();
  }

  if (loading) return <Spinner label="Loading inventory…" />;

  return (
    <div className="space-y-4">
      {toastNode}

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search items, brands…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <Select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="w-auto min-w-[140px]">
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Button variant="secondary" onClick={() => setCatModal(true)}><Settings2 size={16} /></Button>
        <Button onClick={openAdd}><Plus size={16} /> Add Item</Button>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setLowOnly(!lowOnly)} className={cn('rounded-full px-3 py-1.5 text-xs font-medium border', lowOnly ? 'bg-amber-100 border-amber-300 text-amber-800' : 'border-slate-200 text-slate-500')}>
          Low Stock
        </button>
        <button onClick={() => setOutOnly(!outOnly)} className={cn('rounded-full px-3 py-1.5 text-xs font-medium border', outOnly ? 'bg-red-100 border-red-300 text-red-700' : 'border-slate-200 text-slate-500')}>
          Out of Stock
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Package size={32} />} title="No items found" message="Add your first godown item or adjust filters." />
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((i) => {
            const low = i.current_stock <= i.low_stock_threshold;
            const out = i.current_stock === 0;
            return (
              <Card key={i.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{i.name}</p>
                    <p className="text-xs text-slate-400 truncate">{i.brand ?? '—'} · {categories.find((c) => c.id === i.category_id)?.name ?? 'Uncategorized'}</p>
                  </div>
                  {out ? <Badge tone="red">Out of Stock</Badge> : low ? <Badge tone="amber">Low</Badge> : <Badge tone="green">In Stock</Badge>}
                </div>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="text-2xl font-semibold text-slate-900">{i.current_stock.toLocaleString('en-IN')}</span>
                  <span className="text-sm text-slate-500">{i.unit_type}</span>
                  <span className="text-xs text-slate-400">({(i.current_stock * i.unit_value).toLocaleString('en-IN')} {i.metric})</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-slate-500">
                  {wholesale && <span>Wholesale: <b className="text-slate-700">{formatINR(i.wholesale_price)}</b></span>}
                  <span>Retail: <b className="text-slate-700">{formatINR(i.retail_price)}</b></span>
                </div>
                <div className="mt-3 flex gap-1.5">
                  <Button variant="secondary" className="flex-1 !py-2 text-xs" onClick={() => { setStockInModal(i); setTxRate(String(i.latest_price || '')); }}><ArrowDownToLine size={14} /> Stock In</Button>
                  <Button variant="secondary" className="flex-1 !py-2 text-xs" onClick={() => setStockOutModal(i)}><ArrowUpFromLine size={14} /> Stock Out</Button>
                  {isOwner && (
                    <>
                      <Button variant="ghost" className="!px-2 !py-2" onClick={() => openEdit(i)}><Pencil size={14} /></Button>
                      <Button variant="ghost" className="!px-2 !py-2 text-red-500 hover:!bg-red-50" onClick={() => setDeleteItem(i)}>
                        <span className="text-xs font-semibold">✕</span>
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit item */}
      <Modal open={itemModal} onClose={() => setItemModal(false)} title={editing ? 'Edit Item' : 'Add Item'} wide>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <Label required>Item Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <Label>Brand</Label>
            <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          </div>
          <div>
            <Label>Category</Label>
            <Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">None</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Default Supplier / Agency</Label>
            <Select value={form.default_agency_id} onChange={(e) => setForm({ ...form, default_agency_id: e.target.value })}>
              <option value="">None</option>
              {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Unit Type</Label>
            <Select value={form.unit_type} onChange={(e) => setForm({ ...form, unit_type: e.target.value })}>
              {UNIT_TYPES.map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Unit Value</Label>
              <Input type="number" value={form.unit_value} onChange={(e) => setForm({ ...form, unit_value: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Metric</Label>
              <Select value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })}>
                {METRICS.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </div>
          </div>
          <div>
            <Label>Current Stock Units</Label>
            <Input type="number" value={form.current_stock} disabled={!!editing} onChange={(e) => setForm({ ...form, current_stock: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Low Stock Alert Threshold</Label>
            <Input type="number" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Avg Base Purchase Price (₹/unit)</Label>
            <Input type="number" value={form.avg_base_price} onChange={(e) => setForm({ ...form, avg_base_price: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Auto-Update Price Threshold (₹)</Label>
            <Input type="number" value={form.auto_update_threshold} onChange={(e) => setForm({ ...form, auto_update_threshold: Number(e.target.value) })} />
          </div>
          {wholesale && (
            <div>
              <Label>Wholesale Selling Price (₹/unit)</Label>
              <Input type="number" value={form.wholesale_price} onChange={(e) => setForm({ ...form, wholesale_price: Number(e.target.value) })} />
            </div>
          )}
          <div>
            <Label>Retail Selling Price (₹/unit)</Label>
            <Input type="number" value={form.retail_price} onChange={(e) => setForm({ ...form, retail_price: Number(e.target.value) })} />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.is_visible_to_customers} onChange={(e) => setForm({ ...form, is_visible_to_customers: e.target.checked })} className="w-4 h-4 accent-emerald-600" />
            Show in Customer App
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setItemModal(false)}>Cancel</Button>
          <Button onClick={saveItem} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      </Modal>

      {/* Categories */}
      <Modal open={catModal} onClose={() => setCatModal(false)} title="Manage Categories">
        <div className="flex gap-2">
          <Input placeholder="New category name e.g. 50 kg / pota" value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCategory()} />
          <Button onClick={addCategory}>Add</Button>
        </div>
        <ul className="mt-4 space-y-2">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
              <span className="text-sm text-slate-700">{c.name}</span>
              <button className="text-xs font-medium text-red-600 hover:underline" onClick={() => setDeleteCat(c)}>Delete</button>
            </li>
          ))}
          {categories.length === 0 && <p className="text-sm text-slate-400">No categories yet</p>}
        </ul>
      </Modal>

      {/* Stock In */}
      <Modal open={!!stockInModal} onClose={() => setStockInModal(null)} title={`Stock In — ${stockInModal?.name ?? ''}`}>
        <div className="space-y-3">
          <div>
            <Label required>Quantity Added ({stockInModal?.unit_type})</Label>
            <Input type="number" inputMode="decimal" value={txQty} onChange={(e) => setTxQty(e.target.value)} />
          </div>
          <div>
            <Label required>Purchase Rate (₹/unit)</Label>
            <Input type="number" inputMode="decimal" value={txRate} onChange={(e) => setTxRate(e.target.value)} />
          </div>
          <div>
            <Label>Agency / Supplier</Label>
            <Select value={txAgency} onChange={(e) => setTxAgency(e.target.value)}>
              <option value="">Default agency</option>
              {agencies.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </div>
          <div>
            <Label required>Payment Status</Label>
            <Select value={txPay} onChange={(e) => setTxPay(e.target.value)}>
              <option>Paid Cash</option>
              <option>Paid UPI</option>
              <option>Added to Agency Balance</option>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={txNotes} onChange={(e) => setTxNotes(e.target.value)} placeholder="Bill no., remarks…" />
          </div>
          <Button className="w-full" onClick={submitStockIn} disabled={busy}>{busy ? 'Saving…' : 'Add Stock'}</Button>
        </div>
      </Modal>

      {/* Stock Out */}
      <Modal open={!!stockOutModal} onClose={() => setStockOutModal(null)} title={`Stock Out — ${stockOutModal?.name ?? ''}`}>
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Available: <b>{stockOutModal?.current_stock} {stockOutModal?.unit_type}</b></p>
          <div>
            <Label required>Quantity Deducted ({stockOutModal?.unit_type})</Label>
            <Input type="number" inputMode="decimal" value={txQty} onChange={(e) => setTxQty(e.target.value)} />
          </div>
          <div>
            <Label required>Reason</Label>
            <Select value={txReason} onChange={(e) => setTxReason(e.target.value)}>
              <option>Retail Counter</option>
              <option>Walk-in Sale</option>
              <option>Damaged/Expired</option>
              <option>Adjustment</option>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={txNotes} onChange={(e) => setTxNotes(e.target.value)} />
          </div>
          <Button className="w-full" onClick={submitStockOut} disabled={busy}>{busy ? 'Saving…' : 'Deduct Stock'}</Button>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteItem} title="Delete Item" message={`Delete "${deleteItem?.name}" and its history? This cannot be undone.`} onConfirm={removeItem} onClose={() => setDeleteItem(null)} />
      <ConfirmDialog open={!!deleteCat} title="Delete Category" message={`Delete category "${deleteCat?.name}"? Items using it will become uncategorized.`} onConfirm={removeCategory} onClose={() => setDeleteCat(null)} />
    </div>
  );
}
