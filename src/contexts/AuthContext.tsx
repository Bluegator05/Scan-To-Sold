
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { App } from '@capacitor/app';
import { supabase } from '../lib/supabaseClient';
import { User, Session } from '@supabase/supabase-js';
import { getSubscriptionStatus } from '../services/paymentService';
import { SubscriptionStatus } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  subscription: SubscriptionStatus;
  refreshSubscription: () => void;
  signInWithMagicLink: (email: string) => Promise<{ data: { session: Session | null; user: User | null } | null; error: any }>;
  signInWithPassword: (email: string, password: string) => Promise<{ data: { session: Session | null; user: User | null } | null; error: any }>;
  signInWithGoogle: () => Promise<{ data: any; error: any }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ data: { session: Session | null; user: User | null } | null; error: any }>;
  updatePassword: (password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionStatus>({ tier: 'FREE', scansToday: 0, maxDailyScans: 3 });

  const refreshSubscription = async () => {
    if (user) {
      const status = await getSubscriptionStatus(user.id, user.email);
      setSubscription(status);
    }
  };

  useEffect(() => {
    let mounted = true;
    let profileSubscription: any = null;

    // Detect if we are returning from a Magic Link or OAuth provider
    const isAuthCallback =
      window.location.search.includes('code=') ||
      window.location.hash.includes('access_token=') ||
      window.location.hash.includes('error_description=') ||
      window.location.search.includes('error_description=');

    const initSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (mounted) {
          if (session) {
            setUser(session.user);
            const status = await getSubscriptionStatus(session.user.id, session.user.email);
            if (mounted) setSubscription(status);
          }

          // CRITICAL FIX: 
          // If we are in an auth callback flow (URL has code/token), do NOT turn off loading yet.
          // We must wait for onAuthStateChange to fire 'SIGNED_IN' after it processes the token.
          // Only turn off loading here if we are definitely NOT processing a login link.
          if (!isAuthCallback) {
            setLoading(false);
          }
        }
      } catch (e) {
        console.error("Auth Session Error:", e);
        if (mounted && !isAuthCallback) setLoading(false);
      }
    };

    initSession();

    // Safety fallback: Always force loading off after a timeout to prevent infinite stuck states.
    // This handles cases where auth callbacks fail silently or network requests hang.
    const safetyTimer = setTimeout(() => {
      if (mounted && loading) {
        console.warn("Auth loading safety timeout triggered - forcing app render.");
        setLoading(false);
      }
    }, 4000);

    // Listen for Auth State Changes (Login/Logout/Token Exchange)
    const {
      data: { subscription: authListener },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // console.log("Auth Event:", event); // Debugging

      if (mounted) {
        if (session) {
          setUser(session.user);
          // Only refresh sub if strictly necessary to avoid double calls
          if (!user || user.id !== session.user.id) {
            const status = await getSubscriptionStatus(session.user.id, session.user.email);
            if (mounted) setSubscription(status);
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setSubscription({ tier: 'FREE', scansToday: 0, maxDailyScans: 3 });
        }

        // If onAuthStateChange fires, Supabase has likely finished processing the initial state/URL
        setLoading(false);
      }
    });

    // Listen for deep links (Capacitor)
    let appListener: any;

    const handleAuthUrl = async (url: URL) => {
      // Only handle Supabase Auth URLs (PKCE or Implicit)
      const hasCode = url.searchParams.has('code');
      const hasToken = url.hash.includes('access_token');
      const hasError = url.searchParams.has('error_description') || url.hash.includes('error_description');

      if (!hasCode && !hasToken && !hasError) {
        return; // Not an auth URL, ignore it (let other listeners handle it)
      }

      setLoading(true); // Show loading screen while processing

      // Handle PKCE Flow (code)
      if (hasCode) {
        const code = url.searchParams.get('code');
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
        return;
      }

      // Handle Implicit Flow (access_token in hash)
      if (hasToken) {
        const hash = url.hash.substring(1);
        const params = new URLSearchParams(hash);
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');

        if (access_token && refresh_token) {
          await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
        }
      }

      // Handle Errors
      if (hasError) {
        setLoading(false);
      }
    };

    const setupAppListener = async () => {
      appListener = await App.addListener('appUrlOpen', async (data) => {
        try {
          const url = new URL(data.url);
          await handleAuthUrl(url);
        } catch (e: any) {
          console.error("Deep Link Error:", e);
          if (mounted) setLoading(false);
        }
      });

      // Check if app was launched with a URL (Cold Start)
      const launchUrl = await App.getLaunchUrl();
      if (launchUrl && launchUrl.url) {
        const url = new URL(launchUrl.url);
        // Only handle if it's an auth callback
        if (url.searchParams.has('code') || url.hash.includes('access_token')) {
          await handleAuthUrl(url);
        }
      }
    };
    setupAppListener();

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      authListener.unsubscribe();
      if (profileSubscription) profileSubscription.unsubscribe();
      if (appListener) appListener.remove();
    };
  }, []);

  const signInWithMagicLink = async (email: string) => {
    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });
    return { data, error };
  };

  const signInWithPassword = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  };

  const signInWithGoogle = async () => {
    // Determine if we are running in a native app (Capacitor) or web
    const isNative = window.location.protocol === 'capacitor:' || window.location.protocol === 'file:';

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: isNative
          ? 'scantosold://login-callback'
          : window.location.origin,
      },
    });
    return { data, error };
  };

  const signUpWithPassword = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    return { data, error };
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({
      password: password
    });
    return { error };
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, subscription, refreshSubscription, signInWithMagicLink, signInWithPassword, signInWithGoogle, signUpWithPassword, updatePassword, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
