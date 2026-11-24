import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { PlatformAdmin } from '@/lib/types';

interface AdminAuthContextType {
  user: User | null;
  admin: PlatformAdmin | null;
  isSuperAdmin: boolean;
  loading: boolean;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  signIn: (identifier: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  refreshAdmin: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | null>(null);

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [admin, setAdmin] = useState<PlatformAdmin | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('kirana_admin_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('kirana_admin_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const fetchAdminProfile = async (currentUser: User): Promise<PlatformAdmin | null> => {
    try {
      const email = currentUser.email || '';
      const phoneDigits = currentUser.user_metadata?.phone || (email.includes('@kirana.app') ? email.replace('@kirana.app', '') : '');

      // Check by auth_user_id first
      let { data } = await supabase
        .from('platform_admins')
        .select('*')
        .eq('auth_user_id', currentUser.id)
        .maybeSingle();

      // If not found by auth_user_id, check by email
      if (!data && email) {
        const { data: byEmail } = await supabase
          .from('platform_admins')
          .select('*')
          .eq('email', email)
          .maybeSingle();
        data = byEmail;
      }

      // If not found, check by phone
      if (!data && phoneDigits) {
        const { data: byPhone } = await supabase
          .from('platform_admins')
          .select('*')
          .eq('phone', phoneDigits)
          .maybeSingle();
        data = byPhone;
      }

      // If matched, link auth_user_id if missing or mismatch
      if (data && data.auth_user_id !== currentUser.id) {
        await supabase
          .from('platform_admins')
          .update({ auth_user_id: currentUser.id })
          .eq('id', data.id);
        data.auth_user_id = currentUser.id;
      }

      return data as PlatformAdmin | null;
    } catch (err) {
      console.error('Error fetching admin profile:', err);
      return null;
    }
  };

  const verifyAndSetSession = async (currentUser: User | null) => {
    if (!currentUser) {
      setUser(null);
      setAdmin(null);
      setLoading(false);
      return;
    }

    const adminProfile = await fetchAdminProfile(currentUser);
    if (!adminProfile) {
      console.warn('Unauthorized login attempt by non-admin user:', currentUser.email);
      await supabase.auth.signOut();
      setUser(null);
      setAdmin(null);
      setLoading(false);
      return;
    }

    setUser(currentUser);
    setAdmin(adminProfile);
    setLoading(false);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      verifyAndSetSession(session?.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      verifyAndSetSession(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (identifier: string, password: string): Promise<{ success: boolean; error?: string }> => {
    const clean = identifier.trim();
    if (!clean) return { success: false, error: 'Please enter Email or 10-digit Mobile' };
    if (!password) return { success: false, error: 'Please enter Password' };

    // Build candidate login emails
    const candidateEmails: string[] = [];

    if (/^\d{10}$/.test(clean)) {
      // 1. Look up exact email registered for this mobile in platform_admins
      try {
        const { data: adminRecord } = await supabase
          .from('platform_admins')
          .select('email')
          .eq('phone', clean)
          .maybeSingle();

        if (adminRecord?.email) {
          candidateEmails.push(adminRecord.email);
        }
      } catch (e) {
        console.warn('Error resolving admin by phone:', e);
      }

      candidateEmails.push(`${clean}@kirana.app`);
    } else {
      candidateEmails.push(clean);
    }

    let authUser: User | null = null;
    let authError: string | null = null;

    for (const loginEmail of candidateEmails) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });

      if (!error && data.user) {
        authUser = data.user;
        authError = null;
        break;
      } else if (error) {
        authError = error.message;
      }
    }

    if (!authUser) {
      return {
        success: false,
        error: authError === 'Invalid login credentials' ? 'Incorrect email/mobile or password' : (authError || 'Login failed'),
      };
    }

    const adminProfile = await fetchAdminProfile(authUser);
    if (!adminProfile) {
      await supabase.auth.signOut();
      return {
        success: false,
        error: 'Access Denied: This account is not registered in Platform Admins. Super Admin access only.',
      };
    }

    setUser(authUser);
    setAdmin(adminProfile);
    return { success: true };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setAdmin(null);
  };

  const refreshAdmin = async () => {
    if (user) {
      const p = await fetchAdminProfile(user);
      setAdmin(p);
    }
  };

  return (
    <AdminAuthContext.Provider
      value={{
        user,
        admin,
        isSuperAdmin: admin?.role === 'super_admin',
        loading,
        theme,
        toggleTheme,
        signIn,
        signOut,
        refreshAdmin,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
};

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}
