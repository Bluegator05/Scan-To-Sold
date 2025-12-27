
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

    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'Missing query parameter' });

    try {
        // Headers-based approach with SOA headers and Service Version 1.13.0
        const findingUrl = `https://svcs.ebay.com/services/search/FindingService/v1`;
        const fullUrl = `${findingUrl}?OPERATION-NAME=findCompletedItems&SERVICE-VERSION=1.13.0&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD&GLOBAL-ID=EBAY-US&keywords=${encodeURIComponent(query as string)}&paginationInput.entriesPerPage=20&itemFilter(0).name=SoldItemsOnly&itemFilter(0).value(0)=true&itemFilter(1).name=Currency&itemFilter(1).value(0)=USD`;

        console.log('[TEST] Finding API URL:', fullUrl);

        const response = await axios.get(fullUrl, {
            headers: {
                'X-EBAY-SOA-OPERATION-NAME': 'findCompletedItems',
                'X-EBAY-SOA-SECURITY-APPNAME': process.env.EBAY_APP_ID,
                'X-EBAY-SOA-RESPONSE-DATA-FORMAT': 'JSON',
                'X-EBAY-SOA-GLOBAL-ID': 'EBAY-US',
                // For test endpoint, we'll try WITHOUT the app token first to see if it's required with SOA headers
                // Or if SOA headers alone fix it. If it fails, we know we need the token (which is already in production).
            }
        });

        console.log('[TEST] Response Status:', response.status);

        const findRes = response.data.findCompletedItemsResponse[0];
        if (findRes.ack[0] !== 'Success' && findRes.ack[0] !== 'Warning') {
            const error = findRes.errorMessage?.[0]?.error?.[0]?.message?.[0] || 'Unknown Error';
            return res.status(500).json({ error: 'Finding API Rejected Request', details: error, fullResponse: response.data });
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

        res.status(500).json({
            success: false,
            error: error.message,
            response: error.response?.data,
            stack: error.stack
        });
    }
}
