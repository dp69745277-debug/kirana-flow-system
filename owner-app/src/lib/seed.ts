import { supabase } from '@/lib/supabase';
import type { Store, Category, Agency, InventoryItem, WholesaleCustomer, StoreUser } from '@/lib/types';

const DEMO_ITEMS: Array<{ name: string; brand: string; cat: string; unit: string; unitValue: number; metric: string; stock: number; wPrice: number; rPrice: number; base: number; agencyIdx: number; low: number }> = [
  { name: 'Chawal', brand: 'India Gate', cat: '30 kg / Pota', unit: 'Pota', unitValue: 30, metric: 'kg', stock: 42, wPrice: 2100, rPrice: 2240, base: 1980, agencyIdx: 0, low: 10 },
  { name: 'Chana Dal', brand: 'Futana', cat: '50 kg / Pota', unit: 'Pota', unitValue: 50, metric: 'kg', stock: 18, wPrice: 3400, rPrice: 3600, base: 3250, agencyIdx: 0, low: 8 },
  { name: 'Soyabean Oil', brand: 'Fortune', cat: 'Oil & Ghee', unit: 'Box', unitValue: 15, metric: 'L', stock: 9, wPrice: 2250, rPrice: 2370, base: 2150, agencyIdx: 1, low: 10 },
  { name: 'Maida', brand: 'Shakti Bhog', cat: '50 kg / Pota', unit: 'Pota', unitValue: 50, metric: 'kg', stock: 24, wPrice: 1900, rPrice: 2050, base: 1820, agencyIdx: 0, low: 10 },
  { name: 'Sugar', brand: 'Madhur', cat: '50 kg / Pota', unit: 'Pota', unitValue: 50, metric: 'kg', stock: 6, wPrice: 2450, rPrice: 2600, base: 2380, agencyIdx: 0, low: 10 },
  { name: 'Parle-G Biscuit', brand: 'Parle', cat: 'Biscuit', unit: 'Carton', unitValue: 96, metric: 'pcs', stock: 14, wPrice: 860, rPrice: 960, base: 820, agencyIdx: 1, low: 5 },
  { name: 'Mustard Oil', brand: 'Dhara', cat: 'Oil & Ghee', unit: 'Box', unitValue: 12, metric: 'L', stock: 0, wPrice: 1980, rPrice: 2100, base: 1890, agencyIdx: 1, low: 8 },
  { name: 'Besan', brand: 'Rajdhani', cat: 'Kardani', unit: 'Bag', unitValue: 30, metric: 'kg', stock: 11, wPrice: 1650, rPrice: 1780, base: 1580, agencyIdx: 0, low: 6 },
  { name: 'Haldi Powder', brand: 'Everest', cat: 'Kardani', unit: 'Box', unitValue: 24, metric: 'pcs', stock: 7, wPrice: 1440, rPrice: 1560, base: 1380, agencyIdx: 1, low: 5 },
  { name: 'Toor Dal', brand: 'Lo-Toor', cat: '30 kg / Pota', unit: 'Pota', unitValue: 30, metric: 'kg', stock: 16, wPrice: 4200, rPrice: 4450, base: 4050, agencyIdx: 0, low: 6 },
];

export async function seedDemoData(store: Store): Promise<{ ok: boolean; error?: string }> {
  try {
    const storeId = store.id;

    const { data: existing } = await supabase.from('inventory_items').select('id').eq('store_id', storeId).limit(1);
    if (existing && existing.length > 0) {
      return { ok: false, error: 'Demo data can only be loaded into an empty store' };
    }

    const catNames = ['30 kg / Pota', '50 kg / Pota', 'Biscuit', 'Kardani', 'Oil & Ghee'];
    const { data: cats, error: catErr } = await supabase
      .from('categories')
      .insert(catNames.map((name) => ({ store_id: storeId, name })))
      .select();
    if (catErr) return { ok: false, error: catErr.message };
    const categories = cats as Category[];

    const { data: agenciesData, error: agErr } = await supabase
      .from('agencies')
      .insert([
        { store_id: storeId, name: 'Shri Balaji Traders', phone: '9876543210', balance: 48500 },
        { store_id: storeId, name: 'Gupta Oil Mills', phone: '9812345678', balance: 22400 },
      ])
      .select();
    if (agErr) return { ok: false, error: agErr.message };
    const agencies = agenciesData as Agency[];

    const itemsToInsert = DEMO_ITEMS.map((it) => ({
      store_id: storeId,
      category_id: categories.find((c) => c.name === it.cat)?.id ?? null,
      default_agency_id: agencies[it.agencyIdx]?.id ?? null,
      name: it.name,
      brand: it.brand,
      unit_type: it.unit,
      unit_value: it.unitValue,
      metric: it.metric,
      current_stock: it.stock,
      low_stock_threshold: it.low,
      avg_base_price: it.base,
      latest_price: it.base,
      auto_update_threshold: 5,
      wholesale_price: it.wPrice,
      retail_price: it.rPrice,
      is_visible_to_customers: true,
    }));
    const { data: itemsData, error: itemErr } = await supabase.from('inventory_items').insert(itemsToInsert).select();
    if (itemErr) return { ok: false, error: itemErr.message };
    const items = itemsData as InventoryItem[];

    const stockIns = items.map((item, i) => ({
      store_id: storeId,
      item_id: item.id,
      type: 'stock_in' as const,
      quantity: DEMO_ITEMS[i].stock,
      unit_price: DEMO_ITEMS[i].base,
      agency_id: agencies[DEMO_ITEMS[i].agencyIdx]?.id ?? null,
      payment_status: i % 2 === 0 ? 'Paid UPI' : 'Added to Agency Balance',
      notes: 'Opening stock (demo data)',
    }));
    await supabase.from('stock_transactions').insert(stockIns);

    // Two demo wholesale customers
    const { data: custData, error: custErr } = await supabase
      .from('wholesale_customers')
      .insert([
        { store_id: storeId, name: 'Ramesh Gupta', shop_name: 'Gupta General Store', phone: '9900112233', address: 'Main Bazaar Road', credit_limit: 50000, current_khata_balance: 12500 },
        { store_id: storeId, name: 'Suresh Yadav', shop_name: 'Yadav Kirana & Provisions', phone: '9887766554', address: 'Station Road', credit_limit: 30000, current_khata_balance: 4300 },
      ])
      .select();
    if (custErr) return { ok: false, error: custErr.message };
    const customers = custData as WholesaleCustomer[];

    await supabase.from('khata_transactions').insert([
      { store_id: storeId, customer_id: customers[0].id, type: 'debit_manual', amount: 12500, payment_mode: null, balance_after: 12500, notes: 'Opening khata balance (demo)' },
      { store_id: storeId, customer_id: customers[1].id, type: 'debit_manual', amount: 4300, payment_mode: null, balance_after: 4300, notes: 'Opening khata balance (demo)' },
    ]);

    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
