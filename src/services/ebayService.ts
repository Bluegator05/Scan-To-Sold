import { supabase } from '../lib/supabaseClient';
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
    "new", "sealed", "vintage", "rare", "l@@k", "fast shipping",
    "wow", "must see", "mint", "nib", "nwb", "nwt", "brand new",
    "nrfb", "htf", "vhtf", "look", "look!", "check out", "free shipping",
    "authentic", "certified", "guaranteed", "shipped", "shipping",
    "fast", "priority", "tracked", "delivery", "genuine", "original",
    "box", "package", "packaging", "with", "and", "the", "for", "from",
    "pressing", "lp", "vinyl", "record", "vg", "vg+"
  ];
  let cleaned = query.toLowerCase();
  fluffWords.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    cleaned = cleaned.replace(regex, '');
  });
  cleaned = cleaned.replace(/[!@#$%^&*()_+={}\[\]|\\:;"'<>,.?\/]|100%|free|fast/gi, ' ');
  const words = cleaned.replace(/\s+/g, ' ').trim().split(' ').filter(w => {
    return w.length > 2 || /\d/.test(w);
  });
  return words.slice(0, 7).join(' ');
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
    const CACHE_VERSION = "v2";
    if (parsed.version === CACHE_VERSION && (Date.now() - parsed.timestamp < 1000 * 60 * 60)) {
      return parsed.data;
    }
    localStorage.removeItem(`ebay_cache_${key}`);
  } catch (e) { return null; }
  return null;
};

const setStoredData = (key: string, data: any) => {
  try {
    localStorage.setItem(`ebay_cache_${key}`, JSON.stringify({
      data,
      timestamp: Date.now(),
      version: "v2"
    }));
  } catch (e) { }
};

// --- Core API Functions ---

export const fetchMarketData = async (query: string, condition?: string) => {
  const cacheKey = `${query}_${condition || 'any'}`;
  const cached = getStoredData(cacheKey);
  if (cached) return cached;

  try {
    const activeUrl = `${FUNCTIONS_URL}/ebay-search/${encodeURIComponent(query)}${condition ? `?condition=${encodeURIComponent(condition)}` : ''}`;
    const activeRes = await fetch(activeUrl);
    if (activeRes.status === 429) throw new Error("RATE_LIMIT");

    const activeData = activeRes.ok ? await activeRes.json() : { itemSummaries: [] };
    const activeItems = activeData.itemSummaries || [];
    const activeCount = parseInt(activeData.total || activeItems.length);

    const categoryId = extractCategoryId(activeItems);
    const categoryName = activeItems[0]?.categories?.[0]?.categoryName || 'Unknown';

    const searchSold = async (q: string, catId: string | null, forceAnyCondition: boolean = false) => {
      const activeCondition = forceAnyCondition ? null : condition;
      let soldUrl = `${FUNCTIONS_URL}/ebay-sold/${encodeURIComponent(q)}?${activeCondition ? `condition=${encodeURIComponent(activeCondition)}` : ''}`;
      if (catId && catId !== 'null') {
        soldUrl += `&categoryId=${catId}`;
      }
      const res = await fetch(soldUrl);
      if (res.status === 429) return { error: 'RATE_LIMIT' };
      if (res.status === 500) return { error: 'API_BLOCKED' };
      return res.ok ? await res.json() : null;
    };

    let soldItemsRaw = await searchSold(query, categoryId);
    let actualSoldItems = [];
    let isSoldBlocked = false;

    if (soldItemsRaw?.error === 'RATE_LIMIT') throw new Error("RATE_LIMIT");
    if (soldItemsRaw?.error === 'API_BLOCKED') {
      isSoldBlocked = true;
    } else {
      actualSoldItems = (soldItemsRaw || []).filter((item: any) => {
        const sellingState = item.sellingStatus?.[0]?.sellingState?.[0];
        // ALLOW: EndedWithSales (traditional) OR Sold (multi-quantity record)
        return sellingState === 'EndedWithSales' || sellingState === 'Sold';
      });
      if (actualSoldItems.length === 0 && !soldItemsRaw?.error) isSoldBlocked = false;
    }

    // --- FRONTEND FALLBACK TO SERPAPI (If Supabase returns empty) ---
    if (actualSoldItems.length === 0) {
      console.log("No sold data from Supabase, trying direct SerpApi fallback via CORS proxy...");
      try {
        const serpParams = new URLSearchParams({
          engine: 'ebay',
          _nkw: query,
          LH_Sold: '1',
          LH_Complete: '1',
          api_key: SERPAPI_KEY_FALLBACK,
          num: '5'
        });
        const targetUrl = `https://serpapi.com/search?${serpParams}`;
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;

        const serpRes = await fetch(proxyUrl);
        const proxyData = await serpRes.json();
        const serpData = typeof proxyData.contents === 'string' ? JSON.parse(proxyData.contents) : proxyData;
        const organicResults = serpData.organic_results || [];

        if (organicResults.length > 0) {
          console.log(`SerpApi fallback found ${organicResults.length} items.`);
          actualSoldItems = organicResults.map((item: any) => ({
            title: [item.title],
            sellingStatus: [{
              currentPrice: [{
                '__value__': item.price?.extracted?.toString() || (item.price?.raw?.replace(/[^0-9.]/g, '') || "0"),
                '@currencyId': 'USD'
              }],
              sellingState: ['EndedWithSales']
            }],
            listingInfo: [{
              endTime: [item.extensions?.find((ext: string) => ext.toLowerCase().includes('sold'))?.replace(/Sold /i, '') || '']
            }],
            viewItemURL: [item.link],
            galleryURL: [item.thumbnail]
          }));
          isSoldBlocked = false;
        } else {
          console.log("SerpApi also returned no results.");
        }
      } catch (serpErr) {
        console.error("Direct SerpApi fallback failed:", serpErr);
      }
    }
    // -------------------------------------------------------------

    // Fallback for empty sold results
    if (actualSoldItems.length === 0 && !isSoldBlocked) {
      const cleaned = cleanQuery(query);
      if (cleaned && cleaned !== query.toLowerCase()) {
        const fallbackSold = await searchSold(cleaned, categoryId);
        if (fallbackSold?.error === 'RATE_LIMIT') throw new Error("RATE_LIMIT");
        let fallbackItems = (fallbackSold || []).filter((item: any) => {
          const sellingState = item.sellingStatus?.[0]?.sellingState?.[0];
          return sellingState === 'EndedWithSales' || sellingState === 'Sold';
        });

        // Try without categoryId
        if (fallbackItems.length === 0 && categoryId) {
          const noCatSold = await searchSold(cleaned, null);
          fallbackItems = (noCatSold || []).filter((item: any) => {
            const sellingState = item.sellingStatus?.[0]?.sellingState?.[0];
            return sellingState === 'EndedWithSales' || sellingState === 'Sold';
          });
        }

        // Try without condition
        if (fallbackItems.length === 0 && condition) {
          const noCondRes = await searchSold(cleaned, null, true);
          fallbackItems = (noCondRes || []).filter((item: any) => {
            const sellingState = item.sellingStatus?.[0]?.sellingState?.[0];
            return sellingState === 'EndedWithSales' || sellingState === 'Sold';
          });
        }

        if (fallbackItems.length > 0) {
          actualSoldItems = fallbackItems;
        }
      }
    }

    const soldPrices = actualSoldItems.map((item: any) => parseFloat(item.sellingStatus[0].currentPrice[0].__value__));
    const activePrices = activeItems.map((item: any) => parseFloat(item.price.value));

    const medianSoldPrice = soldPrices.length > 0 ? soldPrices.sort((a, b) => a - b)[Math.floor(soldPrices.length / 2)] : 0;
    const medianActive = activePrices.length > 0 ? activePrices.sort((a, b) => a - b)[Math.floor(activePrices.length / 2)] : 0;

    const actualSoldCount = actualSoldItems.length;
    const sellThroughRate = activeCount > 0 ? (actualSoldCount / activeCount) * 100 : (actualSoldCount > 0 ? 100 : 0);

    const calculatePricingRecommendations = (prices: number[], medianPrice: number) => {
      if (prices.length === 0) return null;
      const sorted = [...prices].sort((a, b) => a - b);
      const p25 = sorted[Math.floor(sorted.length * 0.25)] || sorted[0];
      const p50 = medianPrice;
      const p75 = sorted[Math.floor(sorted.length * 0.75)] || sorted[sorted.length - 1];
      const estimatedShipping = Math.max(5, Math.min(15, Math.round(p50 * 0.12 * 100) / 100));

      return {
        quickSale: { price: Math.round(p25 * 100) / 100, strategy: "Price below market", expectedSellTime: "1-3 days" },
        competitive: { price: Math.round(p50 * 100) / 100, strategy: "Match market median", expectedSellTime: "3-7 days" },
        premium: { price: Math.round(p75 * 100) / 100, strategy: "Maximize profit margin", expectedSellTime: "7-14 days" },
        shippingEstimate: estimatedShipping
      };
    };

    const result = {
      medianSoldPrice: soldPrices.length > 0 ? medianSoldPrice : medianActive,
      priceRange: {
        min: soldPrices.length > 0 ? Math.min(...soldPrices) : (activeItems.length > 0 ? Math.min(...activePrices) : 0),
        max: soldPrices.length > 0 ? Math.max(...soldPrices) : (activeItems.length > 0 ? Math.max(...activePrices) : 0)
      },
      activeCount,
      soldCount: actualSoldCount,
      sellThroughRate: (isSoldBlocked || actualSoldItems.length === 0) ? 'N/A' : `${sellThroughRate.toFixed(1)}%`,
      isSoldBlocked: isSoldBlocked || actualSoldItems.length === 0,
      activeItems: activeItems.slice(0, 5).map((item: any) => ({
        title: item.title,
        price: item.price,
        image: item.image,
        itemWebUrl: item.itemWebUrl || item.itemHref
      })),
      pricingRecommendations: soldPrices.length > 0 ? calculatePricingRecommendations(soldPrices, medianSoldPrice) : calculatePricingRecommendations(activePrices, medianActive),
      soldItems: actualSoldItems.slice(0, 5).map((item: any) => ({
        title: item.title[0],
        price: { value: item.sellingStatus[0].currentPrice[0].__value__, currency: item.sellingStatus[0].currentPrice[0]['@currencyId'] },
        image: { imageUrl: item.galleryURL?.[0] || '' },
        itemWebUrl: item.viewItemURL[0],
        endTime: item.listingInfo?.[0]?.endTime || item.endTime?.[0] || ''
      }))
    };

    if ((activeCount > 0 || actualSoldCount > 0) && !isSoldBlocked) {
      setStoredData(cacheKey, result);
    }
    return result;
  } catch (error: any) {
    if (error.message === "RATE_LIMIT") return { error: "Rate Limit Exceeded", isRateLimit: true };
    console.error("fetchMarketData Error:", error);
    return null;
  }
};
export const getEbayPolicies = async (userId: string) => {
  try {
    const response = await fetch(`${FUNCTIONS_URL}/ebay-policies?userId=${userId}`);
    const data = await response.json();
    return data || { shippingPolicies: [], returnPolicies: [], paymentPolicies: [] };
  } catch (e) {
    console.error("Error fetching policies:", e);
    return { shippingPolicies: [], returnPolicies: [], paymentPolicies: [] };
  }
};

export const getSellThroughData = async (query: string) => {
  try {
    const response = await fetch(`${FUNCTIONS_URL}/ebay-sell-through/${encodeURIComponent(query)}`);
    const data = await response.json();
    return data;
  } catch (e) {
    console.error("Error fetching sell-through data:", e);
    return null;
  }
};

export const checkEbayConnection = async (): Promise<boolean> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const url = getApiUrl(`/api/ebay/status?userId=${user.id}&t=${Date.now()}`);
  if (!url) return false;

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
    if (!user) return;
    const authUrl = getApiUrl(`/api/ebay/auth?userId=${user.id}&platform=native`);
    if (authUrl) await Browser.open({ url: authUrl });
  } catch (error: any) {
    console.error("Failed to open eBay auth", error);
  }
};

export const disconnectEbayAccount = async (): Promise<void> => {
  const { data: { user } } = await supabase.auth.getUser();
  const url = getApiUrl(`/api/ebay/disconnect?userId=${user?.id}`);
  if (user && url) {
    try { await fetch(url); } catch (e) { console.error("Failed to disconnect on server", e); }
  }
  localStorage.removeItem(EBAY_TOKEN_KEY);
  window.location.reload();
};

export const searchEbayComps = async (query: string, tab: 'ACTIVE' | 'SOLD' = 'ACTIVE', condition: 'NEW' | 'USED' = 'USED'): Promise<{ averagePrice: string, comps: Comp[] }> => {
  const url = getApiUrl(`/api/ebay/search-comps?query=${encodeURIComponent(query)}&tab=${tab}&condition=${condition}`);
  if (!url) throw new Error("Backend URL not configured");

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to fetch comps");
    }
    return await res.json();
  } catch (error: any) {
    if (error.name === 'AbortError') throw new Error("Search timed out. Please try again.");
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
  const url = getApiUrl(`/api/ebay/fetch-item?itemId=${encodeURIComponent(itemId)}&IncludeSelector=ItemSpecifics,Details,TextDescription`);
  if (!url) throw new Error("Backend URL not configured");
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch item details");
    return await res.json();
  } catch (error) {
    console.error("Fetch details error:", error);
    throw error;
  }
};
