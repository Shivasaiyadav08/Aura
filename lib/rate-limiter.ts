interface RateLimitRecord {
  timestamps: number[];
}

const memoryRateLimit = new Map<string, RateLimitRecord>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_REQUESTS = 30;

/**
 * Sliding window rate limiter to limit requests per IP address.
 */
export async function checkRateLimit(ip: string): Promise<{
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTimeMs: number;
}> {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  let record = memoryRateLimit.get(ip);
  if (!record) {
    record = { timestamps: [] };
  }

  // Keep only requests made within the last hour
  record.timestamps = record.timestamps.filter((t) => t > windowStart);

  if (record.timestamps.length >= MAX_REQUESTS) {
    const oldestRequestTime = record.timestamps[0];
    const resetTimeMs = oldestRequestTime + RATE_LIMIT_WINDOW_MS;
    
    return {
      allowed: false,
      limit: MAX_REQUESTS,
      remaining: 0,
      resetTimeMs,
    };
  }

  // Log the current request
  record.timestamps.push(now);
  memoryRateLimit.set(ip, record);

  return {
    allowed: true,
    limit: MAX_REQUESTS,
    remaining: MAX_REQUESTS - record.timestamps.length,
    resetTimeMs: now + RATE_LIMIT_WINDOW_MS,
  };
}
