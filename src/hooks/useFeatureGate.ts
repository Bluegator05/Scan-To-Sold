import { useAuth } from '../contexts/AuthContext';

export type Feature = 'BULK_MODE' | 'AI_GENERATOR' | 'CSV_EXPORT' | 'UNLIMITED_SCANS';
export type Limit = 'DAILY_SCANS' | 'DAILY_OPTIMIZATIONS';

export const useFeatureGate = () => {
    const { subscription } = useAuth();
    const tier = subscription?.tier || 'FREE';

    const canAccess = (feature: Feature): boolean => {
        switch (feature) {
            case 'BULK_MODE':
                return tier === 'PRO'; // Only Pro has Bulk
            case 'AI_GENERATOR':
                return tier === 'PRO'; // Only Pro has Magic Description / AI
            case 'CSV_EXPORT':
                return tier === 'PRO'; // Only Pro has CSV
            case 'UNLIMITED_SCANS':
                return true; // Everyone has unlimited scans now
            default:
                return true;
        }
    };

    const getLimit = (limit: Limit): number => {
        switch (limit) {
            case 'DAILY_SCANS':
                return Infinity; // Unlimited for everyone
            case 'DAILY_OPTIMIZATIONS':
                if (tier === 'FREE') return 5;
                if (tier === 'PLUS') return 50;
                return Infinity;
            default:
                return 0;
        }
    };

    return { canAccess, getLimit, tier };
};
