
import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { query, token } = req.query;
    if (!query) return res.status(400).json({ error: 'Missing query parameter' });

    try {
        const appId = (process.env.EBAY_APP_ID || '').trim();
        // Classic URL Auth approach
        const findingUrl = `https://svcs.ebay.com/services/search/FindingService/v1?SERVICE-VERSION=1.13.0&SECURITY-APPNAME=${appId}&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD&GLOBAL-ID=EBAY-US`;
        const fullUrl = `${findingUrl}&OPERATION-NAME=findCompletedItems&keywords=${encodeURIComponent(query as string)}&itemFilter(0).name=SoldItemsOnly&itemFilter(0).value(0)=true&itemFilter(1).name=Currency&itemFilter(1).value(0)=USD&paginationInput.entriesPerPage=20`;

        console.log('[TEST] Classic Auth Finding API URL:', fullUrl);

        const response = await axios.get(fullUrl, {
            headers: token ? {
                'Authorization': `Bearer ${token}`
            } : {}
        });

        console.log('[TEST] Response Status:', response.status);

        const findRes = response.data.findCompletedItemsResponse[0];
        if (findRes.ack[0] !== 'Success' && findRes.ack[0] !== 'Warning') {
            const error = findRes.errorMessage?.[0]?.error?.[0]?.message?.[0] || 'Unknown Error';
            return res.status(500).json({ error: 'Finding API Rejected', details: error, fullResponse: response.data });
        }

        const items = findRes.searchResult[0]?.item || [];
        res.status(200).json({
            count: items.length,
            items: items.map((i: any) => ({
                id: i.itemId[0],
                title: i.title[0],
                price: i.sellingStatus[0].currentPrice[0].__value__
            })),
            raw: response.data
        });

    } catch (error: any) {
        console.error('[TEST] Error:', error.message);
        res.status(500).json({ error: error.message, details: error.response?.data });
    }
}
