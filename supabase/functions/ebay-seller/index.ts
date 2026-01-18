// Supabase Edge Function: ebay-seller
// Ultimate Diagnostic Version (v20): Raw Pulse Returns for Depth Inspection

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getEbayToken } from '../_shared/ebay-auth.ts';
import { getCachedData, setCachedData } from '../_shared/cache.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

serve(async (req) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    const stats: any = {
        meta: { id: 'unknown', v: '20' },
        tier: 'none',
        enrichment: { total: 0, hits: 0, fails: 0 }
    };

    try {
        const url = new URL(req.url);
        const pathParts = url.pathname.split('/').filter(Boolean);
        const rawSellerId = pathParts[pathParts.length - 1]?.trim();
        const page = parseInt(url.searchParams.get('page') || '1');

        stats.meta.id = rawSellerId;

        if (!rawSellerId || rawSellerId === 'ebay-seller') {
            return new Response(JSON.stringify({ error: 'Valid Seller ID required' }), { status: 400, headers: corsHeaders });
        }

        const cacheKey = `seller:v20:${rawSellerId}:p:${page}`;
        const cached = getCachedData(cacheKey);
        if (cached) return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        console.log(`[ebay-seller] V20 ULTIMATE DIAGNOSTIC: ${rawSellerId} P${page}`);

        const EBAY_APP_ID = Deno.env.get('EBAY_APP_ID');
        const token = await getEbayToken();
        let finalItems: any[] = [];
        let rawFindingPulse: any = null;
        let rawShoppingPulse: any = null;

        // TIER 1: FINDING API (Oldest First)
        if (EBAY_APP_ID) {
            try {
                const fParams = new URLSearchParams({
                    'OPERATION-NAME': 'findItemsAdvanced',
                    'SERVICE-VERSION': '1.13.0', 'SECURITY-APPNAME': EBAY_APP_ID, 'RESPONSE-DATA-FORMAT': 'JSON',
                    'itemFilter(0).name': 'Seller', 'itemFilter(0).value(0)': rawSellerId,
                    'keywords': '*', 'paginationInput.entriesPerPage': '10', 'paginationInput.pageNumber': page.toString(),
                    'sortOrder': 'StartTimeAscending'
                });
                const res = await fetch(`https://svcs.ebay.com/services/search/FindingService/v1?${fParams}`, {
                    headers: { 'X-EBAY-SOA-GLOBAL-ID': 'EBAY-US', 'X-EBAY-SOA-OPERATION-NAME': 'findItemsAdvanced', 'X-EBAY-SOA-SECURITY-APPNAME': EBAY_APP_ID }
                });
                const data = await res.json();
                const items = data.findItemsAdvancedResponse?.[0]?.searchResult?.[0]?.item;
                if (items?.length > 0) {
                    rawFindingPulse = items[0]; // Capture first raw item
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

        // TIER 2: BROWSE API (Fallback)
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

        // ULTIMATE ENRICHMENT: Shopping API GetSingleItem
        if (finalItems.length > 0 && EBAY_APP_ID) {
            stats.enrichment.total = finalItems.length;
            finalItems = await Promise.all(finalItems.map(async (item, idx) => {
                // If finding API ALREADY gave us a valid ISO date, return as-is
                const hasDate = item.listedDate && item.listedDate.includes('-') && item.listedDate.includes('T');
                if (hasDate) {
                    stats.enrichment.hits++;
                    return item;
                }

                let cleanId = Array.isArray(item.itemId) ? item.itemId[0] : item.itemId;
                if (cleanId.includes('|')) {
                    const parts = cleanId.split('|');
                    cleanId = parts[1] || parts[0];
                }

                try {
                    const sParams = new URLSearchParams({ callname: 'GetSingleItem', responseencoding: 'JSON', appid: EBAY_APP_ID, siteid: '0', version: '967', ItemID: cleanId, IncludeSelector: 'Details' });
                    const sRes = await fetch(`https://open.api.ebay.com/shopping?${sParams}`);
                    const sData = await sRes.json();

                    if (idx === 0) rawShoppingPulse = sData; // Critical diagnostic pulse

                    const date = sData.Item?.StartTime || sData.Item?.RegistrationDate || sData.Item?.ListingInfo?.StartTime;

                    if (date) {
                        stats.enrichment.hits++;
                        return { ...item, listedDate: date };
                    } else {
                        stats.enrichment.fails++;
                        // SKU Rescue as final fallback
                        if (sData.Item?.SellerCustomLabel) {
                            const match = sData.Item.SellerCustomLabel.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
                            if (match) return { ...item, listedDate: new Date(match[1]).toISOString() };
                        }
                    }
                } catch (e) {
                    stats.enrichment.fails++;
                }
                return item;
            }));
        }

        if (finalItems.length > 0) {
            const responseData = { items: finalItems, _debug: stats, _debugRawFinding: rawFindingPulse, _debugRawShopping: rawShoppingPulse };
            setCachedData(cacheKey, responseData);
            return new Response(JSON.stringify(responseData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ error: `Not found: ${rawSellerId}`, stats }), { status: 404, headers: corsHeaders });

    } catch (e) {
        return new Response(JSON.stringify({ error: e.message, stats }), { status: 500, headers: corsHeaders });
    }
});
