import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Store, StoreUser, Lang, FeatureFlags } from '@/lib/types';

interface AppState {
  loading: boolean;
  session: Session | null;
  store: Store | null;
  user: StoreUser | null;
  lang: Lang;
  setLang: (l: Lang) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  hasFeature: (key: string) => boolean;
  isOwner: boolean;
}

const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [user, setUser] = useState<StoreUser | null>(null);
  const [lang, setLangState] = useState<Lang>('en');

  const loadForSession = useCallback(async (s: Session | null) => {
    setSession(s);
    if (!s?.user) {
      setStore(null);
      setUser(null);
      setLoading(false);
      return;
    }
    const { data: userRow } = await supabase
      .from('store_users')
      .select('*')
      .eq('auth_user_id', s.user.id)
      .eq('is_active', true)
      .maybeSingle();
    if (!userRow) {
      setStore(null);
      setUser(null);
      setLoading(false);
      return;
    }
    const { data: storeRow } = await supabase
      .from('stores')
      .select('*')
      .eq('id', userRow.store_id)
      .maybeSingle();
    setUser(userRow as StoreUser);
    setStore((storeRow as Store) ?? null);
    if (storeRow) setLangState((storeRow.language as Lang) ?? 'en');
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      void loadForSession(data.session ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      void (async () => {
        await loadForSession(s);
      })();
    });
    return () => sub.subscription.unsubscribe();
  }, [loadForSession]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    if (store) {
      void supabase.from('stores').update({ language: l }).eq('id', store.id);
    }
  }, [store]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await loadForSession(data.session ?? null);
  }, [loadForSession]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setStore(null);
    setUser(null);
  }, []);

  const flags: FeatureFlags = store?.feature_flags ?? {};
  const hasFeature = useCallback((key: string) => flags[key] === true || flags[key] === undefined, [flags]);
  const isOwner = user?.role === 'owner';

  return (
    <AppContext.Provider value={{ loading, session, store, user, lang, setLang, refresh, signOut, hasFeature, isOwner }}>
      {children}
    </AppContext.Provider>
  );
}
