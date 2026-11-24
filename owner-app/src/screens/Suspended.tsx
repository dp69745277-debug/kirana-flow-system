import { useState, useEffect } from 'react';
import {
  ShieldOff,
  LifeBuoy,
  Clock,
  CreditCard,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Phone,
  MessageSquare,
  Lock,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/context/AppContext';
import { Button, Card } from '@/components/ui';

export default function SuspendedScreen() {
  const { store, signOut, refresh } = useApp();
  const [access, setAccess] = useState<{
    allowed: boolean;
    reason: 'active' | 'trial_expired' | 'suspended' | 'not_found';
    days_left: number;
    amount_due: number;
    store_name?: string;
    admin_whatsapp?: string;
    admin_phone?: string;
    admin_upi_id?: string;
    gateway_enabled?: boolean;
    gateway_provider?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [orderData, setOrderData] = useState<{
    payment_id?: string;
    gateway_order_id?: string;
    qr_payload?: string;
    payment_url?: string;
    admin_upi_id?: string;
    amount?: number;
  } | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (store?.id) {
      supabase.rpc('get_store_access_status', { p_store_id: store.id })
        .then(({ data, error }) => {
          setLoading(false);
          if (!error && data) {
            setAccess(data);
          }
        })
        .catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [store?.id]);

  const isExpired = access?.reason === 'trial_expired' || (store?.subscription_status === 'trial' && store?.trial_ends_at && new Date(store.trial_ends_at).getTime() < Date.now());
  const isSuspended = access?.reason === 'suspended' || !store?.is_active;

  // Pay Now: invokes create-saas-renewal-order
  const handlePayNow = async () => {
    if (!store?.id) return;
    try {
      setPaying(true);
      const res = await supabase.functions.invoke('create-saas-renewal-order', {
        body: {
          store_id: store.id,
          plan_name: 'pro',
          billing_cycle: 'monthly',
          days_to_add: 30,
        },
      });

      if (res.error) throw res.error;
      setOrderData(res.data);

      if (res.data?.payment_url && window.innerWidth < 768) {
        window.open(res.data.payment_url, '_blank');
      }
    } catch (err: unknown) {
      alert((err as Error).message || 'Failed to initiate SaaS renewal order');
    } finally {
      setPaying(false);
    }
  };

  // Verify payment webhook call / manual check
  const handleVerifyPayment = async () => {
    if (!orderData?.gateway_order_id) return;
    try {
      setVerifying(true);
      const res = await supabase.functions.invoke('verify-saas-renewal-webhook', {
        body: {
          gateway_order_id: orderData.gateway_order_id,
          payment_id: orderData.payment_id,
        },
      });

      if (res.data?.ok) {
        alert('Payment verified! Your Kirana store subscription is renewed.');
        await refresh();
      } else {
        alert('Payment not verified yet. If you paid via UPI, please allow 10-30 seconds or reach out to support.');
      }
    } catch (err: unknown) {
      alert((err as Error).message || 'Verification check error');
    } finally {
      setVerifying(false);
    }
  };

  const handleContactWhatsApp = () => {
    const phone = access?.admin_whatsapp || '9876543210';
    const clean = phone.replace(/\D/g, '');
    const full = clean.startsWith('91') ? clean : `91${clean}`;
    const text = `Namaste! My Kirana store "${store?.shop_name}" (${store?.store_code}) demo has ended. I want to renew access.`;
    window.open(`https://wa.me/${full}?text=${encodeURIComponent(text)}`, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-emerald-50 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20 flex items-center justify-center p-4">
      <Card className="p-6 sm:p-8 max-w-md w-full text-center space-y-5 bg-white dark:bg-slate-900 shadow-2xl border-slate-200 dark:border-slate-800">
        {/* Header Icon */}
        <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg">
          {isExpired ? (
            <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Clock size={32} />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <ShieldOff size={32} />
            </div>
          )}
        </div>

        {/* Title & Shop Info */}
        <div>
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            {store?.store_code}
          </span>
          <h1 className="mt-2 text-xl font-extrabold text-slate-900 dark:text-white">
            {isExpired ? 'Free 3-Day Demo Expired' : 'Store Access Suspended'}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {isExpired
              ? `Your free trial for "${store?.shop_name}" has ended. Renew now to restore instant access to your billing, godown inventory, orders, and customer apps.`
              : `Access for "${store?.shop_name}" has been temporarily suspended by the platform administrator. Your data remains completely safe.`}
          </p>
        </div>

        {/* Expired Renewal Pricing Box */}
        {isExpired && (
          <div className="p-4 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-left space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                Monthly Renewal Price:
              </span>
              <span className="text-2xl font-black text-emerald-700 dark:text-emerald-400 tabular-nums">
                ₹{access?.amount_due || store?.custom_plan_price || 499}
                <span className="text-xs font-normal text-slate-500">/mo</span>
              </span>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
              <div>✓ Unlimited inventory items & barcode billing</div>
              <div>✓ Wholesale B2B orders & Khata ledger</div>
              <div>✓ Wholesale Customer App access</div>
              <div>✓ 1-click WhatsApp invoicing</div>
            </div>

            {/* Pay Now or QR state */}
            {!orderData ? (
              <Button
                variant="primary"
                className="w-full mt-2"
                onClick={handlePayNow}
                loading={paying}
                icon={<CreditCard className="w-4 h-4" />}
              >
                Pay Now (₹{access?.amount_due || store?.custom_plan_price || 499})
              </Button>
            ) : (
              <div className="pt-2 text-center space-y-3">
                <div className="p-3 bg-white rounded-xl border border-slate-200 inline-block shadow-sm">
                  <p className="text-[11px] font-bold text-slate-600 mb-1">Scan & Pay via any UPI App</p>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(orderData.qr_payload || '')}`}
                    alt="UPI QR"
                    className="w-36 h-36 mx-auto"
                  />
                  <p className="font-mono text-[11px] text-slate-500 mt-1">{orderData.admin_upi_id}</p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-full"
                    onClick={handleVerifyPayment}
                    loading={verifying}
                  >
                    I Have Paid (Verify & Open)
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Contact Support & Sign Out */}
        <div className="space-y-2 pt-2">
          <Button
            variant="outline"
            className="w-full text-slate-700 dark:text-slate-300"
            onClick={handleContactWhatsApp}
            icon={<MessageSquare className="w-4 h-4 text-emerald-600" />}
          >
            Chat with Platform Support on WhatsApp
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="w-full text-slate-400 hover:text-rose-600"
            onClick={() => signOut()}
          >
            Sign Out
          </Button>
        </div>
      </Card>
    </div>
  );
}
