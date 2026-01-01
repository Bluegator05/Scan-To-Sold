// Supabase Edge Function: ebay-item
// Fetches individual eBay listing data by ID or URL

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getEbayToken } from '../_shared/ebay-auth.ts';
import { getCachedData, setCachedData } from '../_shared/cache.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

serve(async (req) => {
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    try {
        const url = new URL(req.url);
        const idOrUrl = decodeURIComponent(url.pathname.split('/').pop() || '');

        if (!idOrUrl) {
            return new Response(
                JSON.stringify({ error: 'Item ID or URL required' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Extract item ID from URL if needed
        let itemId = idOrUrl;
        if (idOrUrl.includes('ebay.com')) {
            const match = idOrUrl.match(/\/itm\/(\d+)/);
            itemId = match ? match[1] : idOrUrl;
        }

        // Check cache
        const cacheKey = `item:${itemId}`;
        const cached = getCachedData(cacheKey);
        if (cached) {
            return new Response(JSON.stringify(cached), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const token = await getEbayToken();

        const response = await fetch(
            `https://api.ebay.com/buy/browse/v1/item/v1|${itemId}|0`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US'
                }
            }
        );

        if (!response.ok) {
            throw new Error(`eBay API error: ${response.status}`);
        }

        const data = await response.json();
        setCachedData(cacheKey, data);

        return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error:', error);
        return new Response(
            JSON.stringify({ error: 'Failed to fetch item', details: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
