// Supabase Edge Function: ebay-seller
// Fetches a seller's 10 oldest active listings for bulk optimization

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getEbayToken } from '../_shared/ebay-auth.ts';
import { getCachedData, setCachedData } from '../_shared/cache.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

serve(async (req) => {
    // Handle CORS
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    try {
        const url = new URL(req.url);
        const sellerId = url.pathname.split('/').pop();
        const page = parseInt(url.searchParams.get('page') || '1');

        if (!sellerId) {
            return new Response(
                JSON.stringify({ error: 'Seller ID required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Check cache
        const cacheKey = `seller:${sellerId}:p${page}`;
        const cached = getCachedData(cacheKey);
        if (cached) {
            return new Response(JSON.stringify(cached), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const SERPAPI_KEY = Deno.env.get('SERPAPI_KEY');

        // TIER 1: SerpApi (if available)
        if (SERPAPI_KEY && SERPAPI_KEY !== 'YOUR_FREE_KEY_HERE') {
            try {
                const serpParams = new URLSearchParams({
                    engine: 'ebay',
                    _nkw: '*',
                    _ssn: sellerId,
                    api_key: SERPAPI_KEY,
                    _ipg: '10',
                    _sop: '10', // Oldest first
                    _pgn: page.toString()
                });

                const serpResponse = await fetch(`https://serpapi.com/search?${serpParams}`);
                const serpData = await serpResponse.json();
                const organicResults = serpData.organic_results || [];

                if (organicResults.length > 0) {
                    const items = organicResults.map((item: any) => ({
                        itemId: [item.listing_id || 'UNKNOWN'],
                        title: [item.title],
                        sellingStatus: [{
                            currentPrice: [{
                                '__value__': item.price?.extracted?.toString() || "0",
                                '@currencyId': 'USD'
                            }]
                        }],
                        galleryURL: [item.thumbnail || ''],
                        viewItemURL: [item.link],
                        listedDate: item.extensions?.find((ex: string) => ex.toLowerCase().includes('listed')) || 'Recent'
                    }));

                    setCachedData(cacheKey, items);
                    return new Response(JSON.stringify(items), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }
            } catch (serpErr) {
                console.error('SerpApi failed:', serpErr);
            }
        }

        // TIER 2: eBay Browse API (category_ids=0 trick)
        const token = await getEbayToken();

        try {
            const browseParams = new URLSearchParams({
                category_ids: '0',
                filter: `sellers:{${sellerId}}`,
                limit: '10',
                offset: ((page - 1) * 10).toString(),
                sort: 'endingSoonest' // Oldest listings
            });

            const browseResponse = await fetch(
                `https://api.ebay.com/buy/browse/v1/item_summary/search?${browseParams}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
                    }
                }
            );

            if (browseResponse.ok) {
                const browseData = await browseResponse.json();
                const browseItems = browseData.itemSummaries || [];

                if (browseItems.length > 0) {
                    const items = browseItems.map((item: any) => ({
                        itemId: [item.itemId],
                        title: [item.title],
                        sellingStatus: [{
                            currentPrice: [{
                                '__value__': item.price.value,
                                '@currencyId': item.price.currency
                            }]
                        }],
                        viewItemURL: [item.itemWebUrl],
                        galleryURL: [item.image?.imageUrl || ''],
                        listedDate: 'Active' // Browse API summary doesn't give StartTime clearly
                    }));

                    setCachedData(cacheKey, items);
                    return new Response(JSON.stringify(items), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }
            }
        } catch (browseErr) {
            console.error('Browse API failed:', browseErr);
        }

        // TIER 3: Finding API fallback (Primary source for StartTime)
        const EBAY_APP_ID = Deno.env.get('EBAY_APP_ID');
        const findingParams = new URLSearchParams({
            'OPERATION-NAME': 'findItemsAdvanced',
            'SERVICE-VERSION': '1.13.0',
            'SECURITY-APPNAME': EBAY_APP_ID || '',
            'RESPONSE-DATA-FORMAT': 'JSON',
            'REST-PAYLOAD': '',
            'itemFilter(0).name': 'Seller',
            'itemFilter(0).value(0)': sellerId,
            'paginationInput.entriesPerPage': '10',
            'paginationInput.pageNumber': page.toString(),
            'sortOrder': 'StartTimeAscending',
            'outputSelector': 'SellerInfo'
        });

        const findingResponse = await fetch(
            `https://svcs.ebay.com/services/search/FindingService/v1?${findingParams}`,
            {
                headers: {
                    'X-EBAY-SOA-OPERATION-NAME': 'findItemsAdvanced',
                    'X-EBAY-SOA-SERVICE-VERSION': '1.13.0',
                    'X-EBAY-SOA-SECURITY-APPNAME': EBAY_APP_ID || '',
                    'X-EBAY-SOA-RESPONSE-DATA-FORMAT': 'JSON',
                    'X-EBAY-SOA-GLOBAL-ID': 'EBAY-US'
                }
            }
        );

        const findingData = await findingResponse.json();
        const rootResponse = findingData.findItemsAdvancedResponse?.[0];

        if (rootResponse?.ack?.[0] === 'Success') {
            const items = (rootResponse.searchResult?.[0]?.item || []).map((item: any) => ({
                ...item,
                listedDate: item.listingInfo?.[0]?.startTime?.[0] || 'Unknown'
            }));
            setCachedData(cacheKey, items);
            return new Response(JSON.stringify(items), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        return new Response(
            JSON.stringify({ error: 'No listings found for this seller' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Error:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error', details: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
