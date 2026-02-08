
import { loadStripe } from '@stripe/stripe-js';
import { supabase } from '../lib/supabaseClient';
import { SubscriptionStatus, SubscriptionTier } from "../types";

// --- CONFIGURATION ---

// 1. LINKS FOR PRO TIER ($29/mo or $299/yr)
export const STRIPE_PAYMENT_LINK_PRO_MONTHLY = "https://buy.stripe.com/test_9B63cu9A1b9k19L1En8so00";
export const STRIPE_PAYMENT_LINK_PRO_YEARLY = "https://buy.stripe.com/5kQaEWaEq7rm17e3N61ck03";

// 2. LINKS FOR PLUS TIER ($9.99/mo or $99/yr)
export const STRIPE_PAYMENT_LINK_PLUS_MONTHLY = "https://buy.stripe.com/cNicN427U3b617ecjC1ck01";
export const STRIPE_PAYMENT_LINK_PLUS_YEARLY = "https://buy.stripe.com/aFa3cubIucLGcPWcjC1ck02";

// ---------------------

// OPTION 2: ADVANCED (Edge Function API)
// Only required if you are NOT using Payment Links above.
const STRIPE_PUBLISHABLE_KEY = "pk_test_REPLACE_WITH_YOUR_KEY";
const PRICE_ID_PRO = "price_REPLACE_WITH_PRO_ID";
const PRICE_ID_PLUS = "price_REPLACE_WITH_PLUS_ID";

// ---------------------

// Hardcoded Admin Emails (Temporary Override)
const ADMIN_EMAILS = ['bluegator05@gmail.com', 'apple_test@scantosold.com'];

// Tier limits configuration
const TIER_LIMITS = {
  FREE: {
    totalScans: 15,
    dailyScans: Infinity,
    dailyOptimizations: 3
  },
  PLUS: {
    totalScans: Infinity,
    dailyScans: Infinity,
    dailyOptimizations: 20
  },
  PRO: {
    totalScans: Infinity,
    dailyScans: Infinity,
    dailyOptimizations: Infinity
  }
};

// Fetch subscription status from server (replaces localStorage)
export const getSubscriptionStatus = async (userId?: string, email?: string): Promise<SubscriptionStatus> => {
  const defaultStatus: SubscriptionStatus = {
    tier: 'FREE',
    totalScans: 0,
    maxTotalScans: 15,
    dailyScans: 0,
    maxDailyScans: Infinity,
    dailyOptimizations: 0,
    maxDailyOptimizations: 3,
    showSoftWarning: false
  };

  // 1. Admin Override Check
  if (email && ADMIN_EMAILS.includes(email.toLowerCase())) {
    return {
      ...defaultStatus,
      tier: 'PRO',
      maxTotalScans: Infinity,
      maxDailyOptimizations: Infinity
    };
  }

  if (!userId) return defaultStatus;

  // 2. Try to fetch from server-side track-usage function
  try {
    const { data, error } = await supabase.functions.invoke('track-usage', {
      body: { action: 'check' }
    });

    if (!error && data && !data.error) {
      return {
        tier: data.tier || 'FREE',
        totalScans: data.totalScans || 0,
        maxTotalScans: data.maxTotalScans || 15,
        dailyScans: data.dailyScans || 0,
        maxDailyScans: data.maxDailyScans || Infinity,
        dailyOptimizations: data.dailyOptimizations || 0,
        maxDailyOptimizations: data.maxDailyOptimizations || 3,
        showSoftWarning: data.showSoftWarning || false,
        stripeCustomerId: data.stripeCustomerId
      };
    }
  } catch (e) {
    console.warn('track-usage function not available, falling back to database query');
  }

  // 3. Fallback: Query database directly
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('tier, total_scans, total_optimizations, daily_scans_count, daily_optimizations_count, last_reset_date, stripe_customer_id')
      .eq('id', userId)
      .single();

    if (error || !data) {
      console.error('Failed to fetch profile from database:', error);
      return defaultStatus;
    }

    const tier = (data.tier as 'FREE' | 'PLUS' | 'PRO') || 'FREE';
    const limits = TIER_LIMITS[tier];

    // Check if we need to reset daily counters
    const today = new Date().toISOString().split('T')[0];
    const needsReset = data.last_reset_date !== today;

    return {
      tier,
      totalScans: data.total_scans || 0,
      maxTotalScans: limits.totalScans,
      dailyScans: needsReset ? 0 : (data.daily_scans_count || 0),
      maxDailyScans: limits.dailyScans,
      dailyOptimizations: needsReset ? 0 : (data.daily_optimizations_count || 0),
      maxDailyOptimizations: limits.dailyOptimizations,
      showSoftWarning: tier === 'FREE' && (data.total_scans || 0) >= 10 && (data.total_scans || 0) < 15,
      stripeCustomerId: data.stripe_customer_id
    };

  } catch (e) {
    console.error("Failed to fetch subscription from database", e);
    return defaultStatus;
  }
};

// Increment usage on server (replaces localStorage)
export const incrementUsage = async (featureType: 'scan' | 'optimization'): Promise<{ success: boolean; error?: string; data?: any }> => {
  try {
    const { data, error } = await supabase.functions.invoke('track-usage', {
      body: {
        action: 'increment',
        featureType
      }
    });

    if (error) {
      return { success: false, error: error.message || 'Failed to increment usage' };
    }

    if (data?.error) {
      return { success: false, error: data.message, data };
    }

    return { success: true, data };

  } catch (e: any) {
    console.error("Failed to increment usage:", e);
    return { success: false, error: e.message || 'Unknown error' };
  }
};

// Check if user can perform action (without incrementing)
export const canPerformAction = async (featureType: 'scan' | 'optimization'): Promise<{ allowed: boolean; reason?: string; showSoftWarning?: boolean }> => {
  try {
    const { data, error } = await supabase.functions.invoke('track-usage', {
      body: { action: 'check' }
    });

    if (error || !data) {
      return { allowed: true }; // Fail open
    }

    if (featureType === 'scan') {
      const allowed = data.canScan !== false;
      return {
        allowed,
        reason: allowed ? undefined : `You've reached your scan limit. Please upgrade.`,
        showSoftWarning: data.showSoftWarning
      };
    } else {
      const allowed = data.canOptimize !== false;
      return {
        allowed,
        reason: allowed ? undefined : `You've reached your daily optimization limit.`
      };
    }

  } catch (e) {
    console.error("Failed to check action permission:", e);
    return { allowed: true }; // Fail open
  }
};

// Handles the logic to send user to Stripe
export const startStripeCheckout = async (userId: string, email: string, tier: 'PLUS' | 'PRO', interval: 'MONTHLY' | 'YEARLY' = 'MONTHLY') => {
  try {
    // METHOD A: Payment Link (No-Code / Low-Code)
    let linkToUse = '';

    if (tier === 'PRO') {
      linkToUse = interval === 'YEARLY' ? STRIPE_PAYMENT_LINK_PRO_YEARLY : STRIPE_PAYMENT_LINK_PRO_MONTHLY;
    } else {
      linkToUse = interval === 'YEARLY' ? STRIPE_PAYMENT_LINK_PLUS_YEARLY : STRIPE_PAYMENT_LINK_PLUS_MONTHLY;
    }

    if (linkToUse && linkToUse.startsWith('http') && !linkToUse.includes('REPLACE_WITH')) {
      // We append client_reference_id so Stripe knows WHO paid (via webhook later)
      const separator = linkToUse.includes('?') ? '&' : '?';
      const checkoutUrl = `${linkToUse}${separator}client_reference_id=${userId}&prefilled_email=${encodeURIComponent(email)}`;

      window.location.href = checkoutUrl;
      return true;
    }

    // METHOD B: Edge Function (Professional API)
    // Fallback if links are empty/default
    const stripe = await loadStripe(STRIPE_PUBLISHABLE_KEY);
    if (!stripe) throw new Error("Stripe failed to initialize. Check your keys.");

    const priceId = tier === 'PRO' ? PRICE_ID_PRO : PRICE_ID_PLUS;

    // Call Supabase Edge Function 'checkout'
    const { data, error } = await supabase.functions.invoke('checkout', {
      body: {
        price_id: priceId,
        user_id: userId,
        email: email,
        return_url: window.location.origin
      }
    });

    if (error) throw error;
    if (!data?.url) throw new Error("No checkout URL returned from backend.");

    // Redirect
    window.location.href = data.url;

  } catch (e: any) {
    console.error("Checkout Error:", e);
    alert(`Payment Link Missing for ${tier} tier. Please configure STRIPE_PAYMENT_LINK_${tier} in src/services/paymentService.ts`);
    return false;
  }
  return true;
};

// Portal to manage subscription
export const openCustomerPortal = async () => {
  try {
    const { data, error } = await supabase.functions.invoke('portal', {
      body: { return_url: window.location.origin }
    });

    if (error) throw error;
    if (data?.url) window.location.href = data.url;
  } catch (e) {
    console.error("Portal Error:", e);
    alert("Could not open billing portal. Please contact support.");
  }
};
