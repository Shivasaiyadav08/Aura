import { MODELS, FALLBACK_CHAIN } from "./models";
import { callModelProviderWithKey, keyManager } from "./provider";
import { AIServiceUnavailableError, AIValidationError } from "./errors";
import { buildProfilePrompt, buildRepairPrompt } from "@/lib/prompts";
import { ProfileSchema, type Profile } from "@/lib/schema";
import { extractJson } from "@/lib/utils";
import type { NormalizedSource } from "@/lib/types";

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
//
// FIX: Removed runWithRetry wrapper. The wrapper was causing the entire
// key/model matrix to restart on any AIRateLimitError (including when
// callModelProviderWithKey threw for an already-cooling key), which
// caused repeated attempts on the same failing key (index 4 in the logs).
//
// Strategy: Outer loop = API key index, inner loop = model.
// callModelProviderWithKey returns null (not throws) for unavailable keys,
// so the loop simply continues to the next combination cleanly.
// A single-pass retry is done via a simple manual backoff sleep if all
// combinations return null on first pass.

export async function generateProfileWithFallback(
  name: string,
  context: string,
  sources: NormalizedSource[],
  onProgress?: (message: string, isFallback: boolean) => void
): Promise<FallbackResult> {
  const prompt = buildProfilePrompt(name, context, sources);
  const totalKeys = keyManager.getTotalKeys();

  if (totalKeys === 0) {
    throw new AIServiceUnavailableError(
      "No Gemini API keys configured."
    );
  }

  let totalAttempts = 0;
  let firstAttempt = true;

  // Single-pass with optional one backoff retry if no key is available
  for (let pass = 0; pass < 2; pass++) {
    if (pass > 0) {
      // Brief backoff before second pass — allow short cooldowns to expire
      console.warn(`[Orchestrator] Pass ${pass + 1}: waiting 3s before retry pass...`);
      if (onProgress) onProgress(PROGRESS.keyRotating, true);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    for (let keyIdx = 0; keyIdx < totalKeys; keyIdx++) {
      for (let modelIdx = 0; modelIdx < FALLBACK_CHAIN.length; modelIdx++) {
        const modelKey = FALLBACK_CHAIN[modelIdx];
        const modelConfig = MODELS[modelKey];

        if (!firstAttempt && onProgress) {
          onProgress(PROGRESS.switching, true);
        }
        firstAttempt = false;

        totalAttempts++;
        console.log(
          `[Orchestrator] Attempt ${totalAttempts} — Key index: ${keyIdx}, Model: ${modelConfig.name}`
        );

        if (onProgress && totalAttempts === 1) {
          onProgress(PROGRESS.start, false);
        }

        // callModelProviderWithKey returns null for unavailable keys — no throw
        const rawResponse = await callModelProviderWithKey(
          modelConfig,
          prompt,
          keyIdx
        );

        if (rawResponse === null) {
          // Key skipped (cooling/unavailable/timeout/404) — try next combination
          continue;
        }

        // Got a response — attempt to parse
        try {
          const profile = parseAndValidate(rawResponse);
          if (onProgress) onProgress(PROGRESS.finalizing, totalAttempts > 1);
          console.log(
            `[Orchestrator] Success — Key index: ${keyIdx}, Model: ${modelConfig.name}, Attempts: ${totalAttempts}`
          );
          return { profile, modelUsed: modelConfig.name, attempts: totalAttempts };
        } catch (parseErr: any) {
          // Schema mismatch — attempt one repair pass on the same key
          console.warn(
            `[Orchestrator] Parse failed on key ${keyIdx}, model ${modelConfig.name}: ${parseErr.message}. Attempting repair...`
          );
          if (onProgress) onProgress(PROGRESS.repairing, true);

          totalAttempts++;
          const repairPrompt = buildRepairPrompt(prompt, rawResponse, parseErr.message);
          const repaired = await callModelProviderWithKey(modelConfig, repairPrompt, keyIdx);

          if (repaired !== null) {
            try {
              const profile = parseAndValidate(repaired);
              if (onProgress) onProgress(PROGRESS.finalizing, true);
              console.log(
                `[Orchestrator] Repair successful — Key index: ${keyIdx}, Model: ${modelConfig.name}`
              );
              return { profile, modelUsed: `${modelConfig.name} (repaired)`, attempts: totalAttempts };
            } catch (repairParseErr: any) {
              console.warn(
                `[Orchestrator] Repair parse also failed: ${repairParseErr.message}. Continuing to next combination.`
              );
            }
          }
          // Repair failed — continue to next key/model combination
          continue;
        }
      }
    }
  }

  // All passes exhausted — throw 503 (not 500)
  console.error(`[Orchestrator] All ${totalKeys} keys × ${FALLBACK_CHAIN.length} models exhausted after ${totalAttempts} attempts.`);
  throw new AIServiceUnavailableError(PROGRESS.allExhausted);
}
