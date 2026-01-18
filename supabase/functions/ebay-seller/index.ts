// Supabase Edge Function: ebay-seller
// Extreme Resilience Version (v10): 5 Tiers + Detail Diagnostics

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getEbayToken } from '../_shared/ebay-auth.ts';
import { getCachedData, setCachedData } from '../_shared/cache.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

serve(async (req) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    const stats: any = {
        meta: { sellerId: 'unknown', page: 1 },
        serpApi: { status: 'skipped', count: 0 },
        browseApiSeller: { status: 'skipped', count: 0 },
        browseApiKeyword: { status: 'skipped', count: 0 },
        findingApiSeller: { status: 'skipped', count: 0 },
        findingApiKeyword: { status: 'skipped', count: 0 }
    };

    try {
        const url = new URL(req.url);
        const pathParts = url.pathname.split('/').filter(Boolean);
        const sellerId = pathParts[pathParts.length - 1]?.trim().toLowerCase();
        const page = parseInt(url.searchParams.get('page') || '1');

        stats.meta = { sellerId, page };

        if (!sellerId || sellerId === 'ebay-seller') {
            return new Response(JSON.stringify({ error: 'Valid Seller ID required' }), { status: 400, headers: corsHeaders });
        }

        const cacheKey = `seller:v10:${sellerId}:p:${page}`;
        const cached = getCachedData(cacheKey);
        if (cached) return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        console.log(`[ebay-seller] V10 MEGA-SCAN: ${sellerId} P${page}`);

        const EBAY_APP_ID = Deno.env.get('EBAY_APP_ID');
        const SERPAPI_KEY = Deno.env.get('SERPAPI_KEY');
        let finalItems: any[] = [];

        // TIER 0: SerpApi
        if (SERPAPI_KEY && SERPAPI_KEY !== 'YOUR_FREE_KEY_HERE') {
            try {
                stats.serpApi.status = 'trying';
                const sParams = new URLSearchParams({ engine: 'ebay', _nkw: '*', _ssn: sellerId, api_key: SERPAPI_KEY, _ipg: '10', _sop: '10', _pgn: page.toString() });
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
                    stats.serpApi.count = finalItems.length;
                } else { stats.serpApi.status = 'no_results'; }
            } catch (e) { stats.serpApi.status = `error: ${e.message}`; }
        }

        // TIER 1: Browse API (Seller Filter)
        if (finalItems.length === 0) {
            try {
                stats.browseApiSeller.status = 'trying';
                const token = await getEbayToken();
                const bParams = new URLSearchParams({ filter: `sellers:{${sellerId}}`, limit: '10', offset: ((page - 1) * 10).toString(), sort: 'newlyListed' });
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
                    stats.browseApiSeller.status = 'success';
                } else { stats.browseApiSeller.status = data.errors ? `error: ${data.errors[0].message}` : 'no_results'; }
            } catch (e) { stats.browseApiSeller.status = `error: ${e.message}`; }
        }

        // TIER 2: Browse API (Keyword Search)
        if (finalItems.length === 0) {
            try {
                stats.browseApiKeyword.status = 'trying';
                const token = await getEbayToken();
                const qParams = new URLSearchParams({ q: sellerId, limit: '10', offset: ((page - 1) * 10).toString() });
                const res = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${qParams}`, {
                    headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' }
                });
                const data = await res.json();
                if (data.itemSummaries?.length > 0) {
                    finalItems = data.itemSummaries.map((item: any) => ({
                        itemId: [item.itemId], title: [item.title],
                        sellingStatus: [{ currentPrice: [{ '__value__': item.price.value, '@currencyId': item.price.currency }] }],
                        galleryURL: [item.image?.imageUrl || ''], viewItemURL: [item.itemWebUrl], listedDate: 'Active'
                    }));
                    stats.browseApiKeyword.status = 'success';
                }
            } catch (e) { stats.browseApiKeyword.status = `error: ${e.message}`; }
        }

        // TIER 3: Finding API (Seller Filter)
        if (finalItems.length === 0 && EBAY_APP_ID) {
            try {
                stats.findingApiSeller.status = 'trying';
                const fParams = new URLSearchParams({
                    'OPERATION-NAME': 'findItemsAdvanced',
                    'SERVICE-VERSION': '1.13.0',
                    'SECURITY-APPNAME': EBAY_APP_ID,
                    'RESPONSE-DATA-FORMAT': 'JSON',
                    'itemFilter(0).name': 'Seller',
                    'itemFilter(0).value(0)': sellerId,
                    'keywords': '*', // Mandatory for some Finding API calls
                    'paginationInput.entriesPerPage': '10',
                    'paginationInput.pageNumber': page.toString(),
                    'sortOrder': 'StartTimeAscending'
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
                    stats.findingApiSeller.status = 'success';
                }
            } catch (e) { stats.findingApiSeller.status = `error: ${e.message}`; }
        }

        // TIER 4: Finding API (Keyword Rescue)
        if (finalItems.length === 0 && EBAY_APP_ID) {
            try {
                stats.findingApiKeyword.status = 'trying';
                const kParams = new URLSearchParams({ 'OPERATION-NAME': 'findItemsByKeywords', 'SERVICE-VERSION': '1.13.0', 'SECURITY-APPNAME': EBAY_APP_ID, 'RESPONSE-DATA-FORMAT': 'JSON', 'keywords': sellerId, 'paginationInput.entriesPerPage': '10', 'paginationInput.pageNumber': page.toString() });
                const res = await fetch(`https://svcs.ebay.com/services/search/FindingService/v1?${kParams}`, {
                    headers: { 'X-EBAY-SOA-OPERATION-NAME': 'findItemsByKeywords', 'X-EBAY-SOA-SECURITY-APPNAME': EBAY_APP_ID, 'X-EBAY-SOA-RESPONSE-DATA-FORMAT': 'JSON', 'X-EBAY-SOA-GLOBAL-ID': 'EBAY-US' }
                });
                const data = await res.json();
                const items = data.findItemsByKeywordsResponse?.[0]?.searchResult?.[0]?.item;
                if (items?.length > 0) {
                    finalItems = items.map((item: any) => ({
                        itemId: [item.itemId], title: [item.title],
                        sellingStatus: [{ currentPrice: [{ '__value__': item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || "0", '@currencyId': item.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] || "USD" }] }],
                        galleryURL: item.galleryURL || [''], viewItemURL: item.viewItemURL || [''], listedDate: 'Active'
                    }));
                    stats.findingApiKeyword.status = 'success';
                }
            } catch (e) { stats.findingApiKeyword.status = `error: ${e.message}`; }
        }

        if (finalItems.length > 0) {
            // Bulk Resolve dates for those marked 'Active'
            if (finalItems.some(i => i.listedDate === 'Active' || i.listedDate === 'Unknown')) {
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
                    } catch (e) { /* silent */ }
                    return item;
                }));
            }
            setCachedData(cacheKey, finalItems);
            return new Response(JSON.stringify(finalItems), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ error: `Exhausted all search methods for '${sellerId}'.`, diagnostics: stats }), { status: 404, headers: corsHeaders });

    } catch (error) {
        return new Response(JSON.stringify({ error: 'Internal server error', details: error.message, diagnostics: stats }), { status: 500, headers: corsHeaders });
    }
});
