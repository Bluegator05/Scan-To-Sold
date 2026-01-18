// Supabase Edge Function: ebay-seller
// ID Inspector Version (v22): Finding API Resilience + Raw Search Item Pulse

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getEbayToken } from '../_shared/ebay-auth.ts';
import { getCachedData, setCachedData } from '../_shared/cache.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

serve(async (req) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    const stats: any = {
        meta: { id: 'unknown', v: '22' },
        tier: 'none',
        enrich: { total: 0, shoppingHits: 0, browseHits: 0, skuHits: 0, fails: 0 },
        rawSearchItem: null
    };

    try {
        const url = new URL(req.url);
        const force = url.searchParams.get('force') === 'true';
        const pathParts = url.pathname.split('/').filter(Boolean);
        const rawSellerId = pathParts[pathParts.length - 1]?.trim();
        const page = parseInt(url.searchParams.get('page') || '1');

        stats.meta.id = rawSellerId;

        if (!rawSellerId || rawSellerId === 'ebay-seller') {
            return new Response(JSON.stringify({ error: 'Valid Seller ID required' }), { status: 400, headers: corsHeaders });
        }

        const cacheKey = `seller:v22:${rawSellerId}:p:${page}`;
        if (!force) {
            const cached = getCachedData(cacheKey);
            if (cached) return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        console.log(`[ebay-seller] V22 INSPECT: ${rawSellerId} P${page} (Force: ${force})`);

        const EBAY_APP_ID = Deno.env.get('EBAY_APP_ID');
        const token = await getEbayToken();
        let finalItems: any[] = [];
        let firstRawItem: any = null;

        // TIER 1: FINDING API (Resilient Try)
        if (EBAY_APP_ID) {
            const tryFinding = async (keywords: string | null) => {
                const params: any = {
                    'OPERATION-NAME': 'findItemsAdvanced', 'SERVICE-VERSION': '1.13.0', 'SECURITY-APPNAME': EBAY_APP_ID,
                    'RESPONSE-DATA-FORMAT': 'JSON', 'itemFilter(0).name': 'Seller', 'itemFilter(0).value(0)': rawSellerId,
                    'paginationInput.entriesPerPage': '10', 'paginationInput.pageNumber': page.toString(),
                    'sortOrder': 'StartTimeAscending'
                };
                if (keywords) params['keywords'] = keywords;
                const fUrl = `https://svcs.ebay.com/services/search/FindingService/v1?${new URLSearchParams(params)}`;
                const res = await fetch(fUrl, {
                    headers: { 'X-EBAY-SOA-GLOBAL-ID': 'EBAY-US', 'X-EBAY-SOA-OPERATION-NAME': 'findItemsAdvanced', 'X-EBAY-SOA-SECURITY-APPNAME': EBAY_APP_ID }
                });
                return await res.json();
            };

            try {
                // Try 1: No Keywords (Cleanest)
                let data = await tryFinding(null);
                let items = data.findItemsAdvancedResponse?.[0]?.searchResult?.[0]?.item;

                // Try 2: Wildcard (If Try 1 failed due to keyword requirement)
                if (!items) {
                    data = await tryFinding('*');
                    items = data.findItemsAdvancedResponse?.[0]?.searchResult?.[0]?.item;
                }

                if (items?.length > 0) {
                    firstRawItem = items[0];
                    finalItems = items.map((item: any) => ({
                        itemId: [String(item.itemId[0])], title: [item.title[0]],
                        sellingStatus: [{ currentPrice: [{ '__value__': item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || "0", '@currencyId': item.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] || "USD" }] }],
                        galleryURL: item.galleryURL || [''], viewItemURL: item.viewItemURL || [''],
                        listedDate: item.listingInfo?.[0]?.startTime?.[0] || 'Unknown',
                        _source: 'finding'
                    }));
                    stats.tier = 'finding';
                }
            } catch (e) { console.warn('Finding fail:', e); }
        }

        // TIER 2: BROWSE SEARCH
        if (finalItems.length === 0) {
            try {
                const bParams = new URLSearchParams({ category_ids: '0', filter: `sellers:{${rawSellerId}}`, limit: '10', offset: ((page - 1) * 10).toString(), sort: 'newlyListed' });
                const res = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${bParams}`, {
                    headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' }
                });
                const data = await res.json();
                if (data.itemSummaries?.length > 0) {
                    firstRawItem = data.itemSummaries[0];
                    finalItems = data.itemSummaries.map((item: any) => ({
                        itemId: [item.itemId], title: [item.title],
                        sellingStatus: [{ currentPrice: [{ '__value__': item.price.value, '@currencyId': item.price.currency }] }],
                        galleryURL: [item.image?.imageUrl || ''], viewItemURL: [item.itemWebUrl],
                        listedDate: 'Active',
                        _source: 'browse'
                    }));
                    stats.tier = 'browse';
                }
            } catch (e) { console.warn('Browse fail:', e); }
        }

        stats.rawSearchItem = firstRawItem;

        // HYPER ENRICHMENT
        if (finalItems.length > 0) {
            stats.enrich.total = finalItems.length;
            finalItems = await Promise.all(finalItems.map(async (item) => {
                const hasDate = item.listedDate && item.listedDate.includes('-') && item.listedDate.includes('T');
                if (hasDate) return item;

                let cleanId = Array.isArray(item.itemId) ? item.itemId[0] : item.itemId;
                const legacyId = cleanId.includes('|') ? cleanId.split('|')[1] : cleanId;
                const browseId = cleanId.includes('|') ? cleanId : `v1|${cleanId}|0`;

                try {
                    // Shopping
                    if (EBAY_APP_ID) {
                        const sRes = await fetch(`https://open.api.ebay.com/shopping?callname=GetSingleItem&responseencoding=JSON&appid=${EBAY_APP_ID}&siteid=0&version=967&ItemID=${legacyId}&IncludeSelector=Details`);
                        const data = await sRes.json();
                        const date = data.Item?.StartTime || data.Item?.ListingInfo?.StartTime;
                        if (date) { stats.enrich.shoppingHits++; return { ...item, listedDate: date }; }
                        if (data.Item?.SellerCustomLabel) {
                            const match = data.Item.SellerCustomLabel.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
                            if (match) { stats.enrich.skuHits++; return { ...item, listedDate: new Date(match[1]).toISOString() }; }
                        }
                    }

                    // Browse
                    const bRes = await fetch(`https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(browseId)}`, {
                        headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' }
                    });
                    const bData = await bRes.json();
                    const bDate = bData.listingStartTime || bData.startTimeUtc || bData.creationDate;
                    if (bDate) { stats.enrich.browseHits++; return { ...item, listedDate: bDate }; }

                    stats.enrich.fails++;
                } catch (e) { }
                return item;
            }));
        }

        stats.summary = `Tier: ${stats.tier} | Enrich: ${stats.enrich.shoppingHits}S, ${stats.enrich.browseHits}B, ${stats.enrich.skuHits}SKU | Fails: ${stats.enrich.fails}`;

        if (finalItems.length > 0) {
            const responseData = { items: finalItems, _debug: stats };
            setCachedData(cacheKey, responseData);
            return new Response(JSON.stringify(responseData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ error: `Not found: ${rawSellerId}`, stats }), { status: 404, headers: corsHeaders });

    } catch (e) {
        return new Response(JSON.stringify({ error: e.message, stats }), { status: 500, headers: corsHeaders });
    }
});
