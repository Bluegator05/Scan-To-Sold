// Supabase Edge Function: ebay-seller
// Final Stable Version: Robust multi-tier fetching with mandatory headers and StartTime support

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getEbayToken } from '../_shared/ebay-auth.ts';
import { getCachedData, setCachedData } from '../_shared/cache.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

serve(async (req) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    try {
        const url = new URL(req.url);
        const sellerId = url.pathname.split('/').pop()?.trim();
        const page = parseInt(url.searchParams.get('page') || '1');

        if (!sellerId || sellerId === 'ebay-seller') {
            return new Response(JSON.stringify({ error: 'Valid Seller ID required' }), { status: 400, headers: corsHeaders });
        }

        // Cache buster v7 for header restoration fix
        const cacheKey = `seller:v7:${sellerId}:p:${page}`;
        const cached = getCachedData(cacheKey);
        if (cached) return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        console.log(`[ebay-seller] V7 Start: Fetching items for ${sellerId}, Page ${page}`);

        const EBAY_APP_ID = Deno.env.get('EBAY_APP_ID');
        let finalItems: any[] = [];

        // MANDATORY HEADERS FOR FINDING API
        const findingHeaders = {
            'X-EBAY-SOA-SERVICE-VERSION': '1.13.0',
            'X-EBAY-SOA-SECURITY-APPNAME': EBAY_APP_ID || '',
            'X-EBAY-SOA-RESPONSE-DATA-FORMAT': 'JSON',
            'X-EBAY-SOA-GLOBAL-ID': 'EBAY-US'
        };

        // TIER 1: Finding API - findItemsAdvanced (The most reliable for Seller ID + StartTime)
        if (EBAY_APP_ID && finalItems.length === 0) {
            try {
                console.log(`[ebay-seller] Trying Tier 1: findItemsAdvanced (Seller Filter)...`);
                const searchParams = new URLSearchParams({
                    'OPERATION-NAME': 'findItemsAdvanced',
                    'SERVICE-VERSION': '1.13.0',
                    'SECURITY-APPNAME': EBAY_APP_ID,
                    'RESPONSE-DATA-FORMAT': 'JSON',
                    'itemFilter(0).name': 'Seller',
                    'itemFilter(0).value(0)': sellerId,
                    'paginationInput.entriesPerPage': '10',
                    'paginationInput.pageNumber': page.toString(),
                    'sortOrder': 'StartTimeAscending',
                    'outputSelector': 'SellerInfo'
                });

                const res = await fetch(`https://svcs.ebay.com/services/search/FindingService/v1?${searchParams}`, {
                    headers: { ...findingHeaders, 'X-EBAY-SOA-OPERATION-NAME': 'findItemsAdvanced' }
                });

                if (res.ok) {
                    const data = await res.json();
                    const rootRes = data.findItemsAdvancedResponse?.[0];
                    if (rootRes?.ack?.[0] === 'Success') {
                        const items = rootRes?.searchResult?.[0]?.item;
                        if (items && items.length > 0) {
                            finalItems = items.map((item: any) => ({
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
                            console.log(`[ebay-seller] Tier 1 success: Found ${finalItems.length} items.`);
                        }
                    } else {
                        console.warn('[ebay-seller] Tier 1 Ack failing:', rootRes?.ack?.[0], JSON.stringify(rootRes?.errorMessage));
                    }
                }
            } catch (err) {
                console.warn('[ebay-seller] Tier 1 failed:', err);
            }
        }

        // TIER 2: Finding API - findItemsIneBayStores (Alternate for store search)
        if (EBAY_APP_ID && finalItems.length === 0) {
            try {
                console.log(`[ebay-seller] Trying Tier 2: findItemsIneBayStores...`);
                const storeParams = new URLSearchParams({
                    'OPERATION-NAME': 'findItemsIneBayStores',
                    'SERVICE-VERSION': '1.13.0',
                    'SECURITY-APPNAME': EBAY_APP_ID,
                    'RESPONSE-DATA-FORMAT': 'JSON',
                    'storeName': sellerId,
                    'paginationInput.entriesPerPage': '10',
                    'paginationInput.pageNumber': page.toString(),
                    'sortOrder': 'StartTimeAscending'
                });

                const res = await fetch(`https://svcs.ebay.com/services/search/FindingService/v1?${storeParams}`, {
                    headers: { ...findingHeaders, 'X-EBAY-SOA-OPERATION-NAME': 'findItemsIneBayStores' }
                });

                if (res.ok) {
                    const data = await res.json();
                    const rootRes = data.findItemsIneBayStoresResponse?.[0];
                    if (rootRes?.ack?.[0] === 'Success') {
                        const items = rootRes?.searchResult?.[0]?.item;
                        if (items && items.length > 0) {
                            finalItems = items.map((item: any) => ({
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
                            console.log(`[ebay-seller] Tier 2 success: Found ${finalItems.length} items.`);
                        }
                    }
                }
            } catch (err) {
                console.warn('[ebay-seller] Tier 2 failed:', err);
            }
        }

        // TIER 3: Browse API + Parallel Enrichment (Ultimate Fallback)
        if (finalItems.length === 0) {
            console.log(`[ebay-seller] Trying Tier 3: Browse API + Enrichment...`);
            try {
                const token = await getEbayToken();
                const browseParams = new URLSearchParams({
                    filter: `sellers:{${sellerId}}`,
                    limit: '10',
                    offset: ((page - 1) * 10).toString(),
                    sort: 'newlyListed'
                });

                const res = await fetch(
                    `https://api.ebay.com/buy/browse/v1/item_summary/search?${browseParams}`,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
                        }
                    }
                );

                if (res.ok) {
                    const data = await res.json();
                    const summaries = data.itemSummaries || [];
                    if (summaries.length > 0) {
                        finalItems = await Promise.all(summaries.map(async (item: any) => {
                            let detailedDate = 'Unknown';
                            try {
                                const detailRes = await fetch(`https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(item.itemId)}`, {
                                    headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' }
                                });
                                if (detailRes.ok) {
                                    const full = await detailRes.json();
                                    detailedDate = full.listingStartTime || full.startTime || full.creationDate || 'Unknown';
                                }
                            } catch (e) {
                                console.warn(`[ebay-seller] Enrichment failed for ${item.itemId}:`, e);
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
                                listedDate: detailedDate
                            };
                        }));
                        console.log(`[ebay-seller] Tier 3 success: Enriched ${finalItems.length} items.`);
                    }
                }
            } catch (err) {
                console.error('[ebay-seller] Tier 3 failed:', err);
            }
        }

        if (finalItems.length > 0) {
            setCachedData(cacheKey, finalItems);
            return new Response(JSON.stringify(finalItems), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        console.log(`[ebay-seller] Exhausted all tiers. No listings found for ${sellerId}.`);
        return new Response(JSON.stringify({ error: `Seller '${sellerId}' has no active listings or doesn't exist.` }), { status: 404, headers: corsHeaders });

    } catch (error) {
        console.error('[ebay-seller] Critical Error:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error', details: error.message }),
            { status: 500, headers: corsHeaders }
        );
    }
});
