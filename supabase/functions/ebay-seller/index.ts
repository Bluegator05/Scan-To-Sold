// Supabase Edge Function: ebay-seller
// Direct Date Retrieval Version (v15): Prioritizing Finding API for immediate dates

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getEbayToken } from '../_shared/ebay-auth.ts';
import { getCachedData, setCachedData } from '../_shared/cache.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

serve(async (req) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    const stats: any = {
        meta: { id: 'unknown', v: '15' },
        findingTier: { status: 'skipped', info: '' },
        browseTier: { status: 'skipped', info: '' }
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

        const cacheKey = `seller:v15:${rawSellerId}:p:${page}`;
        const cached = getCachedData(cacheKey);
        if (cached) return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

        console.log(`[ebay-seller] V15 DIRECT DATE SEARCH: ${rawSellerId} P${page}`);

        const EBAY_APP_ID = Deno.env.get('EBAY_APP_ID');
        const token = await getEbayToken();
        let finalItems: any[] = [];

        // TIER 1: FINDING API (Best for Dates)
        if (EBAY_APP_ID) {
            const tryFinding = async (sellerId: string, tierKey: string) => {
                try {
                    console.log(`[ebay-seller] Trying Finding API for: ${sellerId}`);
                    const fParams = new URLSearchParams({
                        'OPERATION-NAME': 'findItemsAdvanced',
                        'SERVICE-VERSION': '1.13.0',
                        'SECURITY-APPNAME': EBAY_APP_ID,
                        'RESPONSE-DATA-FORMAT': 'JSON',
                        'itemFilter(0).name': 'Seller',
                        'itemFilter(0).value(0)': sellerId,
                        'keywords': '*', // satisfy mandatory keyword requirement
                        'paginationInput.entriesPerPage': '10',
                        'paginationInput.pageNumber': page.toString(),
                        'sortOrder': 'StartTimeAscending'
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
                        return items.map((item: any) => ({
                            itemId: [item.itemId[0]],
                            title: [item.title[0]],
                            sellingStatus: [{ currentPrice: [{ '__value__': item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || "0", '@currencyId': item.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] || "USD" }] }],
                            galleryURL: item.galleryURL || [''],
                            viewItemURL: item.viewItemURL || [''],
                            listedDate: item.listingInfo?.[0]?.startTime?.[0] || 'Unknown'
                        }));
                    }
                } catch (e) { console.warn(`Finding ${tierKey} failed:`, e); }
                return null;
            };

            finalItems = await tryFinding(rawSellerId, 'T1a') || await tryFinding(rawSellerId.toLowerCase(), 'T1b') || [];
            if (finalItems.length > 0) stats.findingTier.status = 'success';
        }

        // TIER 2: BROWSE API (Fallback)
        if (finalItems.length === 0) {
            const tryBrowse = async (sellerId: string, tierKey: string) => {
                try {
                    console.log(`[ebay-seller] Trying Browse API for: ${sellerId}`);
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
                        return data.itemSummaries.map((item: any) => ({
                            itemId: [item.itemId], title: [item.title],
                            sellingStatus: [{ currentPrice: [{ '__value__': item.price.value, '@currencyId': item.price.currency }] }],
                            galleryURL: [item.image?.imageUrl || ''], viewItemURL: [item.itemWebUrl], listedDate: 'Active'
                        }));
                    }
                } catch (e) { console.warn(`Browse ${tierKey} failed:`, e); }
                return null;
            };

            finalItems = await tryBrowse(rawSellerId, 'T2a') || await tryBrowse(rawSellerId.toLowerCase(), 'T2b') || [];
            if (finalItems.length > 0) stats.browseTier.status = 'success';
        }

        // ENRICHMENT: Only for Browse detections or missing Finding dates
        if (finalItems.length > 0 && finalItems.some(i => i.listedDate === 'Active' || i.listedDate === 'Unknown')) {
            console.log(`[ebay-seller] Deep Scanning for dates...`);
            finalItems = await Promise.all(finalItems.map(async (item) => {
                if (item.listedDate !== 'Active' && item.listedDate !== 'Unknown') return item;
                try {
                    const dRes = await fetch(`https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(item.itemId[0])}`, {
                        headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' }
                    });
                    if (dRes.ok) {
                        const f = await dRes.json();
                        return { ...item, listedDate: f.listingStartTime || f.startTimeUtc || f.startTime || item.listedDate };
                    }
                } catch (e) { }
                return item;
            }));
        }

        if (finalItems.length > 0) {
            setCachedData(cacheKey, finalItems);
            return new Response(JSON.stringify(finalItems), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ error: `Could not find listings for '${rawSellerId}'. Check spelling or store visibility.`, stats }), { status: 404, headers: corsHeaders });

    } catch (error) {
        return new Response(JSON.stringify({ error: `CRITICAL: ${error.message}` }), { status: 500, headers: corsHeaders });
    }
});
