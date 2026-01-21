// The Identity Pulse (v31): SECURITY GUARD + Forensic Structural Logging

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getEbayToken } from '../_shared/ebay-auth.ts';
import { corsHeaders, verifyUser, checkUsage } from '../_shared/auth.ts';
import { getCachedData, setCachedData } from '../_shared/cache.ts';

serve(async (req) => {
    // 1. Handle CORS Preflight
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        // 2. STRICT SECURITY GUARD: Reject any call without a valid Supabase session
        const { user, supabase } = await verifyUser(req);

        // 3. DAILY THROTTLE: Limit to 50 fetches per day
        await checkUsage(supabase, user.id, 'ebay_seller_fetch', 50);

        console.log(`[ebay-seller] Secured call from User: ${user.id}`);

        const url = new URL(req.url);
        const pathParts = url.pathname.split('/');
        const sellerId = pathParts[pathParts.length - 1];
        const page = parseInt(url.searchParams.get('page') || '1');
        const force = url.searchParams.get('force') === 'true';

        if (!sellerId || sellerId === 'ebay-seller') {
            return new Response(JSON.stringify({ error: 'Valid Seller ID required' }), { status: 400, headers: corsHeaders });
        }

        const rawSellerId = decodeURIComponent(sellerId).trim();

        // 3. User-Specific Cache (Security + Performance)
        // We use the User ID in the cache key to prevent one user from seeing another user's cached data
        // even if they fetch the same seller.
        const cacheKey = `seller:v31:${user.id}:${rawSellerId}:p:${page}`;

        if (!force) {
            const cached = getCachedData(cacheKey);
            if (cached) return new Response(JSON.stringify(cached), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        console.log(`[ebay-seller] V31 TRACE: ${rawSellerId} P${page}`);

        const stats = {
            tier: 'none', tierErr: '',
            enrich: { total: 0, shoppingHits: 0, browseHits: 0, fails: 0 },
            summary: '', firstEnrichID: '', firstEnrichError: '', forensic: {} as any
        };

        const EBAY_APP_ID = Deno.env.get('EBAY_APP_ID');
        const token = await getEbayToken();
        let finalItems: any[] = [];

        const browseHeaders = {
            'Authorization': `Bearer ${token}`,
            'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
            'X-EBAY-C-ENDUSERCTX': 'affiliateCampaignId=5338268676,affiliateReferenceId=sts,contextualLocation=country%3DUS%2Czip%3D90210'
        };

        // TIER 1: FINDING API (Restored SOA Headers)
        if (EBAY_APP_ID) {
            const tryFinding = async (op: string) => {
                const params = new URLSearchParams({
                    'SERVICE-VERSION': '1.13.0', 'SECURITY-APPNAME': EBAY_APP_ID,
                    'RESPONSE-DATA-FORMAT': 'JSON', 'REST-PAYLOAD': 'true',
                    'paginationInput.entriesPerPage': '10', 'paginationInput.pageNumber': page.toString(),
                    'GLOBAL-ID': 'EBAY-US'
                });
                if (op === 'findItemsAdvanced') {
                    params.append('itemFilter(0).name', 'Seller');
                    params.append('itemFilter(0).value(0)', rawSellerId);
                } else {
                    params.append('storeName', rawSellerId);
                }
                const fUrl = `https://svcs.ebay.com/services/search/FindingService/v1?OPERATION-NAME=${op}&${params.toString()}`;
                const res = await fetch(fUrl, {
                    headers: {
                        'X-EBAY-SOA-SERVICE-NAME': 'FindingService',
                        'X-EBAY-SOA-OPERATION-NAME': op,
                        'X-EBAY-SOA-SECURITY-APPNAME': EBAY_APP_ID,
                        'X-EBAY-SOA-RESPONSE-DATA-FORMAT': 'JSON',
                        'X-EBAY-SOA-GLOBAL-ID': 'EBAY-US'
                    }
                });
                const text = await res.text();
                try { return JSON.parse(text); } catch (e) { return { _raw: text.slice(0, 50), _status: res.status }; }
            };

            try {
                let data = await tryFinding('findItemsAdvanced');
                let resp = data.findItemsAdvancedResponse?.[0];
                let items = resp?.searchResult?.[0]?.item;

                stats.forensic.tier1 = Object.keys(data).join(',').slice(0, 30);

                if (!items) {
                    const ack = resp?.ack?.[0] || data._status || 'NoAck';
                    stats.tierErr = `Adv:${ack}`;
                    data = await tryFinding('findItemsIneBayStores');
                    resp = data.findItemsIneBayStoresResponse?.[0];
                    items = resp?.searchResult?.[0]?.item;
                    if (!items) stats.tierErr += `|St:${resp?.ack?.[0] || 'NoAck'}`;
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
                stats.forensic.tier2 = Object.keys(bData).join(',').slice(0, 30);

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

        // ENRICHMENT
        if (finalItems.length > 0) {
            stats.enrich.total = finalItems.length;
            finalItems = await Promise.all(finalItems.map(async (item, idx) => {
                const hasDate = item.listedDate && item.listedDate.includes('-') && item.listedDate.includes('T');
                if (hasDate) return item;

                const cleanId = Array.isArray(item.itemId) ? item.itemId[0] : item.itemId;
                const legacyId = cleanId.includes('|') ? cleanId.split('|')[1] : cleanId;
                const browseId = cleanId.includes('|') ? cleanId : `v1|${cleanId}|0`;

                try {
                    // Shopping API v1119
                    if (EBAY_APP_ID) {
                        const sUrl = `https://open.api.ebay.com/shopping?callname=GetSingleItem&responseencoding=JSON&appid=${EBAY_APP_ID}&siteid=0&version=1119&ItemID=${legacyId}&IncludeSelector=Details`;
                        const sRes = await fetch(sUrl);
                        const sData = await sRes.json();
                        if (idx === 0) stats.forensic.enrichS = Object.keys(sData).join(',').slice(0, 30);

                        if (sRes.ok && sData.Item) {
                            const date = sData.Item.StartTime || sData.Item.ListingInfo?.StartTime;
                            if (date) { stats.enrich.shoppingHits++; return { ...item, listedDate: date }; }
                        } else if (idx === 0) {
                            stats.firstEnrichError = `S:${sRes.status}/${sData.Ack || 'Fail'}`;
                        }
                    }

                    // Browse API Get Item
                    const bRes = await fetch(`https://api.ebay.com/buy/browse/v1/item/${encodeURIComponent(browseId)}`, {
                        headers: browseHeaders
                    });
                    const bData = await bRes.json();
                    if (idx === 0) stats.forensic.enrichB = Object.keys(bData).join(',').slice(0, 30);

                    if (bRes.ok) {
                        const date = bData.listingStartTime || bData.startTimeUtc || bData.creationDate;
                        if (date) { stats.enrich.browseHits++; return { ...item, listedDate: date }; }
                        else if (idx === 0) stats.firstEnrichError = `B:NoDate/Keys:${Object.keys(bData).slice(0, 3)}`;
                    } else if (idx === 0 && !stats.firstEnrichError) {
                        stats.firstEnrichError = `B:${bRes.status}`;
                    }
                } catch (e) { if (idx === 0) stats.firstEnrichError = `Ex:${e.message}`; }
                stats.enrich.fails++;
                return item;
            }));
        }

        stats.summary = `[V31] Tier:${stats.tier} | Enr:${stats.enrich.shoppingHits}S,${stats.enrich.browseHits}B | ERR:${stats.firstEnrichError || 'None'}`;
        if (stats.tierErr && stats.tier !== 'finding') stats.summary += ` | TErr:${stats.tierErr.slice(0, 40)}`;
        if (stats.forensic.tier1) stats.summary += ` | T1Key:${stats.forensic.tier1}`;

        const responseData = { items: finalItems, _debug: stats };
        setCachedData(cacheKey, responseData);
        return new Response(JSON.stringify(responseData), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    } catch (e) {
        console.error(`[ebay-seller] FATAL: ${e.message}`);
        return new Response(JSON.stringify({ error: e.message }), {
            status: e.message.includes('authorization') ? 401 : 500,
            headers: corsHeaders
        });
    }
});
