// Supabase Edge Function: ebay-seller
// Super Enrichment Version (v14): Aggressive date extraction + Detailed Logging

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getEbayToken } from '../_shared/ebay-auth.ts';
import { getCachedData, setCachedData } from '../_shared/cache.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

serve(async (req) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    const stats: any = {
        meta: { id: 'unknown', v: '14' },
        res: { count: 0, from: 'none' }
    };

    try {
        const url = new URL(req.url);
        const pathParts = url.pathname.split('/').filter(Boolean);
        const sellerId = pathParts[pathParts.length - 1]?.trim();
        const page = parseInt(url.searchParams.get('page') || '1');

        stats.meta.id = sellerId;

        if (!sellerId || sellerId === 'ebay-seller') {
            return new Response(JSON.stringify({ error: 'Valid Seller ID required' }), { status: 400, headers: corsHeaders });
        }

        const cacheKey = `seller:v14:${sellerId}:p:${page}`;
        const cached = getCachedData(cacheKey);
        if (cached) return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        console.log(`[ebay-seller] V14 MEGA-SCAN: ${sellerId} P${page}`);

        const EBAY_APP_ID = Deno.env.get('EBAY_APP_ID');
        const token = await getEbayToken();
        let finalItems: any[] = [];

        // 1. TRY BROWSE API (Standard RESTful search)
        try {
            const bParams = new URLSearchParams({ category_ids: '0', filter: `sellers:{${sellerId}}`, limit: '10', offset: ((page - 1) * 10).toString(), sort: 'newlyListed' });
            const bRes = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${bParams}`, {
                headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' }
            });
            const bData = await bRes.json();
            if (bData.itemSummaries?.length > 0) {
                finalItems = bData.itemSummaries.map((item: any) => ({
                    itemId: [item.itemId], title: [item.title],
                    sellingStatus: [{ currentPrice: [{ '__value__': item.price.value, '@currencyId': item.price.currency }] }],
                    galleryURL: [item.image?.imageUrl || ''], viewItemURL: [item.itemWebUrl],
                    listedDate: 'Active' // Will be enriched
                }));
                stats.res.from = 'browse';
            }
        } catch (e) { console.warn('Browse failed:', e); }

        // 2. TRY FINDING API (Legacy fallback)
        if (finalItems.length === 0 && EBAY_APP_ID) {
            try {
                const fParams = new URLSearchParams({
                    'OPERATION-NAME': 'findItemsAdvanced', 'SERVICE-VERSION': '1.13.0', 'SECURITY-APPNAME': EBAY_APP_ID, 'RESPONSE-DATA-FORMAT': 'JSON',
                    'itemFilter(0).name': 'Seller', 'itemFilter(0).value(0)': sellerId, 'keywords': '*', 'paginationInput.entriesPerPage': '10'
                });
                const fRes = await fetch(`https://svcs.ebay.com/services/search/FindingService/v1?${fParams}`, {
                    headers: { 'X-EBAY-SOA-OPERATION-NAME': 'findItemsAdvanced', 'X-EBAY-SOA-SECURITY-APPNAME': EBAY_APP_ID, 'X-EBAY-SOA-RESPONSE-DATA-FORMAT': 'JSON', 'X-EBAY-SOA-GLOBAL-ID': 'EBAY-US' }
                });
                const fData = await fRes.json();
                const fItems = fData.findItemsAdvancedResponse?.[0]?.searchResult?.[0]?.item;
                if (fItems?.length > 0) {
                    finalItems = fItems.map((item: any) => ({
                        itemId: [item.itemId], title: [item.title],
                        sellingStatus: [{ currentPrice: [{ '__value__': item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || "0", '@currencyId': item.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] || "USD" }] }],
                        galleryURL: item.galleryURL || [''], viewItemURL: item.viewItemURL || [''],
                        listedDate: item.listingInfo?.[0]?.startTime?.[0] || 'Active'
                    }));
                    stats.res.from = 'finding';
                }
            } catch (e) { console.warn('Finding failed:', e); }
        }

        // 3. SUPER ENRICHMENT PHASE
        if (finalItems.length > 0) {
            console.log(`[ebay-seller] Enriching ${finalItems.length} items for ${sellerId}...`);
            finalItems = await Promise.all(finalItems.map(async (item) => {
                const rawId = item.itemId[0];
                try {
                    const dRes = await fetch(`https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(rawId)}`, {
                        headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' }
                    });

                    if (dRes.ok) {
                        const f = await dRes.json();
                        // Aggressive check for ANY date field
                        const foundDate = f.listingStartTime || f.startTimeUtc || f.startTime || f.creationDate || f.listingInfo?.startTime;
                        console.log(`[ebay-seller] Item ${rawId} enriched: ${foundDate || 'NOT FOUND'}`);
                        return { ...item, listedDate: foundDate || item.listedDate };
                    } else {
                        console.warn(`[ebay-seller] Enrichment fail for ${rawId}: HTTP ${dRes.status}`);
                    }
                } catch (e) {
                    console.error(`[ebay-seller] Enrichment error for ${rawId}:`, e);
                }
                return item;
            }));

            stats.res.count = finalItems.length;
            setCachedData(cacheKey, finalItems);
            return new Response(JSON.stringify(finalItems), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ error: `Could not find listings for ${sellerId}`, stats }), { status: 404, headers: corsHeaders });

    } catch (error) {
        return new Response(JSON.stringify({ error: `CRITICAL: ${error.message}` }), { status: 500, headers: corsHeaders });
    }
});
