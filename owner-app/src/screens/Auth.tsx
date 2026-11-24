import { useState } from 'react';
import { Store as StoreIcon, ChevronLeft, CheckCircle2, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/context/AppContext';
import { Button, Input, Label, Card, cn, useToast, Spinner } from '@/components/ui';
import type { Store, StoreType } from '@/lib/types';
import { seedDemoData } from '@/lib/seed';

const STORE_TYPES: Array<{ value: StoreType; title: string; desc: string; features: string[] }> = [
  {
    value: 'retail',
    title: 'Retail',
    desc: 'Counter sales and godown management',
    features: ['Godown & Inventory', 'Daily Hisaab', 'Agencies', 'Dead Stock', 'Reports', 'Staff'],
  },
  {
    value: 'wholesale',
    title: 'Wholesale',
    desc: 'B2B orders with full retail features',
    features: ['Everything in Retail', 'Wholesale Orders', 'Customer Directory', 'Khata / Udhaar Ledger', 'WhatsApp Invoicing'],
  },
  {
    value: 'mix',
    title: 'Wholesale + Retail (Mix)',
    desc: 'Both models together',
    features: ['All features enabled', 'Manual retail stock-out', 'Automated wholesale order deduction'],
  },
];

export default function AuthScreen({ onBack }: { onBack?: () => void }) {
  const [mode, setMode] = useState<'login' | 'register' | 'storeType'>('login');
  const [busy, setBusy] = useState(false);
  const { show, node: toastNode } = useToast();
  const { refresh, setStore } = useApp();

  // register fields
  const [ownerName, setOwnerName] = useState('');
  const [shopName, setShopName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [storeType, setStoreType] = useState<StoreType>('retail');
  const [registeredStoreId, setRegisteredStoreId] = useState<string | null>(null);

  async function handleRegisterStep1() {
    if (!ownerName.trim() || !shopName.trim() || !address.trim()) return show('Please fill all fields', true);
    if (!/^\d{10}$/.test(phone)) return show('Mobile number must be exactly 10 digits', true);
    if (password.length < 8) return show('Password must be at least 8 characters', true);
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return show('Password must contain at least one letter and one number', true);
    }
    if (password !== confirm) return show('Passwords do not match', true);

    setBusy(true);
    // Pre-check if phone is already registered in stores before advancing to Step 2
    const { data: existing, error: checkErr } = await supabase
      .from('stores')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();
    setBusy(false);

    if (checkErr && checkErr.code !== 'PGRST116') {
      console.warn('Check error:', checkErr);
    }
    if (existing) {
      return show('This mobile number is already registered. Please login.', true);
    }

    // Advance to Step 2 WITHOUT inserting any premature 'retail' row into stores
    setMode('storeType');
  }

  async function handleChooseStoreType(type: StoreType, withDemo: boolean) {
    const cleanType: StoreType = (type.toLowerCase().trim() as StoreType);
    if (!['retail', 'wholesale', 'mix'].includes(cleanType)) {
      return show('Invalid store type selected', true);
    }

    setBusy(true);
    setStoreType(cleanType);

    // Step 1: Create store and owner account directly with chosen storeType
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/signup-owner`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        ownerName: ownerName.trim(),
        shopName: shopName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        password,
        storeType: cleanType,
      }),
    });

    const body = await res.json();
    if (!res.ok) {
      setBusy(false);
      return show(body.error ?? 'Registration failed', true);
    }

    // Step 2: Sign in client-side to obtain session
    const email = `${phone}@kirana.app`;
    const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password });
    if (loginErr) {
      setBusy(false);
      return show(`Account created, but login failed: ${loginErr.message}`, true);
    }

    // Step 3: Explicitly update stores table to ensure store_type & feature_flags match with 100% certainty
    const isWholesale = cleanType === 'wholesale' || cleanType === 'mix';
    const featureFlags: Record<string, boolean | number> = {
      retail_module: true,
      godown_inventory: true,
      daily_hisaab: true,
      agencies: true,
      dead_stock_tracker: true,
      reports: true,
      staff_module: true,
      wholesale_module: isWholesale,
      wholesale_orders: isWholesale,
      customer_directory: isWholesale,
      khata_ledger: isWholesale,
      whatsapp_reminders: isWholesale,
      customer_app_accounts: isWholesale,
      pdf_exports: true,
      max_staff_limit: 10,
    };

    const { data: updatedStore, error: updateErr } = await supabase
      .from('stores')
      .update({
        store_type: cleanType,
        feature_flags: featureFlags,
      })
      .eq('phone', phone)
      .select('*')
      .single();

    if (updateErr) {
      console.error('Store type update error:', updateErr);
      show(`Store created, but setting store type returned: ${updateErr.message}`, true);
    }

    // Step 4: If demo data was requested, seed it
    if (withDemo) {
      const storeToSeed = updatedStore || (await supabase.from('stores').select('*').eq('phone', phone).maybeSingle()).data;
      if (storeToSeed) {
        const seeded = await seedDemoData(storeToSeed as never);
        if (!seeded.ok) show(seeded.error ?? 'Seed failed', true);
      }
    }

    // Step 5: Immediately update in-memory store & trigger AuthContext refresh before redirecting
    if (updatedStore) {
      setStore(updatedStore as Store);
    }
    await refresh();

    setBusy(false);
    setRegisteredStoreId('ok');
  }

  async function handleLogin() {
    if (!/^\d{10}$/.test(phone)) return show('Enter your 10-digit mobile number', true);
    if (!password) return show('Enter your password', true);
    setBusy(true);
    const email = `${phone}@kirana.app`;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return show(error.message === 'Invalid login credentials' ? 'Wrong mobile number or password' : error.message, true);
  }

  if (registeredStoreId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        {toastNode}
        <Card className="p-8 max-w-md text-center">
          <CheckCircle2 className="mx-auto text-emerald-600 mb-3" size={44} />
          <h1 className="text-xl font-bold text-slate-900">Store created!</h1>
          <p className="mt-2 text-sm text-slate-500">Loading your dashboard…</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      {toastNode}
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/20">
            <StoreIcon size={28} />
          </div>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">KiranaHisab</h1>
          <p className="text-sm text-slate-500">Smart store management for Indian kirana</p>
        </div>

        <Card className="p-5">
          {mode === 'login' && (
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Login</h2>
              <p className="text-xs text-slate-500 mb-4">Owner & staff — mobile number + password</p>
              <div className="space-y-3">
                <div>
                  <Label required>Mobile Number</Label>
                  <Input inputMode="numeric" maxLength={10} placeholder="10-digit mobile" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
                </div>
                <div>
                  <Label required>Password</Label>
                  <Input type="password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
                </div>
                <Button className="w-full" onClick={handleLogin} disabled={busy}>
                  {busy ? <Spinner label="" /> : 'Login'}
                </Button>
              </div>
              <p className="mt-4 text-center text-sm text-slate-500">
                New store?{' '}
                <button className="font-medium text-emerald-700 hover:underline" onClick={() => setMode('register')}>Register your store</button>
              </p>
            </div>
          )}

          {mode === 'register' && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                {onBack && <button onClick={onBack} className="p-1 rounded hover:bg-slate-100"><ChevronLeft size={18} /></button>}
                <h2 className="text-lg font-semibold text-slate-900">Register Store</h2>
              </div>
              <p className="text-xs text-slate-500 mb-4">Step 1 of 2 — Owner & shop details</p>
              <div className="space-y-3">
                <div>
                  <Label required>Owner Full Name</Label>
                  <Input placeholder="e.g. Rajesh Kumar" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
                </div>
                <div>
                  <Label required>Shop Name</Label>
                  <Input placeholder="e.g. Kumar Kirana Store" value={shopName} onChange={(e) => setShopName(e.target.value)} />
                </div>
                <div>
                  <Label required>Mobile Number</Label>
                  <Input inputMode="numeric" maxLength={10} placeholder="This is your login ID" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
                </div>
                <div>
                  <Label required>Shop Address</Label>
                  <Input placeholder="Shop address" value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label required>Password</Label>
                    <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <div>
                    <Label required>Confirm</Label>
                    <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                  </div>
                </div>
                <Button className="w-full" onClick={handleRegisterStep1} disabled={busy}>
                  {busy ? 'Creating…' : 'Continue'}
                </Button>
              </div>
              <p className="mt-4 text-center text-sm text-slate-500">
                Already registered?{' '}
                <button className="font-medium text-emerald-700 hover:underline" onClick={() => setMode('login')}>Login</button>
              </p>
            </div>
          )}

          {mode === 'storeType' && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <button onClick={() => setMode('register')} className="p-1 rounded hover:bg-slate-100"><ChevronLeft size={18} /></button>
                <h2 className="text-lg font-semibold text-slate-900">Business Type</h2>
              </div>
              <p className="text-xs text-slate-500 mb-4">Step 2 of 2 — choose how your store works</p>
              <div className="space-y-3">
                {STORE_TYPES.map((st) => (
                  <div key={st.value} className="rounded-xl border border-slate-200 p-3.5 hover:border-emerald-400 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-slate-900">{st.title}</p>
                        <p className="text-xs text-slate-500">{st.desc}</p>
                      </div>
                      <Button
                        variant="secondary"
                        className="shrink-0"
                        onClick={() => handleChooseStoreType(st.value, false)}
                        disabled={busy}
                      >
                        Choose
                      </Button>
                    </div>
                    <ul className="mt-2.5 flex flex-wrap gap-1.5">
                      {st.features.map((f) => (
                        <li key={f} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{f}</li>
                      ))}
                    </ul>
                    <button
                      className={cn('mt-2.5 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50')}
                      onClick={() => handleChooseStoreType(st.value, true)}
                      disabled={busy}
                    >
                      <Sparkles size={13} /> Choose + load demo data
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
