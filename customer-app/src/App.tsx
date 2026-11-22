import { useState, useEffect } from 'react';
import { CustomerAuthProvider, useCustomerAuth } from '@/context/CustomerAuthContext';
import { CartProvider } from '@/context/CartContext';
import { Navbar } from '@/components/Navbar';
import { BottomNav } from '@/components/BottomNav';
import { AuthScreen } from '@/screens/AuthScreen';
import { SuspendedScreen } from '@/screens/SuspendedScreen';
import { ShopScreen } from '@/screens/ShopScreen';
import { CartScreen } from '@/screens/CartScreen';
import { OrdersScreen } from '@/screens/OrdersScreen';
import { KhataScreen } from '@/screens/KhataScreen';
import { Spinner } from '@/components/ui';
import { supabase } from '@/lib/supabase';

function MainApp() {
  const {
    loading,
    customer,
    store,
    isStoreSuspended,
    isCustomerInactive,
    isStoreTypeMismatch,
  } = useCustomerAuth();

  const [activeTab, setActiveTab] = useState<'shop' | 'cart' | 'orders' | 'khata'>('shop');
  const [selectedOrderIdForTracking, setSelectedOrderIdForTracking] = useState<string | null>(null);
  const [activeOrderCount, setActiveOrderCount] = useState<number>(0);

  // Poll / Realtime active order count for nav badge
  useEffect(() => {
    if (!customer?.id) {
      setActiveOrderCount(0);
      return;
    }

    async function fetchActiveCount() {
      const { count } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('customer_id', customer!.id)
        .in('status', ['placed', 'seen', 'packed', 'out_for_delivery', 'ready_for_pickup']);

      setActiveOrderCount(count || 0);
    }

    void fetchActiveCount();

    const channel = supabase
      .channel(`badge-orders-${customer.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${customer.id}` },
        () => {
          void fetchActiveCount();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [customer?.id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spinner label="Loading Kirana Wholesale Portal..." />
      </div>
    );
  }

  // If not logged in, show Auth
  if (!customer || !store) {
    return <AuthScreen />;
  }

  // Kill Switch & Store Check Validations
  if (isStoreSuspended) {
    return <SuspendedScreen reason="store_suspended" />;
  }

  if (isCustomerInactive) {
    return <SuspendedScreen reason="customer_inactive" />;
  }

  if (isStoreTypeMismatch) {
    return <SuspendedScreen reason="store_type_mismatch" />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col selection:bg-emerald-500 selection:text-white w-full overflow-x-hidden">
      {/* Top Sticky App Bar */}
      <Navbar activeTab={activeTab} onSelectTab={(tab) => setActiveTab(tab as typeof activeTab)} />

      <div className="flex-1 flex max-w-7xl w-full mx-auto overflow-x-hidden">
        {/* Left Sidebar on Desktop */}
        <BottomNav
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setActiveTab(tab as typeof activeTab);
            if (tab !== 'orders') setSelectedOrderIdForTracking(null);
          }}
          activeOrderCount={activeOrderCount}
        />

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 p-3 sm:p-5 lg:p-6 max-w-5xl w-full overflow-x-hidden">
          {activeTab === 'shop' && (
            <ShopScreen
              onNavigateToTab={(tab) => setActiveTab(tab as typeof activeTab)}
              onOpenOrderTracker={(orderId) => {
                setSelectedOrderIdForTracking(orderId);
                setActiveTab('orders');
              }}
            />
          )}

          {activeTab === 'cart' && (
            <CartScreen
              onNavigateToTab={(tab) => setActiveTab(tab as typeof activeTab)}
              onOrderCompleted={(orderNum) => {
                setActiveTab('orders');
              }}
            />
          )}

          {activeTab === 'orders' && (
            <OrdersScreen
              onNavigateToTab={(tab) => setActiveTab(tab as typeof activeTab)}
              selectedOrderIdFromShop={selectedOrderIdForTracking}
            />
          )}

          {activeTab === 'khata' && (
            <KhataScreen
              onOpenOrderFromKhata={(orderId) => {
                setSelectedOrderIdForTracking(orderId);
                setActiveTab('orders');
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <CustomerAuthProvider>
      <CartProvider>
        <MainApp />
      </CartProvider>
    </CustomerAuthProvider>
  );
}
