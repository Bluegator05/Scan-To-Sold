import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { Buffer } from 'buffer';

const NEGATIVE_KEYWORDS = "-print -ad -promo -advertisement -repro -reproduction";

/**
 * Aggressively relaxes a query to ensure we get results
 */
function relaxQuery(query: string, level: number): string {
  // Clean special characters but preserve '-' if it's a negative keyword indicator
  // First, extract negative keywords to keep them safe
  const negs = query.split(/\s+/).filter(w => w.startsWith('-'));
  const positives = query.split(/\s+/).filter(w => !w.startsWith('-')).join(' ');

  let q = positives.replace(/[()]/g, '').replace(/[#]/g, '').replace(/[:]/g, '').trim();
  const words = q.split(/\s+/).filter(w => !['new', 'used', 'black', 'white', 'excellent', 'condition', 'works', 'edition', 'authentic', 'ver', 'version'].includes(w.toLowerCase()));

  let relaxed;
  if (level === 1) {
    // Level 1: Core spec (first 5 core words)
    relaxed = words.slice(0, 5).join(' ');
  } else if (level === 2) {
    // Level 2: Model focus (first 3-4 words)
    relaxed = words.slice(0, 4).join(' ');
  } else if (level === 3) {
    // Level 3: Extreme relaxation (first 2 words only)
    relaxed = words.slice(0, 2).join(' ');
  } else {
    relaxed = words.join(' ');
  }

  if (!relaxed) return "";

  // Always append negative keywords to filter ads/cases/manuals
  const finalNegs = [...new Set([...negs, ...NEGATIVE_KEYWORDS.split(' ')])].join(' ');
  return `${relaxed} ${finalNegs}`.trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { query, tab, condition } = req.query; // tab = 'ACTIVE' | 'SOLD', condition = 'NEW' | 'USED'

  if (!query) return res.status(400).json({ error: 'Missing search query' });

  // Trim environment variables to prevent hidden whitespace issues
  const appId = (process.env.EBAY_APP_ID || '').trim();
  const certId = (process.env.EBAY_CERT_ID || '').trim();

  try {
    // 1. GENERATE APP TOKEN (For Browse API)
    if (!appId || !certId) {
      throw new Error("Missing EBAY_APP_ID or EBAY_CERT_ID environment variables.");
    }

    const authHeader = Buffer.from(`${appId}:${certId}`).toString('base64');

    const tokenParams = new URLSearchParams();
    tokenParams.append('grant_type', 'client_credentials');
    tokenParams.append('scope', 'https://api.ebay.com/oauth/api_scope');

    const tokenRes = await axios.post('https://api.ebay.com/identity/v1/oauth2/token',
      tokenParams, {
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
    );

    const appToken = tokenRes.data.access_token;

    // 2. SEARCH EBAY
    let comps = [];
    let avgPrice = 0;
    let finalQueryUsed = query as string;
    let isEstimated = false;
    let marketStats = { activeCount: 0, soldCount: 0, sellThroughRate: 0 };

    if (tab === 'SOLD') {
      // Use CLASSIC Finding API Auth (More compatible with basic developer accounts)
      // SECURITY-APPNAME in URL, NO OAuth header
      const findingBase = `https://svcs.ebay.com/services/search/FindingService/v1?SERVICE-VERSION=1.13.0&SECURITY-APPNAME=${appId}&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD&GLOBAL-ID=EBAY-US`;

      // Try 4 levels of relaxation (0-3)
      for (let level = 0; level <= 3; level++) {
        const currentQuery = relaxQuery(query as string, level);

        // Base Finding API URL
        let fullUrl = `${findingBase}&OPERATION-NAME=findCompletedItems&keywords=${encodeURIComponent(currentQuery)}&paginationInput.entriesPerPage=20&sortOrder=EndTimeSoonest`;

        // Item Filters
        let filterIndex = 0;

        // Mandatory SoldItemsOnly filter
        fullUrl += `&itemFilter(${filterIndex}).name=SoldItemsOnly&itemFilter(${filterIndex}).value(0)=true`;
        filterIndex++;

        // Optional Condition filter
        if (condition === 'NEW') {
          fullUrl += `&itemFilter(${filterIndex}).name=Condition&itemFilter(${filterIndex}).value(0)=1000`;
          filterIndex++;
        } else if (condition === 'USED') {
          fullUrl += `&itemFilter(${filterIndex}).name=Condition&itemFilter(${filterIndex}).value(0)=3000`;
          filterIndex++;
        }

        console.log(`[FINDING API] Level ${level} Attempt: ${currentQuery}`);

        try {
          const findingRes = await axios.get(fullUrl);
          const findResponse = findingRes.data.findCompletedItemsResponse[0];

          if (findResponse.ack[0] === 'Success' || findResponse.ack[0] === 'Warning') {
            const searchResult = findResponse.searchResult[0];
            const items = (searchResult && searchResult.item) ? searchResult.item : [];
            const totalSolds = parseInt(findResponse.paginationOutput?.[0]?.totalEntries?.[0] || "0");
            marketStats.soldCount = totalSolds;

            if (items.length > 0) {
              console.log(`[FINDING API] SUCCESS: Found ${items.length} REAL solds at level ${level}`);
              finalQueryUsed = currentQuery;
              comps = items.map((i: any) => {
                const itemPrice = parseFloat(i.sellingStatus[0].currentPrice[0].__value__);
                let shippingCost = 0;
                const shippingInfo = i.shippingInfo ? i.shippingInfo[0] : null;
                if (shippingInfo && shippingInfo.shippingServiceCost) {
                  shippingCost = parseFloat(shippingInfo.shippingServiceCost[0].__value__);
                }

                return {
                  id: i.itemId[0],
                  title: i.title[0],
                  price: itemPrice,
                  shipping: shippingCost,
                  total: itemPrice + shippingCost,
                  url: i.viewItemURL[0],
                  dateSold: i.listingInfo[0].endTime[0],
                  condition: i.condition ? i.condition[0].conditionDisplayName[0] : 'Used',
                  image: i.galleryURL ? i.galleryURL[0] : null
                };
              });
              break;
            } else {
              console.log(`[FINDING API] No results at level ${level}`);
            }
          } else {
            const error = findResponse.errorMessage?.[0]?.error?.[0];
            const errorId = error?.errorId?.[0];
            console.error(`[FINDING API] Level ${level} Rejected:`, error?.message?.[0]);

            if (errorId === '10001') {
              return res.status(429).json({
                error: 'eBay rate limit reached (10001). Please try again in 24 hours.',
                isRateLimited: true
              });
            }
          }
        } catch (e: any) {
          console.error(`[FINDING API] Level ${level} request failed:`, e.message);
        }
      }

      // If Finding API still returns 0, try SerpApi as a better Sold fallback
      if (comps.length === 0) {
        console.log('[SOLD COMPS] Finding API failed. Trying SerpApi Sold fallback.');
        try {
          const serpParams = new URLSearchParams({
            engine: 'ebay',
            _nkw: query as string,
            show_only: 'Sold',
            api_key: process.env.SERPAPI_KEY || 'e0f6ca870f11e20e9210ec572228272ede9b839e1cbe79ff7f47de23a7a80a57',
            num: '20'
          });

          if (condition === 'NEW') serpParams.append('LH_ItemCondition', '1000');
          else if (condition === 'USED') serpParams.append('LH_ItemCondition', '3000');

          const serpRes = await axios.get(`https://serpapi.com/search?${serpParams}`);
          const results = serpRes.data.organic_results || [];

          if (results.length > 0) {
            comps = results.map((item: any) => {
              const extensions = item.extensions || [];
              const soldDateExt = extensions.find((ext: string) => ext.toLowerCase().includes('sold'));
              const isSold = !!soldDateExt || item.status === 'Sold';

              const itemPrice = item.price?.extracted || item.price?.raw?.replace(/[^0-9.]/g, '') || 0;

              return {
                id: item.listing_id || Math.random().toString(),
                title: item.title,
                price: parseFloat(itemPrice),
                shipping: 0,
                total: parseFloat(itemPrice),
                url: item.link,
                dateSold: soldDateExt ? soldDateExt.replace(/Sold /i, '') : '',
                condition: item.condition || 'Used',
                image: item.thumbnail,
                isSerp: true,
                isSold: isSold
              };
            }).filter((c: any) => c.isSold); // STRICT FILTER: ONLY SOLD
          }
        } catch (e: any) {
          console.error('[SOLD COMPS] SerpApi fallback failed:', e.message);
        }
      }

    } else {
      // Use eBay BROWSE API for ACTIVE items
      for (let level = 0; level <= 3; level++) {
        const currentQuery = relaxQuery(query as string, level);
        try {
          const response = await axios.get('https://api.ebay.com/buy/browse/v1/item_summary/search', {
            headers: {
              'Authorization': `Bearer ${appToken}`,
              'Content-Type': 'application/json',
              'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
              'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country=US,zip=10001'
            },
            params: {
              q: currentQuery,
              limit: 20,
              sort: 'price',
              filter: condition === 'NEW' ? 'conditionIds:{1000|1500}' : condition === 'USED' ? 'conditionIds:{3000}' : undefined
            }
          });

          marketStats.activeCount = parseInt(response.data.total || "0");
          const items = response.data.itemSummaries || [];
          if (items.length > 0) {
            finalQueryUsed = currentQuery;
            comps = items.map((i: any) => {
              const itemPrice = parseFloat(i.price?.value || '0');
              let shippingCost = 0;
              if (i.shippingOptions && i.shippingOptions.length > 0) {
                const costObj = i.shippingOptions[0].shippingCost;
                if (costObj) shippingCost = parseFloat(costObj.value);
              }

              return {
                id: i.legacyItemId || i.itemId,
                title: i.title,
                price: itemPrice,
                shipping: shippingCost,
                total: itemPrice + shippingCost,
                url: i.itemWebUrl,
                condition: i.condition || 'Used',
                image: i.image?.imageUrl || null
              };
            });
            break;
          }
        } catch (e: any) {
          console.error(`[BROWSE API] Level ${level} failed:`, e.message);
        }
      }
    }

    // 2.5 Fetch Sold/Active counts for stats if not already fetched (tab agnostic)
    if (marketStats.soldCount === 0 || marketStats.activeCount === 0) {
      try {
        const statsQuery = relaxQuery(query as string, 0); // Core query for stats

        // Sold Count (Finding API)
        if (marketStats.soldCount === 0) {
          const soldRes = await axios.get(`https://svcs.ebay.com/services/search/FindingService/v1?OPERATION-NAME=findCompletedItems&SERVICE-VERSION=1.13.0&SECURITY-APPNAME=${appId}&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD&keywords=${encodeURIComponent(statsQuery)}&itemFilter(0).name=SoldItemsOnly&itemFilter(0).value(0)=true&paginationInput.entriesPerPage=1`);
          marketStats.soldCount = parseInt(soldRes.data.findCompletedItemsResponse[0].paginationOutput?.[0]?.totalEntries?.[0] || "0");
        }

        // Active Count (Browse API)
        if (marketStats.activeCount === 0) {
          const activeRes = await axios.get('https://api.ebay.com/buy/browse/v1/item_summary/search', {
            headers: { 'Authorization': `Bearer ${appToken}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' },
            params: { q: statsQuery, limit: 1 }
          });
          marketStats.activeCount = parseInt(activeRes.data.total || "0");
        }
      } catch (e) {
        console.warn("[STATS] Non-critical stats fetch failed:", e.message);
      }
    }

    marketStats.sellThroughRate = marketStats.activeCount > 0 ? (marketStats.soldCount / marketStats.activeCount) * 100 : 0;

    // 4. CALCULATE STATS
    const totalSum = comps.reduce((acc: number, item: any) => acc + item.total, 0);
    avgPrice = comps.length > 0 ? totalSum / comps.length : 0;

    res.status(200).json({
      averagePrice: avgPrice.toFixed(2),
      comps: comps,
      marketStats: marketStats,
      queryRelaxed: finalQueryUsed !== query,
      isEstimated: isEstimated,
      queryUsed: finalQueryUsed
    });

  } catch (error: any) {
    console.error('[BACKEND] Search Error:', error.response?.data || error.message);
    const msg = error.response?.data?.error_description || error.message;
    res.status(500).json({ error: `eBay Search Failed: ${msg}` });
  }
}
