import { useState } from 'react';
import {
  Trash2,
  Plus,
  Minus,
  Truck,
  Store,
  ArrowRight,
  Sparkles,
  Info,
  CheckCircle2,
  ShoppingBag,
  Layers,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useCart } from '@/context/CartContext';
import { formatINR } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Button, Input, Textarea, Card, EmptyState, useToast, Spinner, ClickSpark, cn } from '@/components/ui';

interface CartScreenProps {
  onNavigateToTab: (tab: string) => void;
  onOrderCompleted: (orderNumber: string) => void;
}

export function CartScreen({ onNavigateToTab, onOrderCompleted }: CartScreenProps) {
  const { customer, store, lang } = useCustomerAuth();
  const {
    items,
    updateQty,
    removeFromCart,
    clearCart,
    totalItemsCount,
    totalUnitsCount,
    estimatedTotal,
    activeOpenOrder,
    fulfillmentType,
    setFulfillmentType,
    orderNotes,
    setOrderNotes,
    mergeWithActiveOrder,
    setMergeWithActiveOrder,
    checkout,
  } = useCart();

  const { show, node: toastNode } = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [placedOrderNumber, setPlacedOrderNumber] = useState('');

  const handlePlaceOrder = async () => {
    if (items.length === 0) {
      show('Your cart is empty', true);
      return;
    }

    setBusy(true);
    const result = await checkout();
    setBusy(false);

    if (!result.ok) {
      show(result.error || 'Failed to place order', true);
      return;
    }

    const orderNum = result.orderNumber || 'ORD-0000';
    setPlacedOrderNumber(orderNum);

    // Fire joyful confetti animation
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#16a34a', '#0d9488', '#f59e0b', '#3b82f6'],
      });
    } catch {
      // ignore
    }

    setConfirmationOpen(true);
  };

  if (items.length === 0 && !confirmationOpen) {
    return (
      <div className="py-8">
        {toastNode}
        <EmptyState
          icon={<ShoppingBag size={48} />}
          title={t('emptyCart', lang)}
          message={t('emptyCartSub', lang)}
          action={
            <Button onClick={() => onNavigateToTab('shop')} className="mt-2 font-bold">
              {t('startShopping', lang)}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-28 md:pb-8 w-full overflow-x-hidden">
      {toastNode}

      {/* Confirmation Modal on Successful Order */}
      {confirmationOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fade-in">
          <Card className="max-w-md w-full p-6 text-center shadow-2xl border-emerald-300">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 size={36} />
            </div>
            <h2 className="text-xl font-extrabold text-slate-900">
              {mergeWithActiveOrder && activeOpenOrder ? 'Order Updated!' : t('orderPlacedSuccess', lang)}
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Order <strong className="text-emerald-700">#{placedOrderNumber}</strong> has been received by{' '}
              <strong>{store?.shop_name}</strong>.
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Live updates will appear automatically as the wholesaler packs and delivers your order.
            </p>

            <div className="mt-6 flex flex-col gap-2">
              <Button
                onClick={() => {
                  setConfirmationOpen(false);
                  onOrderCompleted(placedOrderNumber);
                }}
                className="w-full font-bold py-3"
              >
                <span>Track Order Live</span>
                <ArrowRight size={16} />
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setConfirmationOpen(false);
                  onNavigateToTab('shop');
                }}
                className="w-full"
              >
                Continue Shopping
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Top Heading */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t('myCart', lang)}</h2>
          <p className="text-xs text-slate-500">
            {totalItemsCount} items ({totalUnitsCount} units)
          </p>
        </div>
        <button
          onClick={clearCart}
          className="text-xs font-semibold text-red-600 hover:text-red-700 flex items-center gap-1 cursor-pointer"
        >
          <Trash2 size={13} />
          <span>Clear All</span>
        </button>
      </div>

      {/* SMART "Add to Active Order" Card if customer already has an open order in placed or seen */}
      {activeOpenOrder && (
        <div className="rounded-2xl border-2 border-emerald-500/80 bg-gradient-to-br from-emerald-50 via-teal-50/50 to-white p-4 shadow-sm animate-fade-in">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
              <Layers size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                  {t('activeOrderDetected', lang)}
                </span>
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-200 text-emerald-900">
                  #{activeOpenOrder.order_number} ({activeOpenOrder.status})
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                You already have an active order that hasn't been packed yet. You can merge these items directly
                into it without repeated phone calls!
              </p>

              {/* Radio Toggle between Merge vs Separate */}
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-semibold">
                <label
                  className={cn(
                    'flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all',
                    mergeWithActiveOrder
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  )}
                >
                  <input
                    type="radio"
                    name="merge_order"
                    checked={mergeWithActiveOrder}
                    onChange={() => setMergeWithActiveOrder(true)}
                    className="sr-only"
                  />
                  <div
                    className={cn(
                      'w-4 h-4 rounded-full border flex items-center justify-center shrink-0',
                      mergeWithActiveOrder ? 'border-white bg-white text-emerald-600' : 'border-slate-300'
                    )}
                  >
                    {mergeWithActiveOrder && <span className="w-2 h-2 rounded-full bg-emerald-600" />}
                  </div>
                  <span>{t('mergeIntoOrder', lang)} #{activeOpenOrder.order_number}</span>
                </label>

                <label
                  className={cn(
                    'flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all',
                    !mergeWithActiveOrder
                      ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  )}
                >
                  <input
                    type="radio"
                    name="merge_order"
                    checked={!mergeWithActiveOrder}
                    onChange={() => setMergeWithActiveOrder(false)}
                    className="sr-only"
                  />
                  <div
                    className={cn(
                      'w-4 h-4 rounded-full border flex items-center justify-center shrink-0',
                      !mergeWithActiveOrder ? 'border-white bg-white text-slate-800' : 'border-slate-300'
                    )}
                  >
                    {!mergeWithActiveOrder && <span className="w-2 h-2 rounded-full bg-slate-800" />}
                  </div>
                  <span>{t('placeSeparateOrder', lang)}</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cart Items List */}
      <div className="space-y-2.5">
        {items.map(({ item, quantity }) => {
          const lineTotal = item.wholesale_price * quantity;
          return (
            <Card key={item.id} className="p-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-500 uppercase">{item.brand || 'General'}</p>
                <h4 className="text-sm font-bold text-slate-900 truncate">{item.name}</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pack: {item.unit_type} ({item.unit_value} {item.metric}) •{' '}
                  <span className="font-bold text-slate-700">{formatINR(item.wholesale_price)}</span>
                </p>
              </div>

              {/* Stepper & Line Total */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl p-0.5">
                  <button
                    onClick={() => updateQty(item.id, quantity - 1)}
                    className="w-7 h-7 rounded-lg text-slate-600 hover:bg-slate-200 flex items-center justify-center cursor-pointer transition-colors"
                  >
                    <Minus size={13} />
                  </button>
                  <span className="w-8 text-center text-xs font-extrabold text-slate-900">{quantity}</span>
                  <button
                    onClick={() => updateQty(item.id, quantity + 1)}
                    className="w-7 h-7 rounded-lg text-slate-600 hover:bg-slate-200 flex items-center justify-center cursor-pointer transition-colors"
                  >
                    <Plus size={13} />
                  </button>
                </div>

                <div className="text-right min-w-[70px]">
                  <p className="text-sm font-extrabold text-slate-900">{formatINR(lineTotal)}</p>
                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="text-[11px] text-red-500 hover:text-red-700 font-semibold cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Fulfillment Mode Selection (Required — Radio Cards) */}
      <Card className="p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
          {t('fulfillmentMode', lang)}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Staff Delivery Option */}
          <div
            onClick={() => setFulfillmentType('delivery')}
            className={cn(
              'p-3.5 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-3',
              fulfillmentType === 'delivery'
                ? 'border-emerald-600 bg-emerald-50/70 shadow-xs'
                : 'border-slate-200 bg-white hover:border-slate-300'
            )}
          >
            <div
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                fulfillmentType === 'delivery' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'
              )}
            >
              <Truck size={17} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900">{t('staffDelivery', lang)}</p>
              <p className="text-[11px] text-slate-500 leading-tight mt-0.5">
                {t('staffDeliveryDesc', lang)}
              </p>
              {customer?.address && (
                <p className="text-[11px] text-emerald-800 font-semibold mt-1.5 bg-emerald-100/60 px-2 py-0.5 rounded-md truncate">
                  📍 {customer.address}
                </p>
              )}
            </div>
          </div>

          {/* Self-Pickup Option */}
          <div
            onClick={() => setFulfillmentType('pickup')}
            className={cn(
              'p-3.5 rounded-xl border-2 transition-all cursor-pointer flex items-start gap-3',
              fulfillmentType === 'pickup'
                ? 'border-teal-600 bg-teal-50/70 shadow-xs'
                : 'border-slate-200 bg-white hover:border-slate-300'
            )}
          >
            <div
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                fulfillmentType === 'pickup' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'
              )}
            >
              <Store size={17} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900">{t('selfPickup', lang)}</p>
              <p className="text-[11px] text-slate-500 leading-tight mt-0.5">
                {t('selfPickupDesc', lang)}
              </p>
              <p className="text-[11px] text-teal-800 font-semibold mt-1.5 bg-teal-100/60 px-2 py-0.5 rounded-md truncate">
                🏪 {store?.address || store?.shop_name}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Order Notes / Special Delivery Instructions */}
      <Card className="p-4">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
          {t('orderNotes', lang)}
        </label>
        <Textarea
          rows={2}
          placeholder={t('orderNotesPlaceholder', lang)}
          value={orderNotes}
          onChange={(e) => setOrderNotes(e.target.value)}
        />
      </Card>

      {/* Bill Summary Card */}
      <Card className="p-4 bg-slate-50/80 border-slate-200">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3">
          {t('billSummary', lang)}
        </h3>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>{t('totalItems', lang)}</span>
            <span className="font-semibold text-slate-800">{totalItemsCount}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>{t('totalUnits', lang)}</span>
            <span className="font-semibold text-slate-800">{totalUnitsCount} units</span>
          </div>
          <div className="pt-2 border-t border-slate-200 flex justify-between items-baseline">
            <span className="font-bold text-slate-900">{t('estimatedTotal', lang)}</span>
            <span className="text-xl font-extrabold text-emerald-700">{formatINR(estimatedTotal)}</span>
          </div>
        </div>

        <p className="mt-3 text-[11px] text-slate-400 italic leading-snug">
          {t('billDisclaimer', lang)}
        </p>
      </Card>

      {/* Place Order CTA Sticky Bar */}
      <div className="sticky bottom-16 md:bottom-4 z-30 pt-2">
        <ClickSpark className="w-full" disabled={busy || items.length === 0} sparkColor={['#10b981', '#34d399']}>
          <Button
            onClick={handlePlaceOrder}
            disabled={busy || items.length === 0}
            className="w-full font-bold py-3.5 text-base shadow-lg shadow-emerald-700/20"
          >
            {busy ? (
              <div className="flex items-center gap-2">
                <Spinner label="" />
                <span>Processing Order...</span>
              </div>
            ) : (
              <div className="flex items-center justify-between w-full px-2">
                <div className="text-left">
                  <span className="block text-xs font-normal text-emerald-100">
                    {mergeWithActiveOrder && activeOpenOrder ? 'Merge into Active Order' : 'Total Payable'}
                  </span>
                  <span className="text-base font-extrabold">{formatINR(estimatedTotal)}</span>
                </div>
                <div className="flex items-center gap-1.5 font-extrabold">
                  <span>{mergeWithActiveOrder && activeOpenOrder ? 'Update Order' : t('placeOrder', lang)}</span>
                  <ArrowRight size={18} />
                </div>
              </div>
            )}
          </Button>
        </ClickSpark>
      </div>
    </div>
  );
}
