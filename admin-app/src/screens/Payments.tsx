import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Store,
  DollarSign,
  Download,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { SaasPayment, Store as StoreModel } from '@/lib/types';
import { Card, Button, Input, Select, Badge, useToast } from '@/components/ui';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import { RecordPaymentModal } from '@/components/RecordPaymentModal';

export const PaymentsScreen: React.FC = () => {
  const { toast } = useToast();
  const [payments, setPayments] = useState<SaasPayment[]>([]);
  const [stores, setStores] = useState<StoreModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [payRes, storeRes] = await Promise.all([
        supabase
          .from('saas_payments')
          .select('*, store:stores(shop_name, store_code, owner_name, phone, custom_plan_price)')
          .order('created_at', { ascending: false }),
        supabase.from('stores').select('*').order('shop_name'),
      ]);

      if (payRes.error) throw payRes.error;
      if (storeRes.error) throw storeRes.error;

      setPayments((payRes.data as SaasPayment[]) || []);
      setStores((storeRes.data as StoreModel[]) || []);
    } catch (err: unknown) {
      toast((err as Error).message || 'Failed to load payments', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredPayments = payments.filter((p) => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const shop = p.store?.shop_name?.toLowerCase() || '';
      const code = p.store?.store_code?.toLowerCase() || '';
      const utr = (p.utr_number || '').toLowerCase();
      const orderId = (p.gateway_order_id || '').toLowerCase();
      if (!shop.includes(q) && !code.includes(q) && !utr.includes(q) && !orderId.includes(q)) {
        return false;
      }
    }
    return true;
  });

  const totalCollected = payments
    .filter((p) => p.status === 'success')
    .reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <span>SaaS Subscription Payments</span>
            <Badge variant="emerald" size="sm">
              Total: {formatCurrency(totalCollected)}
            </Badge>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Audit history of payments received via expired paywalls (Razorpay, Custom UPI) or recorded manually.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            loading={loading}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setModalOpen(true)}
            icon={<Plus className="w-4 h-4" />}
          >
            + Record Manual Cash/UPI Payment
          </Button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Shop Name, Store Code, UTR number, or Order ID..."
              className="pl-9"
            />
          </div>

          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Payment Statuses</option>
            <option value="success">Successful / Verified</option>
            <option value="pending">Pending Payment</option>
            <option value="failed">Failed / Cancelled</option>
          </Select>
        </div>
      </Card>

      {/* Payments Table / Mobile Cards */}
      <Card className="overflow-hidden">
        {filteredPayments.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            No payments match your search query or filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Store</th>
                  <th className="py-3.5 px-4">Plan & Cycle</th>
                  <th className="py-3.5 px-4">Amount</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Gateway / UTR</th>
                  <th className="py-3.5 px-4">Days Extended</th>
                  <th className="py-3.5 px-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredPayments.map((pay) => (
                  <tr key={pay.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                    <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                      {formatDateTime(pay.created_at)}
                    </td>

                    <td className="py-3 px-4">
                      <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                        {pay.store?.shop_name || 'Deleted Store'}
                      </p>
                      <p className="font-mono text-[11px] text-slate-400">
                        {pay.store?.store_code || '-'}
                      </p>
                    </td>

                    <td className="py-3 px-4 capitalize">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {pay.plan_name}
                      </span>
                      <p className="text-[10px] text-slate-400">{pay.billing_cycle}</p>
                    </td>

                    <td className="py-3 px-4 font-bold tabular-nums text-slate-900 dark:text-white text-sm">
                      {formatCurrency(pay.amount)}
                    </td>

                    <td className="py-3 px-4">
                      <Badge
                        variant={
                          pay.status === 'success' ? 'emerald' : pay.status === 'pending' ? 'amber' : 'rose'
                        }
                        size="xs"
                      >
                        {pay.status}
                      </Badge>
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px]">
                      <div>UTR: <strong className="text-slate-800 dark:text-slate-200">{pay.utr_number || '-'}</strong></div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[120px]">{pay.gateway_order_id}</div>
                    </td>

                    <td className="py-3 px-4 font-bold text-emerald-600 dark:text-emerald-400">
                      +{pay.days_added} days
                    </td>

                    <td className="py-3 px-4 text-slate-500 text-[11px] max-w-xs truncate" title={pay.notes || ''}>
                      {pay.notes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Record Manual Payment Modal */}
      <RecordPaymentModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        stores={stores}
        onPaymentRecorded={() => fetchData()}
      />
    </div>
  );
};
