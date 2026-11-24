import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  CreditCard,
  QrCode,
  Shield,
  Save,
  RefreshCw,
  Phone,
  MessageSquare,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { PlatformSettings, GatewayProvider, GatewayMode } from '@/lib/types';
import { Card, Button, Input, Label, Select, Badge, useToast } from '@/components/ui';
import QRCode from 'qrcode';

export const SettingsScreen: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // Form state
  const [id, setId] = useState<string>('');
  const [brandName, setBrandName] = useState('Kirana SaaS Platform');
  const [supportPhone, setSupportPhone] = useState('9876543210');
  const [supportWhatsapp, setSupportWhatsapp] = useState('9876543210');
  const [defaultTrialDays, setDefaultTrialDays] = useState(3);
  const [defaultMonthlyPrice, setDefaultMonthlyPrice] = useState(499);
  const [defaultYearlyPrice, setDefaultYearlyPrice] = useState(4999);

  // Gateway state
  const [gatewayProvider, setGatewayProvider] = useState<GatewayProvider>('manual_upi');
  const [gatewayEnabled, setGatewayEnabled] = useState(true);
  const [gatewayMode, setGatewayMode] = useState<GatewayMode>('test');
  const [gatewayBaseUrl, setGatewayBaseUrl] = useState('');
  const [gatewayMerchantId, setGatewayMerchantId] = useState('');
  const [gatewayApiKey, setGatewayApiKey] = useState('');
  const [gatewayApiSecret, setGatewayApiSecret] = useState('');
  const [gatewayWebhookSecret, setGatewayWebhookSecret] = useState('');
  const [adminUpiId, setAdminUpiId] = useState('kirana@upi');

  // Secrets visibility
  const [showKey, setShowKey] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  // Live QR Code preview
  const [qrDataUrl, setQrDataUrl] = useState('');

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('platform_settings')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setId(data.id);
        setBrandName(data.brand_name || 'Kirana SaaS Platform');
        setSupportPhone(data.support_phone || '9876543210');
        setSupportWhatsapp(data.support_whatsapp || '9876543210');
        setDefaultTrialDays(Number(data.default_trial_days) || 3);
        setDefaultMonthlyPrice(Number(data.default_monthly_price) || 499);
        setDefaultYearlyPrice(Number(data.default_yearly_price) || 4999);

        setGatewayProvider(data.gateway_provider || 'manual_upi');
        setGatewayEnabled(data.gateway_enabled ?? true);
        setGatewayMode(data.gateway_mode || 'test');
        setGatewayBaseUrl(data.gateway_base_url || '');
        setGatewayMerchantId(data.gateway_merchant_id || '');
        setGatewayApiKey(data.gateway_api_key || '');
        setGatewayApiSecret(data.gateway_api_secret || '');
        setGatewayWebhookSecret(data.gateway_webhook_secret || '');
        setAdminUpiId(data.admin_upi_id || 'kirana@upi');
      }
    } catch (err: unknown) {
      toast((err as Error).message || 'Failed to load platform settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  // Generate live UPI QR preview
  useEffect(() => {
    const vpa = adminUpiId.includes('@') ? adminUpiId : `${adminUpiId}@upi`;
    const upiUri = `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(brandName)}&am=${defaultMonthlyPrice}&cu=INR&tn=${encodeURIComponent('Kirana SaaS Subscription')}`;

    QRCode.toDataURL(upiUri, { width: 200, margin: 1 })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.warn('QR error:', err));
  }, [adminUpiId, brandName, defaultMonthlyPrice]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);

      const payload = {
        brand_name: brandName.trim(),
        support_phone: supportPhone.trim(),
        support_whatsapp: supportWhatsapp.trim(),
        default_trial_days: Number(defaultTrialDays),
        default_monthly_price: Number(defaultMonthlyPrice),
        default_yearly_price: Number(defaultYearlyPrice),
        gateway_provider: gatewayProvider,
        gateway_enabled: gatewayEnabled,
        gateway_mode: gatewayMode,
        gateway_base_url: gatewayBaseUrl.trim() || null,
        gateway_merchant_id: gatewayMerchantId.trim() || null,
        gateway_api_key: gatewayApiKey.trim() || null,
        gateway_api_secret: gatewayApiSecret.trim() || null,
        gateway_webhook_secret: gatewayWebhookSecret.trim() || null,
        admin_upi_id: adminUpiId.trim() || 'kirana@upi',
        updated_at: new Date().toISOString(),
      };

      let res;
      if (id) {
        res = await supabase.from('platform_settings').update(payload).eq('id', id).select('*').single();
      } else {
        res = await supabase.from('platform_settings').insert(payload).select('*').single();
      }

      if (res.error) throw res.error;

      if (res.data) setId(res.data.id);
      toast('Platform & Gateway Settings updated successfully!', 'success');
    } catch (err: unknown) {
      toast((err as Error).message || 'Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL || 'https://csfcnektkkxgzvinjayn.supabase.co'}/functions/v1/verify-saas-renewal-webhook`;

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <span>Platform & Gateway Settings</span>
            <Badge variant="blue" size="sm">
              Single-Tenant Master
            </Badge>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Configure platform branding, demo parameters, and the Admin&apos;s master payment gateway used for store renewals.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchSettings}
          loading={loading}
          icon={<RefreshCw className="w-3.5 h-3.5" />}
        >
          Refresh
        </Button>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Brand & Gateway Config */}
          <div className="lg:col-span-2 space-y-6">
            {/* 1. Brand & Support Contacts */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                <Shield className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Brand & SaaS Support Information
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label required>SaaS Brand Name</Label>
                  <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} required />
                </div>
                <div>
                  <Label required>Support Phone</Label>
                  <Input value={supportPhone} onChange={(e) => setSupportPhone(e.target.value)} required />
                </div>
                <div>
                  <Label required>Support WhatsApp Number</Label>
                  <Input value={supportWhatsapp} onChange={(e) => setSupportWhatsapp(e.target.value)} required />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <Label required>Default Demo / Trial Days</Label>
                  <Input
                    type="number"
                    value={defaultTrialDays}
                    onChange={(e) => setDefaultTrialDays(Number(e.target.value))}
                    min={1}
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Given to newly registered stores.</p>
                </div>
                <div>
                  <Label required>Default Monthly Price (₹)</Label>
                  <Input
                    type="number"
                    value={defaultMonthlyPrice}
                    onChange={(e) => setDefaultMonthlyPrice(Number(e.target.value))}
                    min={0}
                    required
                  />
                </div>
                <div>
                  <Label required>Default Yearly Price (₹)</Label>
                  <Input
                    type="number"
                    value={defaultYearlyPrice}
                    onChange={(e) => setDefaultYearlyPrice(Number(e.target.value))}
                    min={0}
                    required
                  />
                </div>
              </div>
            </Card>

            {/* 2. Admin's Own Payment Gateway Settings */}
            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-emerald-600" />
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      Admin Payment Gateway (Master SaaS Account)
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      When store owners pay on expired paywalls, money lands in THIS master gateway.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="gateway_enabled"
                    checked={gatewayEnabled}
                    onChange={(e) => setGatewayEnabled(e.target.checked)}
                    className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <label htmlFor="gateway_enabled" className="text-xs font-semibold cursor-pointer">
                    Gateway Enabled
                  </label>
                </div>
              </div>

              {/* Provider & Mode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label required>Gateway Provider</Label>
                  <Select
                    value={gatewayProvider}
                    onChange={(e) => setGatewayProvider(e.target.value as GatewayProvider)}
                  >
                    <option value="manual_upi">Manual Direct UPI Intent / Dynamic QR</option>
                    <option value="custom_upi">Custom Indian UPI Gateway (Self-Hosted / Paygate)</option>
                    <option value="razorpay">Razorpay (Cards, UPI, Netbanking)</option>
                  </Select>
                </div>

                <div>
                  <Label required>Gateway Environment Mode</Label>
                  <Select value={gatewayMode} onChange={(e) => setGatewayMode(e.target.value as GatewayMode)}>
                    <option value="test">Test / Sandbox Mode</option>
                    <option value="live">Live / Production Mode</option>
                  </Select>
                </div>
              </div>

              {/* Admin UPI ID */}
              <div>
                <Label required>Admin Master UPI ID (VPA)</Label>
                <Input
                  value={adminUpiId}
                  onChange={(e) => setAdminUpiId(e.target.value)}
                  placeholder="e.g. kirana@upi or dinesh@okaxis"
                  required
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Used for dynamic NPCI QR generation in the paywall and direct UPI intent links.
                </p>
              </div>

              {/* Credentials for Custom UPI or Razorpay */}
              {gatewayProvider === 'custom_upi' && (
                <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800 animate-slide-up">
                  <div>
                    <Label>Custom Gateway API Base URL</Label>
                    <Input
                      value={gatewayBaseUrl}
                      onChange={(e) => setGatewayBaseUrl(e.target.value)}
                      placeholder="e.g. https://upi.yourdomain.com"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label>Merchant ID / VPA</Label>
                      <Input
                        value={gatewayMerchantId}
                        onChange={(e) => setGatewayMerchantId(e.target.value)}
                        placeholder="Merchant ID"
                      />
                    </div>
                    <div>
                      <Label>API Key</Label>
                      <div className="relative">
                        <Input
                          type={showKey ? 'text' : 'password'}
                          value={gatewayApiKey}
                          onChange={(e) => setGatewayApiKey(e.target.value)}
                          placeholder="API Key"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(!showKey)}
                          className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                        >
                          {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label>API Secret</Label>
                    <div className="relative">
                      <Input
                        type={showSecret ? 'text' : 'password'}
                        value={gatewayApiSecret}
                        onChange={(e) => setGatewayApiSecret(e.target.value)}
                        placeholder="API Secret"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecret(!showSecret)}
                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                      >
                        {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {gatewayProvider === 'razorpay' && (
                <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800 animate-slide-up">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label required>Razorpay Key ID</Label>
                      <Input
                        value={gatewayApiKey}
                        onChange={(e) => setGatewayApiKey(e.target.value)}
                        placeholder="rzp_test_xxxxxx"
                      />
                    </div>

                    <div>
                      <Label required>Razorpay Key Secret</Label>
                      <div className="relative">
                        <Input
                          type={showSecret ? 'text' : 'password'}
                          value={gatewayApiSecret}
                          onChange={(e) => setGatewayApiSecret(e.target.value)}
                          placeholder="Secret key"
                        />
                        <button
                          type="button"
                          onClick={() => setShowSecret(!showSecret)}
                          className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                        >
                          {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label>Razorpay Webhook Secret</Label>
                    <Input
                      value={gatewayWebhookSecret}
                      onChange={(e) => setGatewayWebhookSecret(e.target.value)}
                      placeholder="Optional webhook signing secret"
                    />
                  </div>
                </div>
              )}

              {/* Webhook Endpoint snippet */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    SaaS Webhook Endpoint (Configure in Gateway Dashboard):
                  </span>
                  <button
                    type="button"
                    onClick={copyWebhook}
                    className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded flex items-center gap-1"
                  >
                    {copiedWebhook ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedWebhook ? 'Copied' : 'Copy URL'}</span>
                  </button>
                </div>
                <code className="block font-mono text-[11px] p-2 bg-slate-900 text-emerald-400 rounded-lg select-all break-all">
                  {webhookUrl}
                </code>
              </div>
            </Card>
          </div>

          {/* Right Col: Live UPI QR Preview & Info */}
          <div className="space-y-6">
            <Card className="p-5 text-center space-y-4">
              <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                <QrCode className="w-4 h-4 text-emerald-600" />
                <span>Live Admin UPI QR Preview</span>
              </div>

              <div className="p-4 bg-white rounded-2xl shadow-inner border border-slate-200 inline-block">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="Admin UPI QR" className="w-44 h-44 mx-auto" />
                ) : (
                  <div className="w-44 h-44 bg-slate-100 flex items-center justify-center text-xs text-slate-400">
                    Generating QR...
                  </div>
                )}
              </div>

              <div className="space-y-1 text-xs">
                <p className="font-bold text-slate-900 dark:text-white font-mono">{adminUpiId}</p>
                <p className="text-slate-400">
                  Amount: <strong className="text-emerald-600">₹{defaultMonthlyPrice}</strong>
                </p>
                <p className="text-[11px] text-slate-400 pt-1">
                  Store owners scanning this QR will send renewal money directly to your account.
                </p>
              </div>
            </Card>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full shadow-lg"
              loading={saving}
              icon={<Save className="w-4 h-4" />}
            >
              Save Platform & Gateway Settings
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};
