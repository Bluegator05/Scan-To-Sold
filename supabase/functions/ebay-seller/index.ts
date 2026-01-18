// Supabase Edge Function: ebay-seller
// Bulletproof Version (v8): Multi-Tier Fetch + Detailed Diagnostics

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getEbayToken } from '../_shared/ebay-auth.ts';
import { getCachedData, setCachedData } from '../_shared/cache.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

serve(async (req) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    const stats = {
        serpApi: { status: 'skipped', items: 0 },
        browseApi: { status: 'skipped', items: 0 },
        findingApi: { status: 'skipped', items: 0 },
        enrichment: { status: 'skipped', items: 0 }
    };

    try {
        const url = new URL(req.url);
        const sellerId = url.pathname.split('/').pop()?.trim();
        const page = parseInt(url.searchParams.get('page') || '1');

        if (!sellerId || sellerId === 'ebay-seller') {
            return new Response(JSON.stringify({ error: 'Valid Seller ID required' }), { status: 400, headers: corsHeaders });
        }

        const cacheKey = `seller:v8:${sellerId}:p:${page}`;
        const cached = getCachedData(cacheKey);
        if (cached) return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        console.log(`[ebay-seller] V8 Start: ${sellerId} P${page}`);

        const EBAY_APP_ID = Deno.env.get('EBAY_APP_ID');
        const SERPAPI_KEY = Deno.env.get('SERPAPI_KEY');
        let finalItems: any[] = [];

        // TIER 0: SerpApi (Primary for resilience)
        if (SERPAPI_KEY && SERPAPI_KEY !== 'YOUR_FREE_KEY_HERE') {
            try {
                stats.serpApi.status = 'trying';
                const serpParams = new URLSearchParams({
                    engine: 'ebay',
                    _nkw: '*',
                    _ssn: sellerId,
                    api_key: SERPAPI_KEY,
                    _ipg: '10',
                    _sop: '10', // Oldest first
                    _pgn: page.toString()
                });

                const res = await fetch(`https://serpapi.com/search?${serpParams}`);
                const data = await res.json();
                const organic = data.organic_results || [];

                if (organic.length > 0) {
                    finalItems = organic.map((item: any) => ({
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
                        listedDate: item.extensions?.find((ex: string) => ex.toLowerCase().includes('listed')) || 'Active'
                    }));
                    stats.serpApi.status = 'success';
                    stats.serpApi.items = finalItems.length;
                    console.log(`[ebay-seller] SerpApi success (T0): ${finalItems.length} items.`);
                } else {
                    stats.serpApi.status = 'no_results';
                }
            } catch (err) {
                stats.serpApi.status = `error: ${err.message}`;
            }
        }

        // TIER 1: Browse API (Search)
        if (finalItems.length === 0) {
            try {
                stats.browseApi.status = 'trying';
                const token = await getEbayToken();
                const browseParams = new URLSearchParams({
                    filter: `sellers:{${sellerId}}`,
                    limit: '10',
                    offset: ((page - 1) * 10).toString(),
                    sort: 'newlyListed'
                });

                const res = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${browseParams}`, {
                    headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' }
                });

                if (res.ok) {
                    const data = await res.json();
                    const summaries = data.itemSummaries || [];
                    if (summaries.length > 0) {
                        finalItems = summaries.map((item: any) => ({
                            itemId: [item.itemId],
                            title: [item.title],
                            sellingStatus: [{
                                currentPrice: [{
                                    '__value__': item.price.value,
                                    '@currencyId': item.price.currency
                                }]
                            }],
                            galleryURL: [item.image?.imageUrl || ''],
                            viewItemURL: [item.itemWebUrl],
                            listedDate: 'Active'
                        }));
                        stats.browseApi.status = 'success';
                        stats.browseApi.items = finalItems.length;
                        console.log(`[ebay-seller] Browse API success (T1): ${finalItems.length} items.`);
                    } else {
                        stats.browseApi.status = 'no_results';
                    }
                } else {
                    stats.browseApi.status = `http_error: ${res.status}`;
                }
            } catch (err) {
                stats.browseApi.status = `error: ${err.message}`;
            }
        }

        // TIER 2: Finding API (StartTime specific)
        if (finalItems.length === 0 && EBAY_APP_ID) {
            try {
                stats.findingApi.status = 'trying';
                const findingParams = new URLSearchParams({
                    'OPERATION-NAME': 'findItemsAdvanced',
                    'SERVICE-VERSION': '1.13.0',
                    'SECURITY-APPNAME': EBAY_APP_ID,
                    'RESPONSE-DATA-FORMAT': 'JSON',
                    'itemFilter(0).name': 'Seller',
                    'itemFilter(0).value(0)': sellerId,
                    'paginationInput.entriesPerPage': '10',
                    'paginationInput.pageNumber': page.toString(),
                    'sortOrder': 'StartTimeAscending'
                });

                const res = await fetch(`https://svcs.ebay.com/services/search/FindingService/v1?${findingParams}`, {
                    headers: {
                        'X-EBAY-SOA-OPERATION-NAME': 'findItemsAdvanced',
                        'X-EBAY-SOA-SECURITY-APPNAME': EBAY_APP_ID,
                        'X-EBAY-SOA-RESPONSE-DATA-FORMAT': 'JSON',
                        'X-EBAY-SOA-GLOBAL-ID': 'EBAY-US'
                    }
                });

                if (res.ok) {
                    const data = await res.json();
                    const items = data.findItemsAdvancedResponse?.[0]?.searchResult?.[0]?.item;
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
                        stats.findingApi.status = 'success';
                        stats.findingApi.items = finalItems.length;
                    } else {
                        stats.findingApi.status = 'no_results';
                    }
                } else {
                    stats.findingApi.status = `http_error: ${res.status}`;
                }
            } catch (err) {
                stats.findingApi.status = `error: ${err.message}`;
            }
        }

        // TIER 3: Deep Enrichment (Only if we missed dates in previous tiers)
        if (finalItems.length > 0 && finalItems.some(i => i.listedDate === 'Active' || i.listedDate === 'Unknown')) {
            try {
                stats.enrichment.status = 'trying';
                const token = await getEbayToken();
                finalItems = await Promise.all(finalItems.map(async (item) => {
                    if (item.listedDate !== 'Active' && item.listedDate !== 'Unknown') return item;
                    try {
                        const dRes = await fetch(`https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(item.itemId[0])}`, {
                            headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' }
                        });
                        if (dRes.ok) {
                            const full = await dRes.json();
                            return { ...item, listedDate: full.listingStartTime || full.startTime || full.creationDate || item.listedDate };
                        }
                    } catch (e) { console.warn('Enrich fail:', e); }
                    return item;
                }));
                stats.enrichment.status = 'success';
            } catch (err) { stats.enrichment.status = `error: ${err.message}`; }
        }

        if (finalItems.length > 0) {
            setCachedData(cacheKey, finalItems);
            return new Response(JSON.stringify(finalItems), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // FAIL: Detailed Diagnostics
        return new Response(JSON.stringify({
            error: `Could not find any active listings for seller '${sellerId}'.`,
            diagnostics: stats
        }), { status: 404, headers: corsHeaders });

    } catch (error) {
        console.error('[ebay-seller] Critical Error:', error);
        return new Response(JSON.stringify({ error: 'Internal server error', details: error.message, diagnostics: stats }), { status: 500, headers: corsHeaders });
    }
});
