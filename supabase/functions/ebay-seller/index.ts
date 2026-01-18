// Supabase Edge Function: ebay-seller
// Full Disclosure Version (v11): 6 Tiers + Detailed Diagnostic Report

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getEbayToken } from '../_shared/ebay-auth.ts';
import { getCachedData, setCachedData } from '../_shared/cache.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

serve(async (req) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    const stats: any = {
        meta: { sellerId: 'unknown', page: 1, v: '11' },
        serpApi: { status: 'skipped', info: '' },
        browseSeller: { status: 'skipped', info: '' },
        browseKeyword: { status: 'skipped', info: '' },
        storeSearch: { status: 'skipped', info: '' },
        findingSeller: { status: 'skipped', info: '' },
        findingKeyword: { status: 'skipped', info: '' }
    };

    try {
        const url = new URL(req.url);
        const pathParts = url.pathname.split('/').filter(Boolean);
        const sellerId = pathParts[pathParts.length - 1]?.trim().toLowerCase();
        const page = parseInt(url.searchParams.get('page') || '1');

        stats.meta.sellerId = sellerId;
        stats.meta.page = page;

        if (!sellerId || sellerId === 'ebay-seller') {
            return new Response(JSON.stringify({ error: 'Valid Seller ID required' }), { status: 400, headers: corsHeaders });
        }

        const cacheKey = `seller:v11:${sellerId}:p:${page}`;
        const cached = getCachedData(cacheKey);
        if (cached) return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        console.log(`[ebay-seller] V11 FULL DISCLOSURE: ${sellerId} P${page}`);

        const EBAY_APP_ID = Deno.env.get('EBAY_APP_ID');
        const SERPAPI_KEY = Deno.env.get('SERPAPI_KEY');
        let finalItems: any[] = [];

        // COMMON HEADERS
        const findHeaders = (op: string) => ({
            'X-EBAY-SOA-OPERATION-NAME': op,
            'X-EBAY-SOA-SECURITY-APPNAME': EBAY_APP_ID || '',
            'X-EBAY-SOA-RESPONSE-DATA-FORMAT': 'JSON',
            'X-EBAY-SOA-GLOBAL-ID': 'EBAY-US',
            'X-EBAY-SOA-SERVICE-VERSION': '1.13.0'
        });

        // TIER 0: SerpApi
        if (SERPAPI_KEY && SERPAPI_KEY !== 'YOUR_FREE_KEY_HERE') {
            try {
                stats.serpApi.status = 'trying';
                const sParams = new URLSearchParams({ engine: 'ebay', _ssn: sellerId, api_key: SERPAPI_KEY, _ipg: '10', _sop: '10', _pgn: page.toString() });
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
                } else { stats.serpApi.status = 'no_results'; stats.serpApi.info = data.error || 'Empty response'; }
            } catch (e) { stats.serpApi.status = 'error'; stats.serpApi.info = e.message; }
        }

        // TIER 1: Browse API Seller Filter
        if (finalItems.length === 0) {
            try {
                stats.browseSeller.status = 'trying';
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
                    stats.browseSeller.status = 'success';
                } else { stats.browseSeller.status = 'no_results'; stats.browseSeller.info = data.errors?.[0]?.message || 'Empty'; }
            } catch (e) { stats.browseSeller.status = 'error'; stats.browseSeller.info = e.message; }
        }

        // TIER 2: Store Search (Finding API)
        if (finalItems.length === 0 && EBAY_APP_ID) {
            try {
                stats.storeSearch.status = 'trying';
                const sParams = new URLSearchParams({ 'OPERATION-NAME': 'findItemsIneBayStores', 'storeName': sellerId, 'paginationInput.entriesPerPage': '10', 'paginationInput.pageNumber': page.toString() });
                const res = await fetch(`https://svcs.ebay.com/services/search/FindingService/v1?${sParams}`, { headers: findHeaders('findItemsIneBayStores') });
                const data = await res.json();
                const items = data.findItemsIneBayStoresResponse?.[0]?.searchResult?.[0]?.item;
                if (items?.length > 0) {
                    finalItems = items.map((item: any) => ({
                        itemId: [item.itemId], title: [item.title],
                        sellingStatus: [{ currentPrice: [{ '__value__': item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || "0", '@currencyId': item.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] || "USD" }] }],
                        galleryURL: item.galleryURL || [''], viewItemURL: item.viewItemURL || [''], listedDate: item.listingInfo?.[0]?.startTime?.[0] || 'Unknown'
                    }));
                    stats.storeSearch.status = 'success';
                } else { stats.storeSearch.status = 'no_results'; stats.storeSearch.info = data.findItemsIneBayStoresResponse?.[0]?.errorMessage?.[0]?.error?.[0]?.message?.[0] || 'Empty'; }
            } catch (e) { stats.storeSearch.status = 'error'; stats.storeSearch.info = e.message; }
        }

        // TIER 3: Finding API Seller Filter
        if (finalItems.length === 0 && EBAY_APP_ID) {
            try {
                stats.findingSeller.status = 'trying';
                const fParams = new URLSearchParams({ 'OPERATION-NAME': 'findItemsAdvanced', 'itemFilter(0).name': 'Seller', 'itemFilter(0).value(0)': sellerId, 'paginationInput.entriesPerPage': '10', 'paginationInput.pageNumber': page.toString() });
                const res = await fetch(`https://svcs.ebay.com/services/search/FindingService/v1?${fParams}`, { headers: findHeaders('findItemsAdvanced') });
                const data = await res.json();
                const items = data.findItemsAdvancedResponse?.[0]?.searchResult?.[0]?.item;
                if (items?.length > 0) {
                    finalItems = items.map((item: any) => ({
                        itemId: [item.itemId], title: [item.title],
                        sellingStatus: [{ currentPrice: [{ '__value__': item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || "0", '@currencyId': item.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] || "USD" }] }],
                        galleryURL: item.galleryURL || [''], viewItemURL: item.viewItemURL || [''], listedDate: item.listingInfo?.[0]?.startTime?.[0] || 'Unknown'
                    }));
                    stats.findingSeller.status = 'success';
                } else { stats.findingSeller.status = 'no_results'; stats.findingSeller.info = data.findItemsAdvancedResponse?.[0]?.errorMessage?.[0]?.error?.[0]?.message?.[0] || 'Empty'; }
            } catch (e) { stats.findingSeller.status = 'error'; stats.findingSeller.info = e.message; }
        }

        // TIER 4: Browse AI Keyword Rescue
        if (finalItems.length === 0) {
            try {
                stats.browseKeyword.status = 'trying';
                const token = await getEbayToken();
                const qParams = new URLSearchParams({ q: sellerId, limit: '10' });
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
                    stats.browseKeyword.status = 'success';
                } else { stats.browseKeyword.status = 'no_results'; }
            } catch (e) { stats.browseKeyword.status = 'error'; stats.browseKeyword.info = e.message; }
        }

        if (finalItems.length > 0) {
            // Background Enrichment
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

        // FINAL FAIL: Report Diagnostics in a way that looks like a readable report
        const report = `FAILED: ${sellerId}\n- SerpApi: ${stats.serpApi.status} (${stats.serpApi.info})\n- BrowseSeller: ${stats.browseSeller.status} (${stats.browseSeller.info})\n- StoreSearch: ${stats.storeSearch.status} (${stats.storeSearch.info})\n- FindingSeller: ${stats.findingSeller.status} (${stats.findingSeller.info})\n- BrowseKeyword: ${stats.browseKeyword.status}`;

        return new Response(JSON.stringify({
            error: report
        }), { status: 404, headers: corsHeaders });

    } catch (error) {
        return new Response(JSON.stringify({ error: `CRITICAL: ${error.message}` }), { status: 500, headers: corsHeaders });
    }
});
