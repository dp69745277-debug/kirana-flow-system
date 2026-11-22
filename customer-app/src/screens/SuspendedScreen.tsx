import { Phone, MessageCircle, AlertOctagon, UserX, Store, LogOut } from 'lucide-react';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { Button, Card } from '@/components/ui';
import { telLink, waLink } from '@/lib/format';
import { t } from '@/lib/i18n';

interface SuspendedScreenProps {
  reason: 'store_suspended' | 'customer_inactive' | 'store_type_mismatch';
}

export function SuspendedScreen({ reason }: SuspendedScreenProps) {
  const { store, customer, lang, signOut } = useCustomerAuth();

  const configs = {
    store_suspended: {
      icon: AlertOctagon,
      iconColor: 'text-red-600 bg-red-100',
      title: t('storeSuspendedTitle', lang),
      desc: t('storeSuspendedDesc', lang),
    },
    customer_inactive: {
      icon: UserX,
      iconColor: 'text-amber-600 bg-amber-100',
      title: t('accountInactiveTitle', lang),
      desc: t('accountInactiveDesc', lang),
    },
    store_type_mismatch: {
      icon: Store,
      iconColor: 'text-blue-600 bg-blue-100',
      title: t('storeTypeMismatchTitle', lang),
      desc: t('storeTypeMismatchDesc', lang),
    },
  };

  const current = configs[reason];
  const Icon = current.icon;

  const wholesalerPhone = store?.phone || '';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <Card className="max-w-md w-full p-6 sm:p-8 text-center shadow-lg border-slate-200">
        <div className={`mx-auto w-16 h-16 rounded-3xl ${current.iconColor} flex items-center justify-center mb-4`}>
          <Icon size={32} />
        </div>

        <h1 className="text-xl font-bold text-slate-900">{current.title}</h1>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">{current.desc}</p>

        {/* Store & Wholesaler Contact */}
        {store && (
          <div className="mt-6 p-4 rounded-xl bg-slate-50 border border-slate-200 text-left">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Wholesaler Details</p>
            <p className="font-bold text-slate-900 mt-1">{store.shop_name}</p>
            <p className="text-xs text-slate-500">{store.owner_name} • +91 {store.phone}</p>
            {store.address && <p className="text-xs text-slate-500 mt-0.5">{store.address}</p>}

            {wholesalerPhone && (
              <div className="mt-3 flex gap-2">
                <a
                  href={telLink(wholesalerPhone)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors"
                >
                  <Phone size={14} />
                  <span>Call Wholesaler</span>
                </a>
                <a
                  href={waLink(
                    wholesalerPhone,
                    `Hello ${store.shop_name}, I am ${customer?.shop_name || 'your customer'} (Ph: ${customer?.phone || ''}). My account shows: ${current.title}. Please check.`
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 text-white text-xs font-bold hover:bg-teal-700 transition-colors"
                >
                  <MessageCircle size={14} />
                  <span>WhatsApp</span>
                </a>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-slate-100 flex justify-center">
          <Button variant="secondary" onClick={signOut} className="w-full">
            <LogOut size={16} />
            <span>Sign Out / Switch Account</span>
          </Button>
        </div>
      </Card>
    </div>
  );
}
