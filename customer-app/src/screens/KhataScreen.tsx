import { useState, useEffect, useMemo } from 'react';
import {
  CreditCard,
  QrCode,
  Copy,
  Check,
  FileDown,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight,
  User,
  Store,
  Phone,
  LogOut,
  Globe,
  Calendar,
  AlertCircle,
  Clock,
  Zap,
  Download,
  ExternalLink,
  CheckCircle2,
  ShieldCheck,
  RefreshCw,
  X,
  Sparkles,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { supabase } from '@/lib/supabase';
import { formatINR, formatDateTime, upiPayLink, telLink, waLink } from '@/lib/format';
import { t } from '@/lib/i18n';
import { generateCustomerKhataPDF } from '@/lib/pdf';
import { Button, Card, Badge, Modal, EmptyState, Spinner, useToast, CountUp, ClickSpark, cn } from '@/components/ui';
import type {
  KhataTransaction,
  Order,
  OrderItem,
  StoreUser,
  Lang,
  StorePaymentMode,
  PaymentTransaction,
} from '@/lib/types';

interface KhataScreenProps {
  onOpenOrderFromKhata: (orderId: string) => void;
}

export function KhataScreen({ onOpenOrderFromKhata }: KhataScreenProps) {
  const { customer, store, lang, setLang, signOut, refresh } = useCustomerAuth();
  const { show, node: toastNode } = useToast();

  const [transactions, setTransactions] = useState<KhataTransaction[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [storeUsers, setStoreUsers] = useState<StoreUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Gateway mode from wholesaler
  const [gatewayMode, setGatewayMode] = useState<StorePaymentMode | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState<'all' | 'debit' | 'credit'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'month' | 'three_months'>('all');

  // Copy UPI state
  const [copiedUpi, setCopiedUpi] = useState(false);

  // Order item detail modal when tapping on an order-linked entry
  const [selectedOrderForBill, setSelectedOrderForBill] = useState<Order | null>(null);
  const [selectedOrderLines, setSelectedOrderLines] = useState<OrderItem[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);

  // Direct Online Payment states
  const [amountModalOpen, setAmountModalOpen] = useState(false);
  const [payAmount, setPayAmount] = useState<number>(customer?.current_khata_balance || 0);
  const [initiatingPay, setInitiatingPay] = useState(false);
  const [activeTx, setActiveTx] = useState<{
    id: string;
    gatewayOrderId?: string;
    qrPayload?: string;
    paymentUrl?: string;
    provider?: string;
    amount: number;
    mode?: string;
  } | null>(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [confirmedReceipt, setConfirmedReceipt] = useState<{
    amount: number;
    utr: string;
    timestamp: string;
  } | null>(null);

  const balance = customer?.current_khata_balance || 0;
  const isSettled = balance <= 0;

  // Keep payAmount in sync with balance when modal opens
  useEffect(() => {
    if (balance > 0) {
      setPayAmount(balance);
    }
  }, [balance]);

  // Load gateway mode
  useEffect(() => {
    if (!customer?.store_id) return;
    let isMounted = true;

    async function fetchPaymentMode() {
      try {
        const { data, error } = await supabase.rpc('get_store_payment_mode', {
          p_store_id: customer!.store_id,
        });
        if (!error && data && isMounted) {
          setGatewayMode(data as StorePaymentMode);
        }
      } catch (err) {
        console.error('Error fetching store payment mode:', err);
      }
    }

    void fetchPaymentMode();
    return () => {
      isMounted = false;
    };
  }, [customer?.store_id]);

  async function loadKhataData() {
    if (!customer?.id || !customer.store_id) return;
    try {
      const [txRes, ordRes, usersRes] = await Promise.all([
        supabase
          .from('khata_transactions')
          .select('*')
          .eq('customer_id', customer.id)
          .order('created_at', { ascending: false }),
        supabase.from('orders').select('*').eq('customer_id', customer.id),
        supabase.from('store_users').select('*').eq('store_id', customer.store_id),
      ]);

      setTransactions((txRes.data as KhataTransaction[]) || []);
      setOrders((ordRes.data as Order[]) || []);
      setStoreUsers((usersRes.data as StoreUser[]) || []);
    } catch (err) {
      console.error('Error loading khata:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadKhataData();

    if (!customer?.id) return;

    // Realtime subscription on khata_transactions
    const channel = supabase
      .channel(`khata-screen-realtime-${customer.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'khata_transactions', filter: `customer_id=eq.${customer.id}` },
        () => {
          void loadKhataData();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [customer?.id]);

  // Realtime subscription for active payment transaction
  useEffect(() => {
    if (!activeTx?.id) return;

    const channel = supabase
      .channel(`tx-status-${activeTx.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'payment_transactions',
          filter: `id=eq.${activeTx.id}`,
        },
        (payload) => {
          const updated = payload.new as PaymentTransaction;
          if (updated && updated.status === 'success') {
            handlePaymentConfirmed(updated.amount, updated.utr_number || 'ONLINE');
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeTx?.id]);

  function handlePaymentConfirmed(amount: number, utr: string) {
    setQrModalOpen(false);
    setActiveTx(null);
    setConfirmedReceipt({
      amount,
      utr,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }),
    });

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

    void loadKhataData();
    void refresh();
  }

  // Monthly stats calculations
  const monthlyStats = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const monthEntries = transactions.filter((t) => t.created_at >= startOfMonth);

    const billed = monthEntries
      .filter((t) => t.type !== 'credit_payment')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const paid = monthEntries
      .filter((t) => t.type === 'credit_payment')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    return { billed, paid };
  }, [transactions]);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    const now = new Date();

    return transactions.filter((t) => {
      // Type filter
      if (typeFilter === 'debit' && t.type !== 'credit_payment') return false;
      if (typeFilter === 'credit' && t.type === 'credit_payment') return false;

      // Date filter
      if (dateFilter === 'month') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        if (new Date(t.created_at) < start) return false;
      } else if (dateFilter === 'three_months') {
        const start = new Date();
        start.setMonth(start.getMonth() - 3);
        if (new Date(t.created_at) < start) return false;
      }

      return true;
    });
  }, [transactions, typeFilter, dateFilter]);

  // Open itemized order bill on tapping a khata entry
  async function handleOpenOrderBill(orderId: string) {
    const ord = orders.find((o) => o.id === orderId);
    if (!ord) return;
    setSelectedOrderForBill(ord);
    setLoadingLines(true);
    const { data } = await supabase.from('order_items').select('*').eq('order_id', orderId);
    setSelectedOrderLines((data as OrderItem[]) || []);
    setLoadingLines(false);
  }

  // Copy UPI ID handler
  function handleCopyUpi() {
    if (!store?.upi_id) return;
    navigator.clipboard.writeText(store.upi_id);
    setCopiedUpi(true);
    show(t('copied', lang));
    setTimeout(() => setCopiedUpi(false), 2500);
  }

  // Initiate Online Khata Payment
  async function handleProceedPayment() {
    if (!customer?.id || !customer.store_id) return;
    if (payAmount <= 0) {
      show('Enter a valid payment amount', true);
      return;
    }
    if (payAmount > balance) {
      show(`Payment amount cannot exceed pending balance of ${formatINR(balance)}`, true);
      return;
    }

    setInitiatingPay(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-payment-order', {
        body: {
          store_id: customer.store_id,
          customer_id: customer.id,
          purpose: 'khata_payment',
          amount: payAmount,
        },
      });

      if (error || !data || !data.ok) {
        show(error?.message || data?.error || 'Failed to initiate payment', true);
        return;
      }

      setAmountModalOpen(false);

      if (data.provider === 'razorpay') {
        if (typeof (window as unknown as { Razorpay?: unknown }).Razorpay !== 'undefined') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const RazorpayClass = (window as any).Razorpay;
          const options = {
            key: data.keyId || gatewayMode?.public_key || '',
            amount: Math.round(payAmount * 100),
            currency: 'INR',
            name: store?.shop_name || 'Wholesale Store',
            description: `Khata Payment - ${customer.shop_name}`,
            order_id: data.gatewayOrderId,
            prefill: {
              name: customer.name || customer.shop_name,
              contact: customer.phone,
            },
            theme: { color: '#16a34a' },
            handler: function () {
              void handleManualStatusCheck(data.transactionId);
            },
            modal: {
              ondismiss: function () {
                // User closed modal
              },
            },
          };
          const rzp = new RazorpayClass(options);
          rzp.open();

          setActiveTx({
            id: data.transactionId,
            gatewayOrderId: data.gatewayOrderId,
            qrPayload: data.qrPayload,
            paymentUrl: data.paymentUrl,
            provider: 'razorpay',
            amount: payAmount,
            mode: data.mode,
          });
          return;
        }
      }

      // Default or custom_upi: show QR Modal
      setActiveTx({
        id: data.transactionId,
        gatewayOrderId: data.gatewayOrderId,
        qrPayload: data.qrPayload,
        paymentUrl: data.paymentUrl,
        provider: data.provider,
        amount: payAmount,
        mode: data.mode,
      });
      setQrModalOpen(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error connecting to payment gateway';
      show(msg, true);
    } finally {
      setInitiatingPay(false);
    }
  }

  // Check Status via Edge Function (supports simulate_success in test mode)
  async function handleManualStatusCheck(targetTxId?: string, simulate?: boolean) {
    const txId = targetTxId || activeTx?.id;
    if (!txId) return;

    setCheckingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-payment-status', {
        body: {
          transaction_id: txId,
          simulate_success: !!simulate,
        },
      });

      if (!error && data?.ok && data.status === 'success') {
        handlePaymentConfirmed(data.amount || payAmount, data.utr || 'TEST_UTR');
      } else {
        show('Payment is still pending. If already paid, please wait a few seconds and re-check.');
      }
    } catch {
      show('Could not verify status. Please retry in a moment.', true);
    } finally {
      setCheckingStatus(false);
    }
  }

  // Download PDF statement
  function handleDownloadStatement() {
    if (!store || !customer) return;

    let label = 'All Transactions';
    if (dateFilter === 'month') label = 'This Month';
    if (dateFilter === 'three_months') label = 'Last 3 Months';

    // Sort chronologically for PDF passbook
    const sorted = [...filteredTransactions].sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );

    let running = 0;
    const entries = sorted.map((k) => {
      const isDebit = k.type !== 'credit_payment';
      running = isDebit ? running + Number(k.amount) : running - Number(k.amount);
      const ord = orders.find((o) => o.id === k.order_id);

      return {
        date: formatDateTime(k.created_at),
        ref: ord?.order_number || (k.type === 'credit_payment' ? 'Payment' : 'Walk-in Udhaar'),
        detail: k.notes || (k.payment_mode ? `Mode: ${k.payment_mode}` : '—'),
        debit: isDebit ? Number(k.amount) : 0,
        credit: !isDebit ? Number(k.amount) : 0,
        balance: Number(k.balance_after || running),
      };
    });

    const openingBalance =
      sorted.length > 0
        ? sorted[0].balance_after -
          (sorted[0].type !== 'credit_payment' ? sorted[0].amount : -sorted[0].amount)
        : 0;
    const closingBalance = customer.current_khata_balance;

    generateCustomerKhataPDF({
      store,
      customer,
      rangeLabel: label,
      openingBalance: Math.max(0, openingBalance),
      entries,
      closingBalance,
    });
  }

  function getUserName(userId: string | null | undefined): string {
    if (!userId) return '';
    const u = storeUsers.find((x) => x.id === userId);
    return u ? u.name : 'Staff';
  }

  const isOnlinePaymentEnabled =
    gatewayMode?.is_enabled && gatewayMode.provider !== 'manual_upi';

  if (loading) {
    return <Spinner label="Loading Khata Passbook..." />;
  }

  return (
    <div className="space-y-4 pb-28 md:pb-8 w-full overflow-x-hidden">
      {toastNode}

      {/* 1. Custom Amount Payment Modal */}
      {amountModalOpen && (
        <Modal
          open={true}
          onClose={() => setAmountModalOpen(false)}
          title={t('payKhataNow', lang)}
        >
          <div className="space-y-4 pt-1">
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-emerald-800 block">
                  {t('pendingBalance', lang)}
                </span>
                <span className="text-xl font-extrabold text-emerald-950">
                  {formatINR(balance)}
                </span>
              </div>
              <Badge tone="green">Verified Khata</Badge>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                {t('customAmount', lang)} (₹)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500 font-extrabold text-base pointer-events-none">
                  ₹
                </span>
                <input
                  type="number"
                  min="1"
                  max={balance}
                  value={payAmount || ''}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setPayAmount(isNaN(val) ? 0 : val);
                  }}
                  className="w-full pl-9 pr-3 py-3 rounded-xl border border-slate-300 text-lg font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Enter amount"
                />
              </div>
            </div>

            {/* Quick Amount Selection Chips */}
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                Quick Select:
              </span>
              <div className="grid grid-cols-4 gap-2">
                {[500, 1000, 5000].map((amt) => {
                  if (amt > balance) return null;
                  return (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setPayAmount(amt)}
                      className={cn(
                        'py-2 px-1 text-xs font-bold rounded-xl border transition-all cursor-pointer',
                        payAmount === amt
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      )}
                    >
                      ₹{amt.toLocaleString('en-IN')}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setPayAmount(balance)}
                  className={cn(
                    'py-2 px-1 text-xs font-bold rounded-xl border transition-all cursor-pointer',
                    payAmount === balance
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                  )}
                >
                  {t('fullDue', lang)}
                </button>
              </div>
            </div>

            {payAmount > balance && (
              <p className="text-xs text-red-600 font-medium">
                Amount cannot exceed current pending balance ({formatINR(balance)})
              </p>
            )}

            <div className="pt-2">
              <ClickSpark
                className="w-full"
                disabled={initiatingPay || payAmount <= 0 || payAmount > balance}
                sparkColor={['#10b981', '#34d399']}
              >
                <Button
                  onClick={handleProceedPayment}
                  disabled={initiatingPay || payAmount <= 0 || payAmount > balance}
                  className="w-full py-3.5 font-extrabold text-base shadow-lg shadow-emerald-600/20"
                >
                  {initiatingPay ? (
                    <div className="flex items-center gap-2">
                      <Spinner label="" />
                      <span>Connecting Payment Gateway...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <Zap size={18} />
                      <span>Proceed to Pay {formatINR(payAmount)}</span>
                    </div>
                  )}
                </Button>
              </ClickSpark>
            </div>
          </div>
        </Modal>
      )}

      {/* 2. Scannable UPI QR Payment Modal */}
      {qrModalOpen && activeTx && (
        <Modal
          open={true}
          onClose={() => setQrModalOpen(false)}
          title={t('scanAndPay', lang)}
        >
          <div className="space-y-4 text-center pt-1">
            <div className="inline-block mx-auto bg-emerald-50 border border-emerald-200 px-4 py-1.5 rounded-full">
              <span className="text-xs text-emerald-800 font-bold">
                Payable Amount: <span className="text-sm font-black">{formatINR(activeTx.amount)}</span>
              </span>
            </div>

            {/* Live Dynamic UPI QR Code */}
            <div className="p-3 bg-white border border-slate-200 rounded-2xl inline-block shadow-md mx-auto">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=4&data=${encodeURIComponent(
                  activeTx.qrPayload || activeTx.paymentUrl || ''
                )}`}
                alt="UPI Payment QR"
                className="w-56 h-56 mx-auto rounded-lg"
              />
            </div>

            {/* Waiting for Confirmation Animated Indicator */}
            <div className="flex items-center justify-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50/80 py-2 px-3 rounded-xl border border-emerald-200/80">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-ping" />
              <span>{t('waitingConfirmation', lang)}</span>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed px-2">
              Scan with <strong>Google Pay, PhonePe, Paytm, BHIM</strong> or any UPI app. Your Khata balance will update instantly upon payment.
            </p>

            {/* Action Buttons */}
            <div className="space-y-2 pt-2">
              {/* Direct UPI Intent Link on Mobile */}
              <a
                href={activeTx.paymentUrl || activeTx.qrPayload || '#'}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm shadow-md transition-colors"
              >
                <ExternalLink size={16} />
                <span>{t('openInUpi', lang)}</span>
              </a>

              <div className="grid grid-cols-2 gap-2">
                <a
                  href={`https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=6&data=${encodeURIComponent(
                    activeTx.qrPayload || activeTx.paymentUrl || ''
                  )}`}
                  download="Khata_Payment_QR.png"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-xs transition-colors"
                >
                  <Download size={14} className="text-emerald-600" />
                  <span>{t('downloadQR', lang)}</span>
                </a>

                <button
                  type="button"
                  onClick={() => handleManualStatusCheck(activeTx.id)}
                  disabled={checkingStatus}
                  className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  <RefreshCw size={14} className={checkingStatus ? 'animate-spin' : ''} />
                  <span>{checkingStatus ? 'Checking...' : t('checkStatus', lang)}</span>
                </button>
              </div>

              {/* Wholesaler Test Mode Simulation Button */}
              {(activeTx.mode === 'test' || gatewayMode?.mode === 'test') && (
                <div className="pt-2 border-t border-slate-100">
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-left space-y-1.5">
                    <p className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
                      <span>🧪</span> Wholesaler Test Mode Active
                    </p>
                    <p className="text-[10px] text-amber-700 leading-snug">
                      Tap below to simulate a verified UPI payment without spending real money.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleManualStatusCheck(activeTx.id, true)}
                      disabled={checkingStatus}
                      className="w-full py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors cursor-pointer"
                    >
                      {t('simulateSuccess', lang)}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* 3. Confirmed Payment Receipt Modal */}
      {confirmedReceipt && (
        <Modal
          open={true}
          onClose={() => setConfirmedReceipt(null)}
          title={t('paymentReceipt', lang)}
        >
          <div className="text-center space-y-4 py-2">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 size={36} />
            </div>

            <div>
              <h3 className="text-xl font-extrabold text-slate-900">Payment Successful!</h3>
              <p className="text-xs text-slate-500 mt-1">
                Your payment has been received and credited to your Khata passbook.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs space-y-2.5 text-left">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Amount Paid</span>
                <span className="text-base font-extrabold text-emerald-700">
                  {formatINR(confirmedReceipt.amount)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Transaction / UTR</span>
                <span className="font-mono font-bold text-slate-800 text-[11px]">
                  {confirmedReceipt.utr}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Time</span>
                <span className="font-semibold text-slate-800">{confirmedReceipt.timestamp}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
                <span className="text-slate-700 font-bold">Remaining Due</span>
                <span className="font-extrabold text-slate-900">{formatINR(balance)}</span>
              </div>
            </div>

            <Button
              onClick={() => setConfirmedReceipt(null)}
              className="w-full font-bold py-3 text-sm"
            >
              Done / View Passbook
            </Button>
          </div>
        </Modal>
      )}

      {/* Itemized Order Modal on tapping a khata entry */}
      {selectedOrderForBill && (
        <Modal
          open={true}
          onClose={() => setSelectedOrderForBill(null)}
          title={`Order #${selectedOrderForBill.order_number} Bill`}
          wide
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500 pb-2 border-b">
              <span>Date: {formatDateTime(selectedOrderForBill.created_at)}</span>
              <span className="font-bold text-slate-800 uppercase">
                {selectedOrderForBill.fulfillment_type}
              </span>
            </div>

            {loadingLines ? (
              <Spinner label="Loading items..." />
            ) : (
              <div className="divide-y divide-slate-100">
                {selectedOrderLines.map((l) => (
                  <div key={l.id} className="py-2 flex justify-between items-center text-xs">
                    <div>
                      <p className="font-bold text-slate-900">{l.item_name_snapshot}</p>
                      <p className="text-slate-500">
                        {l.quantity} units × {formatINR(l.final_unit_price)}
                      </p>
                    </div>
                    <span className="font-bold text-slate-900">{formatINR(l.line_total)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-3 border-t border-slate-200 space-y-1 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>{formatINR(selectedOrderForBill.subtotal)}</span>
              </div>
              {selectedOrderForBill.discount_amount > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>Discount</span>
                  <span>- {formatINR(selectedOrderForBill.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between font-extrabold text-sm text-slate-900 pt-1">
                <span>Total Amount</span>
                <span className="text-emerald-800">{formatINR(selectedOrderForBill.final_total)}</span>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* 4. Large Total Pending Balance Card with 1-Click Pay via UPI */}
      <div
        className={cn(
          'rounded-3xl p-5 text-white shadow-md relative overflow-hidden transition-all',
          isSettled
            ? 'bg-gradient-to-br from-emerald-800 via-teal-700 to-emerald-900'
            : 'bg-gradient-to-br from-slate-900 via-slate-800 to-amber-950'
        )}
      >
        <div className="relative z-10">
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span className="font-medium tracking-wide uppercase">
              {t('pendingBalance', lang)}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/15 backdrop-blur-xs truncate max-w-[150px]">
              {customer?.shop_name}
            </span>
          </div>

          <p className="text-3xl sm:text-4xl font-black mt-2 tracking-tight">
            <CountUp
              to={balance}
              prefix="₹"
              decimals={Number.isInteger(balance) ? 0 : 2}
              locale="en-IN"
              duration={0.85}
              trigger="load"
            />
          </p>

          {isSettled ? (
            <p className="text-xs text-emerald-300 font-semibold mt-1">
              ✓ {t('settledClear', lang)}
            </p>
          ) : (
            <p className="text-xs text-amber-300/90 font-medium mt-1">
              Khata balance is due to {store?.shop_name}.
            </p>
          )}

          {/* Month Stats Row */}
          <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-white/10 text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">{t('billedThisMonth', lang)}</span>
              <span className="font-extrabold text-white text-sm">
                <CountUp
                  to={monthlyStats.billed}
                  prefix="₹"
                  decimals={Number.isInteger(monthlyStats.billed) ? 0 : 2}
                  locale="en-IN"
                  duration={0.85}
                  trigger="load"
                />
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[11px]">{t('paidThisMonth', lang)}</span>
              <span className="font-extrabold text-emerald-300 text-sm">
                <CountUp
                  to={monthlyStats.paid}
                  prefix="₹"
                  decimals={Number.isInteger(monthlyStats.paid) ? 0 : 2}
                  locale="en-IN"
                  duration={0.85}
                  trigger="load"
                />
              </span>
            </div>
          </div>

          {/* High Visibility 1-Click Pay CTA */}
          {balance > 0 && (
            <div className="mt-4 pt-3 border-t border-white/10 space-y-2">
              {isOnlinePaymentEnabled ? (
                <>
                  <button
                    onClick={() => {
                      setPayAmount(balance);
                      setAmountModalOpen(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400 text-slate-950 font-black text-sm shadow-lg shadow-emerald-500/25 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
                  >
                    <Zap size={18} className="fill-slate-950" />
                    <span>{t('payKhataNow', lang)}</span>
                  </button>

                  {/* Fallback Copy UPI ID / Manual Link */}
                  {store?.upi_id && (
                    <div className="flex items-center justify-center gap-3 pt-1 text-[11px] text-slate-300">
                      <button
                        onClick={handleCopyUpi}
                        className="hover:text-white underline underline-offset-2 flex items-center gap-1 cursor-pointer"
                      >
                        {copiedUpi ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        <span>{copiedUpi ? t('copied', lang) : t('copyUpiId', lang)}</span>
                      </button>
                      <span>•</span>
                      <a
                        href={upiPayLink(store.upi_id, store.shop_name, balance)}
                        className="hover:text-white underline underline-offset-2 flex items-center gap-1"
                      >
                        <QrCode size={12} />
                        <span>Manual UPI App Link</span>
                      </a>
                    </div>
                  )}
                </>
              ) : (
                /* Manual UPI Flow */
                store?.upi_id && (
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={upiPayLink(store.upi_id, store.shop_name, balance)}
                      className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-extrabold text-xs shadow-md transition-colors"
                    >
                      <QrCode size={16} />
                      <span>{t('payViaUPI', lang)}</span>
                    </a>

                    <button
                      onClick={handleCopyUpi}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-semibold text-xs backdrop-blur-xs transition-colors cursor-pointer"
                    >
                      {copiedUpi ? <Check size={14} className="text-emerald-300" /> : <Copy size={14} />}
                      <span>{copiedUpi ? t('copied', lang) : t('copyUpiId', lang)}</span>
                    </button>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* 5. Passbook Heading & Statement Download */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h3 className="text-base font-bold text-slate-900">{t('passbook', lang)}</h3>
          <p className="text-xs text-slate-500">Every udhaar, payment & order tracked transparently</p>
        </div>

        <button
          onClick={handleDownloadStatement}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs transition-colors cursor-pointer"
        >
          <FileDown size={14} className="text-emerald-600" />
          <span>Statement PDF</span>
        </button>
      </div>

      {/* 6. Filters: Type (All, Udhaar, Payment) + Date Range */}
      <div className="space-y-2">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          <button
            onClick={() => setTypeFilter('all')}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer shrink-0',
              typeFilter === 'all'
                ? 'bg-slate-800 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            )}
          >
            {t('filterAll', lang)} ({transactions.length})
          </button>
          <button
            onClick={() => setTypeFilter('debit')}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer shrink-0',
              typeFilter === 'debit'
                ? 'bg-red-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            )}
          >
            {t('filterDebit', lang)}
          </button>
          <button
            onClick={() => setTypeFilter('credit')}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer shrink-0',
              typeFilter === 'credit'
                ? 'bg-emerald-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            )}
          >
            {t('filterCredit', lang)}
          </button>

          <div className="h-4 w-px bg-slate-300 mx-1 self-center shrink-0" />

          <button
            onClick={() => setDateFilter('month')}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer shrink-0',
              dateFilter === 'month'
                ? 'bg-teal-700 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            )}
          >
            {t('filterMonth', lang)}
          </button>
          <button
            onClick={() => setDateFilter('three_months')}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer shrink-0',
              dateFilter === 'three_months'
                ? 'bg-teal-700 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            )}
          >
            {t('filterThreeMonths', lang)}
          </button>
        </div>
      </div>

      {/* 7. Passbook Transactions List */}
      {filteredTransactions.length === 0 ? (
        <EmptyState
          icon={<Clock size={36} />}
          title="No transactions found"
          message="Khata entries and payments recorded by your wholesaler will appear here."
        />
      ) : (
        <div className="space-y-2.5">
          {filteredTransactions.map((tx) => {
            const isCredit = tx.type === 'credit_payment';
            const ord = orders.find((o) => o.id === tx.order_id);
            const staffName = getUserName(tx.performed_by_user_id);

            return (
              <Card
                key={tx.id}
                onClick={() => {
                  if (tx.order_id) void handleOpenOrderBill(tx.order_id);
                }}
                className={cn(
                  'p-3.5 flex items-center justify-between gap-3 transition-colors',
                  tx.order_id ? 'cursor-pointer hover:bg-slate-50/80' : ''
                )}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={cn(
                      'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
                      isCredit ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                    )}
                  >
                    {isCredit ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {ord ? `Order #${ord.order_number}` : isCredit ? 'Payment Received' : 'Walk-in Udhaar'}
                      </span>
                      {ord && (
                        <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-1 rounded shrink-0">
                          View Bill
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                      {formatDateTime(tx.created_at)}
                      {staffName && ` • by ${staffName}`}
                      {tx.payment_mode && ` • ${tx.payment_mode}`}
                    </p>
                    {tx.notes && <p className="text-[11px] text-slate-500 italic mt-0.5 truncate">{tx.notes}</p>}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <p
                    className={cn(
                      'text-sm font-extrabold',
                      isCredit ? 'text-emerald-700' : 'text-red-600'
                    )}
                  >
                    {isCredit ? `- ${formatINR(tx.amount)}` : `+ ${formatINR(tx.amount)}`}
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium">
                    Bal: {formatINR(tx.balance_after)}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* 8. Profile & Wholesaler Info Card */}
      <div className="pt-4 border-t border-slate-200 space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Account & Store Details
        </h4>

        {/* Customer Details */}
        <Card className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <User size={15} className="text-emerald-600" />
            <span>Customer Profile</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs pt-1">
            <div>
              <span className="text-slate-400 block text-[10px]">Shop Name</span>
              <span className="font-semibold text-slate-800 truncate block">{customer?.shop_name}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Owner Name</span>
              <span className="font-semibold text-slate-800 truncate block">{customer?.name}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Mobile</span>
              <span className="font-semibold text-slate-800">+91 {customer?.phone}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Address</span>
              <span className="font-semibold text-slate-800 truncate block">
                {customer?.address || '—'}
              </span>
            </div>
          </div>
        </Card>

        {/* Wholesaler Details */}
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
              <Store size={15} className="text-emerald-600" />
              <span>Wholesaler Details</span>
            </div>
            {store?.phone && (
              <a
                href={telLink(store.phone)}
                className="text-xs font-bold text-emerald-700 flex items-center gap-1 hover:underline"
              >
                <Phone size={12} />
                <span>Call Store</span>
              </a>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs pt-1">
            <div>
              <span className="text-slate-400 block text-[10px]">Store Name</span>
              <span className="font-semibold text-slate-800 truncate block">{store?.shop_name}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Store Code</span>
              <span className="font-semibold text-slate-800">{store?.store_code}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Owner</span>
              <span className="font-semibold text-slate-800 truncate block">{store?.owner_name}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">UPI ID</span>
              <span className="font-semibold text-slate-800 truncate block">
                {store?.upi_id || 'Not Set'}
              </span>
            </div>
          </div>
        </Card>

        {/* Language Selection & Logout */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
              <Globe size={15} className="text-emerald-600" />
              <span>{t('language', lang)}</span>
            </div>
            <div className="flex gap-1">
              {(['en', 'hinglish', 'hi'] as Lang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors',
                    lang === l
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  )}
                >
                  {l === 'en' ? 'EN' : l === 'hinglish' ? 'Hinglish' : 'हिन्दी'}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <Button
              variant="secondary"
              onClick={signOut}
              className="w-full text-red-600 border-red-200 hover:bg-red-50"
            >
              <LogOut size={16} />
              <span>{t('logout', lang)}</span>
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
