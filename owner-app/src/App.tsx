import { useState } from 'react';
import { AppProvider, useApp } from '@/context/AppContext';
import Shell from '@/components/Shell';
import type { PageKey } from '@/components/Shell';
import AuthScreen from '@/screens/Auth';
import SuspendedScreen from '@/screens/Suspended';
import Dashboard from '@/screens/Dashboard';
import StaffDashboard from '@/screens/StaffDashboard';
import Inventory from '@/screens/Inventory';
import Orders from '@/screens/Orders';
import Customers from '@/screens/Customers';
import Hisaab from '@/screens/Hisaab';
import AgenciesScreen from '@/screens/Agencies';
import DeadStock from '@/screens/DeadStock';
import Reports from '@/screens/Reports';
import Staff from '@/screens/Staff';
import Profile from '@/screens/Profile';
import { Spinner } from '@/components/ui';

function Router() {
  const { loading, session, store, hasFeature, isOwner } = useApp();
  const [page, setPage] = useState<PageKey>('dashboard');

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Spinner label="Loading…" /></div>;
  if (!session) return <AuthScreen />;
  const isBlockedOrExpired = store && (
    !store.is_active ||
    store.subscription_status === 'expired' ||
    store.subscription_status === 'suspended' ||
    (store.subscription_status === 'trial' && store.trial_ends_at && new Date(store.trial_ends_at).getTime() < Date.now()) ||
    (store.subscription_status === 'active' && store.subscription_ends_at && new Date(store.subscription_ends_at).getTime() < Date.now())
  );
  if (isBlockedOrExpired) return <SuspendedScreen />;
  if (!store) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <p className="text-slate-500 text-sm">Account not linked to a store. Contact your store owner.</p>
      </div>
    );
  }

  const wholesaleOk = store.store_type !== 'retail' && hasFeature('wholesale_module');
  if (page === 'orders' && !wholesaleOk) setPage('dashboard');
  if (page === 'customers' && !wholesaleOk) setPage('dashboard');
  if (page === 'staff' && !isOwner) setPage('dashboard');
  if (page === 'hisaab' && !isOwner) setPage('dashboard');
  if (page === 'reports' && !isOwner) setPage('dashboard');

  const screens: Record<PageKey, React.ReactNode> = {
    dashboard: isOwner ? <Dashboard setPage={setPage} /> : <StaffDashboard setPage={setPage} />,
    inventory: <Inventory />,
    orders: <Orders />,
    customers: <Customers />,
    hisaab: <Hisaab />,
    agencies: <AgenciesScreen />,
    deadstock: <DeadStock />,
    reports: <Reports />,
    staff: <Staff />,
    profile: <Profile />,
  };

  return (
    <Shell page={page} setPage={setPage}>
      {screens[page]}
    </Shell>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Router />
    </AppProvider>
  );
}
