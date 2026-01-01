// Supabase Edge Function: ebay-sold
// Fetches sold listings data with SerpApi fallback

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCachedData, setCachedData } from '../_shared/cache.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

serve(async (req) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    try {
        const url = new URL(req.url);
        const query = decodeURIComponent(url.pathname.split('/').pop() || '');

        if (!query) {
            return new Response(
                JSON.stringify({ error: 'Search query required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Check cache
        const cacheKey = `sold:${query}`;
        const cached = getCachedData(cacheKey);
        if (cached) {
            return new Response(JSON.stringify(cached), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const EBAY_APP_ID = Deno.env.get('EBAY_APP_ID');
        const SERPAPI_KEY = Deno.env.get('SERPAPI_KEY');

        // Try Finding API first
        try {
            const findingParams = new URLSearchParams({
                'OPERATION-NAME': 'findCompletedItems',
                'SERVICE-VERSION': '1.13.0',
                'SECURITY-APPNAME': EBAY_APP_ID || '',
                'RESPONSE-DATA-FORMAT': 'JSON',
                'REST-PAYLOAD': '',
                'keywords': query,
                'itemFilter(0).name': 'SoldItemsOnly',
                'itemFilter(0).value': 'true',
                'paginationInput.entriesPerPage': '100',
                'sortOrder': 'EndTimeSoonest'
            });

            const findingResponse = await fetch(
                `https://svcs.ebay.com/services/search/FindingService/v1?${findingParams}`,
                {
                    headers: {
                        'X-EBAY-SOA-OPERATION-NAME': 'findCompletedItems',
                        'X-EBAY-SOA-SERVICE-VERSION': '1.13.0',
                        'X-EBAY-SOA-SECURITY-APPNAME': EBAY_APP_ID || '',
                        'X-EBAY-SOA-RESPONSE-DATA-FORMAT': 'JSON',
                        'X-EBAY-SOA-GLOBAL-ID': 'EBAY-US'
                    }
                }
            );

            const findingData = await findingResponse.json();
            const rootResponse = findingData.findCompletedItemsResponse?.[0];

            if (rootResponse?.ack?.[0] === 'Success') {
                const items = rootResponse.searchResult?.[0]?.item || [];
                setCachedData(cacheKey, items);
                return new Response(JSON.stringify(items), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }
        } catch (findingErr) {
            console.error('Finding API failed:', findingErr);
        }

        // Fallback to SerpApi
        if (SERPAPI_KEY && SERPAPI_KEY !== 'YOUR_FREE_KEY_HERE') {
            const serpParams = new URLSearchParams({
                engine: 'ebay',
                _nkw: query,
                LH_Sold: '1',
                LH_Complete: '1',
                api_key: SERPAPI_KEY,
                num: '100'
            });

            const serpResponse = await fetch(`https://serpapi.com/search?${serpParams}`);
            const serpData = await serpResponse.json();
            const organicResults = serpData.organic_results || [];

            // Normalize to Finding API format
            const items = organicResults.map((item: any) => ({
                itemId: [item.listing_id],
                title: [item.title],
                sellingStatus: [{
                    currentPrice: [{
                        '__value__': item.price?.extracted?.toString() || "0",
                        '@currencyId': 'USD'
                    }],
                    sellingState: ['EndedWithSales']
                }],
                viewItemURL: [item.link]
            }));

            setCachedData(cacheKey, items);
            return new Response(JSON.stringify(items), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        return new Response(
            JSON.stringify({ error: 'No sold listings found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Error:', error);
        return new Response(
            JSON.stringify({ error: 'Failed to fetch sold listings', details: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
