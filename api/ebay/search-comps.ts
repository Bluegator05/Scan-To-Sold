import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { Buffer } from 'buffer';

/**
 * Strips down a query to its essential keywords to increase search surface
 */
function relaxQuery(query: string, level: number): string {
  let q = query.replace(/[()]/g, '').replace(/[-]/g, ' ').trim();

  if (level === 1) {
    // Level 1: Remove common fluff words and trim to first 6-7 words
    const words = q.split(/\s+/);
    if (words.length > 6) return words.slice(0, 6).join(' ');
  }

  if (level === 2) {
    // Level 2: Core keywords only (first 4 words)
    const words = q.split(/\s+/);
    if (words.length > 4) return words.slice(0, 4).join(' ');
  }

  return q;
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

  try {
    // 1. GENERATE APP TOKEN (Client Credentials)
    if (!process.env.EBAY_APP_ID || !process.env.EBAY_CERT_ID) {
      throw new Error("Missing EBAY_APP_ID or EBAY_CERT_ID environment variables.");
    }

    const authHeader = Buffer.from(`${process.env.EBAY_APP_ID}:${process.env.EBAY_CERT_ID}`).toString('base64');

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('scope', 'https://api.ebay.com/oauth/api_scope');

    const tokenRes = await axios.post('https://api.ebay.com/identity/v1/oauth2/token',
      params, {
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

    if (tab === 'SOLD') {
      // Use eBay FINDING API for truly COMPLETED/SOLD items
      const findingBase = `https://svcs.ebay.com/services/search/FindingService/v1?OPERATION-NAME=findCompletedItems&SERVICE-VERSION=1.0.0&SECURITY-APPNAME=${process.env.EBAY_APP_ID}&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD&GLOBAL-ID=EBAY-US`;

      let filterParams = '&itemFilter(0).name=SoldItemsOnly&itemFilter(0).value=true';
      filterParams += '&itemFilter(1).name=Currency&itemFilter(1).value=USD';

      // Try multiple relaxation levels for wide results
      for (let level = 0; level <= 2; level++) {
        const currentQuery = relaxQuery(query as string, level);
        const fullUrl = `${findingBase}&keywords=${encodeURIComponent(currentQuery)}&paginationInput.entriesPerPage=15&sortOrder=EndTimeSoonest${filterParams}`;

        console.log(`[FINDING API] Level ${level} Query:`, currentQuery);

        try {
          const findingRes = await axios.get(fullUrl);
          const findResponse = findingRes.data.findCompletedItemsResponse[0];

          if (findResponse.ack[0] === 'Success' || findResponse.ack[0] === 'Warning') {
            const searchResult = findResponse.searchResult[0];
            const items = (searchResult && searchResult.item) ? searchResult.item : [];

            if (items.length > 0) {
              console.log(`[FINDING API] Found ${items.length} items at level ${level}`);
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
              break; // Success! Exit relaxation loop
            }
          }
        } catch (e: any) {
          console.error(`[FINDING API] Level ${level} failed:`, e.message);
        }
      }

      // If still 0, try estimation fallback
      if (comps.length === 0) {
        console.log('[SOLD COMPS] All Finding API levels failed. Using fallback estimation.');
        // Fallback implementation here...
        const activeRes = await axios.get('https://api.ebay.com/buy/browse/v1/item_summary/search', {
          headers: {
            'Authorization': `Bearer ${appToken}`,
            'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
          },
          params: { q: relaxQuery(query as string, 1), limit: 10 }
        });
        const activeItems = activeRes.data.itemSummaries || [];
        comps = activeItems.map((i: any) => ({
          id: i.itemId,
          title: i.title + ' (Est.)',
          price: parseFloat(i.price?.value || '0') * 0.9,
          shipping: 0,
          total: parseFloat(i.price?.value || '0') * 0.9,
          url: i.itemWebUrl,
          isEstimated: true
        }));
      }

    } else {
      // Use eBay BROWSE API for ACTIVE items
      for (let level = 0; level <= 1; level++) {
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
              limit: 10,
              sort: 'price',
              filter: condition === 'NEW' ? 'conditionIds:{1000|1500}' : condition === 'USED' ? 'conditionIds:{3000}' : undefined
            }
          });

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

              let cleanId = i.legacyItemId || i.itemId;
              if (cleanId && cleanId.includes('|')) {
                const parts = cleanId.split('|');
                if (parts.length >= 2) cleanId = parts[1];
              }

              return {
                id: cleanId,
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

    // 4. CALCULATE STATS
    const totalSum = comps.reduce((acc: number, item: any) => acc + item.total, 0);
    avgPrice = comps.length > 0 ? totalSum / comps.length : 0;

    res.status(200).json({
      averagePrice: avgPrice.toFixed(2),
      comps: comps,
      queryRelaxed: finalQueryUsed !== query
    });

  } catch (error: any) {
    console.error('[BACKEND] Search Error:', error.response?.data || error.message);
    const msg = error.response?.data?.error_description || error.message;
    res.status(500).json({ error: `eBay Search Failed: ${msg}` });
  }
}
