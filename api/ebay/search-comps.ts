
import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';
import { Buffer } from 'buffer';

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

    // 2. SEARCH EBAY (Browse API)
    let filter = 'priceCurrency:USD';
    
    // Apply Condition Filter
    if (condition === 'NEW') {
        filter += ',conditionIds:{1000|1500}'; // New, New (Other)
    } else if (condition === 'USED') {
        filter += ',conditionIds:{3000}'; // Used
    }

    // For SOLD items via Browse API, explicit 'itemStatus:COMPLETED' is often restricted for public clients.
    // We rely on client-side filtering or best-effort sort if the filter is rejected.
    // However, we can try 'buyingOptions:{FIXED_PRICE}' to narrow down.
    
    const response = await axios.get('https://api.ebay.com/buy/browse/v1/item_summary/search', {
      headers: {
        'Authorization': `Bearer ${appToken}`,
        'Content-Type': 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
      },
      params: {
        q: query,
        limit: 10,
        sort: tab === 'SOLD' ? '-price' : 'price', 
        filter: filter
      }
    });

    const items = response.data.itemSummaries || [];

    // 3. PROCESS RESULTS
    const comps = items.map((i: any) => {
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
        image: i.image?.imageUrl || null // Extract image
      };
    });

    // 4. CALCULATE STATS
    const totalSum = comps.reduce((acc: number, item: any) => acc + item.total, 0);
    const avgPrice = comps.length > 0 ? totalSum / comps.length : 0;

    res.status(200).json({ 
      averagePrice: avgPrice.toFixed(2), 
      comps: comps 
    });

  } catch (error: any) {
    console.error("Search Error:", error.response?.data || error.message);
    const msg = error.response?.data?.error_description || error.message;
    res.status(500).json({ error: `eBay Search Failed: ${msg}` });
  }
}
