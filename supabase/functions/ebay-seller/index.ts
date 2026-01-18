// Supabase Edge Function: ebay-seller
// Mandatory Parameter Fix Version (v12): Injecting q=* to satisfy new eBay requirements

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getEbayToken } from '../_shared/ebay-auth.ts';
import { getCachedData, setCachedData } from '../_shared/cache.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

serve(async (req) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    const stats: any = {
        meta: { sellerId: 'unknown', v: '12' },
        serpApi: { status: 'skipped', info: '' },
        browseSeller: { status: 'skipped', info: '' },
        storeSearch: { status: 'skipped', info: '' },
        findingSeller: { status: 'skipped', info: '' },
        browseKeyword: { status: 'skipped', info: '' }
    };

    try {
        const url = new URL(req.url);
        const pathParts = url.pathname.split('/').filter(Boolean);
        const sellerId = pathParts[pathParts.length - 1]?.trim().toLowerCase();
        const page = parseInt(url.searchParams.get('page') || '1');

        stats.meta.sellerId = sellerId;

        if (!sellerId || sellerId === 'ebay-seller') {
            return new Response(JSON.stringify({ error: 'Valid Seller ID required' }), { status: 400, headers: corsHeaders });
        }

        const cacheKey = `seller:v12:${sellerId}:p:${page}`;
        const cached = getCachedData(cacheKey);
        if (cached) return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        console.log(`[ebay-seller] V12 MANDATORY FIX: ${sellerId} P${page}`);

        const EBAY_APP_ID = Deno.env.get('EBAY_APP_ID');
        const SERPAPI_KEY = Deno.env.get('SERPAPI_KEY');
        let finalItems: any[] = [];

        // TIER 0: SerpApi (Check if credits remain)
        if (SERPAPI_KEY && SERPAPI_KEY !== 'YOUR_FREE_KEY_HERE') {
            try {
                stats.serpApi.status = 'trying';
                const sParams = new URLSearchParams({ engine: 'ebay', _ssn: sellerId, api_key: SERPAPI_KEY, _ipg: '10', _pgn: page.toString() });
                const res = await fetch(`https://serpapi.com/search?${sParams}`);
                const data = await res.json();
                if (data.organic_results?.length > 0) {
                    finalItems = data.organic_results.map((item: any) => ({
                        itemId: [item.listing_id || 'UNKNOWN'], title: [item.title],
                        sellingStatus: [{ currentPrice: [{ '__value__': item.price?.extracted?.toString() || "0", '@currencyId': 'USD' }] }],
                        galleryURL: [item.thumbnail || ''], viewItemURL: [item.link],
                        listedDate: item.extensions?.find((ex: string) => ex.toLowerCase().includes('listed')) || 'Active'
                    }));
                    stats.serpApi.status = 'success';
                } else { stats.serpApi.status = 'fail'; stats.serpApi.info = data.error || 'No credits or no results'; }
            } catch (e) { stats.serpApi.status = 'error'; stats.serpApi.info = e.message; }
        }

        // TIER 1: Browse API Seller Filter (MANDATORY Q FIX)
        if (finalItems.length === 0) {
            try {
                stats.browseSeller.status = 'trying';
                const token = await getEbayToken();
                const bParams = new URLSearchParams({
                    q: '*', // MANDATORY: satisfying eBay's need for a keyword
                    filter: `sellers:{${sellerId}}`,
                    limit: '10',
                    offset: ((page - 1) * 10).toString(),
                    sort: 'newlyListed'
                });
                const res = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${bParams}`, {
                    headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' }
                });
                const data = await res.json();
                if (data.itemSummaries?.length > 0) {
                    finalItems = data.itemSummaries.map((item: any) => ({
                        itemId: [item.itemId], title: [item.title],
                        sellingStatus: [{ currentPrice: [{ '__value__': item.price.value, '@currencyId': item.price.currency }] }],
                        galleryURL: [item.image?.imageUrl || ''], viewItemURL: [item.itemWebUrl], listedDate: 'Active'
                    }));
                    stats.browseSeller.status = 'success';
                } else { stats.browseSeller.status = 'fail'; stats.browseSeller.info = data.errors?.[0]?.message || 'No items found'; }
            } catch (e) { stats.browseSeller.status = 'error'; stats.browseSeller.info = e.message; }
        }

        // TIER 2: Finding API Seller Filter (MANDATORY KEYWORDS FIX)
        if (finalItems.length === 0 && EBAY_APP_ID) {
            try {
                stats.findingSeller.status = 'trying';
                const fParams = new URLSearchParams({
                    'OPERATION-NAME': 'findItemsAdvanced',
                    'SERVICE-VERSION': '1.13.0',
                    'SECURITY-APPNAME': EBAY_APP_ID,
                    'RESPONSE-DATA-FORMAT': 'JSON',
                    'itemFilter(0).name': 'Seller',
                    'itemFilter(0).value(0)': sellerId,
                    'keywords': '*', // MANDATORY wildcard
                    'paginationInput.entriesPerPage': '10'
                });
                const res = await fetch(`https://svcs.ebay.com/services/search/FindingService/v1?${fParams}`, {
                    headers: { 'X-EBAY-SOA-OPERATION-NAME': 'findItemsAdvanced', 'X-EBAY-SOA-SECURITY-APPNAME': EBAY_APP_ID, 'X-EBAY-SOA-RESPONSE-DATA-FORMAT': 'JSON', 'X-EBAY-SOA-GLOBAL-ID': 'EBAY-US' }
                });
                const data = await res.json();
                const items = data.findItemsAdvancedResponse?.[0]?.searchResult?.[0]?.item;
                if (items?.length > 0) {
                    finalItems = items.map((item: any) => ({
                        itemId: [item.itemId], title: [item.title],
                        sellingStatus: [{ currentPrice: [{ '__value__': item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || "0", '@currencyId': item.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] || "USD" }] }],
                        galleryURL: item.galleryURL || [''], viewItemURL: item.viewItemURL || [''], listedDate: item.listingInfo?.[0]?.startTime?.[0] || 'Unknown'
                    }));
                    stats.findingSeller.status = 'success';
                } else { stats.findingSeller.status = 'fail'; stats.findingSeller.info = 'No items found in Finding API'; }
            } catch (e) { stats.findingSeller.status = 'error'; stats.findingSeller.info = e.message; }
        }

        if (finalItems.length > 0) {
            // Background Enrichment for dates
            if (finalItems.some(i => i.listedDate === 'Active' || i.listedDate === 'Unknown')) {
                const token = await getEbayToken();
                finalItems = await Promise.all(finalItems.map(async (item) => {
                    if (item.listedDate !== 'Active' && item.listedDate !== 'Unknown') return item;
                    try {
                        const dRes = await fetch(`https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(item.itemId[0])}`, {
                            headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' }
                        });
                        if (dRes.ok) {
                            const f = await dRes.json();
                            return { ...item, listedDate: f.listingStartTime || f.startTime || item.listedDate };
                        }
                    } catch (e) { }
                    return item;
                }));
            }
            setCachedData(cacheKey, finalItems);
            return new Response(JSON.stringify(finalItems), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const report = `FAILED: ${sellerId}\n- SerpApi: ${stats.serpApi.info}\n- BrowseSeller: ${stats.browseSeller.info}\n- FindingSeller: ${stats.findingSeller.info}`;
        return new Response(JSON.stringify({ error: report }), { status: 404, headers: corsHeaders });

    } catch (error) {
        return new Response(JSON.stringify({ error: `CRITICAL: ${error.message}` }), { status: 500, headers: corsHeaders });
    }
});
