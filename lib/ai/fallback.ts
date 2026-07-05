import { MODELS, FALLBACK_CHAIN } from "./models";
import { callModelProviderWithKey, keyManager } from "./provider";
import { AIServiceUnavailableError, AIValidationError, AIRateLimitError } from "./errors";
import { buildProfilePrompt, buildRepairPrompt } from "@/lib/prompts";
import { ProfileSchema, type Profile } from "@/lib/schema";
import { extractJson } from "@/lib/utils";
import type { NormalizedSource } from "@/lib/types";
import { runWithRetry } from "./retry";

// ─── Parse + Validate Helper ──────────────────────────────────────────────────

function parseAndValidate(raw: string): Profile {
  const jsonStr = extractJson(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new AIValidationError(`Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  const result = ProfileSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map(i => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new AIValidationError(`Schema validation failed: ${issues}`);
  }
  return result.data;
}

// ─── Result Type ──────────────────────────────────────────────────────────────

export interface FallbackResult {
  profile: Profile;
  modelUsed: string;
  attempts: number;
}

// ─── Progress Message Helpers (user-facing, provider-neutral) ─────────────────

const PROGRESS = {
  start: "Building intelligence profile...",
  switching: "Switching to backup system...",
  keyRotating: "Optimizing connection...",
  repairing: "Refining response structure...",
  finalizing: "Finalizing intelligence report...",
  allExhausted: "We're experiencing unusually high demand. Please try again shortly.",
};

// ─── Main Fallback Orchestrator ───────────────────────────────────────────────

/**
 * Orchestrates the multi-model Gemini fallback chain.
 * Attempts models in order for a single API key before rotating to the next key.
 * If all keys fail, retries using exponential backoff with jitter up to 3 times.
 */
export async function generateProfileWithFallback(
  name: string,
  context: string,
  sources: NormalizedSource[],
  onProgress?: (message: string, isFallback: boolean) => void
): Promise<FallbackResult> {
  const prompt = buildProfilePrompt(name, context, sources);
  const totalKeys = keyManager.getTotalKeys();
  let attemptCount = 0;

  return runWithRetry(async () => {
    attemptCount++;
    let fallbackAttempted = false;

    for (let keyIdx = 0; keyIdx < totalKeys; keyIdx++) {
      for (let modelIdx = 0; modelIdx < FALLBACK_CHAIN.length; modelIdx++) {
        const modelKey = FALLBACK_CHAIN[modelIdx];
        const modelConfig = MODELS[modelKey];
        const isFallback = fallbackAttempted || modelIdx > 0 || keyIdx > 0;

        if (onProgress) {
          onProgress(isFallback ? PROGRESS.switching : PROGRESS.start, isFallback);
        }

        try {
          fallbackAttempted = true;
          // Call model using specific key index
          const rawResponse = await callModelProviderWithKey(
            modelConfig,
            prompt,
            keyIdx
          );

          // Try to parse the response
          try {
            const profile = parseAndValidate(rawResponse);
            if (onProgress) onProgress(PROGRESS.finalizing, isFallback);
            return { profile, modelUsed: modelConfig.name, attempts: attemptCount };
          } catch (parseErr: any) {
            // Schema mismatch — attempt one repair pass on the same key
            if (onProgress) onProgress(PROGRESS.repairing, isFallback);

            const repairPrompt = buildRepairPrompt(prompt, rawResponse, parseErr.message);
            const repaired = await callModelProviderWithKey(modelConfig, repairPrompt, keyIdx);
            const profile = parseAndValidate(repaired);

            if (onProgress) onProgress(PROGRESS.finalizing, isFallback);
            return { profile, modelUsed: `${modelConfig.name} (repaired)`, attempts: attemptCount };
          }
        } catch (err: any) {
          console.warn(`[Fallback] Key index ${keyIdx}, model ${modelConfig.name} failed: ${err.message}`);
          // Continue loop to try next model/key combination
          continue;
        }
      }
    }

    // If we exhaust all keys and models, throw a transient error to trigger runWithRetry backoff
    throw new AIServiceUnavailableError(PROGRESS.allExhausted);
  }, {
    maxRetries: 2, // 3 attempts total (Attempt 1 -> Attempt 2 -> Attempt 3)
    initialDelayMs: 2000,
    backoffFactor: 2,
    jitter: true,
  }, (err, retryNum, delayMs) => {
    console.warn(`[Orchestrator] All keys/models exhausted (Attempt ${retryNum}). Retrying in ${Math.round(delayMs)}ms...`);
    if (onProgress) {
      onProgress(PROGRESS.keyRotating, true);
    }
  });
}
