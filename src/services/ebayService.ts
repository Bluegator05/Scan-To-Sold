import { supabase, getAuthHeaders } from '../lib/supabaseClient';
import { Comp } from '../types';
import { Browser } from '@capacitor/browser';

// --- CONFIGURATION ---
export const API_BASE_URL = "https://www.scantosold.com";
const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_BASE_URL || "https://urnvmiktzkwdlmfeznjj.supabase.co/functions/v1";
const SERPAPI_KEY_FALLBACK = "e0f6ca870f11e20e9210ec572228272ede9b839e1cbe79ff7f47de23a7a80a57";
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

const setStoredData = (key: string, data: any) => {
  try {
    localStorage.setItem(`ebay_cache_${key}`, JSON.stringify({
      data,
      timestamp: Date.now(),
      version: "v3"
    }));
  } catch (e) { }
};

// --- Core API Functions ---

export const fetchMarketData = async (query: string, condition?: string) => {
  const cacheKey = `${query}_${condition || 'any'}`;
  const cached = getStoredData(cacheKey);
  if (cached) return cached;

  console.log(`[STS] Fetching market data for: ${query}`);

  let activeItems: any[] = [];
  let actualSoldItems: any[] = [];
  let isSoldBlocked = false;
  let activeCount = 0;

  // 1. Fetch Active Items
  try {
    const activeUrl = `${FUNCTIONS_URL}/ebay-search/${encodeURIComponent(query)}${condition ? `?condition=${encodeURIComponent(condition)}` : ''}`;
    const activeRes = await fetch(activeUrl, { headers: await getAuthHeaders() });
    if (activeRes.ok) {
      const activeData = await activeRes.json();
      activeItems = activeData.itemSummaries || [];
      activeCount = parseInt(activeData.total || activeItems.length);
    } else if (activeRes.status === 401) {
      console.error("[STS] Active search unauthorized - session likely expired.");
    }
  } catch (e) {
    console.warn("[STS] Supabase Search failed, falling back to empty active list.");
  }

  const categoryId = extractCategoryId(activeItems);

  // 2. Fetch Sold Items (Supabase)
  try {
    const soldUrl = `${FUNCTIONS_URL}/ebay-sold/${encodeURIComponent(query)}?${condition ? `condition=${encodeURIComponent(condition)}` : ''}${categoryId ? `&categoryId=${categoryId}` : ''}`;
    const soldRes = await fetch(soldUrl, { headers: await getAuthHeaders() });

    if (soldRes.ok) {
      const soldData = await soldRes.json();
      actualSoldItems = (soldData || []).filter((item: any) => {
        const state = item.sellingStatus?.[0]?.sellingState?.[0];
        return state === 'EndedWithSales' || state === 'Sold';
      });
    } else if (soldRes.status === 401) {
      console.error("[STS] Sold search unauthorized - session likely expired.");
    } else if (soldRes.status === 429 || soldRes.status === 500) {
      isSoldBlocked = true;
    }
  } catch (e) {
    console.warn("[STS] Supabase Sold failed, will try SerpApi fallback.");
  }

  // 3. SerpApi Fallback (If Supabase yields nothing)
  if (actualSoldItems.length === 0) {
    console.log("[STS] Trying direct SerpApi fallback...");
    try {
      const serpParams = new URLSearchParams({
        engine: 'ebay',
        _nkw: query,
        show_only: 'Sold',
        api_key: SERPAPI_KEY_FALLBACK,
        num: '15'
      });
      const targetUrl = `https://serpapi.com/search?${serpParams}`;
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;

      const res = await fetch(proxyUrl);
      const json = await res.json();
      const serpData = typeof json.contents === 'string' ? JSON.parse(json.contents) : json;
      const results = serpData.organic_results || [];

      if (results.length > 0) {
        console.log(`[STS] SerpApi found ${results.length} SOLD items.`);
        actualSoldItems = results.map((item: any) => ({
          title: [item.title],
          sellingStatus: [{
            currentPrice: [{
              '__value__': item.price?.extracted?.toString() || (item.price?.raw?.replace(/[^0-9.]/g, '') || "0"),
              '@currencyId': 'USD'
            }],
            sellingState: ['EndedWithSales']
          }],
          listingInfo: [{
            endTime: [item.sold_date || item.extensions?.find((ext: string) => ext.toLowerCase().includes('sold'))?.replace(/Sold /i, '') || '']
          }],
          viewItemURL: [item.link],
          galleryURL: [item.thumbnail]
        }));
        isSoldBlocked = false;
      }
    } catch (e) {
      console.error("[STS] SerpApi fallback failed:", e);
    }
  }

  // Final Results Processing
  const soldPrices = actualSoldItems.map((item: any) => parseFloat(item.sellingStatus[0].currentPrice[0].__value__)).filter(p => !isNaN(p));
  const activePrices = activeItems.map((item: any) => parseFloat(item.price?.value || 0)).filter(p => !isNaN(p));

  const medianSoldPrice = soldPrices.length > 0 ? [...soldPrices].sort((a, b) => a - b)[Math.floor(soldPrices.length / 2)] : 0;
  const medianActive = activePrices.length > 0 ? [...activePrices].sort((a, b) => a - b)[Math.floor(activePrices.length / 2)] : 0;

  const actualSoldCount = actualSoldItems.length;
  const sellThroughRate = activeCount > 0 ? (actualSoldCount / activeCount) * 100 : (actualSoldCount > 0 ? 100 : 0);

  const calculatePricingRecommendations = (prices: number[], median: number) => {
    if (prices.length === 0 && activePrices.length === 0) return null;
    const refPrices = prices.length > 0 ? prices : activePrices;
    const refMedian = prices.length > 0 ? median : medianActive;

    const sorted = [...refPrices].sort((a, b) => a - b);
    const p25 = sorted[Math.floor(sorted.length * 0.25)] || sorted[0];
    const p50 = refMedian;
    const p75 = sorted[Math.floor(sorted.length * 0.75)] || sorted[sorted.length - 1];

    return {
      quickSale: {
        price: Math.round(p25 * 100) / 100,
        strategy: "Aggressive Pricing",
        description: "Set below the market 25th percentile to attract quick buyers and clear inventory within 48 hours.",
        expectedSellTime: "1-3 days"
      },
      competitive: {
        price: Math.round(p50 * 100) / 100,
        strategy: "Market Balanced",
        description: "Aligned with current sold median. Best balance of profit margin and reasonable turnaround time.",
        expectedSellTime: "3-7 days"
      },
      premium: {
        price: Math.round(p75 * 100) / 100,
        strategy: "Maximum Value",
        description: "Positioned at the higher end of the market. Best for high-demand items where buyers value quality.",
        expectedSellTime: "7-14 days"
      },
      shippingEstimate: Math.max(5, Math.min(15, Math.round(p50 * 0.12 * 100) / 100))
    };
  };

  const result = {
    medianSoldPrice: medianSoldPrice || medianActive,
    priceRange: {
      min: soldPrices.length > 0 ? Math.min(...soldPrices) : (activePrices.length > 0 ? Math.min(...activePrices) : 0),
      max: soldPrices.length > 0 ? Math.max(...soldPrices) : (activePrices.length > 0 ? Math.max(...activePrices) : 0)
    },
    activeCount,
    soldCount: actualSoldCount,
    sellThroughRate: isSoldBlocked ? 0 : sellThroughRate, // Return as number
    isSoldBlocked: isSoldBlocked && actualSoldCount === 0,
    activeComps: activeItems.slice(0, 10).map((item: any) => ({
      id: item.itemId || Math.random().toString(36).substr(2, 9),
      title: item.title,
      price: parseFloat(item.price?.value || 0),
      image: item.image?.imageUrl || item.galleryURL?.[0] || '',
      url: item.itemWebUrl || item.itemHref || item.viewItemURL?.[0]
    })),
    pricingRecommendations: calculatePricingRecommendations(soldPrices, medianSoldPrice),
    soldComps: actualSoldItems.slice(0, 10).map((item: any) => ({
      id: (Array.isArray(item.itemId) ? item.itemId[0] : item.itemId) || Math.random().toString(36).substr(2, 9),
      title: (Array.isArray(item.title) ? item.title[0] : item.title) || '',
      price: parseFloat(item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || "0"),
      image: (Array.isArray(item.galleryURL) ? item.galleryURL[0] : (item.galleryURL || '')),
      url: (Array.isArray(item.viewItemURL) ? item.viewItemURL[0] : (item.viewItemURL || '')),
      dateSold: (Array.isArray(item.listingInfo?.[0]?.endTime) ? item.listingInfo[0].endTime[0] : (item.listingInfo?.[0]?.endTime || ''))
    }))
  };

  if (activeCount > 0 || actualSoldCount > 0) {
    setStoredData(cacheKey, result);
  }
  return result;
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

export const searchEbayComps = async (query: string, tab: 'ACTIVE' | 'SOLD' = 'ACTIVE', condition: 'NEW' | 'USED' = 'USED'): Promise<{ averagePrice: string, comps: Comp[] }> => {
  const url = getApiUrl(`/api/ebay/search-comps?query=${encodeURIComponent(query)}&tab=${tab}&condition=${condition}`);
  if (!url) throw new Error("Backend URL not configured");
  const res = await fetch(url, { headers: await getAuthHeaders() });
  if (!res.ok) throw new Error("Failed to fetch comps");
  return await res.json();
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
