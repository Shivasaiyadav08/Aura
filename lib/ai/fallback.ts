import { MODELS, FALLBACK_CHAIN } from "./models";
import { callModelProvider } from "./provider";
import { AIServiceUnavailableError, AIValidationError, AIRateLimitError } from "./errors";
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

/**
 * Orchestrates the 4-model Gemini fallback chain.
 * For each model, ALL available API keys are tried before moving to the next model.
 * 4 keys × 4 models = up to 16 total attempts before giving up.
 *
 * Progress messages are deliberately provider-neutral — users never see model
 * names, error codes, or key details.
 */
export async function generateProfileWithFallback(
  name: string,
  context: string,
  sources: NormalizedSource[],
  onProgress?: (message: string, isFallback: boolean) => void
): Promise<FallbackResult> {
  const prompt = buildProfilePrompt(name, context, sources);
  let totalAttempts = 0;

  for (let modelIdx = 0; modelIdx < FALLBACK_CHAIN.length; modelIdx++) {
    const modelKey = FALLBACK_CHAIN[modelIdx];
    const modelConfig = MODELS[modelKey];
    const isFallback = modelIdx > 0;

    if (onProgress) {
      onProgress(isFallback ? PROGRESS.switching : PROGRESS.start, isFallback);
    }

    try {
      totalAttempts++;

      // callModelProvider internally iterates all available keys for this model
      const rawResponse = await callModelProvider(
        modelConfig,
        prompt,
        (_fromIdx, _toIdx, _reason) => {
          if (onProgress) onProgress(PROGRESS.keyRotating, isFallback);
        }
      );

      // Try to parse the response
      try {
        const profile = parseAndValidate(rawResponse);
        if (onProgress) onProgress(PROGRESS.finalizing, isFallback);
        return { profile, modelUsed: modelConfig.name, attempts: totalAttempts };
      } catch (parseErr: any) {
        // Schema mismatch — attempt one repair pass
        if (onProgress) onProgress(PROGRESS.repairing, isFallback);

        totalAttempts++;
        const repairPrompt = buildRepairPrompt(prompt, rawResponse, parseErr.message);
        const repaired = await callModelProvider(modelConfig, repairPrompt);
        const profile = parseAndValidate(repaired);

        if (onProgress) onProgress(PROGRESS.finalizing, isFallback);
        return { profile, modelUsed: `${modelConfig.name} (repaired)`, attempts: totalAttempts };
      }
    } catch (err: any) {
      const isAllKeysExhausted =
        err instanceof AIRateLimitError ||
        (err.message && (
          err.message.toLowerCase().includes("quota") ||
          err.message.includes("429") ||
          err.message.toLowerCase().includes("exhausted") ||
          err.message.toLowerCase().includes("all gemini")
        ));

      if (isAllKeysExhausted && modelIdx < FALLBACK_CHAIN.length - 1) {
        // All keys tried for this model — silently move to next model
        console.warn(`[Fallback] Model ${modelConfig.name}: all keys exhausted. Moving to next model.`);
        continue;
      }

      // For validation errors or other non-quota errors on last model, still try next
      if (modelIdx < FALLBACK_CHAIN.length - 1) {
        console.warn(`[Fallback] Model ${modelConfig.name} failed: ${err.message}. Trying next model.`);
        continue;
      }
    }
  }

  // All 4 models × all keys exhausted
  throw new AIServiceUnavailableError(PROGRESS.allExhausted);
}
