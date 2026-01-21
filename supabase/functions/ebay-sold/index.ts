// Supabase Edge Function: ebay-sold
// Fetches sold listings data with SerpApi fallback

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCachedData, setCachedData } from '../_shared/cache.ts';
import { corsHeaders, verifyUser, checkUsage } from '../_shared/auth.ts';

serve(async (req) => {
    // 1. Handle CORS
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        // 2. STRICT SECURITY GUARD
        const { user, supabase } = await verifyUser(req);

        // 3. DAILY THROTTLE: 100 sold lookups per day
        await checkUsage(supabase, user.id, 'ebay_sold', 100);

        const url = new URL(req.url);
        const query = decodeURIComponent(url.pathname.split('/').pop() || '');
        const condition = url.searchParams.get('condition');
        const categoryId = url.searchParams.get('categoryId');

        if (!query) {
            return new Response(JSON.stringify({ error: 'Search query required' }), { status: 400, headers: corsHeaders });
        }

        // Map common Browse API conditions to Finding API Condition IDs
        const mapCondition = (cond: string | null) => {
            if (!cond || cond === 'null') return null;
            const c = cond.toUpperCase();
            if (c.includes('NEW')) return '1000';
            if (c.includes('USED') || c.includes('GOOD') || c.includes('POOR')) return '3000';
            if (c.includes('REFURBISHED')) return '2500';
            return null;
        };

        const conditionId = mapCondition(condition);

        // Check cache
        const cacheKey = `sold:${query}:${condition || 'any'}:${categoryId || 'any'}`;
        const cached = getCachedData(cacheKey);
        if (cached) return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        const EBAY_APP_ID = Deno.env.get('EBAY_APP_ID');
        const SERPAPI_KEY = Deno.env.get('SERPAPI_KEY');

        // Try Finding API first
        try {
            const itemFilters: any[] = [{ name: 'SoldItemsOnly', value: 'true' }];
            if (conditionId) itemFilters.push({ name: 'Condition', value: conditionId });

            const findingParams = new URLSearchParams({
                'OPERATION-NAME': 'findCompletedItems',
                'SERVICE-VERSION': '1.13.0',
                'SECURITY-APPNAME': EBAY_APP_ID || '',
                'RESPONSE-DATA-FORMAT': 'JSON',
                'REST-PAYLOAD': '',
                'keywords': query,
                'paginationInput.entriesPerPage': '100',
                'sortOrder': 'EndTimeSoonest'
            });

            itemFilters.forEach((filter, index) => {
                findingParams.append(`itemFilter(${index}).name`, filter.name);
                findingParams.append(`itemFilter(${index}).value`, filter.value);
            });

            if (categoryId && categoryId !== 'null') findingParams.append('categoryId', categoryId);

            const findingResponse = await fetch(`https://svcs.ebay.com/services/search/FindingService/v1?${findingParams}`, {
                headers: {
                    'X-EBAY-SOA-OPERATION-NAME': 'findCompletedItems',
                    'X-EBAY-SOA-SERVICE-VERSION': '1.13.0',
                    'X-EBAY-SOA-SECURITY-APPNAME': EBAY_APP_ID || '',
                    'X-EBAY-SOA-RESPONSE-DATA-FORMAT': 'JSON',
                    'X-EBAY-SOA-GLOBAL-ID': 'EBAY-US'
                }
            });

            const findingData = await findingResponse.json();
            const rootResponse = findingData.findCompletedItemsResponse?.[0];

            if (rootResponse?.ack?.[0] === 'Success') {
                const items = rootResponse.searchResult?.[0]?.item || [];
                const count = rootResponse.searchResult?.[0]?.['@count'] || '0';
                if (items.length > 0 && count !== '0') {
                    setCachedData(cacheKey, items);
                    return new Response(JSON.stringify(items), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }
            }
        } catch (findingErr) {
            console.error('[FindingAPI] Exception:', findingErr.message);
        }

        // Fallback to SerpApi
        const ACTUAL_SERPAPI_KEY = SERPAPI_KEY || 'e0f6ca870f11e20e9210ec572228272ede9b839e1cbe79ff7f47de23a7a80a57';
        if (ACTUAL_SERPAPI_KEY) {
            const serpParams = new URLSearchParams({ engine: 'ebay', _nkw: query, show_only: 'Sold', api_key: ACTUAL_SERPAPI_KEY, num: '100' });
            if (condition) {
                const c = condition.toUpperCase();
                if (c.includes('NEW')) serpParams.append('LH_ItemCondition', '10');
                else if (c.includes('USED')) serpParams.append('LH_ItemCondition', '3');
            }

            const serpResponse = await fetch(`https://serpapi.com/search?${serpParams}`);
            const serpData = await serpResponse.json();
            const organicResults = serpData.organic_results || [];

            const items = organicResults.map((item: any) => {
                const extensions = item.extensions || [];
                const soldDateExt = extensions.find((ext: string) => ext.toLowerCase().includes('sold'));
                const isSoldRecord = !!soldDateExt || item.status === 'Sold';

                return {
                    itemId: [item.listing_id], title: [item.title],
                    sellingStatus: [{
                        currentPrice: [{ '__value__': item.price?.extracted?.toString() || "0", '@currencyId': 'USD' }],
                        sellingState: [isSoldRecord ? 'EndedWithSales' : 'Active']
                    }],
                    listingInfo: [{ endTime: [soldDateExt ? soldDateExt.replace(/Sold /i, '') : ''] }],
                    viewItemURL: [item.link], galleryURL: [item.thumbnail]
                };
            });

            setCachedData(cacheKey, items);
            return new Response(JSON.stringify(items), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ error: 'No sold listings found' }), { status: 404, headers: corsHeaders });

    } catch (error: any) {
        console.error('Error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: error.message.includes('authorization') ? 401 : 500,
            headers: corsHeaders
        });
    }
});
