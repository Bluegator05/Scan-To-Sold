// Supabase Edge Function: ebay-seller
// Bulletproof ID Resolution Version (v18): Resolving dates with verified IDs

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getEbayToken } from '../_shared/ebay-auth.ts';
import { getCachedData, setCachedData } from '../_shared/cache.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

serve(async (req) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    const stats: any = {
        meta: { id: 'unknown', v: '18' },
        tier: 'none',
        enrichment: { attempts: 0, successes: 0, errors: [] }
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

        const cacheKey = `seller:v18:${rawSellerId}:p:${page}`;
        const cached = getCachedData(cacheKey);
        if (cached) return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        console.log(`[ebay-seller] V18 BULLETPROOF: ${rawSellerId} P${page}`);

        const EBAY_APP_ID = Deno.env.get('EBAY_APP_ID');
        const token = await getEbayToken();
        let finalItems: any[] = [];
        let rawDebugPulse: any = null;

        // TIER 1: FINDING API (Legacy) - Returns numeric IDs + startTime
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
                        itemId: [String(item.itemId[0])], title: [item.title[0]],
                        sellingStatus: [{ currentPrice: [{ '__value__': item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || "0", '@currencyId': item.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] || "USD" }] }],
                        galleryURL: item.galleryURL || [''], viewItemURL: item.viewItemURL || [''],
                        listedDate: item.listingInfo?.[0]?.startTime?.[0] || 'Active',
                        _source: 'finding'
                    }));
                    stats.tier = 'finding';
                }
            } catch (e) { console.warn('Finding fail:', e); }
        }

        // TIER 2: BROWSE API (RESTful) - Returns v1|... IDs, NO startTime
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

        // ENRICHMENT: Deep pulsate for dates
        if (finalItems.length > 0) {
            finalItems = await Promise.all(finalItems.map(async (item, idx) => {
                // Only enrich if date is generic or missing ISO pattern
                const isGeneric = item.listedDate === 'Active' || item.listedDate === 'Unknown';
                const isIso = item.listedDate.includes('-') && item.listedDate.includes(':');
                if (!isGeneric && isIso) return item;

                stats.enrichment.attempts++;
                const rawId = Array.isArray(item.itemId) ? item.itemId[0] : item.itemId;
                // For Finding IDs (purely numeric), Browse API needs v1| prefix
                const browseId = (!rawId.includes('|')) ? `v1|${rawId}|0` : rawId;

                try {
                    const dRes = await fetch(`https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(browseId)}`, {
                        headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' }
                    });

                    if (dRes.ok) {
                        const f = await dRes.json();
                        if (idx === 0) rawDebugPulse = f;

                        const date = f.listingStartTime || f.startTimeUtc || f.startTime || f.creationDate || null;

                        // SKU Backup
                        let skuDate = null;
                        if (!date && f.sellerCustomLabel) {
                            const match = f.sellerCustomLabel.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
                            if (match) skuDate = new Date(match[1]).toISOString();
                        }

                        if (date || skuDate) {
                            stats.enrichment.successes++;
                            return { ...item, listedDate: date || skuDate };
                        }
                    } else {
                        const err = await dRes.text();
                        stats.enrichment.errors.push(`ID ${browseId}: HTTP ${dRes.status} - ${err.slice(0, 50)}`);
                    }
                } catch (e) {
                    stats.enrichment.errors.push(`ID ${browseId}: ${e.message}`);
                }
                return item;
            }));
        }

        if (finalItems.length > 0) {
            const responseData = { items: finalItems, _debug: stats, _debugRaw: rawDebugPulse };
            setCachedData(cacheKey, responseData);
            return new Response(JSON.stringify(responseData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ error: `Not found: ${rawSellerId}`, stats }), { status: 404, headers: corsHeaders });

    } catch (e) {
        return new Response(JSON.stringify({ error: e.message, stats }), { status: 500, headers: corsHeaders });
    }
});
