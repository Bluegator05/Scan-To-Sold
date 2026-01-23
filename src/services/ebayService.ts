import { supabase, getAuthHeaders } from '../lib/supabaseClient';
import { Comp } from '../types';
import { Browser } from '@capacitor/browser';

// --- CONFIGURATION ---
export const API_BASE_URL = "https://www.scantosold.com";
const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_BASE_URL || "https://urnvmiktzkwdlmfeznjj.supabase.co/functions/v1";
// ---------------------

const EBAY_TOKEN_KEY = 'sts_ebay_connected';

export const isEbayConnected = (): boolean => {
  return !!localStorage.getItem(EBAY_TOKEN_KEY);
};

export const extractEbayId = (url: string): string | null => {
  try {
    const match = url.match(/(?:itm\/|item\/)(\d+)/);
    if (match && match[1]) return match[1];

    const urlObj = new URL(url);
    const itmParam = urlObj.searchParams.get('itm');
    if (itmParam) return itmParam;

    return null;
  } catch (e) { return null; }
};

const getApiUrl = (endpoint: string) => {
  return `${API_BASE_URL}${endpoint}`;
}

const getSearchCache = (key: string) => {
  try {
    const item = localStorage.getItem(`ebay_search_cache_${key}`);
    if (!item) return null;
    const { data, timestamp } = JSON.parse(item);
    if (timestamp && (Date.now() - timestamp < 1000 * 60 * 30)) return data;
  } catch (e) { return null; }
  return null;
};

const setSearchCache = (key: string, data: any) => {
  try {
    if (data?.comps?.length === 0) return;
    localStorage.setItem(`ebay_search_cache_${key}`, JSON.stringify({ data, timestamp: Date.now() }));
  } catch (e) { }
};

export const searchEbayComps = async (query: string, tab: 'ACTIVE' | 'SOLD' = 'ACTIVE', condition: 'NEW' | 'USED' = 'USED', bypassCache = false): Promise<{ averagePrice: string, comps: Comp[], isEstimated?: boolean, marketStats?: any, isRateLimited?: boolean, debug?: string[], queryUsed?: string }> => {
  const cacheKey = `${query}_${tab}_${condition}`;

  if (!bypassCache) {
    const cached = getSearchCache(cacheKey);
    if (cached) return cached;
  }

  const url = getApiUrl(`/api/ebay/search-comps?query=${encodeURIComponent(query)}&tab=${tab}&condition=${condition}&t=${Date.now()}`);

  console.log(`[eBay] Frontend Requesting: ${url}`);
  const res = await fetch(url, { headers: await getAuthHeaders() });

  if (res.status === 429) {
    return { averagePrice: "0.00", comps: [], isRateLimited: true };
  }

  const data = await res.json();
  if (!res.ok) {
    const error = new Error(data.error || `Search failed (${res.status})`) as any;
    error.debug = data.debug;
    throw error;
  }

  setSearchCache(cacheKey, data);
  return data;
};

export const fetchMarketData = async (query: string, condition: 'NEW' | 'USED' = 'USED') => {
  const data = await searchEbayComps(query, 'SOLD', condition);
  if (data.isRateLimited) {
    return { medianSoldPrice: 0, priceRange: { min: 0, max: 0 }, totalActive: 0, totalSold: 0, sellThroughRate: 0, isSoldBlocked: true, activeComps: [], soldComps: [], isRateLimited: true };
  }
  const marketStats = data.marketStats || { activeCount: 0, soldCount: 0, sellThroughRate: 0 };
  const soldPrices = data.comps.map(c => c.price);
  const medianSoldPrice = parseFloat(data.averagePrice);

  const calculatePricingRecommendations = (prices: number[], median: number) => {
    if (prices.length === 0) return null;
    const sorted = [...prices].sort((a, b) => a - b);
    return {
      quickSale: { price: Math.round((sorted[Math.floor(sorted.length * 0.25)] || sorted[0]) * 100) / 100, strategy: "Aggressive Pricing", description: "Set below market median.", expectedSellTime: "1-3 days" },
      competitive: { price: Math.round(median * 100) / 100, strategy: "Market Balanced", description: "Aligned with median.", expectedSellTime: "3-7 days" },
      premium: { price: Math.round((sorted[Math.floor(sorted.length * 0.75)] || sorted[sorted.length - 1]) * 100) / 100, strategy: "Maximum Value", description: "Higher end.", expectedSellTime: "7-14 days" },
      shippingEstimate: 7.99
    };
  };

  return {
    medianSoldPrice,
    priceRange: { min: Math.min(...soldPrices), max: Math.max(...soldPrices) },
    totalActive: marketStats.activeCount,
    totalSold: marketStats.soldCount,
    sellThroughRate: marketStats.sellThroughRate,
    isSoldBlocked: false,
    activeComps: [],
    soldComps: data.comps.slice(0, 10),
    pricingRecommendations: calculatePricingRecommendations(soldPrices, medianSoldPrice),
    isEstimated: !!data.isEstimated,
    isRateLimited: false
  };
};

export const checkEbayConnection = async (): Promise<boolean> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const url = getApiUrl(`/api/ebay/status?userId=${user.id}&t=${Date.now()}`);
  try {
    const response = await fetch(url, { headers: await getAuthHeaders() });
    if (!response.ok) return false;
    const data = await response.json();
    if (data.connected) localStorage.setItem(EBAY_TOKEN_KEY, 'true');
    else localStorage.removeItem(EBAY_TOKEN_KEY);
    return data.connected;
  } catch (error) { return false; }
};

export const getEbayPolicies = async (userId: string) => {
  try {
    const url = getApiUrl(`/api/ebay/get-policies?userId=${userId}`);
    if (!url) return { shippingPolicies: [], returnPolicies: [], paymentPolicies: [] };
    const response = await fetch(url, { headers: await getAuthHeaders() });
    if (!response.ok) throw new Error("API error");
    const data = await response.json();
    return {
      shippingPolicies: Array.isArray(data?.shippingPolicies) ? data.shippingPolicies : [],
      returnPolicies: Array.isArray(data?.returnPolicies) ? data.returnPolicies : [],
      paymentPolicies: Array.isArray(data?.paymentPolicies) ? data.paymentPolicies : []
    };
  } catch (e) {
    console.warn("[eBay] Failed to load policies:", e);
    return { shippingPolicies: [], returnPolicies: [], paymentPolicies: [] };
  }
};

export const getSellThroughData = async (query: string) => {
  try { return await fetchMarketData(query); }
  catch (e) { return { activeCount: 0, soldCount: 0, sellThroughRate: 0 }; }
};

export const connectEbayAccount = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const authUrl = getApiUrl(`/api/ebay/auth?userId=${user.id}&platform=native`);
  if (authUrl) await Browser.open({ url: authUrl });
};

export const disconnectEbayAccount = async (): Promise<void> => {
  const { data: { user } } = await supabase.auth.getUser();
  const url = getApiUrl(`/api/ebay/disconnect?userId=${user?.id}`);
  if (user && url) {
    try { await fetch(url, { headers: await getAuthHeaders() }); } catch (e) { }
  }
  localStorage.removeItem(EBAY_TOKEN_KEY);
  window.location.reload();
};

export const logoutEbay = () => { localStorage.removeItem(EBAY_TOKEN_KEY); window.location.reload(); };

export const searchEbayByImage = async (imageBase64: string): Promise<any[]> => {
  const url = getApiUrl('/api/ebay/search-image');
  try {
    const res = await fetch(url, { method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ imageBase64 }) });
    const data = await res.json();
    return data.results || [];
  } catch (e) { return []; }
};

export const fetchEbayItemDetails = async (itemId: string): Promise<any> => {
  const url = getApiUrl(`/api/ebay/fetch-item?itemId=${encodeURIComponent(itemId)}&IncludeSelector=ItemSpecifics,Details,TextDescription`);
  const res = await fetch(url, { headers: await getAuthHeaders() });
  if (!res.ok) throw new Error("Failed to fetch item details");
  return await res.json();
};

export const fetchSellerItems = async (page = 1, limit = 20, sort = 'newest', sellerId?: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Use path parameter style as it's proven to work in the Bulk tab
  const idToUse = sellerId && sellerId.trim() !== '' ? encodeURIComponent(sellerId.trim()) : 'ebay-seller';
  const url = `${FUNCTIONS_URL}/ebay-seller/${idToUse}?userId=${user.id}&page=${page}&limit=${limit}&sort=${sort}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: await getAuthHeaders()
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch seller items (${response.status})`);
  }

  return await response.json();
};
