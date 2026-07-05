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

// ─── Key Cooldown Helpers ─────────────────────────────────────────────────────

/**
 * Returns the minimum remaining cooldown (ms) across all (key, model) pairs.
 * Returns 0 if any combination is currently available.
 */
function getMinCooldownMs(): number {
  return keyManager.getMinModelCooldownMs();
}

// ─── Single Matrix Pass ───────────────────────────────────────────────────────

async function runMatrixPass(
  prompt: string,
  totalKeys: number,
  totalAttempts: { value: number },
  onProgress?: (message: string, isFallback: boolean) => void
): Promise<FallbackResult | null> {
  // MODEL outer → KEY inner: try best model on all keys before downgrading
  for (let modelIdx = 0; modelIdx < FALLBACK_CHAIN.length; modelIdx++) {
    const modelKey = FALLBACK_CHAIN[modelIdx];
    const modelConfig = MODELS[modelKey];

    for (let keyIdx = 0; keyIdx < totalKeys; keyIdx++) {
      totalAttempts.value++;

      console.log(
        `[Orchestrator] Attempt ${totalAttempts.value} — Model: ${modelConfig.name}, Key: ${keyIdx}`
      );

      if (onProgress && totalAttempts.value === 1) {
        onProgress(PROGRESS.start, false);
      } else if (onProgress && modelIdx > 0) {
        onProgress(PROGRESS.switching, true);
      } else if (onProgress) {
        onProgress(PROGRESS.keyRotating, true);
      }

      // Returns null for cooling/unavailable/timeout/404 — never throws
      const rawResponse = await callModelProviderWithKey(modelConfig, prompt, keyIdx);
      if (rawResponse === null) continue;

      // Got a response — attempt to parse
      try {
        const profile = parseAndValidate(rawResponse);
        if (onProgress) onProgress(PROGRESS.finalizing, totalAttempts.value > 1);
        console.log(`[Orchestrator] ✓ Success — Model: ${modelConfig.name}, Key: ${keyIdx}, Attempts: ${totalAttempts.value}`);
        return { profile, modelUsed: modelConfig.name, attempts: totalAttempts.value };
      } catch (parseErr: any) {
        // One repair attempt on same key
        console.warn(`[Orchestrator] Parse failed: ${parseErr.message}. Repairing...`);
        if (onProgress) onProgress(PROGRESS.repairing, true);

        totalAttempts.value++;
        const repairPrompt = buildRepairPrompt(prompt, rawResponse, parseErr.message);
        const repaired = await callModelProviderWithKey(modelConfig, repairPrompt, keyIdx);

        if (repaired !== null) {
          try {
            const profile = parseAndValidate(repaired);
            if (onProgress) onProgress(PROGRESS.finalizing, true);
            console.log(`[Orchestrator] ✓ Repair success — Model: ${modelConfig.name}, Key: ${keyIdx}`);
            return { profile, modelUsed: `${modelConfig.name} (repaired)`, attempts: totalAttempts.value };
          } catch (repairErr: any) {
            console.warn(`[Orchestrator] Repair parse also failed: ${repairErr.message}`);
          }
        }
        continue;
      }
    }
  }

  return null; // All combinations returned null (all keys cooling)
}

// ─── Main Fallback Orchestrator ───────────────────────────────────────────────
//
// Strategy: MODEL (outer) → KEY (inner).
// Exhausts all API keys on the best model before downgrading to the next tier.
//
// Smart recovery: if pass-1 returns null (all keys cooling), we check the
// shortest remaining cooldown. If it's within our budget we wait exactly
// that long and run pass-2, giving us a real chance at recovery within 60s.

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

  const totalAttempts = { value: 0 };

  // ── Pass 1 ────────────────────────────────────────────────────────────────
  const result1 = await runMatrixPass(prompt, totalKeys, totalAttempts, onProgress);
  if (result1) return result1;

  // ── Pass 1 returned null: all keys are cooling ────────────────────────────
  // Check if any key will recover soon enough to fit within our 55s budget.
  // We leave 20s for the actual API call, so we can wait at most 35s.
  const MAX_WAIT_MS = 35_000;
  const minCooldown = getMinCooldownMs();

  if (minCooldown > 0 && minCooldown <= MAX_WAIT_MS) {
    const waitMs = minCooldown + 500; // +500ms buffer for clock skew
    console.warn(
      `[Orchestrator] All keys cooling. Shortest cooldown: ${Math.round(minCooldown / 1000)}s. ` +
      `Waiting ${Math.round(waitMs / 1000)}s then retrying...`
    );
    if (onProgress) onProgress(PROGRESS.keyRotating, true);
    await new Promise(resolve => setTimeout(resolve, waitMs));

    // ── Pass 2 ──────────────────────────────────────────────────────────────
    const result2 = await runMatrixPass(prompt, totalKeys, totalAttempts, onProgress);
    if (result2) return result2;
  } else if (minCooldown > MAX_WAIT_MS) {
    console.warn(
      `[Orchestrator] All keys cooling, min cooldown ${Math.round(minCooldown / 1000)}s exceeds budget. Failing fast.`
    );
  }

  // All passes exhausted
  console.error(
    `[Orchestrator] ✗ All ${FALLBACK_CHAIN.length} models × ${totalKeys} keys exhausted after ${totalAttempts.value} attempts.`
  );
  throw new AIServiceUnavailableError(PROGRESS.allExhausted);
}
