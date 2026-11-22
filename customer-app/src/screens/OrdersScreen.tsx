import { useState, useEffect, useMemo } from 'react';
import {
  Package,
  Clock,
  CheckCircle2,
  Truck,
  Store,
  ChevronDown,
  ChevronUp,
  FileDown,
  RotateCcw,
  PlusCircle,
  XCircle,
  AlertCircle,
  Eye,
  Camera,
} from 'lucide-react';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useCart } from '@/context/CartContext';
import { supabase } from '@/lib/supabase';
import { formatINR, formatDateTime } from '@/lib/format';
import { t } from '@/lib/i18n';
import { generateCustomerInvoicePDF } from '@/lib/pdf';
import { Button, Card, Badge, Modal, ConfirmDialog, EmptyState, Spinner, useToast, cn } from '@/components/ui';
import type { Order, OrderItem, InventoryItem, StoreUser } from '@/lib/types';

interface OrdersScreenProps {
  onNavigateToTab: (tab: string) => void;
  selectedOrderIdFromShop?: string | null;
}

export function OrdersScreen({ onNavigateToTab, selectedOrderIdFromShop }: OrdersScreenProps) {
  const { customer, store, lang } = useCustomerAuth();
  const { reorderItems } = useCart();
  const { show, node: toastNode } = useToast();

  const [orders, setOrders] = useState<Order[]>([]);
  const [storeUsers, setStoreUsers] = useState<StoreUser[]>([]);
  const [inventoryList, setInventoryList] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Sub-tabs: 'active' | 'history'
  const [subTab, setSubTab] = useState<'active' | 'history'>('active');

  // Expanded order ID
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(selectedOrderIdFromShop || null);
  const [orderLinesMap, setOrderLinesMap] = useState<Record<string, OrderItem[]>>({});

  // Cancel order dialog
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);
  const [busyCancel, setBusyCancel] = useState(false);

  // Delivery proof modal
  const [proofPhotoModal, setProofPhotoModal] = useState<string | null>(null);

  async function loadOrdersData() {
    if (!customer?.id) return;
    try {
      const [ordRes, usersRes, invRes] = await Promise.all([
        supabase
          .from('orders')
          .select('*')
          .eq('customer_id', customer.id)
          .order('created_at', { ascending: false }),
        supabase.from('store_users').select('*').eq('store_id', customer.store_id),
        supabase.from('inventory_items').select('*').eq('store_id', customer.store_id),
      ]);

      setOrders((ordRes.data as Order[]) || []);
      setStoreUsers((usersRes.data as StoreUser[]) || []);
      setInventoryList((invRes.data as InventoryItem[]) || []);
    } catch (err) {
      console.error('Error loading orders:', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadOrderLines(orderId: string) {
    if (orderLinesMap[orderId]) return;
    const { data } = await supabase.from('order_items').select('*').eq('order_id', orderId);
    if (data) {
      setOrderLinesMap((prev) => ({ ...prev, [orderId]: data as OrderItem[] }));
    }
  }

  useEffect(() => {
    void loadOrdersData();

    if (!customer?.id) return;

    // Realtime listener for order updates
    const channel = supabase
      .channel(`orders-screen-realtime-${customer.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${customer.id}` },
        () => {
          void loadOrdersData();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [customer?.id]);

  useEffect(() => {
    if (selectedOrderIdFromShop) {
      setExpandedOrderId(selectedOrderIdFromShop);
      void loadOrderLines(selectedOrderIdFromShop);
    }
  }, [selectedOrderIdFromShop]);

  const activeOrders = useMemo(() => {
    return orders.filter((o) =>
      ['placed', 'seen', 'packed', 'out_for_delivery', 'ready_for_pickup'].includes(o.status)
    );
  }, [orders]);

  const pastOrders = useMemo(() => {
    return orders.filter((o) => ['delivered', 'cancelled'].includes(o.status));
  }, [orders]);

  const displayedOrders = subTab === 'active' ? activeOrders : pastOrders;

  // Handle Cancel Order (Only allowed while placed or seen)
  async function handleCancelConfirm() {
    if (!orderToCancel) return;
    setBusyCancel(true);
    const { error } = await supabase
      .from('orders')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', orderToCancel.id);

    setBusyCancel(false);
    if (error) {
      show(error.message, true);
      return;
    }

    show(`Order #${orderToCancel.order_number} cancelled`);
    setOrderToCancel(null);
    void loadOrdersData();
  }

  // Handle Reorder all items from past order
  function handleReorder(orderId: string) {
    const lines = orderLinesMap[orderId] || [];
    if (lines.length === 0) {
      void loadOrderLines(orderId).then(() => {
        const freshLines = orderLinesMap[orderId] || [];
        reorderItems(
          freshLines.map((l) => ({ item_id: l.item_id, quantity: l.quantity })),
          inventoryList
        );
        show('Items added to cart!');
        onNavigateToTab('cart');
      });
    } else {
      reorderItems(
        lines.map((l) => ({ item_id: l.item_id, quantity: l.quantity })),
        inventoryList
      );
      show('Items added to cart!');
      onNavigateToTab('cart');
    }
  }

  // Handle PDF invoice download
  function handleDownloadInvoice(order: Order) {
    if (!store || !customer) return;
    const lines = orderLinesMap[order.id] || [];
    const userMap = new Map(storeUsers.map((u) => [u.id, u.name]));
    const deliveredByName = order.delivered_by_user_id ? userMap.get(order.delivered_by_user_id) : undefined;

    generateCustomerInvoicePDF({
      store,
      customer,
      orderNumber: order.order_number,
      items: lines.map((l) => ({
        name: l.item_name_snapshot,
        qty: l.quantity,
        rate: l.final_unit_price,
        total: l.line_total,
      })),
      subtotal: order.subtotal,
      discount: order.discount_amount || 0,
      total: order.final_total,
      paymentMode: order.payment_mode,
      paidAmount: order.paid_amount || 0,
      khataAmount: order.khata_amount || 0,
      deliveredBy: deliveredByName,
      dateISO: order.created_at,
    });
  }

  // Helpers to resolve staff/owner names
  function getUserName(userId: string | null | undefined): string {
    if (!userId) return '';
    const u = storeUsers.find((x) => x.id === userId);
    return u ? u.name : 'Staff';
  }

  // Stepper steps builder based on fulfillment type
  function getStepperSteps(order: Order) {
    const isPickup = order.fulfillment_type === 'pickup';
    const seenBy = getUserName(order.seen_by_user_id);
    const deliveredBy = getUserName(order.delivered_by_user_id);

    if (isPickup) {
      return [
        { key: 'placed', label: t('stepPlaced', lang), sub: formatDateTime(order.created_at) },
        { key: 'seen', label: t('stepSeen', lang), sub: seenBy ? `by ${seenBy}` : '' },
        { key: 'packed', label: t('stepPacked', lang), sub: '' },
        { key: 'ready_for_pickup', label: t('stepReadyForPickup', lang), sub: 'Ready at counter' },
        { key: 'delivered', label: t('stepCompleted', lang), sub: deliveredBy ? `by ${deliveredBy}` : '' },
      ];
    } else {
      return [
        { key: 'placed', label: t('stepPlaced', lang), sub: formatDateTime(order.created_at) },
        { key: 'seen', label: t('stepSeen', lang), sub: seenBy ? `by ${seenBy}` : '' },
        { key: 'packed', label: t('stepPacked', lang), sub: '' },
        { key: 'out_for_delivery', label: t('stepOutForDelivery', lang), sub: 'On the way' },
        { key: 'delivered', label: t('stepDelivered', lang), sub: deliveredBy ? `by ${deliveredBy}` : '' },
      ];
    }
  }

  function getStepIndex(status: Order['status'], isPickup: boolean): number {
    const steps = isPickup
      ? ['placed', 'seen', 'packed', 'ready_for_pickup', 'delivered']
      : ['placed', 'seen', 'packed', 'out_for_delivery', 'delivered'];
    const idx = steps.indexOf(status);
    return idx >= 0 ? idx : 0;
  }

  if (loading) {
    return <Spinner label="Loading your orders..." />;
  }

  return (
    <div className="space-y-4 pb-28 md:pb-8 w-full overflow-x-hidden">
      {toastNode}

      {/* Cancel Order Confirm Dialog */}
      <ConfirmDialog
        open={!!orderToCancel}
        title="Cancel Order"
        message={t('confirmCancel', lang)}
        confirmLabel="Yes, Cancel"
        danger
        onConfirm={handleCancelConfirm}
        onClose={() => setOrderToCancel(null)}
      />

      {/* Delivery Proof Photo Modal */}
      {proofPhotoModal && (
        <Modal open={true} onClose={() => setProofPhotoModal(null)} title="Delivery Proof Photo">
          <div className="p-2 flex flex-col items-center">
            <img
              src={proofPhotoModal}
              alt="Delivery Proof"
              className="max-h-[70vh] rounded-xl object-contain shadow-md"
            />
          </div>
        </Modal>
      )}

      {/* Sub Tabs Toggle (Active Orders vs Order History) */}
      <div className="flex bg-slate-200/80 p-1 rounded-xl">
        <button
          onClick={() => setSubTab('active')}
          className={cn(
            'flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2',
            subTab === 'active' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <span>{t('activeOrders', lang)}</span>
          {activeOrders.length > 0 && (
            <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] font-extrabold flex items-center justify-center">
              {activeOrders.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setSubTab('history')}
          className={cn(
            'flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2',
            subTab === 'history' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
          )}
        >
          <span>{t('orderHistory', lang)}</span>
          <span className="text-slate-400">({pastOrders.length})</span>
        </button>
      </div>

      {/* Orders List */}
      {displayedOrders.length === 0 ? (
        <EmptyState
          icon={<Package size={40} />}
          title={subTab === 'active' ? 'No active orders' : 'No past orders yet'}
          message={
            subTab === 'active'
              ? 'All your orders are either completed or you haven’t placed one yet.'
              : 'Completed and cancelled orders will appear here.'
          }
          action={
            subTab === 'active' ? (
              <Button onClick={() => onNavigateToTab('shop')} className="mt-2 font-bold">
                {t('startShopping', lang)}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3.5">
          {displayedOrders.map((order) => {
            const isExpanded = expandedOrderId === order.id;
            const lines = orderLinesMap[order.id] || [];
            const isPickup = order.fulfillment_type === 'pickup';
            const stepperSteps = getStepperSteps(order);
            const currentStepIdx = getStepIndex(order.status, isPickup);
            const isCancelled = order.status === 'cancelled';
            const canModify = ['placed', 'seen'].includes(order.status);

            return (
              <Card
                key={order.id}
                className={cn(
                  'overflow-hidden transition-all border',
                  subTab === 'active' ? 'border-emerald-200/90 shadow-sm' : 'border-slate-200'
                )}
              >
                {/* Header Summary Row */}
                <div
                  onClick={() => {
                    if (isExpanded) {
                      setExpandedOrderId(null);
                    } else {
                      setExpandedOrderId(order.id);
                      void loadOrderLines(order.id);
                    }
                  }}
                  className="p-4 cursor-pointer hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-extrabold text-slate-900">
                          #{order.order_number}
                        </span>
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                            isCancelled
                              ? 'bg-red-100 text-red-700'
                              : order.status === 'delivered'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-900 animate-pulse'
                          )}
                        >
                          {order.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {formatDateTime(order.created_at)} •{' '}
                        <span className="font-semibold text-slate-600">
                          {isPickup ? 'Counter Pickup' : 'Shop Delivery'}
                        </span>
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-base font-extrabold text-slate-900">
                        {formatINR(order.final_total)}
                      </p>
                      <div className="flex items-center justify-end text-xs text-slate-400 gap-1 mt-0.5">
                        <span>{isExpanded ? 'Hide' : 'Details'}</span>
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </div>
                    </div>
                  </div>

                  {/* Quick Realtime Mini Bar for Active Orders if collapsed */}
                  {!isExpanded && !isCancelled && subTab === 'active' && (
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">Status:</span>
                      <span className="font-bold text-emerald-700 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping" />
                        {order.status === 'out_for_delivery'
                          ? '🚚 Out for Delivery'
                          : order.status === 'ready_for_pickup'
                          ? '🏪 Ready for Pickup'
                          : order.status === 'packed'
                          ? '📦 Packed'
                          : order.status === 'seen'
                          ? '👀 Seen by Wholesaler'
                          : '📝 Order Placed'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Expanded Detailed View */}
                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/50 p-4 space-y-4 animate-fade-in">
                    {/* 1. Flipkart-Style Live Progress Stepper (Only if not cancelled) */}
                    {!isCancelled && (
                      <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-200 shadow-xs overflow-x-auto no-scrollbar">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
                          {t('liveStatus', lang)}
                        </h4>

                        <div className="relative flex items-center justify-between min-w-[280px]">
                          {/* Connecting Line */}
                          <div className="absolute top-4 left-3 right-3 h-0.5 bg-slate-200 -z-0" />
                          <div
                            className="absolute top-4 left-3 h-0.5 bg-emerald-600 transition-all duration-500 -z-0"
                            style={{
                              width: `${(currentStepIdx / (stepperSteps.length - 1)) * 95}%`,
                            }}
                          />

                          {stepperSteps.map((step, idx) => {
                            const isCompleted = idx <= currentStepIdx;
                            const isCurrent = idx === currentStepIdx;

                            return (
                              <div
                                key={step.key}
                                className="relative flex flex-col items-center text-center z-10"
                                style={{ width: `${100 / stepperSteps.length}%` }}
                              >
                                <div
                                  className={cn(
                                    'w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all shadow-xs',
                                    isCompleted
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-white border-2 border-slate-300 text-slate-400',
                                    isCurrent && 'ring-4 ring-emerald-100 scale-110'
                                  )}
                                >
                                  {isCompleted ? <CheckCircle2 size={16} /> : idx + 1}
                                </div>
                                <span
                                  className={cn(
                                    'text-[10px] mt-2 font-bold line-clamp-1',
                                    isCompleted ? 'text-slate-900' : 'text-slate-400'
                                  )}
                                >
                                  {step.label}
                                </span>
                                {step.sub && (
                                  <span className="text-[9px] text-slate-400 mt-0.5 line-clamp-1">
                                    {step.sub}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 2. Customer Actions for Open Orders (placed / seen) */}
                    {canModify && (
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => onNavigateToTab('shop')}
                          className="flex-1 text-xs font-bold border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100"
                        >
                          <PlusCircle size={15} />
                          <span>{t('addMoreItems', lang)}</span>
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => setOrderToCancel(order)}
                          className="text-xs font-bold px-3"
                        >
                          <XCircle size={15} />
                          <span>{t('cancelOrder', lang)}</span>
                        </Button>
                      </div>
                    )}

                    {/* 3. Itemized Bill with Price Adjustment Transparency */}
                    <div className="bg-white rounded-2xl p-4 border border-slate-200">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                          Itemized Order List
                        </h4>
                        <span className="text-xs text-slate-400 font-semibold">{lines.length} items</span>
                      </div>

                      {lines.length === 0 ? (
                        <div className="py-4 text-center text-xs text-slate-400">Loading order items...</div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {lines.map((l) => {
                            const isRateAdjusted =
                              l.original_unit_price > 0 && l.original_unit_price !== l.final_unit_price;

                            return (
                              <div key={l.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                                <div className="min-w-0">
                                  <p className="font-bold text-slate-900">{l.item_name_snapshot}</p>
                                  <p className="text-slate-500 mt-0.5">
                                    Qty: <strong className="text-slate-800">{l.quantity}</strong> ×{' '}
                                    {isRateAdjusted ? (
                                      <span>
                                        <span className="line-through text-slate-400">
                                          {formatINR(l.original_unit_price)}
                                        </span>{' '}
                                        <strong className="text-emerald-700">
                                          {formatINR(l.final_unit_price)}
                                        </strong>
                                      </span>
                                    ) : (
                                      <span>{formatINR(l.final_unit_price)}</span>
                                    )}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="font-bold text-slate-900">{formatINR(l.line_total)}</p>
                                  {isRateAdjusted && (
                                    <span className="text-[10px] font-semibold text-emerald-600">
                                      Rate Adjusted by Wholesaler
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Pricing Summary */}
                      <div className="mt-3 pt-3 border-t border-slate-200 space-y-1.5 text-xs">
                        <div className="flex justify-between text-slate-600">
                          <span>Subtotal</span>
                          <span className="font-semibold text-slate-800">{formatINR(order.subtotal)}</span>
                        </div>
                        {order.discount_amount > 0 && (
                          <div className="flex justify-between text-emerald-700 font-semibold">
                            <span>{t('discountGiven', lang)}</span>
                            <span>- {formatINR(order.discount_amount)}</span>
                          </div>
                        )}
                        <div className="pt-1.5 border-t border-slate-200 flex justify-between font-extrabold text-sm text-slate-900">
                          <span>Final Total</span>
                          <span className="text-emerald-800 text-base">{formatINR(order.final_total)}</span>
                        </div>
                      </div>
                    </div>

                    {/* 4. Payment Settlement Summary & Delivery Proof (if completed) */}
                    {(order.status === 'delivered' || order.paid_amount > 0 || order.khata_amount > 0) && (
                      <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-2">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                          {t('paymentBreakdown', lang)}
                        </h4>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                            <span className="text-slate-400 block text-[10px] font-semibold uppercase">
                              Payment Mode
                            </span>
                            <span className="font-bold text-slate-800 uppercase">
                              {order.payment_mode || 'Pending Settlement'}
                            </span>
                          </div>

                          <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-100">
                            <span className="text-emerald-700 block text-[10px] font-semibold uppercase">
                              Amount Paid
                            </span>
                            <span className="font-bold text-emerald-950">
                              {formatINR(order.paid_amount)}
                            </span>
                          </div>

                          <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-100">
                            <span className="text-amber-700 block text-[10px] font-semibold uppercase">
                              Added to Khata
                            </span>
                            <span className="font-bold text-amber-950">
                              {formatINR(order.khata_amount)}
                            </span>
                          </div>
                        </div>

                        {/* Delivery Proof Photo thumbnail */}
                        {order.delivery_proof_url && (
                          <div className="pt-2">
                            <button
                              onClick={() => setProofPhotoModal(order.delivery_proof_url)}
                              className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                            >
                              <Camera size={14} />
                              <span>{t('proofPhoto', lang)} (Tap to view)</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 5. Completed Order CTAs: Download Invoice PDF & Reorder All Items */}
                    {order.status === 'delivered' && (
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => handleDownloadInvoice(order)}
                          className="flex-1 text-xs font-bold"
                        >
                          <FileDown size={15} />
                          <span>{t('downloadInvoice', lang)}</span>
                        </Button>
                        <Button
                          variant="primary"
                          onClick={() => handleReorder(order.id)}
                          className="flex-1 text-xs font-bold"
                        >
                          <RotateCcw size={15} />
                          <span>{t('reorderAll', lang)}</span>
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
