// In-memory cache with TTL for API responses
// Reduces API calls and improves performance

interface CacheEntry {
    data: any;
    timestamp: number;
    version: string;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 1000 * 60 * 10; // 10 minutes
const CACHE_VERSION = "v3";

export function getCachedData(key: string): any | null {
    const cached = cache.get(key);

    // Check cache version and TTL
    if (cached && cached.version === CACHE_VERSION && (Date.now() - cached.timestamp < CACHE_TTL)) {
        return cached.data;
    }

    return null;
}

export function setCachedData(key: string, data: any): void {
    cache.set(key, {
        data,
        timestamp: Date.now(),
        version: CACHE_VERSION
    });
}

export function clearCache(): void {
    cache.clear();
}
