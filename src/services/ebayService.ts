import { supabase, getAuthHeaders } from '../lib/supabaseClient';
import { Comp } from '../types';
import { Browser } from '@capacitor/browser';

// --- CONFIGURATION ---
export const API_BASE_URL = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? "" // Use relative URLs on localhost (proxy or local server)
  : "https://www.scantosold.com";
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

// --- Market Data Helpers ---

const cleanQuery = (query: string) => {
  if (!query) return "";
  const fluffWords = [
    "l@@k", "fast shipping", "wow", "must see", "look", "look!",
    "check out", "free shipping", "authentic", "certified",
    "guaranteed", "shipped", "shipping", "fast", "priority",
    "tracked", "delivery", "genuine", "100%", "free"
  ];
  let cleaned = query.toLowerCase();
  fluffWords.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    cleaned = cleaned.replace(regex, '');
  });

  // Remove special characters but keep alphanumeric and spaces
  cleaned = cleaned.replace(/[!@#$%^&*()_+={}\[\]|\\:;"'<>,.?\/]/gi, ' ');

  const words = cleaned.replace(/\s+/g, ' ').trim().split(' ').filter(w => {
    // Keep words longer than 1 char, or single digits if they are numeric (like model numbers)
    return w.length > 1 || /\d/.test(w);
  });

  // If the query is already very short (under 5 words), don't slice it further
  if (words.length <= 5) return words.join(' ');
  return words.slice(0, 8).join(' ');
};

const extractCategoryId = (items: any[]) => {
  if (!items || items.length === 0) return null;
  const counts: Record<string, number> = {};
  items.forEach(item => {
    const catId = item.categories?.[0]?.categoryId || item.primaryCategory?.categoryId;
    if (catId) counts[catId] = (counts[catId] || 0) + 1;
  });
  const sorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  return sorted[0] || null;
};

const getStoredData = (key: string) => {
  try {
    const item = localStorage.getItem(`ebay_cache_${key}`);
    if (!item) return null;
    const parsed = JSON.parse(item);
    const CACHE_VERSION = "v3"; // Bumped version
    if (parsed.version === CACHE_VERSION && (Date.now() - parsed.timestamp < 1000 * 60 * 60)) {
      return parsed.data;
    }
  } catch (e) { return null; }
  return null;
};

const getSearchCache = (key: string) => {
  try {
    const item = localStorage.getItem(`ebay_search_cache_${key}`);
    if (!item) return null;
    const { data, timestamp } = JSON.parse(item);
    if (timestamp && (Date.now() - timestamp < 1000 * 60 * 30)) return data; // 30 min cache
  } catch (e) { return null; }
  return null;
};

const setSearchCache = (key: string, data: any) => {
  try {
    // Only cache if we actually have results
    if (data?.comps?.length === 0) return;
    localStorage.setItem(`ebay_search_cache_${key}`, JSON.stringify({ data, timestamp: Date.now() }));
  } catch (e) { }
};

// --- Core API Functions ---

// This function is now a high-level wrapper around the consolidated API
export const fetchMarketData = async (query: string, condition: 'NEW' | 'USED' = 'USED') => {
  console.log(`[STS] Fetching consolidated market data for: ${query}`);

  // Always fetch SOLD view for market analysis as it now includes stats
  const data = await searchEbayComps(query, 'SOLD', condition);

  if (data.isRateLimited) {
    return {
      medianSoldPrice: 0,
      priceRange: { min: 0, max: 0 },
      totalActive: 0,
      totalSold: 0,
      sellThroughRate: 0,
      isSoldBlocked: true,
      activeComps: [],
      soldComps: [],
      isRateLimited: true
    };
  }

  const marketStats = data.marketStats || { activeCount: 0, soldCount: 0, sellThroughRate: 0 };
  const soldPrices = data.comps.map(c => c.price);
  const medianSoldPrice = parseFloat(data.averagePrice);

  const calculatePricingRecommendations = (prices: number[], median: number) => {
    if (prices.length === 0) return null;
    const sorted = [...prices].sort((a, b) => a - b);
    const p25 = sorted[Math.floor(sorted.length * 0.25)] || sorted[0];
    const p50 = median;
    const p75 = sorted[Math.floor(sorted.length * 0.75)] || sorted[sorted.length - 1];

    return {
      quickSale: { price: Math.round(p25 * 100) / 100, strategy: "Aggressive Pricing", description: "Set below market median.", expectedSellTime: "1-3 days" },
      competitive: { price: Math.round(p50 * 100) / 100, strategy: "Market Balanced", description: "Aligned with median.", expectedSellTime: "3-7 days" },
      premium: { price: Math.round(p75 * 100) / 100, strategy: "Maximum Value", description: "Higher end.", expectedSellTime: "7-14 days" },
      shippingEstimate: 7.99
    };
  };

  return {
    medianSoldPrice,
    priceRange: {
      min: Math.min(...soldPrices),
      max: Math.max(...soldPrices)
    },
    totalActive: marketStats.activeCount,
    totalSold: marketStats.soldCount,
    sellThroughRate: marketStats.sellThroughRate,
    isSoldBlocked: false,
    activeComps: [], // We don't need these immediately for the review screen summary
    soldComps: data.comps.slice(0, 10),
    pricingRecommendations: calculatePricingRecommendations(soldPrices, medianSoldPrice),
    isEstimated: !!data.isEstimated,
    isRateLimited: false
  };
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
  try {
    // Redirecting to fetchMarketData as it handles the logic correctly with fallbacks
    return await fetchMarketData(query);
  } catch (e) { return { activeCount: 0, soldCount: 0, sellThroughRate: 0 }; }
};

export const checkEbayConnection = async (): Promise<boolean> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const url = getApiUrl(`/api/ebay/status?userId=${user.id}&t=${Date.now()}`);
  if (!url) return false;
  try {
    const response = await fetch(url, { headers: await getAuthHeaders() });
    if (!response.ok) return false;
    const data = await response.json();
    if (data.connected) localStorage.setItem(EBAY_TOKEN_KEY, 'true');
    else localStorage.removeItem(EBAY_TOKEN_KEY);
    return data.connected;
  } catch (error) { return false; }
};

export const connectEbayAccount = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const authUrl = getApiUrl(`/api/ebay/auth?userId=${user.id}&platform=native`);
    if (authUrl) await Browser.open({ url: authUrl });
  } catch (error: any) { console.error("Failed to open eBay auth", error); }
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

export const searchEbayComps = async (query: string, tab: 'ACTIVE' | 'SOLD' = 'ACTIVE', condition: 'NEW' | 'USED' = 'USED', bypassCache = false): Promise<{ averagePrice: string, comps: Comp[], isEstimated?: boolean, marketStats?: any, isRateLimited?: boolean, debug?: string[], queryUsed?: string }> => {
  const cacheKey = `${query}_${tab}_${condition}`;

  if (!bypassCache) {
    const cached = getSearchCache(cacheKey);
    if (cached) return cached;
  }

  const baseUrl = API_BASE_URL;
  const url = `${baseUrl}/api/ebay/search-comps?query=${encodeURIComponent(query)}&tab=${tab}&condition=${condition}&t=${Date.now()}`;

  console.log(`[eBay] Searching (${tab}, bypass=${bypassCache}): ${query}`);
  const res = await fetch(url, { headers: await getAuthHeaders() });

  if (res.status === 429) {
    return { averagePrice: "0.00", comps: [], isRateLimited: true };
  }

  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const data = await res.json();

  setSearchCache(cacheKey, data);
  return data;
};

export const searchEbayByImage = async (imageBase64: string): Promise<any[]> => {
  const url = getApiUrl('/api/ebay/search-image');
  if (!url) return [];
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ imageBase64 })
    });
    const data = await res.json();
    return data.results || [];
  } catch (e) { return []; }
};

export const fetchEbayItemDetails = async (itemId: string): Promise<any> => {
  const url = getApiUrl(`/api/ebay/fetch-item?itemId=${encodeURIComponent(itemId)}&IncludeSelector=ItemSpecifics,Details,TextDescription`);
  if (!url) throw new Error("Backend URL not configured");
  const res = await fetch(url, { headers: await getAuthHeaders() });
  if (!res.ok) throw new Error("Failed to fetch item details");
  return await res.json();
};
