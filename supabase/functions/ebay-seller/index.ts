// Supabase Edge Function: ebay-seller
// Fetches a seller's listings and enriches them with dates

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getEbayToken } from '../_shared/ebay-auth.ts';
import { getCachedData, setCachedData } from '../_shared/cache.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

serve(async (req) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    try {
        const url = new URL(req.url);
        const sellerId = url.pathname.split('/').pop();
        const page = parseInt(url.searchParams.get('page') || '1');

        if (!sellerId) {
            return new Response(JSON.stringify({ error: 'Seller ID required' }), { status: 400, headers: corsHeaders });
        }

        const cacheKey = `seller:v3:${sellerId}:p:${page}`;
        const cached = getCachedData(cacheKey);
        if (cached) return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        console.log(`[ebay-seller] Fetching and Enriching for ${sellerId}, Page ${page}`);

        const token = await getEbayToken();

        // 1. Get List via Browse API (Reliable for sellers)
        const browseParams = new URLSearchParams({
            category_ids: '0', // Global search
            filter: `sellers:{${sellerId}}`,
            limit: '10',
            offset: ((page - 1) * 10).toString(),
            sort: 'newlyListed' // Focus on sequence
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

        if (!browseResponse.ok) {
            const err = await browseResponse.text();
            throw new Error(`Browse API failed: ${err}`);
        }

        const browseData = await browseResponse.json();
        const browseItems = browseData.itemSummaries || [];

        if (browseItems.length === 0) {
            return new Response(JSON.stringify([]), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // 2. ENRICH: Parallel Fetch Item Details to get listingStartTime
        // This is necessary because search summaries often omit the original start time
        console.log(`[ebay-seller] Enriching ${browseItems.length} items with dates...`);
        const enrichedItems = await Promise.all(browseItems.map(async (item: any) => {
            try {
                const detailResponse = await fetch(
                    `https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(item.itemId)}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
                        }
                    }
                );
                if (detailResponse.ok) {
                    const fullItem = await detailResponse.json();
                    // listingStartTime is the official field for the Browse API browse/v1/item/{itemId}
                    return {
                        ...item,
                        listedDate: fullItem.listingStartTime || 'Unknown'
                    };
                }
            } catch (e) {
                console.error(`Failed to enrich item ${item.itemId}:`, e);
            }
            return { ...item, listedDate: 'Unknown' };
        }));

        // 3. Format for Frontend
        const items = enrichedItems.map((item: any) => ({
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
            listedDate: item.listedDate
        }));

        setCachedData(cacheKey, items);
        return new Response(JSON.stringify(items), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Bulk Fetch Error:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error', details: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
