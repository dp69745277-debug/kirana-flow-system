import { useState } from 'react';
import { Store as StoreIcon, Globe, CreditCard, ShoppingCart } from 'lucide-react';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useCart } from '@/context/CartContext';
import { formatINR } from '@/lib/format';
import { t } from '@/lib/i18n';
import type { Lang } from '@/lib/types';
import { cn } from './ui';

export function Navbar({
  activeTab,
  onSelectTab,
}: {
  activeTab: string;
  onSelectTab: (tab: string) => void;
}) {
  const { customer, store, lang, setLang } = useCustomerAuth();
  const { totalItemsCount } = useCart();
  const [langOpen, setLangOpen] = useState(false);

  const balance = customer?.current_khata_balance ?? 0;

  const languages: Array<{ code: Lang; label: string }> = [
    { code: 'en', label: 'English' },
    { code: 'hinglish', label: 'Hinglish' },
    { code: 'hi', label: 'हिन्दी' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-3">
        {/* Left: Wholesaler & Customer Info */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shrink-0 shadow-sm shadow-emerald-600/30">
            <StoreIcon size={18} className="sm:hidden" />
            <StoreIcon size={20} className="hidden sm:block" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="text-xs sm:text-base font-bold text-slate-900 truncate">
                {store?.shop_name || 'Wholesale Portal'}
              </h1>
              {store?.store_code && (
                <span className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md">
                  {store.store_code}
                </span>
              )}
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 truncate font-medium">
              {customer?.shop_name} • <span className="text-slate-400">{customer?.name}</span>
            </p>
          </div>
        </div>

        {/* Right: Khata Pill + Language Switcher + Cart Quick Button */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Live Pending Khata Pill */}
          <button
            onClick={() => onSelectTab('khata')}
            className={cn(
              'flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-semibold border transition-all cursor-pointer shrink-0',
              balance > 0
                ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 hover:border-amber-400'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
            )}
            title="View Khata Statement & Pay"
          >
            <CreditCard size={12} className={balance > 0 ? 'text-amber-600' : 'text-emerald-600'} />
            <span className="truncate">
              {t('due', lang)}: <strong className="font-bold">{formatINR(balance)}</strong>
            </span>
          </button>

          {/* Language Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => setLangOpen(!langOpen)}
              className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-xl border border-slate-200 text-slate-700 text-[11px] sm:text-xs font-semibold bg-white hover:bg-slate-50 cursor-pointer transition-colors shrink-0"
            >
              <Globe size={13} className="text-emerald-600" />
              <span className="hidden sm:inline">
                {lang === 'en' ? 'English' : lang === 'hinglish' ? 'Hinglish' : 'हिन्दी'}
              </span>
              <span className="sm:hidden">{lang.toUpperCase()}</span>
            </button>

            {langOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setLangOpen(false)} />
                <div className="absolute right-0 mt-1.5 w-36 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-fade-in">
                  {languages.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => {
                        setLang(l.code);
                        setLangOpen(false);
                      }}
                      className={cn(
                        'w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between transition-colors',
                        lang === l.code
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'text-slate-700 hover:bg-slate-50'
                      )}
                    >
                      {l.label}
                      {lang === l.code && <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Cart Icon in Header on Desktop */}
          <button
            onClick={() => onSelectTab('cart')}
            className={cn(
              'relative p-2 rounded-xl border transition-colors cursor-pointer hidden md:flex items-center justify-center',
              activeTab === 'cart'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            )}
            title="Shopping Cart"
          >
            <ShoppingCart size={18} />
            {totalItemsCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center shadow-sm">
                {totalItemsCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
