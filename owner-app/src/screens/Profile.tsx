import { useEffect, useState } from 'react';
import { Copy, Check, Save, CreditCard, ShieldCheck, Eye, EyeOff, QrCode } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/lib/supabase';
import { Button, Input, Label, Card, Badge, useToast, Spinner, Select } from '@/components/ui';
import type { Lang, StoreType, PaymentGatewayProvider, PaymentGatewayMode } from '@/lib/types';

const TYPE_LABEL: Record<StoreType, string> = {
  retail: 'Retail',
  wholesale: 'Wholesale',
  mix: 'Wholesale + Retail (Mix)',
};

export default function Profile() {
  const { store, user, isOwner, lang, setLang, refresh } = useApp();
  const { show, node: toastNode } = useToast();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [gatewaySaving, setGatewaySaving] = useState(false);

  const [form, setForm] = useState({
    owner_name: store?.owner_name ?? '',
    shop_name: store?.shop_name ?? '',
    phone: store?.phone ?? '',
    address: store?.address ?? '',
    upi_id: store?.upi_id ?? '',
    gstin: store?.gstin ?? '',
    dead_stock_days: store?.dead_stock_days ?? 10,
  });

  const [gatewayForm, setGatewayForm] = useState({
    provider: 'manual_upi' as PaymentGatewayProvider,
    is_enabled: false,
    mode: 'test' as PaymentGatewayMode,
    api_base_url: '',
    merchant_id: '',
    api_key: '',
    api_secret: '',
    webhook_secret: '',
  });

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL || 'https://csfcnektkkxgzvinjayn.supabase.co'}/functions/v1/verify-payment-webhook`;

  useEffect(() => {
    if (!isOwner || !store) return;
    async function loadGateway() {
      const { data } = await supabase
        .from('store_payment_gateways')
        .select('*')
        .eq('store_id', store!.id)
        .maybeSingle();

      if (data) {
        setGatewayForm({
          provider: (data.provider as PaymentGatewayProvider) || 'manual_upi',
          is_enabled: !!data.is_enabled,
          mode: (data.mode as PaymentGatewayMode) || 'test',
          api_base_url: data.api_base_url || '',
          merchant_id: data.merchant_id || '',
          api_key: data.api_key || '',
          api_secret: data.api_secret || '',
          webhook_secret: data.webhook_secret || '',
        });
      }
    }
    void loadGateway();
  }, [isOwner, store]);

  if (!store) return null;
  if (!user) return null;

  async function save() {
    setBusy(true);
    const { error } = await supabase.from('stores').update({
      owner_name: form.owner_name.trim(),
      shop_name: form.shop_name.trim(),
      phone: form.phone.trim(),
      address: form.address.trim() || null,
      upi_id: form.upi_id.trim() || null,
      gstin: form.gstin.trim() || null,
      dead_stock_days: Number(form.dead_stock_days) || 10,
    }).eq('id', store!.id);
    setBusy(false);
    if (error) return show(error.message, true);
    show('Profile updated');
    await refresh();
  }

  async function saveGateway() {
    setGatewaySaving(true);
    const { error } = await supabase.from('store_payment_gateways').upsert({
      store_id: store!.id,
      provider: gatewayForm.provider,
      is_enabled: gatewayForm.is_enabled,
      mode: gatewayForm.mode,
      api_base_url: gatewayForm.api_base_url.trim() || null,
      merchant_id: gatewayForm.merchant_id.trim() || null,
      api_key: gatewayForm.api_key.trim() || null,
      api_secret: gatewayForm.api_secret.trim() || null,
      webhook_secret: gatewayForm.webhook_secret.trim() || null,
    }, { onConflict: 'store_id' });
    setGatewaySaving(false);
    if (error) return show(error.message, true);
    show('Payment Gateway Settings updated');
  }

  function copyWebhookUrl() {
    void navigator.clipboard.writeText(webhookUrl);
    setWebhookCopied(true);
    setTimeout(() => setWebhookCopied(false), 1500);
  }

  function copyCode() {
    void navigator.clipboard.writeText(store!.store_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {toastNode}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-slate-500">Store ID (read-only)</p>
            <p className="text-xl font-bold text-slate-900 flex items-center gap-2">
              {store.store_code}
              <button onClick={copyCode} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-emerald-600">
                {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
              </button>
            </p>
            <p className="text-[11px] text-slate-400">Share this with customers or support</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-slate-500">Store Type</p>
            <Badge tone="teal" className="mt-1">{TYPE_LABEL[store.store_type]}</Badge>
          </div>
        </div>
      </Card>

      {isOwner ? (
        <Card className="p-4">
          <h3 className="font-semibold text-slate-800 mb-3">Shop Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>Owner Name</Label><Input value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} /></div>
            <div><Label>Shop Name</Label><Input value={form.shop_name} onChange={(e) => setForm({ ...form, shop_name: e.target.value })} /></div>
            <div><Label>Mobile Number</Label><Input inputMode="numeric" maxLength={10} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })} /></div>
            <div><Label>UPI ID (used in reminders & invoices)</Label><Input value={form.upi_id} onChange={(e) => setForm({ ...form, upi_id: e.target.value })} placeholder="store@upi" /></div>
            <div className="sm:col-span-2"><Label>Shop Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div><Label>GSTIN (optional)</Label><Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} /></div>
            <div><Label>Default Dead Stock Days</Label><Input type="number" value={form.dead_stock_days} onChange={(e) => setForm({ ...form, dead_stock_days: Number(e.target.value) })} /></div>
          </div>
          <Button className="mt-4" onClick={save} disabled={busy}><Save size={15} /> {busy ? 'Saving…' : 'Save Changes'}</Button>
        </Card>
      ) : (
        <Card className="p-4 text-sm text-slate-500">Only the owner can edit shop details.</Card>
      )}

      {isOwner && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
            <div>
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <CreditCard size={18} className="text-emerald-600" />
                Payment Gateway Settings
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Configure automated UPI QR, Custom Gateways & Razorpay</p>
            </div>
            <Badge tone={gatewayForm.is_enabled ? 'green' : 'slate'}>
              {gatewayForm.is_enabled ? (gatewayForm.mode === 'live' ? 'Live' : 'Test Mode') : 'Disabled'}
            </Badge>
          </div>

          <div className="space-y-4">
            {/* Provider and Mode selection */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label>Gateway Provider</Label>
                <Select
                  value={gatewayForm.provider}
                  onChange={(e) => setGatewayForm({ ...gatewayForm, provider: e.target.value as PaymentGatewayProvider })}
                >
                  <option value="manual_upi">Manual UPI Only</option>
                  <option value="custom_upi">Custom UPI Gateway</option>
                  <option value="razorpay">Razorpay Gateway</option>
                </Select>
              </div>

              <div>
                <Label>Gateway Status</Label>
                <Select
                  value={gatewayForm.is_enabled ? '1' : '0'}
                  onChange={(e) => setGatewayForm({ ...gatewayForm, is_enabled: e.target.value === '1' })}
                >
                  <option value="1">Enabled (Active)</option>
                  <option value="0">Disabled (Manual Only)</option>
                </Select>
              </div>

              <div>
                <Label>Environment Mode</Label>
                <Select
                  value={gatewayForm.mode}
                  onChange={(e) => setGatewayForm({ ...gatewayForm, mode: e.target.value as PaymentGatewayMode })}
                  disabled={!gatewayForm.is_enabled}
                >
                  <option value="test">Test / Sandbox</option>
                  <option value="live">Production / Live</option>
                </Select>
              </div>
            </div>

            {/* Provider Specific Configuration */}
            {gatewayForm.provider === 'manual_upi' && (
              <div className="rounded-lg bg-emerald-50/70 border border-emerald-100 p-3 text-xs text-emerald-800 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <QrCode size={14} /> Manual UPI Mode
                </p>
                <p>
                  Staff and Customers will pay directly to your shop UPI ID ({form.upi_id || 'store@upi'}).
                  Payments are verified manually by staff before order completion.
                </p>
              </div>
            )}

            {gatewayForm.provider === 'custom_upi' && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <ShieldCheck size={14} className="text-emerald-600" />
                  Custom Gateway API Credentials
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <Label required>API Base URL</Label>
                    <Input
                      placeholder="https://api.custom-gateway.com"
                      value={gatewayForm.api_base_url}
                      onChange={(e) => setGatewayForm({ ...gatewayForm, api_base_url: e.target.value })}
                    />
                    <p className="text-[11px] text-slate-400 mt-1">Leave empty to use standardized NPCI direct dynamic UPI QR</p>
                  </div>

                  <div>
                    <Label required>Merchant ID / UPI VPA</Label>
                    <Input
                      placeholder="merchant123 or merchant@bank"
                      value={gatewayForm.merchant_id}
                      onChange={(e) => setGatewayForm({ ...gatewayForm, merchant_id: e.target.value })}
                    />
                  </div>

                  <div>
                    <Label>API Key</Label>
                    <Input
                      placeholder="key_live_..."
                      value={gatewayForm.api_key}
                      onChange={(e) => setGatewayForm({ ...gatewayForm, api_key: e.target.value })}
                    />
                  </div>

                  <div>
                    <Label>API Secret (Server-side Only)</Label>
                    <div className="relative">
                      <Input
                        type={showApiSecret ? 'text' : 'password'}
                        placeholder="••••••••••••"
                        value={gatewayForm.api_secret}
                        onChange={(e) => setGatewayForm({ ...gatewayForm, api_secret: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiSecret(!showApiSecret)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                      >
                        {showApiSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <Label>Webhook Secret</Label>
                    <div className="relative">
                      <Input
                        type={showWebhookSecret ? 'text' : 'password'}
                        placeholder="••••••••••••"
                        value={gatewayForm.webhook_secret}
                        onChange={(e) => setGatewayForm({ ...gatewayForm, webhook_secret: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                      >
                        {showWebhookSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {gatewayForm.provider === 'razorpay' && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <ShieldCheck size={14} className="text-emerald-600" />
                  Razorpay API Credentials
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label required>Razorpay Key ID</Label>
                    <Input
                      placeholder="rzp_test_... or rzp_live_..."
                      value={gatewayForm.api_key}
                      onChange={(e) => setGatewayForm({ ...gatewayForm, api_key: e.target.value })}
                    />
                  </div>

                  <div>
                    <Label required>Razorpay Key Secret (Server-side Only)</Label>
                    <div className="relative">
                      <Input
                        type={showApiSecret ? 'text' : 'password'}
                        placeholder="••••••••••••"
                        value={gatewayForm.api_secret}
                        onChange={(e) => setGatewayForm({ ...gatewayForm, api_secret: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiSecret(!showApiSecret)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                      >
                        {showApiSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <Label>Webhook Secret</Label>
                    <div className="relative">
                      <Input
                        type={showWebhookSecret ? 'text' : 'password'}
                        placeholder="••••••••••••"
                        value={gatewayForm.webhook_secret}
                        onChange={(e) => setGatewayForm({ ...gatewayForm, webhook_secret: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                      >
                        {showWebhookSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Read-only Webhook URL */}
            <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-1.5">
              <Label>Webhook Callback URL (Paste in your Gateway Dashboard)</Label>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={webhookUrl}
                  className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-600 truncate"
                />
                <Button variant="secondary" className="!py-2 !px-3 shrink-0 text-xs" onClick={copyWebhookUrl}>
                  {webhookCopied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                  {webhookCopied ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <p className="text-[11px] text-slate-400">Receives instant confirmation for UPI QR and payment links.</p>
            </div>

            <Button onClick={saveGateway} disabled={gatewaySaving}>
              <Save size={15} /> {gatewaySaving ? 'Saving…' : 'Save Gateway Settings'}
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-4">
        <h3 className="font-semibold text-slate-800 mb-3">Language</h3>
        <div className="flex gap-2">
          {(['en', 'hinglish', 'hi'] as Lang[]).map((l) => (
            <button key={l} onClick={() => setLang(l)}
              className={`rounded-lg px-4 py-2.5 text-sm font-medium border transition-colors ${
                lang === l ? 'bg-emerald-600 text-white border-emerald-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}>
              {l === 'en' ? 'English' : l === 'hinglish' ? 'Hinglish' : 'हिन्दी'}
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-semibold text-slate-800 mb-2">Your Account</h3>
        <p className="text-sm text-slate-500">{user.name} · +91 {user.phone} · {user.role === 'owner' ? 'Owner' : 'Staff'}</p>
        <p className="text-xs text-slate-400 mt-1">Logged in with mobile number + password</p>
      </Card>
    </div>
  );
}
