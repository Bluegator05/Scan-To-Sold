// Supabase Edge Function: ebay-seller
// Hyper-Enrichment Version (v21): Multi-API Sniffing + UI Debug Summary

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getEbayToken } from '../_shared/ebay-auth.ts';
import { getCachedData, setCachedData } from '../_shared/cache.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

serve(async (req) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    const stats: any = {
        meta: { id: 'unknown', v: '21' },
        tier: 'none',
        enrich: { total: 0, shoppingHits: 0, browseHits: 0, skuHits: 0, fails: 0 }
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

        const cacheKey = `seller:v21:${rawSellerId}:p:${page}`;
        if (!force) {
            const cached = getCachedData(cacheKey);
            if (cached) return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        console.log(`[ebay-seller] V21 HYPER: ${rawSellerId} P${page} (Force: ${force})`);

        const EBAY_APP_ID = Deno.env.get('EBAY_APP_ID');
        const token = await getEbayToken();
        let finalItems: any[] = [];

        // TIER 1: FINDING API
        if (EBAY_APP_ID) {
            try {
                const fParams = new URLSearchParams({
                    'OPERATION-NAME': 'findItemsAdvanced', 'SERVICE-VERSION': '1.13.0', 'SECURITY-APPNAME': EBAY_APP_ID,
                    'RESPONSE-DATA-FORMAT': 'JSON', 'itemFilter(0).name': 'Seller', 'itemFilter(0).value(0)': rawSellerId,
                    'keywords': '*', 'paginationInput.entriesPerPage': '10', 'paginationInput.pageNumber': page.toString(),
                    'sortOrder': 'StartTimeAscending'
                });
                const res = await fetch(`https://svcs.ebay.com/services/search/FindingService/v1?${fParams}`, {
                    headers: { 'X-EBAY-SOA-GLOBAL-ID': 'EBAY-US', 'X-EBAY-SOA-OPERATION-NAME': 'findItemsAdvanced' }
                });
                const data = await res.json();
                const items = data.findItemsAdvancedResponse?.[0]?.searchResult?.[0]?.item;
                if (items?.length > 0) {
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

        // HYPER ENRICHMENT: Multiple Sniffs
        if (finalItems.length > 0) {
            stats.enrich.total = finalItems.length;
            finalItems = await Promise.all(finalItems.map(async (item) => {
                const hasDate = item.listedDate && item.listedDate.includes('-') && item.listedDate.includes('T');
                if (hasDate) return item;

                let cleanId = Array.isArray(item.itemId) ? item.itemId[0] : item.itemId;
                const legacyId = cleanId.includes('|') ? cleanId.split('|')[1] : cleanId;
                const browseId = cleanId.includes('|') ? cleanId : `v1|${cleanId}|0`;

                try {
                    // Sniff 1: Shopping API (Legacy Gold Standard)
                    if (EBAY_APP_ID) {
                        const sRes = await fetch(`https://open.api.ebay.com/shopping?callname=GetSingleItem&responseencoding=JSON&appid=${EBAY_APP_ID}&siteid=0&version=967&ItemID=${legacyId}&IncludeSelector=Details`);
                        if (sRes.ok) {
                            const data = await sRes.json();
                            const date = data.Item?.StartTime || data.Item?.ListingInfo?.StartTime;
                            if (date) { stats.enrich.shoppingHits++; return { ...item, listedDate: date }; }
                            // SKU Rescue
                            if (data.Item?.SellerCustomLabel) {
                                const match = data.Item.SellerCustomLabel.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
                                if (match) { stats.enrich.skuHits++; return { ...item, listedDate: new Date(match[1]).toISOString() }; }
                            }
                        }
                    }

                    // Sniff 2: Browse API Item Detail (Modern Backup)
                    const bRes = await fetch(`https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(browseId)}`, {
                        headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' }
                    });
                    if (bRes.ok) {
                        const data = await bRes.json();
                        const date = data.listingStartTime || data.startTimeUtc || data.creationDate;
                        if (date) { stats.enrich.browseHits++; return { ...item, listedDate: date }; }
                    }

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
