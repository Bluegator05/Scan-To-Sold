
import { createClient } from '@supabase/supabase-js';

// --- CONFIGURATION ---
// STEP 1: Replace the strings below with your Supabase credentials.
// You can find these in your Supabase Dashboard -> Project Settings -> API

const MANUAL_SUPABASE_URL = "https://urnvmiktzkwdlmfeznjj.supabase.co";
const MANUAL_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVybnZtaWt0emt3ZGxtZmV6bmpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4MzU4MjUsImV4cCI6MjA3OTQxMTgyNX0.I6wW-RRlsJC-9xtTTUpnsKcXbTayE9cvyyWcz9jK3B4";

// ---------------------

// Logic to prefer Env vars (if deploying later) but fallback to the manual strings above
const getEnv = (key: string) => {
  // Check import.meta.env (Vite)
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    // @ts-ignore
    return import.meta.env[key];
  }
  // Check process.env (Node/Compat)
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }
  } catch (e) {
    // Ignore process access errors in strict browser envs
  }
  return undefined;
};

const envUrl = getEnv('VITE_SUPABASE_URL');
const envKey = getEnv('VITE_SUPABASE_ANON_KEY');

const rawUrl = envUrl || MANUAL_SUPABASE_URL;
const rawKey = envKey || MANUAL_SUPABASE_ANON_KEY;

// Safety check to prevent app crash on invalid URLs
const isValidUrl = (url: string) => {
  try {
    return Boolean(new URL(url));
  } catch (e) {
    return false;
  }
};

const supabaseUrl = isValidUrl(rawUrl) ? rawUrl : "https://placeholder.supabase.co";
const supabaseAnonKey = rawKey || "placeholder";

// Helper to check if keys are configured (used by UI)
export const isSupabaseConfigured = () => {
  return (
    isValidUrl(rawUrl) &&
    !rawUrl.includes("PASTE_YOUR") &&
    rawKey.length > 20 &&
    !rawKey.includes("PASTE_YOUR")
  );
};

if (!isSupabaseConfigured()) {
  console.warn("⚠️ Supabase credentials missing! Please edit src/lib/supabaseClient.ts and paste your keys.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const getAuthHeaders = async (): Promise<HeadersInit> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    return {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    };
  }
  return { 'Content-Type': 'application/json' };
};
