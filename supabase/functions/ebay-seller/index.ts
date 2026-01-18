// Supabase Edge Function: ebay-seller
// Date Rescue Version (v17): Aggressive extraction + SKU Fallback + Raw Pulse

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getEbayToken } from '../_shared/ebay-auth.ts';
import { getCachedData, setCachedData } from '../_shared/cache.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

serve(async (req) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    const stats: any = {
        meta: { id: 'unknown', v: '17' },
        detection: { finding: false, browse: false, enrichment: 0 },
        rescue: { skuDateFound: 0 }
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

        const cacheKey = `seller:v17:${rawSellerId}:p:${page}`;
        const cached = getCachedData(cacheKey);
        if (cached) return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        console.log(`[ebay-seller] V17 DATE RESCUE: ${rawSellerId} P${page}`);

        const EBAY_APP_ID = Deno.env.get('EBAY_APP_ID');
        const token = await getEbayToken();
        let finalItems: any[] = [];
        let rawDebugPulse: any = null;

        // TIER 1: FINDING API (Native Date Support)
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
                    headers: { 'X-EBAY-SOA-GLOBAL-ID': 'EBAY-US', 'X-EBAY-SOA-OPERATION-NAME': 'findItemsAdvanced' }
                });
                const data = await res.json();
                const items = data.findItemsAdvancedResponse?.[0]?.searchResult?.[0]?.item;
                if (items?.length > 0) {
                    finalItems = items.map((item: any) => ({
                        itemId: [item.itemId[0]], title: [item.title[0]],
                        sellingStatus: [{ currentPrice: [{ '__value__': item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || "0", '@currencyId': item.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] || "USD" }] }],
                        galleryURL: item.galleryURL || [''], viewItemURL: item.viewItemURL || [''],
                        listedDate: item.listingInfo?.[0]?.startTime?.[0] || 'Active',
                        _source: 'finding'
                    }));
                    stats.detection.finding = true;
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
                    stats.detection.browse = true;
                }
            } catch (e) { console.warn('Browse fail:', e); }
        }

        // ENRICHMENT: Aggressive scanning for missing dates
        if (finalItems.length > 0) {
            finalItems = await Promise.all(finalItems.map(async (item, idx) => {
                const needsDate = item.listedDate === 'Active' || item.listedDate === 'Unknown' || !item.listedDate.includes('-');
                if (!needsDate) return item;

                try {
                    const dRes = await fetch(`https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(item.itemId[0])}`, {
                        headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' }
                    });

                    if (dRes.ok) {
                        const f = await dRes.json();
                        if (idx === 0) rawDebugPulse = f; // Capture raw pulse for first item

                        // 1. Extreme Field Pulse (Check ALL fields seen in eBay API versions)
                        const d = f.listingStartTime || f.startTimeUtc || f.startTime || f.creationDate ||
                            f.listingInfo?.startTime || f.listingInfo?.startTimeUtc ||
                            f.metadata?.listingStartTime || null;

                        // 2. Rescue: SKU Pattern Match (Many sellers put date in SKU/Custom Label)
                        let skuDate = null;
                        if (!d && f.sellerCustomLabel) {
                            const datePattern = /(\d{1,2}\/\d{1,2}\/\d{2,4})/; // MM/DD/YY or MM/DD/YYYY
                            const match = f.sellerCustomLabel.match(datePattern);
                            if (match) {
                                skuDate = new Date(match[1]).toISOString();
                                stats.rescue.skuDateFound++;
                            }
                        }

                        stats.detection.enrichment++;
                        return { ...item, listedDate: d || skuDate || item.listedDate };
                    }
                } catch (e) { console.error('Enrichment error:', e); }
                return item;
            }));
        }

        if (finalItems.length > 0) {
            const responseData = { items: finalItems, _debug: stats, _debugRaw: rawDebugPulse };
            setCachedData(cacheKey, responseData);
            return new Response(JSON.stringify(responseData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ error: `Seller ${rawSellerId} not found.`, stats }), { status: 404, headers: corsHeaders });

    } catch (e) {
        return new Response(JSON.stringify({ error: e.message, stats }), { status: 500, headers: corsHeaders });
    }
});
