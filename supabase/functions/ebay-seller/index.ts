// Supabase Edge Function: ebay-seller
// Hybrid Search Version (v13): Category-Locked Search to satisfy new eBay requirements

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getEbayToken } from '../_shared/ebay-auth.ts';
import { getCachedData, setCachedData } from '../_shared/cache.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

serve(async (req) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    const stats: any = {
        meta: { rawId: 'unknown', v: '13' },
        browseTier1: { status: 'skipped', info: '' },
        browseTier2: { status: 'skipped', info: '' },
        findingTier1: { status: 'skipped', info: '' },
        findingTier2: { status: 'skipped', info: '' }
    };

    try {
        const url = new URL(req.url);
        const pathParts = url.pathname.split('/').filter(Boolean);
        const rawSellerId = pathParts[pathParts.length - 1]?.trim();
        const page = parseInt(url.searchParams.get('page') || '1');

        stats.meta.rawId = rawSellerId;

        if (!rawSellerId || rawSellerId === 'ebay-seller') {
            return new Response(JSON.stringify({ error: 'Valid Seller ID required' }), { status: 400, headers: corsHeaders });
        }

        const cacheKey = `seller:v13:${rawSellerId}:p:${page}`;
        const cached = getCachedData(cacheKey);
        if (cached) return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        console.log(`[ebay-seller] V13 HYBRID SEARCH: ${rawSellerId} P${page}`);

        const EBAY_APP_ID = Deno.env.get('EBAY_APP_ID');
        const token = await getEbayToken();
        let finalItems: any[] = [];

        // TIER 1: Browse API with Category Lock (The "Magic" parameter for sellers)
        // Using category_ids=0 instead of q=* prevents the "Too Large" error
        const tryBrowse = async (sellerId: string, tier: string) => {
            try {
                stats[tier].status = 'trying';
                const bParams = new URLSearchParams({
                    category_ids: '0',
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
                    stats[tier].status = 'success';
                    return data.itemSummaries.map((item: any) => ({
                        itemId: [item.itemId], title: [item.title],
                        sellingStatus: [{ currentPrice: [{ '__value__': item.price.value, '@currencyId': item.price.currency }] }],
                        galleryURL: [item.image?.imageUrl || ''], viewItemURL: [item.itemWebUrl], listedDate: 'Active'
                    }));
                } else { stats[tier].status = 'fail'; stats[tier].info = data.errors?.[0]?.message || 'No items found'; }
            } catch (e) { stats[tier].status = 'error'; stats[tier].info = e.message; }
            return null;
        };

        // Try both raw and lowercase for Browse API
        finalItems = await tryBrowse(rawSellerId, 'browseTier1') || await tryBrowse(rawSellerId.toLowerCase(), 'browseTier2') || [];

        // TIER 2: Finding API with Global Region Headers (Finding Fallback)
        if (finalItems.length === 0 && EBAY_APP_ID) {
            const tryFinding = async (sellerId: string, tier: string) => {
                try {
                    stats[tier].status = 'trying';
                    const fParams = new URLSearchParams({
                        'OPERATION-NAME': 'findItemsAdvanced',
                        'SERVICE-VERSION': '1.13.0',
                        'SECURITY-APPNAME': EBAY_APP_ID,
                        'RESPONSE-DATA-FORMAT': 'JSON',
                        'itemFilter(0).name': 'Seller',
                        'itemFilter(0).value(0)': sellerId,
                        'keywords': sellerId, // Using seller ID as keyword is safer than *
                        'paginationInput.entriesPerPage': '10'
                    });
                    const res = await fetch(`https://svcs.ebay.com/services/search/FindingService/v1?${fParams}`, {
                        headers: {
                            'X-EBAY-SOA-OPERATION-NAME': 'findItemsAdvanced',
                            'X-EBAY-SOA-SECURITY-APPNAME': EBAY_APP_ID,
                            'X-EBAY-SOA-RESPONSE-DATA-FORMAT': 'JSON',
                            'X-EBAY-SOA-GLOBAL-ID': 'EBAY-US'
                        }
                    });
                    const data = await res.json();
                    const items = data.findItemsAdvancedResponse?.[0]?.searchResult?.[0]?.item;
                    if (items?.length > 0) {
                        stats[tier].status = 'success';
                        return items.map((item: any) => ({
                            itemId: [item.itemId], title: [item.title],
                            sellingStatus: [{ currentPrice: [{ '__value__': item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || "0", '@currencyId': item.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] || "USD" }] }],
                            galleryURL: item.galleryURL || [''], viewItemURL: item.viewItemURL || [''], listedDate: item.listingInfo?.[0]?.startTime?.[0] || 'Unknown'
                        }));
                    } else { stats[tier].status = 'fail'; stats[tier].info = 'Empty result'; }
                } catch (e) { stats[tier].status = 'error'; stats[tier].info = e.message; }
                return null;
            };
            finalItems = await tryFinding(rawSellerId, 'findingTier1') || await tryFinding(rawSellerId.toLowerCase(), 'findingTier2') || [];
        }

        if (finalItems.length > 0) {
            // Background Enrichment
            const finalToken = token;
            finalItems = await Promise.all(finalItems.map(async (item) => {
                if (item.listedDate !== 'Active' && item.listedDate !== 'Unknown') return item;
                try {
                    const dRes = await fetch(`https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(item.itemId[0])}`, {
                        headers: { 'Authorization': `Bearer ${finalToken}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' }
                    });
                    if (dRes.ok) {
                        const f = await dRes.json();
                        return { ...item, listedDate: f.listingStartTime || f.startTime || item.listedDate };
                    }
                } catch (e) { }
                return item;
            }));
            setCachedData(cacheKey, finalItems);
            return new Response(JSON.stringify(finalItems), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const report = `FAILED: ${rawSellerId}\n- BrowseT1: ${stats.browseTier1.status} (${stats.browseTier1.info})\n- FindingT1: ${stats.findingTier1.status} (${stats.findingTier1.info})`;
        return new Response(JSON.stringify({ error: report }), { status: 404, headers: corsHeaders });

    } catch (error) {
        return new Response(JSON.stringify({ error: `CRITICAL: ${error.message}` }), { status: 500, headers: corsHeaders });
    }
});
