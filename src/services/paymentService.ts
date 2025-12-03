
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

const SCAN_LIMIT_KEY = 'sts_scan_limit_';

// Hardcoded Admin Emails (Temporary Override)
const ADMIN_EMAILS = ['bluegator05@gmail.com'];

export const getDailyUsage = (): number => {
  const today = new Date().toLocaleDateString();
  const key = `${SCAN_LIMIT_KEY}${today}`;
  const count = localStorage.getItem(key);
  return count ? parseInt(count, 10) : 0;
};

export const incrementDailyUsage = (): number => {
  const today = new Date().toLocaleDateString();
  const key = `${SCAN_LIMIT_KEY}${today}`;
  const current = getDailyUsage();
  const newCount = current + 1;
  localStorage.setItem(key, newCount.toString());
  return newCount;
};

// Now fetches from Database (Profiles Table)
export const getSubscriptionStatus = async (userId?: string, email?: string): Promise<SubscriptionStatus> => {
  const defaultStatus: SubscriptionStatus = {
    tier: 'FREE',
    scansToday: getDailyUsage(),
    maxDailyScans: 3
  };

  // 1. Admin Override Check
  if (email && ADMIN_EMAILS.includes(email.toLowerCase())) {
    return { ...defaultStatus, tier: 'PRO', maxDailyScans: Infinity };
  }

  if (!userId) return defaultStatus;

  // 2. Database Check
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('tier, stripe_customer_id')
      .eq('id', userId)
      .single();

    if (error || !data) {
      return defaultStatus;
    }

    const tier = (data.tier as SubscriptionTier) || 'FREE';

    let maxScans = 3;
    if (tier === 'PLUS') maxScans = 30;
    if (tier === 'PRO') maxScans = Infinity;

    return {
      tier: tier,
      scansToday: getDailyUsage(),
      maxDailyScans: maxScans,
      stripeCustomerId: data.stripe_customer_id
    };

  } catch (e) {
    console.error("Failed to fetch subscription", e);
    return defaultStatus;
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
