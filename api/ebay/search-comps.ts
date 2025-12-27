
import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { Buffer } from 'buffer';

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

    if (tab === 'SOLD') {
      // Use eBay FINDING API for truly COMPLETED/SOLD items
      // https://developer.ebay.com/Devzone/finding/CallRef/findCompletedItems.html
      const findingUrl = `https://svcs.ebay.com/services/search/FindingService/v1?OPERATION-NAME=findCompletedItems&SERVICE-VERSION=1.13.0&SECURITY-APPNAME=${process.env.EBAY_APP_ID}&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD`;

      let filterParams = '';
      // Don't filter by condition for sold items - we want to see all sold listings
      // The condition filter is too restrictive and causes 0 results

      filterParams += '&itemFilter(0).name=SoldItemsOnly&itemFilter(0).value=true';
      filterParams += '&itemFilter(1).name=Currency&itemFilter(1).value=USD';

      try {
        const findingUrl = `https://svcs.ebay.com/services/search/FindingService/v1?OPERATION-NAME=findCompletedItems&SERVICE-VERSION=1.13.0&SECURITY-APPNAME=${process.env.EBAY_APP_ID}&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD`;
        const fullUrl = `${findingUrl}&keywords=${encodeURIComponent(query as string)}&paginationInput.entriesPerPage=10&sortOrder=EndTimeSoonest${filterParams}`;

        console.log('[FINDING API] Request URL:', fullUrl);
        console.log('[FINDING API] Query:', query);
        console.log('[FINDING API] Filter Params:', filterParams);

        const findingRes = await axios.get(fullUrl);

        console.log('[FINDING API] Response Status:', findingRes.status);
        console.log('[FINDING API] Response Data:', JSON.stringify(findingRes.data, null, 2));

        const findResponse = findingRes.data.findCompletedItemsResponse[0];
        console.log('[FINDING API] ACK:', findResponse.ack[0]);

        if (findResponse.ack[0] !== 'Success' && findResponse.ack[0] !== 'Warning') {
          const errorMsg = findResponse.errorMessage?.[0]?.error?.[0]?.message?.[0] || 'Finding API Error';
          console.error('[FINDING API] Error Message:', errorMsg);
          throw new Error(errorMsg);
        }

        const searchResult = findResponse.searchResult[0];
        const items = (searchResult && searchResult.item) ? searchResult.item : [];
        console.log('[FINDING API] Found', items.length, 'sold items');

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
      } catch (findingError: any) {
        console.error('[SOLD COMPS] Finding API Error:', findingError.message);
        console.error('[SOLD COMPS] Error Stack:', findingError.stack);
        console.error('[SOLD COMPS] Response Data:', findingError.response?.data);
        // Fallback to empty results rather than crashing
        comps = [];
      }
    } else {
      // Use eBay BROWSE API for ACTIVE items
      let filter = 'priceCurrency:USD';
      if (condition === 'NEW') {
        filter += ',conditionIds:{1000|1500}';
      } else if (condition === 'USED') {
        filter += ',conditionIds:{3000}';
      }

      const response = await axios.get('https://api.ebay.com/buy/browse/v1/item_summary/search', {
        headers: {
          'Authorization': `Bearer ${appToken}`,
          'Content-Type': 'application/json',
          'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
          'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country=US,zip=10001'
        },
        params: {
          q: query,
          limit: 10,
          sort: 'price',
          filter: filter
        }
      });

      const items = response.data.itemSummaries || [];

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
          gtin: i.gtin || null,
          epid: i.epid || null,
          condition: i.condition || 'Used',
          image: i.image?.imageUrl || null
        };
      });
    }

    // 4. CALCULATE STATS
    const totalSum = comps.reduce((acc: number, item: any) => acc + item.total, 0);
    avgPrice = comps.length > 0 ? totalSum / comps.length : 0;

    res.status(200).json({
      averagePrice: avgPrice.toFixed(2),
      comps: comps
    });

  } catch (error: any) {
    console.error('[BACKEND] Search Error:', error.response?.data || error.message);
    console.error('[BACKEND] Error Stack:', error.stack);
    const msg = error.response?.data?.error_description || error.message;
    res.status(500).json({ error: `eBay Search Failed: ${msg}`, details: error.response?.data });
  }
}
