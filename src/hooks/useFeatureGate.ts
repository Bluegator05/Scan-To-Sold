import { useAuth } from '../contexts/AuthContext';

export type Feature = 'BULK_MODE' | 'AI_GENERATOR' | 'CSV_EXPORT' | 'UNLIMITED_SCANS' | 'AI_SCAN';
export type Limit = 'DAILY_SCANS' | 'DAILY_OPTIMIZATIONS' | 'LIFETIME_SCANS';

export const useFeatureGate = () => {
    const { subscription } = useAuth();
    const tier = subscription?.tier || 'FREE';

    const canAccess = (feature: Feature): boolean => {
        switch (feature) {
            case 'BULK_MODE':
                return tier === 'PRO'; // Only Pro has Bulk
            case 'AI_GENERATOR':
                return tier === 'PRO'; // Only Pro has Magic Description / AI
            case 'AI_SCAN':
                // Check lifetime scan limit for FREE tier
                if (tier === 'FREE') {
                    const totalScans = subscription?.totalScans || 0;
                    const maxTotalScans = subscription?.maxTotalScans || 15;
                    return totalScans < maxTotalScans;
                }
                return true; // PLUS and PRO have unlimited
            case 'CSV_EXPORT':
                return tier === 'PRO'; // Only Pro has CSV
            case 'UNLIMITED_SCANS':
                return tier !== 'FREE'; // Only PLUS and PRO have unlimited
            default:
                return true;
        }
    };

    const getLimit = (limit: Limit): number => {
        switch (limit) {
            case 'LIFETIME_SCANS':
                return subscription?.maxTotalScans || 15;
            case 'DAILY_SCANS':
                return subscription?.maxDailyScans || Infinity;
            case 'DAILY_OPTIMIZATIONS':
                return subscription?.maxDailyOptimizations || 3;
            default:
                return 0;
        }
    };

    const hasReachedLimit = (limit: Limit): boolean => {
        switch (limit) {
            case 'LIFETIME_SCANS':
                const totalScans = subscription?.totalScans || 0;
                const maxTotalScans = subscription?.maxTotalScans || 15;
                return totalScans >= maxTotalScans;
            case 'DAILY_SCANS':
                const dailyScans = subscription?.dailyScans || 0;
                const maxDailyScans = subscription?.maxDailyScans || Infinity;
                return dailyScans >= maxDailyScans;
            case 'DAILY_OPTIMIZATIONS':
                const dailyOpts = subscription?.dailyOptimizations || 0;
                const maxDailyOpts = subscription?.maxDailyOptimizations || 3;
                return dailyOpts >= maxDailyOpts;
            default:
                return false;
        }
    };

    return { canAccess, getLimit, hasReachedLimit, tier };
};
