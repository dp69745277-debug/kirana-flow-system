import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  LayoutDashboard, Package, ShoppingCart, Users, BookOpen, Calculator,
  Truck, ClipboardCheck, Skull, BarChart3, UserCog, Store as StoreIcon,
  Bell, IndianRupee, Menu, X, LogOut, Copy, Check, Inbox, Sun, Moon, Volume2, VolumeX,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { supabase } from '@/lib/supabase';
import { Badge, Button, Card, cn } from '@/components/ui';
import { t } from '@/lib/i18n';
import { formatINR, formatDateTime } from '@/lib/format';
import { playClick, playToggle, isSoundMuted, toggleSoundMuted } from '@/lib/sound';
import type { PriceAlert, InventoryItem, PendingHisaab } from '@/lib/types';

export type PageKey =
  | 'dashboard' | 'inventory' | 'orders' | 'customers' | 'hisaab'
  | 'agencies' | 'deadstock' | 'reports' | 'staff' | 'profile';

interface NavItem { key: PageKey; labelKey: string; icon: ReactNode; wholesaleOnly?: boolean; ownerOnly?: boolean }

const NAV: NavItem[] = [
  { key: 'dashboard', labelKey: 'dashboard', icon: <LayoutDashboard size={20} /> },
  { key: 'inventory', labelKey: 'inventory', icon: <Package size={20} /> },
  { key: 'orders', labelKey: 'orders', icon: <ShoppingCart size={20} />, wholesaleOnly: true },
  { key: 'customers', labelKey: 'customers', icon: <Users size={20} />, wholesaleOnly: true },
  { key: 'hisaab', labelKey: 'hisaab', icon: <Calculator size={20} />, ownerOnly: true },
  { key: 'agencies', labelKey: 'agencies', icon: <Truck size={20} /> },
  { key: 'deadstock', labelKey: 'deadStock', icon: <Skull size={20} /> },
  { key: 'reports', labelKey: 'reports', icon: <BarChart3 size={20} />, ownerOnly: true },
  { key: 'staff', labelKey: 'staff', icon: <UserCog size={20} />, ownerOnly: true },
  { key: 'profile', labelKey: 'profile', icon: <StoreIcon size={20} /> },
];

const MOBILE_NAV: PageKey[] = ['dashboard', 'inventory', 'orders', 'customers', 'hisaab'];

export default function Shell({ page, setPage, children }: { page: PageKey; setPage: (p: PageKey) => void; children: ReactNode }) {
  const { store, user, lang, setLang, signOut, hasFeature, isOwner } = useApp();
  const [drawer, setDrawer] = useState(false);
  const [showLowStock, setShowLowStock] = useState(false);
  const [showPrice, setShowPrice] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [lowStockItems, setLowStockItems] = useState<InventoryItem[]>([]);
  const [priceAlerts, setPriceAlerts] = useState<Array<PriceAlert & { item?: { name: string } }>>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isDark, setIsDark] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));
  const [soundMuted, setSoundMutedState] = useState(isSoundMuted());

  useEffect(() => {
    const handler = (e: Event) => {
      setSoundMutedState((e as CustomEvent<boolean>).detail);
    };
    window.addEventListener('kirana_sound_mute_change', handler);
    return () => window.removeEventListener('kirana_sound_mute_change', handler);
  }, []);

  const handleSoundToggle = () => {
    const next = toggleSoundMuted();
    setSoundMutedState(next);
    if (!next) {
      playToggle();
    }
  };

  const handleThemeToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    playToggle();
    const x = e.clientX;
    const y = e.clientY;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    const toggle = () => {
      const nextDark = !document.documentElement.classList.contains('dark');
      if (nextDark) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
      setIsDark(nextDark);
    };

    const prefersReduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // View Transitions API with fallback
    if (!('startViewTransition' in document) || prefersReduced) {
      toggle();
      return;
    }

    const transition = (document as unknown as { startViewTransition: (cb: () => void) => { ready: Promise<void> } }).startViewTransition(() => {
      toggle();
    });

    transition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 620,
          easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
          pseudoElement: '::view-transition-new(root)',
        }
      );
    });
  };

  useEffect(() => {
    if (!store) return;
    let mounted = true;
    async function load() {
      const { data: items } = await supabase.from('inventory_items').select('*').eq('store_id', store!.id);
      if (mounted && items) {
        setLowStockItems((items as InventoryItem[]).filter((i) => i.current_stock <= i.low_stock_threshold));
      }
      const { data: alerts } = await supabase
        .from('price_alerts')
        .select('*, item:inventory_items(name)')
        .eq('store_id', store!.id)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(20);
      if (mounted && alerts) setPriceAlerts(alerts as Array<PriceAlert & { item?: { name: string } }>);
      if (isOwner) {
        const { count } = await supabase
          .from('pending_hisaab')
          .select('id', { count: 'exact', head: true })
          .eq('store_id', store!.id)
          .eq('status', 'pending');
        if (mounted) setPendingCount(count ?? 0);
      }
    }
    void load();
    const channel = supabase
      .channel('shell-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items', filter: `store_id=eq.${store.id}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'price_alerts', filter: `store_id=eq.${store.id}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pending_hisaab', filter: `store_id=eq.${store.id}` }, () => void load())
      .subscribe();
    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [store, isOwner]);

  if (!store || !user) return null;

  const visibleNav = NAV.filter((n) => {
    if (n.wholesaleOnly && !(store.store_type !== 'retail' && hasFeature('wholesale_module'))) return false;
    if (n.ownerOnly && !isOwner) return false;
    return true;
  });

  const mobileItems = MOBILE_NAV.filter((k) => visibleNav.some((n) => n.key === k));

  async function markAlertsRead() {
    await supabase.from('price_alerts').update({ is_read: true }).eq('store_id', store!.id).eq('is_read', false);
    setPriceAlerts([]);
  }

  function copyStoreCode() {
    void navigator.clipboard.writeText(store!.store_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 flex-col bg-white border-r border-slate-200 z-30">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
            <StoreIcon size={18} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 truncate">{store.shop_name}</p>
            <button onClick={copyStoreCode} className="flex items-center gap-1 text-xs text-slate-400 hover:text-emerald-600">
              {store.store_code} {copied ? <Check size={11} /> : <Copy size={11} />}
            </button>
          </div>
        </div>
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {visibleNav.map((n) => {
            const isActive = page === n.key;
            return (
              <button
                key={n.key}
                onClick={() => {
                  playClick();
                  setPage(n.key);
                }}
                className={cn(
                  'relative w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 active:scale-[0.98]',
                  isActive
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 shadow-2xs border border-emerald-500/20'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-200'
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-2.5 bottom-2.5 w-1 bg-emerald-600 rounded-r-full" />
                )}
                {n.icon} {t(n.labelKey, lang)}
                {n.key === 'agencies' && isOwner && pendingCount > 0 && (
                  <span className="ml-auto bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300 rounded-full px-1.5 text-[11px] font-semibold">{pendingCount}</span>
                )}
              </button>
            );
          })}
        </nav>
        <button onClick={signOut} className="flex items-center gap-3 px-6 py-4 text-sm text-slate-500 hover:text-red-600 hover:bg-slate-50 border-t border-slate-100">
          <LogOut size={18} /> {t('logout', lang)}
        </button>
      </aside>

      {/* Header */}
      <header className="lg:pl-60 sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2.5 sm:py-3">
          <button className="lg:hidden p-1.5 sm:p-2 -ml-1 sm:-ml-2 text-slate-600 dark:text-slate-300" onClick={() => setDrawer(true)}>
            <Menu size={20} className="sm:w-[22px] sm:h-[22px]" />
          </button>
          <div className="min-w-0 flex-1 mr-1">
            <h1 className="text-sm sm:text-base font-semibold text-slate-900 truncate">{t(page === 'dashboard' ? 'dashboard' : page, lang)}</h1>
            <p className="text-[11px] sm:text-xs text-slate-400 truncate">
              {user.name} · {user.role === 'owner' ? 'Owner' : 'Staff'}
            </p>
          </div>

          {/* Low stock bell */}
          <div className="relative">
            <button onClick={() => { setShowLowStock(!showLowStock); setShowPrice(false); }} className="relative p-1.5 sm:p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300">
              <Bell size={18} className="sm:w-5 sm:h-5" />
              {lowStockItems.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-amber-500 text-white text-[9px] sm:text-[10px] font-bold rounded-full min-w-[16px] sm:min-w-[18px] h-[16px] sm:h-[18px] flex items-center justify-center px-1">
                  {lowStockItems.length}
                </span>
              )}
            </button>
            {showLowStock && (
              <Popover onClose={() => setShowLowStock(false)}>
                <p className="font-semibold text-slate-800 mb-2">{t('lowStockAlerts', lang)}</p>
                {lowStockItems.length === 0 ? (
                  <p className="text-sm text-slate-400 py-3">All stock levels healthy</p>
                ) : (
                  <ul className="space-y-2">
                    {lowStockItems.map((i) => (
                      <li key={i.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate text-slate-700">{i.name} {i.brand ? `(${i.brand})` : ''}</span>
                        <Badge tone={i.current_stock === 0 ? 'red' : 'amber'}>
                          {i.current_stock === 0 ? t('outOfStock', lang) : `${i.current_stock} ${i.unit_type}`}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Popover>
            )}
          </div>

          {/* Price fluctuation */}
          <div className="relative">
            <button onClick={() => { setShowPrice(!showPrice); setShowLowStock(false); }} className="relative p-1.5 sm:p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300">
              <IndianRupee size={18} className="sm:w-5 sm:h-5" />
              {priceAlerts.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] sm:text-[10px] font-bold rounded-full min-w-[16px] sm:min-w-[18px] h-[16px] sm:h-[18px] flex items-center justify-center px-1">
                  {priceAlerts.length}
                </span>
              )}
            </button>
            {showPrice && (
              <Popover onClose={() => { setShowPrice(false); void markAlertsRead(); }}>
                <p className="font-semibold text-slate-800 mb-2">Price Fluctuation Alerts</p>
                {priceAlerts.length === 0 ? (
                  <p className="text-sm text-slate-400 py-3">No recent price movements</p>
                ) : (
                  <ul className="space-y-2">
                    {priceAlerts.map((a) => (
                      <li key={a.id} className="text-sm">
                        <span className="text-slate-700">{a.item?.name ?? 'Item'}</span>
                        <span className={cn('ml-2 font-medium', a.diff_amount >= 0 ? 'text-red-600' : 'text-emerald-600')}>
                          {formatINR(a.old_price)} → {formatINR(a.new_price)} ({a.diff_amount >= 0 ? '+' : ''}{formatINR(a.diff_amount)})
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Popover>
            )}
          </div>

          {/* Pending hisaab (owner) */}
          {isOwner && (
            <div className="relative">
              <button onClick={() => { setShowPending(!showPending); setShowLowStock(false); setShowPrice(false); setPage('agencies'); }} className="relative p-1.5 sm:p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300">
                <Inbox size={18} className="sm:w-5 sm:h-5" />
                {pendingCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-teal-600 text-white text-[9px] sm:text-[10px] font-bold rounded-full min-w-[16px] sm:min-w-[18px] h-[16px] sm:h-[18px] flex items-center justify-center px-1">
                    {pendingCount}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Sound On / Mute toggle */}
          <button
            onClick={handleSoundToggle}
            title={soundMuted ? 'Unmute Sound' : 'Mute Sound'}
            aria-label={soundMuted ? 'Unmute Sound' : 'Mute Sound'}
            className="relative p-1.5 sm:p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
          >
            {soundMuted ? <VolumeX size={18} className="sm:w-5 sm:h-5 text-slate-400" /> : <Volume2 size={18} className="sm:w-5 sm:h-5 text-emerald-600" />}
          </button>

          {/* Theme toggle (Light <-> Dark mode with circular wipe) */}
          <button
            onClick={handleThemeToggle}
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="relative p-1.5 sm:p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
          >
            {isDark ? <Sun size={18} className="sm:w-5 sm:h-5 text-amber-400" /> : <Moon size={18} className="sm:w-5 sm:h-5" />}
          </button>

          {/* Language switcher */}
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden shrink-0">
            {(['en', 'hinglish', 'hi'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={cn('px-1.5 sm:px-2 py-1 sm:py-1.5 text-[11px] sm:text-xs font-medium transition-colors', lang === l ? 'bg-emerald-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50')}
              >
                {l === 'en' ? 'EN' : l === 'hinglish' ? 'HiNg' : 'हिं'}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {drawer && (
        <div className="lg:hidden fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm transition-opacity" onMouseDown={(e) => { if (e.target === e.currentTarget) setDrawer(false); }}>
          <div className="absolute inset-y-0 left-0 w-72 bg-white dark:bg-slate-900 shadow-2xl flex flex-col border-r border-slate-200/80 dark:border-slate-800 animate-slide-in-left">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">{store.shop_name}</p>
                <p className="text-xs text-slate-400 font-mono">{store.store_code}</p>
              </div>
              <button onClick={() => setDrawer(false)} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
              {visibleNav.map((n) => {
                const isActive = page === n.key;
                return (
                  <button
                    key={n.key}
                    onClick={() => {
                      playClick();
                      setPage(n.key);
                      setDrawer(false);
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition-all duration-150',
                      isActive
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-semibold shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    )}
                  >
                    {n.icon} {t(n.labelKey, lang)}
                  </button>
                );
              })}
            </nav>
            <button
              onClick={signOut}
              className="flex items-center gap-3 px-6 py-4 text-sm text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 border-t border-slate-100 dark:border-slate-800 transition-colors"
            >
              <LogOut size={18} /> {t('logout', lang)}
            </button>
          </div>
        </div>
      )}

      <main className="lg:pl-60 pb-24 lg:pb-8 overflow-x-hidden">
        <div key={page} className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-5 animate-page-enter">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800/80 flex min-h-[58px] pb-[env(safe-area-inset-bottom)] px-1">
        {mobileItems.map((k) => {
          const item = NAV.find((n) => n.key === k)!;
          const isActive = page === k;
          return (
            <button
              key={k}
              onClick={() => {
                playClick();
                setPage(k);
              }}
              className={cn(
                'relative flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium min-h-[56px] justify-center transition-all duration-200 active:scale-95',
                isActive ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              )}
            >
              {isActive && (
                <span className="absolute inset-x-1.5 inset-y-1 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl -z-10 border border-emerald-500/20" />
              )}
              {item.icon}
              {t(item.labelKey, lang)}
            </button>
          );
        })}
        <button
          onClick={() => setDrawer(true)}
          className="relative flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 min-h-[56px] justify-center transition-all duration-200 active:scale-95"
        >
          <Menu size={20} />
          More
        </button>
      </nav>
    </div>
  );
}

function Popover({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-[80]" onMouseDown={onClose} />
      <Card className="fixed inset-x-3 top-14 z-[90] w-auto max-h-[70dvh] overflow-y-auto sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-80 sm:max-h-96 p-4 shadow-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        {children}
      </Card>
    </>
  );
}
