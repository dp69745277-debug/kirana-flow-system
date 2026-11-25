import { useState } from 'react';
import { Store, Phone, Lock, ArrowRight, ShieldCheck } from 'lucide-react';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { Button, Input, Label, Card, useToast, Spinner, BlurText } from '@/components/ui';

export function AuthScreen() {
  const { login } = useCustomerAuth();
  const { show, node: toastNode } = useToast();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!/^\d{10}$/.test(phone)) {
      show('Enter a valid 10-digit mobile number', true);
      return;
    }
    if (!password) {
      show('Enter your password', true);
      return;
    }

    setBusy(true);
    const res = await login(phone, password);
    setBusy(false);

    if (!res.ok) {
      show(res.error || 'Login failed', true);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/60 via-slate-50 to-slate-100 flex flex-col items-center justify-center p-4">
      {toastNode}

      <div className="w-full max-w-md">
        {/* Top Brand Header */}
        <div className="text-center mb-6">
          <div className="mx-auto w-16 h-16 rounded-3xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30">
            <Store size={32} />
          </div>
          <BlurText
            as="h1"
            text="Kirana Wholesale B2B"
            delay={80}
            stepDuration={0.28}
            blur={6}
            distance={16}
            animateBy="words"
            direction="top"
            trigger="load"
            className="mt-4 text-2xl font-extrabold text-slate-900 tracking-tight justify-center"
          />
          <p className="text-sm text-slate-500 mt-1 font-medium">
            Retailer Portal • Direct Wholesaler Ordering & Khata
          </p>
        </div>

        {/* Login Card */}
        <Card className="p-6 sm:p-7 shadow-xl border-slate-200/80 bg-white">
          <div className="mb-5">
            <h2 className="text-lg font-bold text-slate-900">Retailer Login</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter your registered mobile number and password provided by your wholesaler.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label required>10-Digit Mobile Number</Label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Phone size={16} />
                </div>
                <Input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="e.g. 9811122233"
                  className="pl-10"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  disabled={busy}
                  autoFocus
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label required>Password</Label>
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <ShieldCheck size={12} className="text-emerald-600" />
                  Set by Wholesaler
                </span>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock size={16} />
                </div>
                <Input
                  type="password"
                  placeholder="Enter your password"
                  className="pl-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full mt-2 font-bold py-3 text-base"
              disabled={busy || phone.length !== 10 || !password}
            >
              {busy ? (
                <div className="flex items-center gap-2">
                  <Spinner label="" />
                  <span>Logging in...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <span>Login to Shop</span>
                  <ArrowRight size={18} />
                </div>
              )}
            </Button>
          </form>
        </Card>

        {/* Security / Wholesale Notice Footer */}
        <p className="mt-5 text-center text-xs text-slate-400 leading-relaxed px-4">
          Wholesale accounts are created directly by the Wholesaler. If you do not have an account, please contact your wholesaler with your shop details.
        </p>
      </div>
    </div>
  );
}
