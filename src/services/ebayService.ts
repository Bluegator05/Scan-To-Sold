import { supabase } from '../lib/supabaseClient';
import { Comp } from '../types';
import { Browser } from '@capacitor/browser';

// --- CONFIGURATION ---
// REPLACE THIS with your actual backend URL (e.g. https://my-api.render.com or Supabase Edge Function URL)
const API_BASE_URL = "https://www.scantosold.com";
// ---------------------

const EBAY_TOKEN_KEY = 'sts_ebay_connected';

export const isEbayConnected = (): boolean => {
  return !!localStorage.getItem(EBAY_TOKEN_KEY);
};

export const extractEbayId = (url: string): string | null => {
  try {
    // Handle "ebay.com/itm/123456789"
    const match = url.match(/(?:itm\/|item\/)(\d+)/);
    if (match && match[1]) return match[1];

    // Handle "ebay.to/..." or other redirectors? (Requires expansion if needed)
    // Handle parameters ?itm=123456
    const urlObj = new URL(url);
    const itmParam = urlObj.searchParams.get('itm');
    if (itmParam) return itmParam;

    return null;
  } catch (e) {
    return null;
  }
};

const getApiUrl = (endpoint: string) => {
  if (API_BASE_URL.includes("PASTE_YOUR")) {
    console.error("API_BASE_URL not configured in src/services/ebayService.ts");
    return null;
  }
  return `${API_BASE_URL}${endpoint}`;
}

export const checkEbayConnection = async (): Promise<boolean> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const url = getApiUrl(`/api/ebay/status?userId=${user.id}&t=${Date.now()}`);
  if (!url) return false;

  // alert(`Checking eBay status for: ${user.id}`); // DEBUG

  try {
    const response = await fetch(url);
    if (!response.ok) return false;

    const data = await response.json();

    if (data.connected) {
      localStorage.setItem(EBAY_TOKEN_KEY, 'true');
    } else {
      localStorage.removeItem(EBAY_TOKEN_KEY);
    }

    return data.connected;
  } catch (error) {
    console.error("Status check failed", error);
    return false;
  }
};

export const connectEbayAccount = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert("No user found!"); // DEBUG
      return;
    }

    const authUrl = getApiUrl(`/api/ebay/auth?userId=${user.id}&platform=native`);
    // alert(`Opening Auth URL: ${authUrl}`); // DEBUG

    await Browser.open({ url: authUrl });
  } catch (error: any) {
    alert(`Connect Error: ${error.message}`); // DEBUG
    console.error("Failed to open eBay auth", error);
  }
};

export const disconnectEbayAccount = async (): Promise<void> => {
  const { data: { user } } = await supabase.auth.getUser();

  const url = getApiUrl(`/api/ebay/disconnect?userId=${user?.id}`);

  if (user && url) {
    try {
      await fetch(url);
    } catch (e) {
      console.error("Failed to disconnect on server", e);
    }
  }

  localStorage.removeItem(EBAY_TOKEN_KEY);
  window.location.reload();
};

export const searchEbayComps = async (query: string, tab: 'ACTIVE' | 'SOLD' = 'ACTIVE', condition: 'NEW' | 'USED' = 'USED'): Promise<{ averagePrice: string, comps: Comp[] }> => {
  const url = getApiUrl(`/api/ebay/search-comps?query=${encodeURIComponent(query)}&tab=${tab}&condition=${condition}`);
  if (!url) throw new Error("Backend URL not configured");

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to fetch comps");
    }
    return await res.json();
  } catch (error: any) {
    console.error("Comp search failed", error);
    throw error;
  }
};

export const searchEbayByImage = async (imageBase64: string): Promise<any[]> => {
  const url = getApiUrl('/api/ebay/search-image');
  if (!url) return [];

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64 })
    });

    if (!res.ok) throw new Error("Visual search failed");

    const data = await res.json();
    return data.results || [];
  } catch (e) {
    console.error("Visual Search Error:", e);
    return [];
  }
};

export const fetchEbayItemDetails = async (itemId: string): Promise<any> => {
  const url = getApiUrl(`/api/ebay/fetch-item?itemId=${encodeURIComponent(itemId)}`);
  if (!url) throw new Error("Backend URL not configured");

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error("Failed to fetch item details");
    }
    return await res.json();
  } catch (error) {
    console.error("Fetch details error:", error);
    throw error;
  }
};

export const getEbayPolicies = async (userId: string) => {
  const url = getApiUrl(`/api/ebay/get-policies?userId=${userId}`);
  if (!url) return { paymentPolicies: [], returnPolicies: [], shippingPolicies: [] };

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch policies");
    return await res.json();
  } catch (e) {
    console.error(e);
    return { paymentPolicies: [], returnPolicies: [], shippingPolicies: [] };
  }
};
