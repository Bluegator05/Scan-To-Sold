
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
        const findingUrl = `https://svcs.ebay.com/services/search/FindingService/v1?OPERATION-NAME=findCompletedItems&SERVICE-VERSION=1.13.0&SECURITY-APPNAME=${process.env.EBAY_APP_ID}&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD`;
        const fullUrl = `${findingUrl}&keywords=${encodeURIComponent(query as string)}&paginationInput.entriesPerPage=10&itemFilter(0).name=SoldItemsOnly&itemFilter(0).value=true`;

        console.log('[TEST] Finding API URL:', fullUrl);

        const response = await axios.get(fullUrl);

        console.log('[TEST] Response Status:', response.status);
        console.log('[TEST] Response Data:', JSON.stringify(response.data, null, 2));

        res.status(200).json({
            success: true,
            url: fullUrl,
            status: response.status,
            data: response.data
        });
    } catch (error: any) {
        console.error('[TEST] Error:', error.message);
        console.error('[TEST] Error Response:', error.response?.data);

        res.status(500).json({
            success: false,
            error: error.message,
            response: error.response?.data,
            stack: error.stack
        });
    }
}
