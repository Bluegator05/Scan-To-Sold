import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export async function verifyUser(req: Request) {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
        console.error('[Auth] No Authorization header found');
        throw new Error('No authorization header')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    if (!supabaseUrl || !supabaseKey) {
        console.error('[Auth] Supabase environment variables missing');
        throw new Error('Server configuration error: Auth env vars missing');
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
        global: { headers: { Authorization: authHeader } },
    })

    // Robust extraction: Split by space and take the last part
    const token = authHeader.split(' ').pop() || '';

    if (!token) {
        console.error('[Auth] Token extraction failed from header:', authHeader);
        throw new Error('Malformed authorization header');
    }

    console.log(`[Auth] Verifying token (prefix: ${token.substring(0, 10)}...)`);

    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
        console.error('[Auth] User verification failed:', error?.message || 'No user found');
        throw new Error('Unauthorized: Invalid token or session expired')
    }

    return { user, supabase }
}

export async function checkUsage(supabase: any, userId: string, feature: string, limit: number) {
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
        .from('user_app_usage')
        .select('*')
        .eq('user_id', userId)
        .eq('feature_name', feature)
        .maybeSingle()

    if (error) {
        console.error('Usage check error:', error)
        return; // Fail open
    }

    if (data) {
        const lastDate = data.last_request_at?.split('T')[0]
        if (lastDate === today) {
            if (data.request_count >= limit) {
                throw new Error(`Daily limit for ${feature} reached (${limit}).`)
            }
            await supabase.from('user_app_usage').update({
                request_count: data.request_count + 1,
                last_request_at: new Date().toISOString()
            }).eq('id', data.id)
        } else {
            await supabase.from('user_app_usage').update({
                request_count: 1,
                last_request_at: new Date().toISOString()
            }).eq('id', data.id)
        }
    } else {
        await supabase.from('user_app_usage').insert({
            user_id: userId,
            feature_name: feature,
            request_count: 1,
            last_request_at: new Date().toISOString()
        })
    }
}
