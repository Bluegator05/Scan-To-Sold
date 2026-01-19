// The Identity Pulse (v28): Contextual Location Fix + Finding API Trace

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getEbayToken } from '../_shared/ebay-auth.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { getCachedData, setCachedData } from '../_shared/cache.ts';

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const url = new URL(req.url);
        const pathParts = url.pathname.split('/');
        const sellerId = pathParts[pathParts.length - 1];
        const page = parseInt(url.searchParams.get('page') || '1');
        const force = url.searchParams.get('force') === 'true';

        if (!sellerId || sellerId === 'ebay-seller') {
            return new Response(JSON.stringify({ error: 'Valid Seller ID required' }), { status: 400, headers: corsHeaders });
        }

        const rawSellerId = decodeURIComponent(sellerId).trim();
        const cacheKey = `seller:v28:${rawSellerId}:p:${page}`;
        if (!force) {
            const cached = getCachedData(cacheKey);
            if (cached) return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        console.log(`[ebay-seller] V28 TRACE: ${rawSellerId} P${page}`);

        const stats = {
            tier: 'none', tierErr: '',
            enrich: { total: 0, shoppingHits: 0, browseHits: 0, skuHits: 0, fails: 0 },
            summary: '', firstEnrichID: '', firstEnrichError: '', firstEnrichRaw: null, secondEnrichRaw: null
        };

        const EBAY_APP_ID = Deno.env.get('EBAY_APP_ID');
        const token = await getEbayToken();
        let finalItems: any[] = [];

        // Contextual Header to prevent "Problem calculating shipping cost" errors
        const browseHeaders = {
            'Authorization': `Bearer ${token}`,
            'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
            'X-EBAY-C-ENDUSERCTX': 'affiliateCampaignId=5338268676,affiliateReferenceId=sts,contextualLocation=country%3DUS%2Czip%3D90210'
        };

        // TIER 1: FINDING API (Full Trace)
        if (EBAY_APP_ID) {
            const tryFinding = async (op: string) => {
                const params: any = {
                    'SERVICE-VERSION': '1.13.0', 'SECURITY-APPNAME': EBAY_APP_ID, 'RESPONSE-DATA-FORMAT': 'JSON',
                    'paginationInput.entriesPerPage': '10', 'paginationInput.pageNumber': page.toString(),
                    'GLOBAL-ID': 'EBAY-US'
                };
                if (op === 'findItemsAdvanced') {
                    params['itemFilter(0).name'] = 'Seller';
                    params['itemFilter(0).value(0)'] = rawSellerId;
                } else if (op === 'findItemsIneBayStores') {
                    params['storeName'] = rawSellerId;
                }
                const fUrl = `https://svcs.ebay.com/services/search/FindingService/v1?OPERATION-NAME=${op}&${new URLSearchParams(params)}`;
                const res = await fetch(fUrl, {
                    headers: { 'X-EBAY-SOA-SERVICE-NAME': 'FindingService', 'X-EBAY-SOA-OPERATION-NAME': op, 'X-EBAY-SOA-SECURITY-APPNAME': EBAY_APP_ID, 'X-EBAY-SOA-GLOBAL-ID': 'EBAY-US', 'X-EBAY-SOA-RESPONSE-DATA-FORMAT': 'JSON' }
                });
                const text = await res.text();
                try { return JSON.parse(text); } catch (e) { return { _raw: text.slice(0, 50) }; }
            };

            try {
                let data = await tryFinding('findItemsAdvanced');
                let resp = data.findItemsAdvancedResponse?.[0];
                let items = resp?.searchResult?.[0]?.item;

                if (!items) {
                    const err = resp?.errorMessage?.[0]?.error?.[0]?.message?.[0] || data._raw || resp?.ack?.[0];
                    stats.tierErr = `Adv:${err}`;

                    data = await tryFinding('findItemsIneBayStores');
                    resp = data.findItemsIneBayStoresResponse?.[0];
                    items = resp?.searchResult?.[0]?.item;
                    if (!items && !stats.tierErr.includes('Success')) {
                        const err2 = resp?.errorMessage?.[0]?.error?.[0]?.message?.[0] || resp?.ack?.[0];
                        stats.tierErr += `|St:${err2}`;
                    }
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
            } catch (e) { stats.tierErr = `FE:${e.message}`; }
        }

        // TIER 2: BROWSE API Fallback
        if (finalItems.length === 0) {
            try {
                const bRes = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?category_ids=0&filter=sellers:{${rawSellerId}}&limit=10&offset=${((page - 1) * 10)}&sort=newlyListed`, {
                    headers: browseHeaders
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
                    stats.tierErr = `${stats.tierErr}|Br:${bData.errors?.[0]?.message || 'Empty'}`;
                }
            } catch (e) { stats.tierErr = `${stats.tierErr}|BE:${e.message}`; }
        }

        // HYPER ENRICHMENT: The Geolocated Pulse (v28)
        if (finalItems.length > 0) {
            stats.enrich.total = finalItems.length;
            finalItems = await Promise.all(finalItems.map(async (item, idx) => {
                const hasDate = item.listedDate && item.listedDate.includes('-') && item.listedDate.includes('T');
                if (hasDate) return item;

                const cleanId = Array.isArray(item.itemId) ? item.itemId[0] : item.itemId;
                const legacyId = cleanId.includes('|') ? cleanId.split('|')[1] : cleanId;
                const browseId = cleanId.includes('|') ? cleanId : `v1|${cleanId}|0`;

                try {
                    // Try Shopping API
                    if (EBAY_APP_ID) {
                        const sUrl = `https://open.api.ebay.com/shopping?callname=GetSingleItem&responseencoding=JSON&appid=${EBAY_APP_ID}&siteid=0&version=1119&ItemID=${legacyId}&IncludeSelector=Details`;
                        const sRes = await fetch(sUrl);
                        const sData = await sRes.json();
                        if (idx === 0) stats.firstEnrichRaw = sData;
                        if (sRes.ok && sData.Item) {
                            const date = sData.Item.StartTime || sData.Item.ListingInfo?.StartTime;
                            if (date) { stats.enrich.shoppingHits++; return { ...item, listedDate: date }; }
                        } else if (idx === 0) {
                            stats.firstEnrichError = `S:${sRes.status}/${sData.Errors?.[0]?.ShortMessage || 'No'}`;
                        }
                    }

                    // Try Browse API with Geolocation Fix
                    const bRes = await fetch(`https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(browseId)}`, {
                        headers: browseHeaders
                    });
                    const bData = await bRes.json();
                    if (idx === 0) stats.secondEnrichRaw = bData;
                    if (bRes.ok) {
                        const date = bData.listingStartTime || bData.startTimeUtc || bData.creationDate;
                        if (date) { stats.enrich.browseHits++; return { ...item, listedDate: date }; }
                        else if (idx === 0) stats.firstEnrichError = `B:NoDate/${(bData.warnings?.[0]?.message || 'NoWarn').slice(0, 30)}`;
                    } else if (idx === 0 && !stats.firstEnrichError) {
                        stats.firstEnrichError = `B:${bRes.status}/${bData.errors?.[0]?.message || 'Err'}`;
                    }
                } catch (e) { if (idx === 0) stats.firstEnrichError = `Ex:${e.message}`; }
                stats.enrich.fails++;
                return item;
            }));
        }

        stats.summary = `[V28] Tier:${stats.tier} | Enr:${stats.enrich.shoppingHits}S,${stats.enrich.browseHits}B | Fails:${stats.enrich.fails} | ERR:${stats.firstEnrichError || 'None'}`;
        if (stats.tierErr && stats.tier !== 'finding') stats.summary += ` | TErr:${stats.tierErr.slice(0, 60)}`;

        if (finalItems.length > 0) {
            const responseData = { items: finalItems, _debug: stats };
            setCachedData(cacheKey, responseData);
            return new Response(JSON.stringify(responseData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ error: 'No items found', _debug: stats }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
    }
});
