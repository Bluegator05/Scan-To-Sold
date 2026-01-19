// Supabase Edge Function: ebay-seller
// The Identity Pulse (v25): Finding Header Fix + Enhanced Enrichment Diagnostics

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getEbayToken } from '../_shared/ebay-auth.ts';
import { getCachedData, setCachedData } from '../_shared/cache.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

serve(async (req) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    const stats: any = {
        meta: { id: 'unknown', v: '24' },
        tier: 'none',
        enrich: { total: 0, shoppingHits: 0, browseHits: 0, skuHits: 0, fails: 0 },
        firstEnrichID: null,
        firstEnrichRaw: null,
        firstEnrichError: null
    };

    try {
        const url = new URL(req.url);
        const force = url.searchParams.get('force') === 'true';
        const rawSellerId = url.pathname.split('/').filter(Boolean).pop()?.trim() || 'unknown';
        const page = parseInt(url.searchParams.get('page') || '1');

        stats.meta.id = rawSellerId;

        if (!rawSellerId || rawSellerId === 'ebay-seller') {
            return new Response(JSON.stringify({ error: 'Valid Seller ID required' }), { status: 400, headers: corsHeaders });
        }

        const cacheKey = `seller:v25:${rawSellerId}:p:${page}`;
        if (!force) {
            const cached = getCachedData(cacheKey);
            if (cached) return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        console.log(`[ebay-seller] V25 TRACE: ${rawSellerId} P${page}`);

        const EBAY_APP_ID = Deno.env.get('EBAY_APP_ID');
        const token = await getEbayToken();
        let finalItems: any[] = [];

        // TIER 1: FINDING API (Restored Headers)
        if (EBAY_APP_ID) {
            const tryFinding = async (op: string, keywords: string | null) => {
                const params: any = {
                    'SERVICE-VERSION': '1.13.0', 'SECURITY-APPNAME': EBAY_APP_ID, 'RESPONSE-DATA-FORMAT': 'JSON',
                    'paginationInput.entriesPerPage': '10', 'paginationInput.pageNumber': page.toString(),
                    'sortOrder': 'StartTimeAscending', 'GLOBAL-ID': 'EBAY-US'
                };
                if (op === 'findItemsAdvanced') {
                    params['itemFilter(0).name'] = 'Seller';
                    params['itemFilter(0).value(0)'] = rawSellerId;
                    if (keywords) params['keywords'] = keywords;
                } else if (op === 'findItemsIneBayStores') {
                    params['storeName'] = rawSellerId;
                }
                const fUrl = `https://svcs.ebay.com/services/search/FindingService/v1?OPERATION-NAME=${op}&${new URLSearchParams(params)}`;
                // RESTORE MANDATORY HEADERS
                const res = await fetch(fUrl, {
                    headers: {
                        'X-EBAY-SOA-SERVICE-NAME': 'FindingService',
                        'X-EBAY-SOA-OPERATION-NAME': op,
                        'X-EBAY-SOA-SECURITY-APPNAME': EBAY_APP_ID,
                        'X-EBAY-SOA-GLOBAL-ID': 'EBAY-US',
                        'X-EBAY-SOA-RESPONSE-DATA-FORMAT': 'JSON'
                    }
                });
                return await res.json();
            };

            try {
                let data = await tryFinding('findItemsAdvanced', null);
                let items = data.findItemsAdvancedResponse?.[0]?.searchResult?.[0]?.item;

                if (!items) {
                    data = await tryFinding('findItemsIneBayStores', null);
                    items = data.findItemsIneBayStoresResponse?.[0]?.searchResult?.[0]?.item;
                }

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
            } catch (e) {
                console.warn('Finding tier failure', e);
                stats.tierErr = e.message;
            }
        }

        // TIER 2: BROWSE API Fallback
        if (finalItems.length === 0) {
            try {
                const bRes = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?category_ids=0&filter=sellers:{${rawSellerId}}&limit=10&offset=${((page - 1) * 10)}&sort=newlyListed`, {
                    headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' }
                });
                const bData = await bRes.json();
                if (bData.itemSummaries?.length > 0) {
                    finalItems = bData.itemSummaries.map((item: any) => ({
                        itemId: [item.itemId], title: [item.title],
                        sellingStatus: [{ currentPrice: [{ '__value__': item.price.value, '@currencyId': item.price.currency }] }],
                        galleryURL: [item.image?.imageUrl || ''], viewItemURL: [item.itemWebUrl],
                        listedDate: 'Active', _source: 'browse'
                    }));
                    stats.tier = 'browse';
                } else {
                    stats.tierErr = bData.errors?.[0]?.message || 'No items found in browse';
                }
            } catch (e) { stats.tierErr = e.message; }
        }

        // HYPER ENRICHMENT: The Identity Pulse (v25)
        if (finalItems.length > 0) {
            stats.enrich.total = finalItems.length;
            finalItems = await Promise.all(finalItems.map(async (item, idx) => {
                const hasDate = item.listedDate && item.listedDate.includes('-') && item.listedDate.includes('T');
                if (hasDate) return item;

                const cleanId = Array.isArray(item.itemId) ? item.itemId[0] : item.itemId;
                const legacyId = cleanId.includes('|') ? cleanId.split('|')[1] : cleanId;
                const browseId = cleanId.includes('|') ? cleanId : `v1|${cleanId}|0`;

                if (idx === 0) stats.firstEnrichID = legacyId;

                try {
                    // Try Shopping API
                    if (EBAY_APP_ID) {
                        const sUrl = `https://open.api.ebay.com/shopping?callname=GetSingleItem&responseencoding=JSON&appid=${EBAY_APP_ID}&siteid=0&version=967&ItemID=${legacyId}&IncludeSelector=Details`;
                        const sRes = await fetch(sUrl);
                        const sData = await sRes.json();

                        if (idx === 0) stats.firstEnrichRaw = sData;

                        if (sRes.ok && sData.Item) {
                            const date = sData.Item.StartTime || sData.Item.ListingInfo?.StartTime;
                            if (date) { stats.enrich.shoppingHits++; return { ...item, listedDate: date }; }
                            if (sData.Item.SellerCustomLabel) {
                                const match = sData.Item.SellerCustomLabel.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
                                if (match) { stats.enrich.skuHits++; return { ...item, listedDate: new Date(match[1]).toISOString() }; }
                            }
                        } else if (idx === 0) {
                            stats.firstEnrichError = `ShopErr ${sRes.status}: ${sData.Errors?.[0]?.ShortMessage || 'Fail'}`;
                        }
                    }

                    // Try Browse API
                    const bRes = await fetch(`https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(browseId)}`, {
                        headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' }
                    });
                    const bData = await bRes.json();
                    if (bRes.ok) {
                        const date = bData.listingStartTime || bData.startTimeUtc || bData.creationDate;
                        if (date) { stats.enrich.browseHits++; return { ...item, listedDate: date }; }
                    } else if (idx === 0 && !stats.firstEnrichError) {
                        stats.firstEnrichError = `BrowseErr ${bRes.status}: ${bData.errors?.[0]?.message || 'Fail'}`;
                    }
                } catch (e) { if (idx === 0) stats.firstEnrichError = e.message; }

                stats.enrich.fails++;
                return item;
            }));
        }

        stats.summary = `Tier: ${stats.tier} | Enrich: ${stats.enrich.shoppingHits}S, ${stats.enrich.browseHits}B, ${stats.enrich.skuHits}SKU | Fails: ${stats.enrich.fails}`;
        if (stats.firstEnrichError) stats.summary += ` | Err: ${stats.firstEnrichError.slice(0, 40)}`;
        if (stats.tierErr && stats.tier === 'none') stats.summary += ` | TierErr: ${stats.tierErr.slice(0, 30)}`;

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
