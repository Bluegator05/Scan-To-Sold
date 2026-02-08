import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders, verifyUser } from '../_shared/auth.ts';

// Tier limits configuration
const TIER_LIMITS = {
    FREE: {
        totalScans: 10,
        dailyScans: Infinity,
        dailyOptimizations: 3
    },
    PLUS: {
        totalScans: Infinity,
        dailyScans: Infinity,
        dailyOptimizations: 20
    },
    PRO: {
        totalScans: Infinity,
        dailyScans: Infinity,
        dailyOptimizations: Infinity
    }
};

serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { user, supabase } = await verifyUser(req);
        const { action, featureType } = await req.json();

        console.log(`[track-usage] User: ${user.id}, Action: ${action}, Feature: ${featureType}`);

        // Fetch user profile with tier and usage data
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('tier, total_scans, total_optimizations, daily_scans_count, daily_optimizations_count, last_reset_date')
            .eq('id', user.id)
            .single();

        if (profileError || !profile) {
            throw new Error('Failed to fetch user profile');
        }

        const tier = profile.tier || 'FREE';
        const limits = TIER_LIMITS[tier as keyof typeof TIER_LIMITS];
        const today = new Date().toISOString().split('T')[0];

        // Reset daily counters if it's a new day
        let dailyScans = profile.daily_scans_count || 0;
        let dailyOptimizations = profile.daily_optimizations_count || 0;

        if (profile.last_reset_date !== today) {
            dailyScans = 0;
            dailyOptimizations = 0;
        }

        // Check limits based on feature type
        if (action === 'check') {
            // Just return current usage status
            return new Response(JSON.stringify({
                tier,
                totalScans: profile.total_scans || 0,
                maxTotalScans: limits.totalScans,
                dailyScans,
                maxDailyScans: limits.dailyScans,
                dailyOptimizations,
                maxDailyOptimizations: limits.dailyOptimizations,
                canScan: (profile.total_scans || 0) < limits.totalScans && dailyScans < limits.dailyScans,
                canOptimize: dailyOptimizations < limits.dailyOptimizations,
                showSoftWarning: tier === 'FREE' && (profile.total_scans || 0) >= 7 && (profile.total_scans || 0) < 10
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (action === 'increment') {
            // Increment usage counters
            let newTotalScans = profile.total_scans || 0;
            let newTotalOptimizations = profile.total_optimizations || 0;
            let newDailyScans = dailyScans;
            let newDailyOptimizations = dailyOptimizations;

            if (featureType === 'scan') {
                // Check limits before incrementing
                if (newTotalScans >= limits.totalScans) {
                    return new Response(JSON.stringify({
                        error: 'LIMIT_REACHED',
                        message: `You've reached your ${tier} tier limit of ${limits.totalScans} scans. Please upgrade to continue.`,
                        tier,
                        totalScans: newTotalScans,
                        maxTotalScans: limits.totalScans
                    }), {
                        status: 403,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                if (newDailyScans >= limits.dailyScans) {
                    return new Response(JSON.stringify({
                        error: 'DAILY_LIMIT_REACHED',
                        message: `You've reached your daily scan limit of ${limits.dailyScans}. Try again tomorrow.`,
                        tier,
                        dailyScans: newDailyScans,
                        maxDailyScans: limits.dailyScans
                    }), {
                        status: 403,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                newTotalScans++;
                newDailyScans++;
            } else if (featureType === 'optimization') {
                // Check optimization limits
                if (newDailyOptimizations >= limits.dailyOptimizations) {
                    return new Response(JSON.stringify({
                        error: 'OPTIMIZATION_LIMIT_REACHED',
                        message: `You've reached your daily optimization limit of ${limits.dailyOptimizations}. Upgrade for more.`,
                        tier,
                        dailyOptimizations: newDailyOptimizations,
                        maxDailyOptimizations: limits.dailyOptimizations
                    }), {
                        status: 403,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }

                newTotalOptimizations++;
                newDailyOptimizations++;
            }

            // Update database
            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    total_scans: newTotalScans,
                    total_optimizations: newTotalOptimizations,
                    daily_scans_count: newDailyScans,
                    daily_optimizations_count: newDailyOptimizations,
                    last_reset_date: today
                })
                .eq('id', user.id);

            if (updateError) {
                throw new Error('Failed to update usage');
            }

            return new Response(JSON.stringify({
                success: true,
                tier,
                totalScans: newTotalScans,
                maxTotalScans: limits.totalScans,
                dailyScans: newDailyScans,
                maxDailyScans: limits.dailyScans,
                dailyOptimizations: newDailyOptimizations,
                maxDailyOptimizations: limits.dailyOptimizations,
                showSoftWarning: tier === 'FREE' && newTotalScans >= 7 && newTotalScans < 10
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        throw new Error('Invalid action');

    } catch (error: any) {
        console.error("[track-usage] Error:", error);
        return new Response(JSON.stringify({
            error: error.message || "Unknown error"
        }), {
            status: error.message.includes('authorization') ? 401 : 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
