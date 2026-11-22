import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { Store, WholesaleCustomer, Lang } from '@/lib/types';

interface CustomerAuthState {
  loading: boolean;
  customer: WholesaleCustomer | null;
  store: Store | null;
  lang: Lang;
  setLang: (l: Lang) => void;
  login: (phone: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signOut: () => void;
  refresh: () => Promise<void>;
  isStoreSuspended: boolean;
  isCustomerInactive: boolean;
  isStoreTypeMismatch: boolean;
}

const CustomerAuthContext = createContext<CustomerAuthState | null>(null);

const STORAGE_PHONE_KEY = 'kirana_customer_session_phone';
const STORAGE_LANG_KEY = 'kirana_customer_lang';

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<WholesaleCustomer | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [lang, setLangState] = useState<Lang>(() => {
    return (localStorage.getItem(STORAGE_LANG_KEY) as Lang) || 'en';
  });

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem(STORAGE_LANG_KEY, l);
  }, []);

  const loadCustomerData = useCallback(async (phone: string): Promise<boolean> => {
    try {
      const { data: custRow, error: custErr } = await supabase
        .from('wholesale_customers')
        .select('*')
        .eq('phone', phone)
        .maybeSingle();

      if (custErr || !custRow) {
        setCustomer(null);
        setStore(null);
        return false;
      }

      const { data: storeRow, error: storeErr } = await supabase
        .from('stores')
        .select('*')
        .eq('id', custRow.store_id)
        .maybeSingle();

      if (storeErr || !storeRow) {
        setCustomer(null);
        setStore(null);
        return false;
      }

      setCustomer(custRow as WholesaleCustomer);
      setStore(storeRow as Store);
      return true;
    } catch (err) {
      console.error('Error loading customer session:', err);
      return false;
    }
  }, []);

  // On mount check stored phone
  useEffect(() => {
    const savedPhone = localStorage.getItem(STORAGE_PHONE_KEY);
    if (!savedPhone) {
      setLoading(false);
      return;
    }

    loadCustomerData(savedPhone).finally(() => {
      setLoading(false);
    });
  }, [loadCustomerData]);

  // Realtime subscription for customer and store changes
  useEffect(() => {
    if (!customer?.id || !store?.id) return;

    const channel = supabase
      .channel(`cust-realtime-${customer.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wholesale_customers', filter: `id=eq.${customer.id}` },
        (payload) => {
          if (payload.new) {
            setCustomer(payload.new as WholesaleCustomer);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stores', filter: `id=eq.${store.id}` },
        (payload) => {
          if (payload.new) {
            setStore(payload.new as Store);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [customer?.id, store?.id]);

  const login = async (phone: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      return { ok: false, error: 'Please enter a valid 10-digit mobile number' };
    }
    if (!password) {
      return { ok: false, error: 'Please enter your password' };
    }

    try {
      const { data: custRow, error: custErr } = await supabase
        .from('wholesale_customers')
        .select('*')
        .eq('phone', cleanPhone)
        .maybeSingle();

      if (custErr) {
        return { ok: false, error: custErr.message };
      }

      if (!custRow) {
        return { ok: false, error: 'No account found with this mobile number. Contact your wholesaler.' };
      }

      // Password verification: match password_digest or if password_digest is null (initial), allow and update
      if (custRow.password_digest && custRow.password_digest !== password) {
        return { ok: false, error: 'Incorrect password. Please try again or ask your wholesaler.' };
      }

      // If initial null password, set password_digest to password entered
      if (!custRow.password_digest) {
        await supabase
          .from('wholesale_customers')
          .update({ password_digest: password })
          .eq('id', custRow.id);
      }

      const { data: storeRow, error: storeErr } = await supabase
        .from('stores')
        .select('*')
        .eq('id', custRow.store_id)
        .maybeSingle();

      if (storeErr || !storeRow) {
        return { ok: false, error: 'Linked wholesaler store not found' };
      }

      const c = custRow as WholesaleCustomer;
      const s = storeRow as Store;

      setCustomer(c);
      setStore(s);
      localStorage.setItem(STORAGE_PHONE_KEY, cleanPhone);

      return { ok: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      return { ok: false, error: msg };
    }
  };

  const signOut = () => {
    localStorage.removeItem(STORAGE_PHONE_KEY);
    setCustomer(null);
    setStore(null);
  };

  const refresh = async () => {
    if (customer?.phone) {
      await loadCustomerData(customer.phone);
    }
  };

  const isStoreSuspended = !!store && store.is_active === false;
  const isCustomerInactive = !!customer && customer.is_active === false;
  const isStoreTypeMismatch = !!store && store.store_type !== 'wholesale' && store.store_type !== 'mix';

  return (
    <CustomerAuthContext.Provider
      value={{
        loading,
        customer,
        store,
        lang,
        setLang,
        login,
        signOut,
        refresh,
        isStoreSuspended,
        isCustomerInactive,
        isStoreTypeMismatch,
      }}
    >
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth() {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error('useCustomerAuth must be used within CustomerAuthProvider');
  return ctx;
}
