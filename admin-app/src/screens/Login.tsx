import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
} from 'lucide-react';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { Button, Input, Label, Card, Badge } from '@/components/ui';

export const LoginScreen: React.FC = () => {
  const { signIn } = useAdminAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await signIn(identifier, password);
    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Failed to authenticate');
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 sm:p-6 bg-gradient-to-br from-slate-50 via-slate-100 to-emerald-50 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20 text-slate-900 dark:text-slate-100">
      {/* Decorative background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md space-y-6 relative z-10">
        {/* Header Icon & Title */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-500/25 mb-1">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Kirana<span className="text-emerald-600 dark:text-emerald-400">SaaS</span> Super Admin
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
            Authorized portal for platform creator & operations. Connected to shared production database.
          </p>
        </div>

        {/* Login Card */}
        <Card className="p-6 sm:p-8 backdrop-blur-xl bg-white/95 dark:bg-slate-900/90 shadow-xl border-slate-200/80 dark:border-slate-800">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Admin Authentication
              </span>
              <Badge variant="emerald" size="xs">
                Protected Portal
              </Badge>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-medium">
                {error}
              </div>
            )}

            <div>
              <Label required>Email or 10-Digit Mobile</Label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Enter email or 10-digit mobile"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="pl-9 font-medium"
                  autoFocus
                  required
                />
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                Enter your registered admin email or mobile number.
              </p>
            </div>

            <div>
              <Label required>Password</Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your admin password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 pr-10 font-medium"
                  required
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full mt-2"
              loading={loading}
              icon={<ArrowRight className="w-4 h-4" />}
            >
              Sign In to Super Admin
            </Button>
          </form>
        </Card>

        {/* Security Footer */}
        <div className="text-center text-[11px] text-slate-400 dark:text-slate-600 flex items-center justify-center gap-2">
          <span>Row Level Security (RLS) Active</span>
          <span>•</span>
          <span>PostgreSQL 17</span>
          <span>•</span>
          <span>Role: Super Admin</span>
        </div>
      </div>
    </div>
  );
};
