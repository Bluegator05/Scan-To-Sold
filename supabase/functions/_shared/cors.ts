// CORS headers for Supabase Edge Functions
// Allows requests from your ScantoSold domain

export const corsHeaders = {
    'Access-Control-Allow-Origin': '*', // Update to your domain in production: 'https://scantosold.com'
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

export function handleCors(req: Request): Response | null {
    // Handle OPTIONS request for CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }
    return null;
}
