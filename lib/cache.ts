let redisClient: any = null;
let redisStatus: "disconnected" | "connecting" | "connected" | "failed" = "disconnected";

// ─── Redis Initialization ─────────────────────────────────────────────────────

if (process.env.REDIS_URL) {
  try {
    const Redis = require("ioredis");
    let url = process.env.REDIS_URL.trim();

    // Normalize the URL scheme.
    // Some environment variable editors strip the scheme leaving "//host:port".
    // ioredis interprets scheme-less URLs as Unix socket paths → ENOENT.
    // Upstash always uses TLS so we default to rediss:// when scheme is missing.
    if (url.startsWith("//")) {
      url = "rediss:" + url;
      console.log("[Cache] Redis URL scheme was missing — normalized to rediss://");
    } else if (url.startsWith("redis://") && url.includes("upstash")) {
      // Upstash requires TLS even if URL says redis://
      url = url.replace("redis://", "rediss://");
      console.log("[Cache] Redis URL upgraded to rediss:// for Upstash TLS compatibility");
    }

    // Upstash (and most managed Redis providers) use rediss:// for TLS.
    // ioredis does NOT auto-detect TLS from the scheme — you must pass tls:{}.
    // Without this, ioredis strips the scheme and tries the hostname as a
    // Unix socket path → ENOENT error.
    const isTLS = url.startsWith("rediss://");

    redisClient = new Redis(url, {
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
