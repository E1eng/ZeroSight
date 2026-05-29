type CacheEntry<T> = {
  timestamp: number;
  data: T;
};

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry<unknown>>();

export const getCached = <T>(key: string): T | null => {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
};

export const setCached = <T>(key: string, data: T): void => {
  cache.set(key, { data, timestamp: Date.now() });
};
