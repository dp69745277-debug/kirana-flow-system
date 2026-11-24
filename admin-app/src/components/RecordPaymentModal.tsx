import React, { useState, useEffect } from 'react';
import { CreditCard, DollarSign, Calendar, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Store as StoreModel, PlanName, BillingCycle } from '@/lib/types';
import { Modal, Button, Input, Label, Select, Textarea, useToast } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import confetti from 'canvas-confetti';

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  stores: StoreModel[];
  onPaymentRecorded: () => void;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  onClose,
  stores,
  onPaymentRecorded,
}) => {
  const { toast } = useToast();
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [amount, setAmount] = useState<number>(499);
  const [planName, setPlanName] = useState<PlanName>('pro');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [daysToAdd, setDaysToAdd] = useState<number>(30);
  const [utrNumber, setUtrNumber] = useState('');
  const [notes, setNotes] = useState('Manual UPI / Cash renewal received by Super Admin');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (stores.length > 0 && !selectedStoreId) {
      setSelectedStoreId(stores[0].id);
      setAmount(Number(stores[0].custom_plan_price) || 499);
    }
  }, [stores, selectedStoreId]);

  const handleStoreChange = (storeId: string) => {
    setSelectedStoreId(storeId);
    const matched = stores.find((s) => s.id === storeId);
    if (matched) {
      setAmount(Number(matched.custom_plan_price) || 499);
    }
  };

  const handleDaysPreset = (days: number, cycle: BillingCycle) => {
    setDaysToAdd(days);
    setBillingCycle(cycle);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStoreId) {
      toast('Please select a store', 'error');
      return;
    }
    if (amount <= 0) {
      toast('Please enter a valid payment amount', 'error');
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase.rpc('record_saas_payment', {
        p_store_id: selectedStoreId,
        p_amount: Number(amount),
        p_plan_name: planName,
        p_billing_cycle: billingCycle,
        p_utr_number: utrNumber.trim() || null,
        p_days_to_add: Number(daysToAdd),
        p_notes: notes.trim(),
      });

      if (error) throw error;

      // Celebrate with confetti
      try {
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.6 },
        });
      } catch {
        // silent
      }

      toast(`Payment recorded! Store subscription activated & extended by +${daysToAdd} days.`, 'success');
      onPaymentRecorded();
      onClose();
    } catch (err: unknown) {
      toast((err as Error).message || 'Failed to record payment', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-emerald-600" />
          <span>Record SaaS Subscription Payment</span>
        </div>
      }
      description="Record an offline Cash or UPI renewal payment. Automatically sets store to Active and extends their subscription expiry date."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Select Store */}
        <div>
          <Label required>Select Store</Label>
          <Select value={selectedStoreId} onChange={(e) => handleStoreChange(e.target.value)}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.shop_name} ({s.store_code}) - {s.owner_name} ({s.phone})
              </option>
            ))}
          </Select>
        </div>

        {/* Amount & Plan */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label required>Amount Received (₹)</Label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400 text-sm">₹</span>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="pl-7 font-bold"
                required
              />
            </div>
          </div>

          <div>
            <Label>Plan Tier</Label>
            <Select value={planName} onChange={(e) => setPlanName(e.target.value as PlanName)}>
              <option value="basic">Basic Plan</option>
              <option value="pro">Pro Plan (All Features)</option>
              <option value="enterprise">Enterprise</option>
            </Select>
          </div>
        </div>

        {/* Days to Add Presets */}
        <div>
          <Label required>Days to Add to Subscription Expiry</Label>
          <div className="flex items-center gap-2 mb-2">
            <button
              type="button"
              onClick={() => handleDaysPreset(30, 'monthly')}
              className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors ${
                daysToAdd === 30 ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-slate-50 text-slate-600'
              }`}
            >
              +30 Days (1 Month)
            </button>
            <button
              type="button"
              onClick={() => handleDaysPreset(90, 'quarterly')}
              className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors ${
                daysToAdd === 90 ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-slate-50 text-slate-600'
              }`}
            >
              +90 Days (Quarterly)
            </button>
            <button
              type="button"
              onClick={() => handleDaysPreset(365, 'yearly')}
              className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors ${
                daysToAdd === 365 ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-slate-50 text-slate-600'
              }`}
            >
              +365 Days (1 Year)
            </button>
          </div>
          <Input
            type="number"
            value={daysToAdd}
            onChange={(e) => setDaysToAdd(Number(e.target.value))}
            placeholder="Custom days..."
          />
        </div>

        {/* UTR / Bank Reference */}
        <div>
          <Label>UTR / Bank Reference / Transaction ID</Label>
          <Input
            value={utrNumber}
            onChange={(e) => setUtrNumber(e.target.value)}
            placeholder="e.g. 432198765042 or CASH-RECEIPT-01"
            className="font-mono"
          />
        </div>

        {/* Notes */}
        <div>
          <Label>Internal Payment Notes</Label>
          <Textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Paid cash at store visit / PhonePe to Admin UPI"
          />
        </div>

        <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button variant="outline" size="sm" type="button" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" type="submit" loading={loading} icon={<CheckCircle2 className="w-4 h-4" />}>
            Confirm & Activate Store
          </Button>
        </div>
      </form>
    </Modal>
  );
};
