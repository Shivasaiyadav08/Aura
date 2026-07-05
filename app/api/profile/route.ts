import { NextRequest, NextResponse } from "next/server";
import { searchForPerson } from "@/lib/search";
import { generateProfileWithFallback } from "@/lib/ai/fallback";
import { validateGeneratedProfile } from "@/lib/ai/validator";
import { checkRateLimit } from "@/lib/rate-limiter";
import { cache } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { resolveProfileImage } from "@/lib/image-resolver";
import { AIServiceUnavailableError, AIRateLimitError, AITimeoutError } from "@/lib/ai/errors";
import type { ProfileResponse, ErrorResponse } from "@/types";
import type { Profile } from "@/lib/schema";

// ─── Vercel Runtime Config ────────────────────────────────────────────────────
// 60s is the hard cap for Vercel Free/Hobby plans.
// Pro allows up to 300s but we keep 60 for universal compatibility.
export const maxDuration = 60;

// ─── Input Validation ─────────────────────────────────────────────────────────

interface RequestBody {
  name: string;
  context: string;
}

function validateInput(body: unknown): { valid: true; data: RequestBody } | { valid: false; error: string } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Invalid request format." };
  }

  const { name, context } = body as Record<string, unknown>;

  if (typeof name !== "string" || name.trim().length < 2) {
    return { valid: false, error: "Name must be at least 2 characters." };
  }
  if (name.trim().length > 100) {
    return { valid: false, error: "Name must be 100 characters or fewer." };
  }
  if (typeof context !== "string" || context.trim().length < 2) {
    return { valid: false, error: "Context must be at least 2 characters." };
  }
  if (context.trim().length > 150) {
    return { valid: false, error: "Context must be 150 characters or fewer." };
  }

  return {
    valid: true,
    data: { name: name.trim(), context: context.trim() },
  };
}

// ─── Friendly Error Mapper ────────────────────────────────────────────────────
// NEVER expose raw provider errors to the client.

function toFriendlyError(err: unknown): { message: string; status: number } {
  // FIX: Check error CLASS and STATUS CODE first — before string matching.
  // This prevents AIServiceUnavailableError from falling through to HTTP 500.

  // Service unavailable (all providers exhausted) → 503
  if (err instanceof AIServiceUnavailableError) {
    return {
      message: "We're experiencing unusually high demand. Please try again shortly.",
      status: 503,
    };
  }

  // Rate limit / quota exceeded → 503
  if (err instanceof AIRateLimitError) {
    return {
      message: "We're experiencing unusually high demand. Please try again in a moment.",
      status: 503,
    };
  }

  // Timeout → 504
  if (err instanceof AITimeoutError) {
    return {
      message: "The request took longer than expected. Please try again.",
      status: 504,
    };
  }

  // String-based fallbacks for errors not wrapped in typed classes
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  // High demand / quota
  if (
    lower.includes("quota") ||
    lower.includes("exhausted") ||
    lower.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("all gemini") ||
    lower.includes("all available")
  ) {
    return {
      message: "We're experiencing unusually high demand. Please try again in a moment.",
      status: 503,
    };
  }

  // Service unavailable
  if (
    lower.includes("unavailable") ||
    lower.includes("overloaded") ||
    lower.includes("503") ||
    lower.includes("fallback chain") ||
    lower.includes("high demand")
  ) {
    return {
      message: "We're experiencing unusually high demand. Please try again shortly.",
      status: 503,
    };
  }

  // Timeout
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("deadline")) {
    return {
      message: "The request took longer than expected. Please try again.",
      status: 504,
    };
  }

  // Search / API key config
  if (lower.includes("tavily") || lower.includes("search failed")) {
    return {
      message: "We could not gather enough information for this search. Please try a more specific name or context.",
      status: 422,
    };
  }

  // Validation errors
  if (lower.includes("validation") || lower.includes("schema")) {
    return {
      message: "We had trouble structuring the report. Please try again.",
      status: 422,
    };
  }

  // No API keys configured
  if (lower.includes("no gemini api keys") || lower.includes("api key")) {
    return {
      message: "The service is temporarily misconfigured. Please contact support.",
      status: 503,
    };
  }

  // Generic fallback — still 500 only for true unexpected programming errors
  return {
    message: "An unexpected error occurred. Please try again.",
    status: 500,
  };
}

// ─── POST /api/profile ────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse<ProfileResponse | ErrorResponse>> {
  const startTime = Date.now();

  // 1. Rate limit check
  const clientIp = request.ip || request.headers.get("x-forwarded-for") || "127.0.0.1";
  const rateLimit = await checkRateLimit(clientIp);

  if (!rateLimit.allowed) {
    return NextResponse.json<ErrorResponse>(
      { success: false, error: "Too many requests. Please wait a moment and try again." },
      {
        status: 429,
        headers: { "Retry-After": Math.ceil((rateLimit.resetTimeMs - Date.now()) / 1000).toString() },
      }
    );
  }

  // 2. Parse + validate input
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ErrorResponse>({ success: false, error: "Invalid request body." }, { status: 400 });
  }

  const validation = validateInput(body);
  if (!validation.valid) {
    return NextResponse.json<ErrorResponse>({ success: false, error: validation.error }, { status: 400 });
  }

  const { name, context } = validation.data;
  const cacheKey = `profile:${name.toLowerCase()}:${context.toLowerCase()}`;

  // Hard 55s deadline guard — returns a clean 503 before Vercel's hard-kill at 60s.
  // We keep a reference to the timer so we can clear it on success (prevents process leak).
  let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  const deadline = new Promise<never>((_, reject) => {
    deadlineTimer = setTimeout(
      () => reject(new AIServiceUnavailableError("The request took too long. Please try again.")),
      55_000
    );
  });

  try {
    const response = await Promise.race([
      (async () => {
        // 3. Check cache first
        const cached = await cache.get<Profile>(cacheKey);
        if (cached) {
          const latency = Date.now() - startTime;
          logger.log({ name, context, modelUsed: "Cache", status: "success", latencyMs: latency, cacheHit: true, retryCount: 0 });
          return NextResponse.json<ProfileResponse>({
            success: true,
            profile: cached,
            modelUsed: "Cached",
            latencyMs: latency,
            cacheHit: true,
          });
        }

        // 4. Web search
        const sources = await searchForPerson(name, context);

        // 5. AI generation with fallback chain
        const result = await generateProfileWithFallback(name, context, sources);

        // 6. Post-generation validation (soft fail — return best-effort result)
        const validity = validateGeneratedProfile(result.profile);
        if (!validity.valid) {
          console.warn(`[Profile API] Validation soft-fail: ${validity.reason}. Using best-effort result.`);
        }

        // 7. Resolve profile image (non-fatal)
        if (!result.profile.profileImageUrl) {
          try {
            const imageUrl = await resolveProfileImage(
              sources,
              name,
              context,
              {
                occupation : result.profile.basicDetails?.occupation,
                company    : result.profile.basicDetails?.currentCompany,
                industry   : result.profile.basicDetails?.industry,
                nationality: result.profile.basicDetails?.nationality,
                location   : [
                  result.profile.basicDetails?.currentCity,
                  result.profile.basicDetails?.currentCountry,
                ].filter(Boolean).join(" ") || undefined,
              }
            );
            if (imageUrl) result.profile.profileImageUrl = imageUrl;
          } catch (imgErr) {
            console.warn("[Profile API] Image resolution failed (non-fatal):", imgErr);
          }
        }

        // 8. Cache result
        await cache.set(cacheKey, result.profile);

        const latency = Date.now() - startTime;
        logger.log({
          name, context,
          modelUsed: result.modelUsed,
          status: "success",
          latencyMs: latency,
          cacheHit: false,
          retryCount: result.attempts - 1,
        });

        return NextResponse.json<ProfileResponse>({
          success: true,
          profile: result.profile,
          modelUsed: result.modelUsed,
          latencyMs: latency,
          cacheHit: false,
        });
      })(),
      deadline,
    ]);

    // Clear deadline timer so it doesn't fire after the response is sent
    if (deadlineTimer) clearTimeout(deadlineTimer);
    return response;

  } catch (err: unknown) {
    if (deadlineTimer) clearTimeout(deadlineTimer);
    const latency = Date.now() - startTime;
    const { message, status } = toFriendlyError(err);

    logger.log({
      name, context,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      latencyMs: latency,
      cacheHit: false,
    });

    return NextResponse.json<ErrorResponse>({ success: false, error: message }, { status });
  }
}
