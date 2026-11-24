import React, { useState } from 'react';
import { AdminAuthProvider, useAdminAuth } from '@/context/AdminAuthContext';
import { ToastProvider } from '@/components/ui';
import { Navbar, type NavTab } from '@/components/Navbar';
import { LoginScreen } from '@/screens/Login';
import { DashboardScreen } from '@/screens/Dashboard';
import { StoresScreen } from '@/screens/Stores';
import { PaymentsScreen } from '@/screens/Payments';
import { SettingsScreen } from '@/screens/Settings';
import { AdminsScreen } from '@/screens/Admins';
import type { Store as StoreModel } from '@/lib/types';
import { Loader2, Store } from 'lucide-react';

function AppContent() {
  const { user, admin, loading } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [selectedStore, setSelectedStore] = useState<StoreModel | null>(null);
  const [storeFilter, setStoreFilter] = useState<{ status?: string; type?: string } | undefined>();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/25 mb-4 animate-bounce">
          <Store className="w-6 h-6" />
        </div>
        <p className="text-sm font-bold tracking-tight">Kirana SaaS Control Panel</p>
        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifying Super Admin Privileges...
        </p>
      </div>
    );
  }

  if (!user || !admin) {
    return <LoginScreen />;
  }

  const handleNavigateToStores = (filter?: { status?: string; type?: string }) => {
    setStoreFilter(filter);
    setActiveTab('stores');
  };

  const handleSelectStoreFromDashboard = (store: StoreModel) => {
    setSelectedStore(store);
    setActiveTab('stores');
  };

  return (
    <div className="min-h-screen bg-slate-50/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {activeTab === 'dashboard' && (
          <DashboardScreen
            onNavigateToStores={handleNavigateToStores}
            onNavigateToPayments={() => setActiveTab('payments')}
            onSelectStore={handleSelectStoreFromDashboard}
          />
        )}

        {activeTab === 'stores' && (
          <StoresScreen
            initialFilter={storeFilter}
            selectedStore={selectedStore}
            onSelectStore={setSelectedStore}
          />
        )}

        {activeTab === 'payments' && <PaymentsScreen />}

        {activeTab === 'settings' && <SettingsScreen />}

        {activeTab === 'admins' && <AdminsScreen />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AdminAuthProvider>
        <AppContent />
      </AdminAuthProvider>
    </ToastProvider>
  );
}
