import { Store, ShoppingCart, Package, BookOpen } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { t } from '@/lib/i18n';
import { cn } from './ui';

interface BottomNavProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  activeOrderCount: number;
}

export function BottomNav({ activeTab, onSelectTab, activeOrderCount }: BottomNavProps) {
  const { lang } = useCustomerAuth();
  const { totalItemsCount } = useCart();

  const navItems = [
    {
      id: 'shop',
      label: t('shop', lang),
      icon: Store,
      badge: 0,
    },
    {
      id: 'cart',
      label: t('cart', lang),
      icon: ShoppingCart,
      badge: totalItemsCount,
      badgeColor: 'bg-red-600 text-white',
    },
    {
      id: 'orders',
      label: t('orders', lang),
      icon: Package,
      badge: activeOrderCount,
      badgeColor: 'bg-emerald-600 text-white animate-pulse',
    },
    {
      id: 'khata',
      label: t('khata', lang),
      icon: BookOpen,
      badge: 0,
    },
  ];

  return (
    <>
      {/* Mobile Fixed Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 flex items-center justify-around shadow-lg">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={cn(
                'relative flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all cursor-pointer',
                isActive
                  ? 'text-emerald-700 font-bold scale-105'
                  : 'text-slate-500 hover:text-slate-700 font-medium'
              )}
            >
              <div className="relative">
                <Icon size={20} strokeWidth={isActive ? 2.4 : 1.8} />
                {item.badge > 0 && (
                  <span
                    className={cn(
                      'absolute -top-1.5 -right-2.5 px-1.5 min-w-[18px] h-[18px] rounded-full text-[10px] font-bold flex items-center justify-center shadow-xs',
                      item.badgeColor || 'bg-red-600 text-white'
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] mt-1 tracking-tight">{item.label}</span>
              {isActive && (
                <span className="w-4 h-1 rounded-full bg-emerald-600 mt-0.5" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Desktop Left Sidebar Navigation */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 bg-white border-r border-slate-200 min-h-[calc(100vh-64px)] p-4">
        <div className="space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={cn(
                  'w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-semibold transition-all cursor-pointer',
                  isActive
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon size={19} className={isActive ? 'text-emerald-600' : 'text-slate-500'} />
                  <span>{item.label}</span>
                </div>
                {item.badge > 0 && (
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-full text-xs font-bold',
                      item.badgeColor || 'bg-red-600 text-white'
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
}
