import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useCustomerAuth } from './CustomerAuthContext';
import type { CartItem, InventoryItem, Order, FulfillmentType } from '@/lib/types';

interface CartContextState {
  items: CartItem[];
  addToCart: (item: InventoryItem, qty?: number) => void;
  updateQty: (itemId: string, qty: number) => void;
  removeFromCart: (itemId: string) => void;
  clearCart: () => void;
  getItemQty: (itemId: string) => number;
  totalItemsCount: number;
  totalUnitsCount: number;
  estimatedTotal: number;
  activeOpenOrder: Order | null;
  fulfillmentType: FulfillmentType;
  setFulfillmentType: (f: FulfillmentType) => void;
  orderNotes: string;
  setOrderNotes: (notes: string) => void;
  mergeWithActiveOrder: boolean;
  setMergeWithActiveOrder: (merge: boolean) => void;
  checkout: () => Promise<{ ok: boolean; orderNumber?: string; error?: string }>;
  refreshActiveOrder: () => Promise<void>;
  reorderItems: (orderItems: Array<{ item_id: string | null; quantity: number }>, inventoryList: InventoryItem[]) => void;
}

const CartContext = createContext<CartContextState | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { customer, store } = useCustomerAuth();
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('kirana_b2b_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeOpenOrder, setActiveOpenOrder] = useState<Order | null>(null);
  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>('delivery');
  const [orderNotes, setOrderNotes] = useState('');
  const [mergeWithActiveOrder, setMergeWithActiveOrder] = useState(true);

  // Save cart to localStorage
  useEffect(() => {
    localStorage.setItem('kirana_b2b_cart', JSON.stringify(items));
  }, [items]);

  // Load customer's latest active open order (status: 'placed' or 'seen')
  const refreshActiveOrder = useCallback(async () => {
    if (!customer?.id) {
      setActiveOpenOrder(null);
      return;
    }

    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('customer_id', customer.id)
      .in('status', ['placed', 'seen'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setActiveOpenOrder(data as Order);
      setMergeWithActiveOrder(true);
    } else {
      setActiveOpenOrder(null);
      setMergeWithActiveOrder(false);
    }
  }, [customer?.id]);

  useEffect(() => {
    void refreshActiveOrder();

    if (!customer?.id) return;

    // Realtime listener for order changes
    const channel = supabase
      .channel(`cust-orders-cart-${customer.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${customer.id}` },
        () => {
          void refreshActiveOrder();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [customer?.id, refreshActiveOrder]);

  const addToCart = (item: InventoryItem, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((c) => c.item.id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.item.id === item.id ? { ...c, quantity: c.quantity + qty } : c
        );
      }
      return [...prev, { item, quantity: qty }];
    });
  };

  const updateQty = (itemId: string, qty: number) => {
    if (qty <= 0) {
      removeFromCart(itemId);
      return;
    }
    setItems((prev) =>
      prev.map((c) => (c.item.id === itemId ? { ...c, quantity: qty } : c))
    );
  };

  const removeFromCart = (itemId: string) => {
    setItems((prev) => prev.filter((c) => c.item.id !== itemId));
  };

  const clearCart = () => {
    setItems([]);
    setOrderNotes('');
  };

  const getItemQty = (itemId: string): number => {
    const found = items.find((c) => c.item.id === itemId);
    return found ? found.quantity : 0;
  };

  const totalItemsCount = items.length;

  const totalUnitsCount = useMemo(() => {
    return items.reduce((acc, c) => acc + c.quantity, 0);
  }, [items]);

  const estimatedTotal = useMemo(() => {
    return items.reduce((acc, c) => acc + c.item.wholesale_price * c.quantity, 0);
  }, [items]);

  const reorderItems = (
    orderItems: Array<{ item_id: string | null; quantity: number }>,
    inventoryList: InventoryItem[]
  ) => {
    const itemMap = new Map(inventoryList.map((i) => [i.id, i]));
    const newItems: CartItem[] = [];

    orderItems.forEach((oi) => {
      if (oi.item_id && itemMap.has(oi.item_id)) {
        const inv = itemMap.get(oi.item_id)!;
        if (inv.is_visible_to_customers && inv.current_stock > 0) {
          newItems.push({ item: inv, quantity: oi.quantity });
        }
      }
    });

    if (newItems.length > 0) {
      setItems((prev) => {
        const merged = [...prev];
        newItems.forEach((ni) => {
          const idx = merged.findIndex((m) => m.item.id === ni.item.id);
          if (idx >= 0) {
            merged[idx].quantity += ni.quantity;
          } else {
            merged.push(ni);
          }
        });
        return merged;
      });
    }
  };

  const checkout = async (): Promise<{ ok: boolean; orderNumber?: string; error?: string }> => {
    if (!customer || !store) {
      return { ok: false, error: 'User session or store not loaded' };
    }
    if (items.length === 0) {
      return { ok: false, error: 'Your cart is empty' };
    }

    try {
      // 1. Check if merging into existing active order
      if (activeOpenOrder && mergeWithActiveOrder) {
        const orderId = activeOpenOrder.id;

        // Fetch existing lines for this order
        const { data: existingLines } = await supabase
          .from('order_items')
          .select('*')
          .eq('order_id', orderId);

        const existingMap = new Map((existingLines || []).map((l) => [l.item_id, l]));

        let addedAmount = 0;

        for (const cartItem of items) {
          const lineTotal = cartItem.item.wholesale_price * cartItem.quantity;
          addedAmount += lineTotal;

          if (existingMap.has(cartItem.item.id)) {
            const existingLine = existingMap.get(cartItem.item.id)!;
            const newQty = Number(existingLine.quantity) + cartItem.quantity;
            const newTotal = Number(existingLine.final_unit_price) * newQty;

            await supabase
              .from('order_items')
              .update({
                quantity: newQty,
                line_total: newTotal,
              })
              .eq('id', existingLine.id);
          } else {
            await supabase.from('order_items').insert({
              order_id: orderId,
              item_id: cartItem.item.id,
              item_name_snapshot: cartItem.item.name,
              quantity: cartItem.quantity,
              original_unit_price: cartItem.item.wholesale_price,
              final_unit_price: cartItem.item.wholesale_price,
              line_total: lineTotal,
            });
          }
        }

        // Update orders subtotal and final_total
        const updatedSubtotal = Number(activeOpenOrder.subtotal) + addedAmount;
        const updatedFinalTotal = Math.max(0, updatedSubtotal - Number(activeOpenOrder.discount_amount || 0));

        await supabase
          .from('orders')
          .update({
            subtotal: updatedSubtotal,
            final_total: updatedFinalTotal,
            updated_at: new Date().toISOString(),
          })
          .eq('id', orderId);

        clearCart();
        void refreshActiveOrder();

        return { ok: true, orderNumber: activeOpenOrder.order_number };
      }

      // 2. Otherwise create a brand new order
      let orderNumber = 'ORD-' + Math.floor(1000 + Math.random() * 9000);
      try {
        const { data: numData } = await supabase.rpc('next_order_number', { p_store_id: store.id });
        if (numData) orderNumber = numData;
      } catch (err) {
        console.warn('Fallback order number generator used:', err);
      }

      const subtotal = estimatedTotal;
      const finalTotal = subtotal;

      const { data: newOrderRow, error: orderErr } = await supabase
        .from('orders')
        .insert({
          store_id: store.id,
          customer_id: customer.id,
          order_number: orderNumber,
          fulfillment_type: fulfillmentType,
          status: 'placed',
          subtotal: subtotal,
          discount_amount: 0,
          final_total: finalTotal,
          delivery_notes: fulfillmentType === 'delivery' ? (orderNotes.trim() || null) : null,
          notes: orderNotes.trim() || null,
        })
        .select()
        .single();

      if (orderErr || !newOrderRow) {
        return { ok: false, error: orderErr?.message || 'Failed to place order' };
      }

      // Insert order items
      const lineRows = items.map((c) => ({
        order_id: newOrderRow.id,
        item_id: c.item.id,
        item_name_snapshot: c.item.name,
        quantity: c.quantity,
        original_unit_price: c.item.wholesale_price,
        final_unit_price: c.item.wholesale_price,
        line_total: c.item.wholesale_price * c.quantity,
      }));

      const { error: linesErr } = await supabase.from('order_items').insert(lineRows);
      if (linesErr) {
        console.error('Error inserting order items:', linesErr);
      }

      clearCart();
      void refreshActiveOrder();

      return { ok: true, orderNumber: newOrderRow.order_number };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Checkout failed';
      return { ok: false, error: msg };
    }
  };

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        updateQty,
        removeFromCart,
        clearCart,
        getItemQty,
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
        refreshActiveOrder,
        reorderItems,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
