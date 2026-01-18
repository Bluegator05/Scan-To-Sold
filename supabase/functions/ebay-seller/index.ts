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
        const pathParts = url.pathname.split('/');
        const sellerId = pathParts[pathParts.length - 1];
        const pageCount = parseInt(url.searchParams.get('page') || '1');

        if (!sellerId || sellerId === 'ebay-seller') {
            return new Response(JSON.stringify({ error: 'Valid Seller ID required' }), { status: 400, headers: corsHeaders });
        }

        const cacheKey = `seller:v4:${sellerId}:p:${pageCount}`;
        const cached = getCachedData(cacheKey);
        if (cached) return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        console.log(`[ebay-seller] V4 - Fetching/Enriching for ${sellerId}, Page ${pageCount}`);

        const token = await getEbayToken();

        // 1. Get List via Browse API
        const browseParams = new URLSearchParams({
            category_ids: '0',
            filter: `sellers:{${sellerId}}`,
            limit: '10',
            offset: ((pageCount - 1) * 10).toString(),
            sort: 'newlyListed'
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
            console.error('[ebay-seller] Browse Search Failed:', err);
            throw new Error(`Browse API failed: ${err}`);
        }

        const browseData = await browseResponse.json();
        const browseItems = browseData.itemSummaries || [];

        if (browseItems.length === 0) {
            return new Response(JSON.stringify([]), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // 2. ENRICH: Parallel Fetch Item Details to get listingStartTime
        console.log(`[ebay-seller] Deep Scanning ${browseItems.length} items for dates...`);
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

                    // Check multiple possible fields for the listing date
                    const startTime = fullItem.listingStartTime || fullItem.startTime || fullItem.startTimeUtc || fullItem.listingInfo?.startTime;

                    if (startTime) {
                        return { ...item, listedDate: startTime };
                    } else {
                        console.warn(`[ebay-seller] No start time found in profile for ${item.itemId}. Available keys:`, Object.keys(fullItem));
                    }
                } else {
                    console.error(`[ebay-seller] Failed to fetch details for ${item.itemId}: ${detailResponse.status}`);
                }
            } catch (e) {
                console.error(`[ebay-seller] Critical error enriching item ${item.itemId}:`, e);
            }
            return { ...item, listedDate: 'Unknown' };
        }));

        // 3. Format result
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
        console.error('[ebay-seller] Final Handler Catch:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error', details: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
