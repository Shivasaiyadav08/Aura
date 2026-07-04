import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { keyManager } from "@/lib/ai/keyRotation";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = logger.getStats();
  const keyStats = keyManager.getStats();

  const response = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    keys: {
      total: keyManager.getTotalKeys(),
      available: keyManager.getAvailableCount(),
      details: keyStats.map((k) => ({
        index: k.index,
        status: k.status,
        failCount: k.failCount,
        cooldownRemainingMs: k.cooldownUntil ? Math.max(0, k.cooldownUntil - Date.now()) : 0,
      })),
    },
    env: {
      hasTavilyKey: !!process.env.TAVILY_API_KEY,
      hasRedisUrl: !!process.env.REDIS_URL,
    },
    analytics: stats,
  };

  const httpStatus = keyManager.getAvailableCount() > 0 ? 200 : 503;

  return NextResponse.json(response, { status: httpStatus });
}
