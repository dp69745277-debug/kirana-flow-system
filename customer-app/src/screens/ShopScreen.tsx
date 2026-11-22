import { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Phone,
  MessageCircle,
  PackageCheck,
  ChevronRight,
  Plus,
  Minus,
  Sparkles,
  Check,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useCart } from '@/context/CartContext';
import { supabase } from '@/lib/supabase';
import { formatINR, telLink, waLink } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Badge, Spinner, EmptyState, cn } from '@/components/ui';
import type { InventoryItem, Category, Order, OrderItem } from '@/lib/types';

interface ShopScreenProps {
  onNavigateToTab: (tab: string) => void;
  onOpenOrderTracker: (orderId: string) => void;
}

export function ShopScreen({ onNavigateToTab, onOpenOrderTracker }: ShopScreenProps) {
  const { customer, store, lang } = useCustomerAuth();
  const { addToCart, updateQty, getItemQty } = useCart();

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [inStockOnly, setInStockOnly] = useState(false);

  // Active Order Live Strip
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);

  // Buy Again / Frequent items from past orders
  const [frequentItems, setFrequentItems] = useState<InventoryItem[]>([]);

  // Load catalog & past orders
  useEffect(() => {
    if (!store?.id || !customer?.id) return;

    let isMounted = true;

    async function loadShopData() {
      try {
        const [itemsRes, catRes, activeOrderRes, pastOrdersRes] = await Promise.all([
          supabase
            .from('inventory_items')
            .select('*')
            .eq('store_id', store!.id)
            .eq('is_visible_to_customers', true)
            .order('name'),
          supabase
            .from('categories')
            .select('*')
            .eq('store_id', store!.id)
            .order('name'),
          supabase
            .from('orders')
            .select('*')
            .eq('customer_id', customer!.id)
            .in('status', ['placed', 'seen', 'packed', 'out_for_delivery', 'ready_for_pickup'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('orders')
            .select('id')
            .eq('customer_id', customer!.id)
            .order('created_at', { ascending: false })
            .limit(10),
        ]);

        if (!isMounted) return;

        const inventory = (itemsRes.data as InventoryItem[]) || [];
        setItems(inventory);
        setCategories((catRes.data as Category[]) || []);
        setActiveOrder((activeOrderRes.data as Order) || null);

        // Calculate frequent / buy again items from order_items
        const orderIds = (pastOrdersRes.data || []).map((o) => o.id);
        if (orderIds.length > 0) {
          const { data: pastLines } = await supabase
            .from('order_items')
            .select('item_id')
            .in('order_id', orderIds);

          if (pastLines && isMounted) {
            const countMap: Record<string, number> = {};
            pastLines.forEach((l) => {
              if (l.item_id) countMap[l.item_id] = (countMap[l.item_id] || 0) + 1;
            });
            const topItemIds = Object.keys(countMap).sort((a, b) => countMap[b] - countMap[a]);
            const frequent = topItemIds
              .map((id) => inventory.find((it) => it.id === id))
              .filter(Boolean) as InventoryItem[];
            setFrequentItems(frequent.slice(0, 8));
          }
        }
      } catch (err) {
        console.error('Error loading shop data:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void loadShopData();

    // Supabase Realtime for inventory stock updates & order status changes
    const channel = supabase
      .channel(`shop-realtime-${store.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_items', filter: `store_id=eq.${store.id}` },
        (payload) => {
          if (payload.eventType === 'UPDATE' && payload.new) {
            setItems((prev) =>
              prev.map((it) => (it.id === payload.new.id ? (payload.new as InventoryItem) : it))
            );
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${customer.id}` },
        () => {
          void loadShopData();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      void supabase.removeChannel(channel);
    };
  }, [store?.id, customer?.id]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return items.filter((item) => {
      // Category filter
      if (selectedCategory !== 'all' && item.category_id !== selectedCategory) {
        return false;
      }
      // In stock filter
      if (inStockOnly && item.current_stock <= 0) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchName = item.name.toLowerCase().includes(query);
        const matchBrand = (item.brand || '').toLowerCase().includes(query);
        if (!matchName && !matchBrand) return false;
      }
      return true;
    });
  }, [items, selectedCategory, inStockOnly, searchQuery]);

  // Khata credit limit percentage
  const khataBalance = customer?.current_khata_balance || 0;
  const creditLimit = customer?.credit_limit || 0;
  const creditPercent = creditLimit > 0 ? Math.min(100, Math.round((khataBalance / creditLimit) * 100)) : 0;

  if (loading) {
    return <Spinner label="Loading Wholesale Catalog..." />;
  }

  return (
    <div className="space-y-4 pb-28 md:pb-8 w-full overflow-x-hidden">
      {/* 1. Store & Khata Summary Card (Top Banner) */}
      <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 text-white rounded-2xl p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/30 text-emerald-100 border border-emerald-400/30 mb-1.5">
              Connected Wholesaler
            </span>
            <h2 className="text-lg sm:text-xl font-bold truncate">{store?.shop_name}</h2>
            <p className="text-xs text-emerald-100/90 line-clamp-1">{store?.address || 'Main Wholesale Market'}</p>

            {/* Quick Contact Buttons */}
            <div className="mt-2.5 flex items-center gap-2">
              {store?.phone && (
                <>
                  <a
                    href={telLink(store.phone)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-semibold backdrop-blur-xs transition-colors"
                  >
                    <Phone size={12} />
                    <span>Call</span>
                  </a>
                  <a
                    href={waLink(store.phone, `Namaste ${store.shop_name}, I am ${customer?.shop_name}.`)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-500/40 hover:bg-teal-500/60 text-xs font-semibold backdrop-blur-xs transition-colors"
                  >
                    <MessageCircle size={12} />
                    <span>WhatsApp</span>
                  </a>
                </>
              )}
            </div>
          </div>

          {/* Right: Customer's Khata Balance & Credit Limit */}
          <div
            onClick={() => onNavigateToTab('khata')}
            className="w-full sm:w-auto bg-black/20 backdrop-blur-md rounded-xl p-3 border border-white/10 cursor-pointer hover:bg-black/30 transition-colors"
          >
            <div className="flex items-center justify-between gap-3 text-xs text-emerald-100">
              <span className="font-medium">{customer?.shop_name}</span>
              <span className="text-[10px] uppercase font-bold text-emerald-300">Khata Balance</span>
            </div>
            <p className="text-xl font-extrabold text-white mt-0.5">{formatINR(khataBalance)}</p>

            {creditLimit > 0 && (
              <div className="mt-2 text-[11px]">
                <div className="flex justify-between text-emerald-200/80 mb-1">
                  <span>Credit Limit: {formatINR(creditLimit)}</span>
                  <span>{creditPercent}% used</span>
                </div>
                <div className="w-full bg-white/20 h-1.5 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      creditPercent > 90 ? 'bg-red-400' : creditPercent > 70 ? 'bg-amber-400' : 'bg-emerald-300'
                    )}
                    style={{ width: `${creditPercent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Active Order Live Banner Strip (Sticky if active) */}
      {activeOrder && (
        <div
          onClick={() => onOpenOrderTracker(activeOrder.id)}
          className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-center justify-between gap-3 shadow-xs cursor-pointer hover:bg-amber-100/70 transition-colors animate-fade-in"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0">
              <PackageCheck size={16} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-950 truncate">
                  Order #{activeOrder.order_number}
                </span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-extrabold uppercase bg-amber-200 text-amber-900">
                  {activeOrder.status.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="text-[11px] text-amber-800">
                {t('trackLive', lang)} • Total: {formatINR(activeOrder.final_total)}
              </p>
            </div>
          </div>
          <div className="flex items-center text-amber-900 font-bold text-xs shrink-0">
            <span>Track</span>
            <ChevronRight size={16} />
          </div>
        </div>
      )}

      {/* 3. Flipkart-Style Search Bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
          <Search size={18} />
        </div>
        <input
          type="text"
          placeholder={t('searchPlaceholder', lang)}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-xs"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-slate-400 hover:text-slate-600"
          >
            Clear
          </button>
        )}
      </div>

      {/* 4. Category Chips & In-Stock Toggle Filter */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => setSelectedCategory('all')}
          className={cn(
            'px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors cursor-pointer shrink-0',
            selectedCategory === 'all'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          )}
        >
          {t('all', lang)} ({items.length})
        </button>

        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={cn(
              'px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer shrink-0',
              selectedCategory === cat.id
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            )}
          >
            {cat.name}
          </button>
        ))}

        <div className="h-5 w-px bg-slate-300 mx-1 shrink-0" />

        <button
          onClick={() => setInStockOnly(!inStockOnly)}
          className={cn(
            'px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer shrink-0 border flex items-center gap-1.5',
            inStockOnly
              ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          )}
        >
          {inStockOnly && <Check size={12} className="text-emerald-700" />}
          <span>{t('inStockOnly', lang)}</span>
        </button>
      </div>

      {/* 5. 1-Click "Buy Again / Frequent Items" Shelf */}
      {frequentItems.length > 0 && !searchQuery && selectedCategory === 'all' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 mb-2.5">
            <RotateCcw size={14} className="text-emerald-600" />
            <span>{t('buyAgain', lang)}</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
            {frequentItems.map((item) => {
              const qty = getItemQty(item.id);
              return (
                <div
                  key={`freq-${item.id}`}
                  className="min-w-[150px] max-w-[150px] p-2.5 rounded-xl border border-slate-100 bg-slate-50/60 flex flex-col justify-between shrink-0"
                >
                  <div>
                    <p className="text-xs font-bold text-slate-900 line-clamp-1">{item.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {item.unit_type} ({item.unit_value} {item.metric})
                    </p>
                    <p className="text-xs font-extrabold text-emerald-700 mt-1">
                      {formatINR(item.wholesale_price)}
                    </p>
                  </div>

                  <div className="mt-2">
                    {qty === 0 ? (
                      <button
                        onClick={() => addToCart(item, 1)}
                        className="w-full py-1 text-xs font-bold bg-white border border-emerald-600 text-emerald-700 hover:bg-emerald-50 rounded-lg cursor-pointer transition-colors"
                      >
                        + Add
                      </button>
                    ) : (
                      <div className="flex items-center justify-between bg-white border border-emerald-600 rounded-lg px-1 py-0.5 text-xs font-bold text-emerald-800">
                        <button
                          onClick={() => updateQty(item.id, qty - 1)}
                          className="p-1 hover:bg-slate-100 rounded"
                        >
                          <Minus size={12} />
                        </button>
                        <span>{qty}</span>
                        <button
                          onClick={() => updateQty(item.id, qty + 1)}
                          className="p-1 hover:bg-slate-100 rounded"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. Product Catalog Grid */}
      {filteredProducts.length === 0 ? (
        <EmptyState
          icon={<Search size={32} />}
          title="No items found"
          message="Try adjusting your search query or category filter."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredProducts.map((item) => {
            const qty = getItemQty(item.id);
            const isOutOfStock = item.current_stock <= 0;
            const isLowStock = !isOutOfStock && item.current_stock <= item.low_stock_threshold;

            return (
              <div
                key={item.id}
                className={cn(
                  'bg-white rounded-2xl border p-4 shadow-xs flex flex-col justify-between transition-all',
                  qty > 0 ? 'border-emerald-500 ring-1 ring-emerald-500/20' : 'border-slate-200'
                )}
              >
                <div>
                  {/* Top: Brand & Live Stock Badge */}
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider truncate">
                      {item.brand || 'General'}
                    </span>
                    {isOutOfStock ? (
                      <Badge tone="red">{t('outOfStock', lang)}</Badge>
                    ) : isLowStock ? (
                      <Badge tone="amber">
                        {t('lowStock', lang)} ({item.current_stock} {t('onlyLeft', lang)})
                      </Badge>
                    ) : (
                      <Badge tone="green">{t('inStock', lang)}</Badge>
                    )}
                  </div>

                  {/* Item Name & Pack / Unit Info */}
                  <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                    {item.name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Pack: <strong className="text-slate-700">{item.unit_type}</strong> ({item.unit_value}{' '}
                    {item.metric})
                  </p>

                  {/* Wholesale Price */}
                  <div className="mt-2.5 flex items-baseline gap-1.5">
                    <span className="text-lg font-extrabold text-slate-900">
                      {formatINR(item.wholesale_price)}
                    </span>
                    <span className="text-xs text-slate-400">/ {item.unit_type}</span>
                    {item.retail_price > item.wholesale_price && (
                      <span className="text-xs text-slate-400 line-through ml-1">
                        MRP {formatINR(item.retail_price)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom: Fast B2B Quantity Stepper with +5, +10 quick add */}
                <div className="mt-4 pt-3 border-t border-slate-100">
                  {isOutOfStock ? (
                    <button
                      disabled
                      className="w-full py-2 rounded-xl bg-slate-100 text-slate-400 text-xs font-bold cursor-not-allowed text-center"
                    >
                      Out of Stock
                    </button>
                  ) : qty === 0 ? (
                    <button
                      onClick={() => addToCart(item, 1)}
                      className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Plus size={15} />
                      <span>{t('add', lang)}</span>
                    </button>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between bg-emerald-50 border border-emerald-300 rounded-xl p-1">
                        <button
                          onClick={() => updateQty(item.id, qty - 1)}
                          className="w-8 h-8 rounded-lg bg-white border border-emerald-200 text-emerald-800 flex items-center justify-center hover:bg-emerald-100 cursor-pointer transition-colors shadow-xs"
                        >
                          <Minus size={15} />
                        </button>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="1"
                            value={qty}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val)) updateQty(item.id, Math.max(0, val));
                            }}
                            className="w-12 text-center bg-transparent text-sm font-extrabold text-emerald-950 focus:outline-none"
                          />
                          <span className="text-[11px] font-semibold text-emerald-700">units</span>
                        </div>
                        <button
                          onClick={() => updateQty(item.id, qty + 1)}
                          className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 cursor-pointer transition-colors shadow-xs"
                        >
                          <Plus size={15} />
                        </button>
                      </div>

                      {/* Quick Bulk Increment Buttons for Wholesale */}
                      <div className="flex items-center justify-end gap-1.5 text-[10px] font-bold text-slate-500">
                        <span>Quick:</span>
                        <button
                          onClick={() => addToCart(item, 5)}
                          className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-emerald-100 hover:text-emerald-800 border border-slate-200 transition-colors cursor-pointer"
                        >
                          +5
                        </button>
                        <button
                          onClick={() => addToCart(item, 10)}
                          className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-emerald-100 hover:text-emerald-800 border border-slate-200 transition-colors cursor-pointer"
                        >
                          +10
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
