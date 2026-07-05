let redisClient: any = null;
let redisStatus: "disconnected" | "connecting" | "connected" | "failed" = "disconnected";

// ─── Redis / Upstash Initialization ──────────────────────────────────────────
// Supports two URL formats:
//   1. rediss://... or redis://... → raw Redis protocol via ioredis
//   2. https://...upstash.io → Upstash REST API (use @upstash/redis if available)
//
// The ENOENT error occurs when ioredis receives an https:// URL and tries
// to interpret the hostname as a Unix socket path. We detect this and skip
// ioredis entirely for REST-format Upstash URLs.

if (process.env.REDIS_URL) {
  try {
    const url = process.env.REDIS_URL.trim();

    if (url.startsWith("https://") || url.startsWith("http://")) {
      // Upstash REST URL — ioredis cannot handle this.
      // Skip Redis and use in-memory cache. To fix, set REDIS_URL to the
      // rediss:// protocol URL from Upstash console → Details → Redis URL.
      console.warn(
        "[Cache] REDIS_URL is an HTTP URL (Upstash REST format). " +
        "ioredis needs the rediss:// protocol URL from Upstash console → Details → Redis URL. " +
        "Using in-memory cache until corrected."
      );
      redisStatus = "failed";
    } else {
      const Redis = require("ioredis");

      // Normalize scheme: some env editors strip the scheme leaving "//host:port"
      let normalizedUrl = url;
      if (url.startsWith("//")) {
        normalizedUrl = "rediss:" + url;
        console.log("[Cache] Redis URL scheme was missing — normalized to rediss://");
      } else if (url.startsWith("redis://") && url.includes("upstash")) {
        normalizedUrl = url.replace("redis://", "rediss://");
        console.log("[Cache] Redis URL upgraded to rediss:// for Upstash TLS");
      }

      const isTLS = normalizedUrl.startsWith("rediss://");

      redisClient = new Redis(normalizedUrl, {
        tls: isTLS ? { rejectUnauthorized: false } : undefined,
        lazyConnect: true,
        maxRetriesPerRequest: 2,
        connectTimeout: 8000,
        commandTimeout: 5000,
        retryStrategy(times: number) {
          if (times > 3) {
            console.warn("[Cache] Redis retry limit reached. Using in-memory cache only.");
            return null;
          }
          return Math.min(times * 500, 2000);
        },
        enableOfflineQueue: false,
      });

      redisStatus = "connecting";

      redisClient.on("connect", () => {
        redisStatus = "connected";
        console.log("[Cache] Redis connected successfully.");
      });
      redisClient.on("ready", () => { redisStatus = "connected"; });
      redisClient.on("error", (err: any) => {
        if (redisStatus !== "failed") {
          console.warn(`[Cache] Redis error — falling back to in-memory: ${err.message}`);
        }
        redisStatus = "failed";
      });
      redisClient.on("close", () => {
        if (redisStatus === "connected") {
          console.warn("[Cache] Redis connection closed. Using in-memory cache.");
        }
        redisStatus = "disconnected";
      });

      redisClient.connect().catch((err: any) => {
        console.warn(`[Cache] Redis connect failed: ${err.message}. Using in-memory cache.`);
        redisStatus = "failed";
      });
    }

  } catch (err: any) {
    console.warn(`[Cache] Redis init error: ${err.message}. Using in-memory cache.`);
    redisStatus = "failed";
  }
} else {
  console.log("[Cache] No REDIS_URL configured. Using in-memory cache.");
}

// ─── Cache Implementation ─────────────────────────────────────────────────────

interface CacheItem<T> {
  value: T;
  expiresAt: number;
}

class SmartCache {
  private memoryCache = new Map<string, CacheItem<any>>();
  private defaultTtlMs = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    if (typeof setInterval !== "undefined") {
      setInterval(() => this.pruneExpired(), 5 * 60 * 1000);
    }
  }

  private pruneExpired() {
    const now = Date.now();
    this.memoryCache.forEach((item, key) => {
      if (item.expiresAt < now) this.memoryCache.delete(key);
    });
  }

  private get isRedisReady(): boolean {
    return redisStatus === "connected" && redisClient !== null;
  }

  public async get<T>(key: string): Promise<T | null> {
    // Try Redis first
    if (this.isRedisReady) {
      try {
        const cached = await redisClient.get(key);
        if (cached) return JSON.parse(cached) as T;
      } catch (err: any) {
        console.warn(`[Cache] Redis GET failed for "${key}": ${err.message}`);
      }
    }

    // In-memory fallback
    const item = this.memoryCache.get(key);
    if (item) {
      if (item.expiresAt > Date.now()) return item.value as T;
      this.memoryCache.delete(key);
    }
    return null;
  }

  public async set<T>(key: string, value: T, ttlMs: number = this.defaultTtlMs): Promise<void> {
    // Write to Redis
    if (this.isRedisReady) {
      try {
        const ttlSec = Math.max(1, Math.round(ttlMs / 1000));
        await redisClient.set(key, JSON.stringify(value), "EX", ttlSec);
      } catch (err: any) {
        console.warn(`[Cache] Redis SET failed for "${key}": ${err.message}`);
      }
    }

    // Always write to memory too (fast reads even when Redis is up)
    this.memoryCache.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  public async delete(key: string): Promise<void> {
    if (this.isRedisReady) {
      try { await redisClient.del(key); } catch {}
    }
    this.memoryCache.delete(key);
  }

  public async clear(): Promise<void> {
    if (this.isRedisReady) {
      try { await redisClient.flushdb(); } catch {}
    }
    this.memoryCache.clear();
  }

  public getStatus() {
    return {
      redis: redisStatus,
      memoryEntries: this.memoryCache.size,
    };
  }
}

export const cache = new SmartCache();
export default cache;
