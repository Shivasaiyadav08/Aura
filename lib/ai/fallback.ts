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

// ─── Progress Message Helpers ─────────────────────────────────────────────────

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
// Loop order: MODEL (outer) → KEY (inner).
//
// This is the correct strategy: exhaust all API keys on the best model
// BEFORE downgrading to a worse model. The previous key→model order
// meant we tried all 5 models on key 0 (all likely quota-exceeded together)
// before ever trying key 1 with the best model.
//
// No runWithRetry wrapper — that was causing matrix restarts.
// callModelProviderWithKey returns null (never throws) for skipped keys.

export async function generateProfileWithFallback(
  name: string,
  context: string,
  sources: NormalizedSource[],
  onProgress?: (message: string, isFallback: boolean) => void
): Promise<FallbackResult> {
  const prompt = buildProfilePrompt(name, context, sources);
  const totalKeys = keyManager.getTotalKeys();

  if (totalKeys === 0) {
    throw new AIServiceUnavailableError("No Gemini API keys configured.");
  }

  let totalAttempts = 0;
  let firstAttempt = true;

  // MODEL outer loop → KEY inner loop
  for (let modelIdx = 0; modelIdx < FALLBACK_CHAIN.length; modelIdx++) {
    const modelKey = FALLBACK_CHAIN[modelIdx];
    const modelConfig = MODELS[modelKey];

    for (let keyIdx = 0; keyIdx < totalKeys; keyIdx++) {
      if (!firstAttempt && onProgress) {
        onProgress(modelIdx > 0 ? PROGRESS.switching : PROGRESS.keyRotating, true);
      }
      firstAttempt = false;
      totalAttempts++;

      console.log(
        `[Orchestrator] Attempt ${totalAttempts} — Model: ${modelConfig.name}, Key index: ${keyIdx}`
      );

      if (onProgress && totalAttempts === 1) {
        onProgress(PROGRESS.start, false);
      }

      // Returns null for cooling/unavailable/timeout/404 — never throws
      const rawResponse = await callModelProviderWithKey(modelConfig, prompt, keyIdx);

      if (rawResponse === null) {
        // Key skipped — try next key for the same model
        continue;
      }

      // Got a response — attempt to parse
      try {
        const profile = parseAndValidate(rawResponse);
        if (onProgress) onProgress(PROGRESS.finalizing, totalAttempts > 1);
        console.log(
          `[Orchestrator] ✓ Success — Model: ${modelConfig.name}, Key: ${keyIdx}, Attempts: ${totalAttempts}`
        );
        return { profile, modelUsed: modelConfig.name, attempts: totalAttempts };
      } catch (parseErr: any) {
        // Attempt one repair pass on the same key
        console.warn(
          `[Orchestrator] Parse failed (${parseErr.message}). Attempting repair on Model: ${modelConfig.name}, Key: ${keyIdx}`
        );
        if (onProgress) onProgress(PROGRESS.repairing, true);

        totalAttempts++;
        const repairPrompt = buildRepairPrompt(prompt, rawResponse, parseErr.message);
        const repaired = await callModelProviderWithKey(modelConfig, repairPrompt, keyIdx);

        if (repaired !== null) {
          try {
            const profile = parseAndValidate(repaired);
            if (onProgress) onProgress(PROGRESS.finalizing, true);
            console.log(`[Orchestrator] ✓ Repair successful — Model: ${modelConfig.name}, Key: ${keyIdx}`);
            return { profile, modelUsed: `${modelConfig.name} (repaired)`, attempts: totalAttempts };
          } catch (repairErr: any) {
            console.warn(`[Orchestrator] Repair parse also failed: ${repairErr.message}`);
          }
        }
        // Repair failed — continue to next key for this model
        continue;
      }
    }
  }

  // All models × all keys exhausted
  console.error(
    `[Orchestrator] ✗ All ${FALLBACK_CHAIN.length} models × ${totalKeys} keys exhausted after ${totalAttempts} attempts.`
  );
  throw new AIServiceUnavailableError(PROGRESS.allExhausted);
}
