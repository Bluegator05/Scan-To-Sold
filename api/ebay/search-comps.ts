import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { Buffer } from 'buffer';

const NEGATIVE_KEYWORDS = "-print -ad";

/**
 * Aggressively relaxes a query to ensure we get results
 */
function relaxQuery(query: string, level: number): string {
  const negs = query.split(/\s+/).filter(w => w.startsWith('-'));
  const positives = query.split(/\s+/).filter(w => !w.startsWith('-')).join(' ');

  let q = positives.replace(/[()]/g, '').replace(/[#]/g, '').replace(/[:]/g, '').trim();
  const words = q.split(/\s+/).filter(w => !['new', 'used', 'excellent', 'condition', 'works', 'authentic', 'ver'].includes(w.toLowerCase()));

  let relaxed;
  if (level === 1) {
    relaxed = words.slice(0, 5).join(' ');
  } else if (level === 2) {
    relaxed = words.slice(0, 4).join(' ');
  } else if (level === 3) {
    relaxed = words.slice(0, 2).join(' ');
  } else {
    relaxed = words.join(' ');
  }

  if (!relaxed) return "";
  const finalNegs = [...new Set([...negs, ...NEGATIVE_KEYWORDS.split(' ')])].join(' ');
  return `${relaxed} ${finalNegs}`.trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { query, tab, condition } = req.query;
  if (!query) return res.status(400).json({ error: 'Missing search query' });

  const appId = (process.env.EBAY_APP_ID || '').trim();
  const certId = (process.env.EBAY_CERT_ID || '').trim();
  let logs: string[] = [];

  try {
    logs.push(`Search started: ${query} (${tab} / ${condition})`);
    if (!appId || !certId) {
      throw new Error("Missing EBAY_APP_ID or EBAY_CERT_ID environment variables.");
    }

    const authHeader = Buffer.from(`${appId}:${certId}`).toString('base64');
    const tokenRes = await axios.post('https://api.ebay.com/identity/v1/oauth2/token',
      'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope', {
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const appToken = tokenRes.data.access_token;
    let comps = [];
    let avgPrice = 0;
    let finalQueryUsed = query as string;
    let isEstimated = false;
    let marketStats = { activeCount: 0, soldCount: 0, sellThroughRate: 0 };

    if (tab === 'SOLD') {
      const findingBase = `https://svcs.ebay.com/services/search/FindingService/v1?SERVICE-VERSION=1.13.0&SECURITY-APPNAME=${appId}&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD&GLOBAL-ID=EBAY-US`;

      for (let level = 0; level <= 3; level++) {
        const currentQuery = relaxQuery(query as string, level);
        let fullUrl = `${findingBase}&OPERATION-NAME=findCompletedItems&keywords=${encodeURIComponent(currentQuery)}&paginationInput.entriesPerPage=20&sortOrder=EndTimeSoonest&itemFilter(0).name=SoldItemsOnly&itemFilter(0).value(0)=true`;

        if (condition === 'NEW') fullUrl += `&itemFilter(1).name=Condition&itemFilter(1).value(0)=1000`;
        else if (condition === 'USED') fullUrl += `&itemFilter(1).name=Condition&itemFilter(1).value(0)=3000`;

        logs.push(`Finding API Level ${level} URL: ${fullUrl}`);
        try {
          // PURE REST CALL: Historically most stable for Finding API
          const findingRes = await axios.get(fullUrl);
          logs.push(`Finding API Status: ${findingRes.status}`);
          const findResponse = findingRes.data.findCompletedItemsResponse[0];

          if (findResponse.ack[0] === 'Success' || findResponse.ack[0] === 'Warning') {
            const items = findResponse.searchResult[0]?.item || [];
            if (items.length > 0) {
              finalQueryUsed = currentQuery;
              marketStats.soldCount = parseInt(findResponse.paginationOutput?.[0]?.totalEntries?.[0] || "0");
              comps = items.map((i: any) => ({
                id: i.itemId[0],
                title: i.title[0],
                price: parseFloat(i.sellingStatus[0].currentPrice[0].__value__),
                shipping: parseFloat(i.shippingInfo?.[0]?.shippingServiceCost?.[0]?.__value__ || "0"),
                total: parseFloat(i.sellingStatus[0].currentPrice[0].__value__) + parseFloat(i.shippingInfo?.[0]?.shippingServiceCost?.[0]?.__value__ || "0"),
                url: i.viewItemURL[0],
                dateSold: i.listingInfo[0].endTime[0],
                condition: i.condition ? i.condition[0].conditionDisplayName[0] : 'Used',
                image: i.galleryURL ? i.galleryURL[0] : null
              }));
              break;
            }
          } else {
            const error = findResponse.errorMessage?.[0]?.error?.[0];
            if (error?.errorId?.[0] === '10001') {
              logs.push(`RATE LIMIT EXCEEDED (10001).`);
              break;
            }
          }
        } catch (e: any) {
          const errorData = e.response?.data;
          const errorMsg = errorData ? JSON.stringify(errorData).substring(0, 200) : e.message;
          logs.push(`Level ${level} FAILED: ${errorMsg}`);
          if (errorMsg.includes('10001')) break;
        }
      }

      // SERPAPI FALLBACK
      if (comps.length === 0) {
        try {
          logs.push(`Trying SerpApi fallback`);
          const serpParams = new URLSearchParams({
            engine: 'ebay',
            _nkw: query as string,
            show_only: 'Sold',
            api_key: process.env.SERPAPI_KEY || 'e0f6ca870f11e20e9210ec572228272ede9b839e1cbe79ff7f47de23a7a80a57',
            num: '20'
          });
          if (condition === 'NEW') serpParams.append('LH_ItemCondition', '10');
          else if (condition === 'USED') serpParams.append('LH_ItemCondition', '3');

          const serpRes = await axios.get(`https://serpapi.com/search?${serpParams}`);
          logs.push(`SerpApi Results: ${serpRes.data.organic_results?.length || 0}`);
          const results = serpRes.data.organic_results || [];
          if (results.length > 0) {
            comps = results.map((item: any) => ({
              id: item.listing_id || Math.random().toString(),
              title: item.title,
              price: parseFloat(item.price?.extracted || "0"),
              shipping: 0,
              total: parseFloat(item.price?.extracted || "0"),
              url: item.link,
              dateSold: (item.extensions || []).find((ext: string) => ext.toLowerCase().includes('sold')) || "",
              condition: item.condition || 'Used',
              image: item.thumbnail
            }));
          }
        } catch (e: any) { logs.push(`SerpApi FAILED: ${e.message}`); }
      }
    } else {
      // ACTIVE listings (uses Browse API)
      for (let level = 0; level <= 3; level++) {
        const currentQuery = relaxQuery(query as string, level);
        const url = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
        logs.push(`Browse ACTIVE Level ${level} Query: ${currentQuery}`);
        try {
          const response = await axios.get(url, {
            headers: { 'Authorization': `Bearer ${appToken}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' },
            params: {
              q: currentQuery,
              limit: 20,
              filter: condition === 'NEW' ? 'conditionIds:{1000|1500}' : condition === 'USED' ? 'conditionIds:{3000}' : undefined
            }
          });
          const items = response.data.itemSummaries || [];
          if (items.length > 0) {
            finalQueryUsed = currentQuery;
            marketStats.activeCount = parseInt(response.data.total || "0");
            comps = items.map((i: any) => ({
              id: i.legacyItemId || i.itemId,
              title: i.title,
              price: parseFloat(i.price?.value || '0'),
              total: parseFloat(i.price?.value || '0') + parseFloat(i.shippingOptions?.[0]?.shippingCost?.value || "0"),
              shipping: parseFloat(i.shippingOptions?.[0]?.shippingCost?.value || "0"),
              url: i.itemWebUrl,
              condition: i.condition || 'Used',
              image: i.image?.imageUrl || null
            }));
            break;
          }
        } catch (e: any) { logs.push(`Browse ACTIVE FAILED: ${e.message}`); }
      }
    }

    // Always fetch Active count for Market Stats if not already fetched
    if (marketStats.activeCount === 0) {
      try {
        const activeRes = await axios.get('https://api.ebay.com/buy/browse/v1/item_summary/search', {
          headers: { 'Authorization': `Bearer ${appToken}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' },
          params: { q: relaxQuery(query as string, 0), limit: 1 }
        });
        marketStats.activeCount = parseInt(activeRes.data.total || "0");
      } catch (e) { }
    }

    marketStats.sellThroughRate = marketStats.activeCount > 0 ? (marketStats.soldCount / marketStats.activeCount) * 100 : 0;
    const totalSum = comps.reduce((acc: number, item: any) => acc + item.total, 0);
    avgPrice = comps.length > 0 ? totalSum / comps.length : 0;

    res.status(200).json({
      averagePrice: avgPrice.toFixed(2),
      comps: comps,
      marketStats: marketStats,
      queryUsed: finalQueryUsed,
      debug: logs
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message, debug: logs });
  }
}
