// Supabase Edge Function: ebay-seller
// Fetches a seller's listings for bulk optimization
// Priority: Finding API (best for StartTime) -> Browse API (Enriched)

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

        // Cache buster v5 for final fix
        const cacheKey = `seller:v5:${sellerId}:p:${page}`;
        const cached = getCachedData(cacheKey);
        if (cached) return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        console.log(`[ebay-seller] V5 Fetching for ${sellerId}, Page ${page}`);

        const EBAY_APP_ID = Deno.env.get('EBAY_APP_ID');
        let items: any[] = [];

        // TIER 1: Finding API (Specifically for listingInfo.startTime)
        if (EBAY_APP_ID) {
            try {
                const findingParams = new URLSearchParams({
                    'OPERATION-NAME': 'findItemsAdvanced',
                    'SERVICE-VERSION': '1.13.0',
                    'SECURITY-APPNAME': EBAY_APP_ID,
                    'RESPONSE-DATA-FORMAT': 'JSON',
                    'REST-PAYLOAD': '',
                    'itemFilter(0).name': 'Seller',
                    'itemFilter(0).value(0)': sellerId,
                    'paginationInput.entriesPerPage': '10',
                    'paginationInput.pageNumber': page.toString(),
                    'sortOrder': 'StartTimeAscending',
                    'keywords': ' ' // Space to satisfy mandatory keyword if needed
                });

                const findingRes = await fetch(`https://svcs.ebay.com/services/search/FindingService/v1?${findingParams}`);
                if (findingRes.ok) {
                    const data = await findingRes.json();
                    const searchResult = data.findItemsAdvancedResponse?.[0]?.searchResult?.[0];
                    if (searchResult?.item) {
                        items = searchResult.item.map((item: any) => ({
                            itemId: [item.itemId],
                            title: [item.title],
                            sellingStatus: [{
                                currentPrice: [{
                                    '__value__': item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || "0",
                                    '@currencyId': item.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] || "USD"
                                }]
                            }],
                            galleryURL: item.galleryURL || [''],
                            viewItemURL: item.viewItemURL || [''],
                            listedDate: item.listingInfo?.[0]?.startTime?.[0] || 'Unknown'
                        }));
                        console.log(`[ebay-seller] Finding API succeeded with ${items.length} items.`);
                    }
                }
            } catch (err) {
                console.warn('[ebay-seller] Finding API Tier failed:', err);
            }
        }

        // TIER 2: Browse API Enrichment (Fallback if Finding API yielded nothing)
        if (items.length === 0) {
            console.log('[ebay-seller] Falling back to Browse API + Enrichment...');
            const token = await getEbayToken();
            const browseParams = new URLSearchParams({
                filter: `sellers:{${sellerId}}`,
                limit: '10',
                offset: ((page - 1) * 10).toString(),
                sort: 'newlyListed'
            });

            const browseRes = await fetch(
                `https://api.ebay.com/buy/browse/v1/item_summary/search?${browseParams}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
                    }
                }
            );

            if (browseRes.ok) {
                const data = await browseRes.json();
                const summaries = data.itemSummaries || [];

                // Deep enrichment for each item to get listingStartTime
                items = await Promise.all(summaries.map(async (item: any) => {
                    let listedDate = 'Unknown';
                    try {
                        const detailRes = await fetch(`https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(item.itemId)}`, {
                            headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' }
                        });
                        if (detailRes.ok) {
                            const full = await detailRes.ok ? await detailRes.json() : {};
                            listedDate = full.listingStartTime || full.startTime || full.creationDate || 'Unknown';
                        }
                    } catch (e) {
                        console.warn(`Detail enrichment failed for ${item.itemId}`, e);
                    }

                    return {
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
                        listedDate
                    };
                }));
            }
        }

        if (items.length > 0) {
            setCachedData(cacheKey, items);
            return new Response(JSON.stringify(items), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ error: 'No listings found' }), { status: 404, headers: corsHeaders });

    } catch (error) {
        console.error('Final Error:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error', details: error.message }),
            { status: 500, headers: corsHeaders }
        );
    }
});
