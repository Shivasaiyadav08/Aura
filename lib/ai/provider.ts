import { GoogleGenerativeAI } from "@google/generative-ai";
import { AIRateLimitError, AITimeoutError } from "./errors";
import type { ModelConfig } from "./models";

// ─── Key Status Types ─────────────────────────────────────────────────────────

export type KeyStatus = "available" | "cooling" | "rate-limited" | "quota-exceeded" | "disabled";

export interface KeyState {
  index: number;
  status: KeyStatus;
  failCount: number;
  cooldownUntil: number | null;
  lastError: string | null;
}

// ─── Smart Gemini Key Manager ─────────────────────────────────────────────────

class GeminiKeyManager {
  private keys: string[] = [];
  private states: KeyState[] = [];
  private roundRobinIndex = 0;

  constructor() {
    const rawKeys = [
      process.env.GEMINI_API_KEY,
      process.env.GEMINI_API_KEY_1,
      process.env.GEMINI_API_KEY_2,
      process.env.GEMINI_API_KEY_3,
      process.env.GEMINI_API_KEY_4,
      process.env.GEMINI_API_KEY_5,
    ];

    const seen = new Set<string>();
    for (const raw of rawKeys) {
      const key = raw?.trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        const idx = this.keys.length;
        this.keys.push(key);
        this.states.push({
          index: idx,
          status: "available",
          failCount: 0,
          cooldownUntil: null,
          lastError: null,
        });
      }
    }

    if (this.keys.length === 0) {
      console.error("[KeyManager] No Gemini API keys found. Add GEMINI_API_KEY_1 through GEMINI_API_KEY_5 to .env.local");
    } else {
      console.log(`[KeyManager] Initialized with ${this.keys.length} Gemini API key(s).`);
    }
  }

  /** Restore keys whose cooldown period has elapsed */
  private refreshStatuses(): void {
    const now = Date.now();
    for (const s of this.states) {
      if (
        s.status !== "available" &&
        s.status !== "disabled" &&
        s.cooldownUntil !== null &&
        now >= s.cooldownUntil
      ) {
        console.log(`[KeyManager] Key ${s.index} restored to available after cooldown.`);
        s.status = "available";
        s.cooldownUntil = null;
        // Reset fail count on recovery so temporary errors don't accumulate forever
        s.failCount = 0;
      }
    }
  }

  /** Get the next available key (round-robin, skipping unavailable).
   *  FIX: Advances roundRobinIndex after selection so the next call
   *  gets the following key rather than repeating the same one.
   */
  public getAvailableKey(): { key: string; index: number } | null {
    this.refreshStatuses();
    for (let i = 0; i < this.keys.length; i++) {
      const idx = (this.roundRobinIndex + i) % this.keys.length;
      if (this.states[idx].status === "available") {
        // Advance the pointer AFTER selection so the next call picks the next key
        this.roundRobinIndex = (idx + 1) % this.keys.length;
        return { key: this.keys[idx], index: idx };
      }
    }
    return null;
  }

  /** Check if a specific key index is currently usable (after refreshing cooldowns).
   *  Returns true if available, false if cooling/quota-exceeded/disabled.
   */
  public isKeyAvailable(index: number): boolean {
    this.refreshStatuses();
    if (index < 0 || index >= this.states.length) return false;
    return this.states[index].status === "available";
  }

  /** Mark a key as failed with an appropriate cooldown based on error type */
  public markKeyFailed(index: number, errorMsg: string): void {
    if (index < 0 || index >= this.states.length) return;

    const s = this.states[index];
    s.failCount++;
    s.lastError = errorMsg;

    const lower = errorMsg.toLowerCase();
    const isQuota =
      lower.includes("quota") ||
      lower.includes("resource exhausted") ||
      lower.includes("exhausted") ||
      errorMsg.includes("429");
    const isServer =
      errorMsg.includes("503") ||
      errorMsg.includes("500") ||
      errorMsg.includes("502") ||
      errorMsg.includes("504") ||
      lower.includes("overloaded") ||
      lower.includes("unavailable");

    if (isQuota) {
      s.status = "quota-exceeded";
      s.cooldownUntil = Date.now() + 62_000; // 62s — Gemini free tier resets per 60s
    } else if (isServer) {
      s.status = "cooling";
      s.cooldownUntil = Date.now() + 10_000; // 10s
    } else {
      s.status = "rate-limited";
      s.cooldownUntil = Date.now() + 15_000; // 15s
    }

    // Do NOT forcibly advance roundRobinIndex here — getAvailableKey already manages rotation
    const remaining = s.cooldownUntil
      ? Math.round((s.cooldownUntil - Date.now()) / 1000)
      : 0;
    console.warn(
      `[KeyManager] Key ${index} → ${s.status} (cooldown: ${remaining}s remaining)`
    );
  }

  public getKeyByIndex(index: number): { key: string; index: number } | null {
    // No refreshStatuses here — caller decides whether to check availability
    if (index >= 0 && index < this.keys.length) {
      return { key: this.keys[index], index };
    }
    return null;
  }

  public getKeyState(index: number): KeyState | null {
    this.refreshStatuses();
    if (index >= 0 && index < this.states.length) {
      return { ...this.states[index] }; // return a copy to prevent mutation
    }
    return null;
  }

  public hasKeys(): boolean { return this.keys.length > 0; }
  public getTotalKeys(): number { return this.keys.length; }
  public getAvailableCount(): number {
    this.refreshStatuses();
    return this.states.filter(s => s.status === "available").length;
  }
  public getStats(): KeyState[] {
    this.refreshStatuses();
    return this.states.map(s => ({ ...s }));
  }
}

export const keyManager = new GeminiKeyManager();

// ─── Gemini Caller (with AbortController for real request cancellation) ───────
//
// IMPORTANT: Using AbortController + signal instead of Promise.race.
// Promise.race leaves the underlying fetch running (wasting quota even on timeout).
// AbortController actually cancels the HTTP request — no quota consumed.

async function callGoogleGemini(
  modelConfig: ModelConfig,
  prompt: string,
  apiKey: string
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    modelConfig.timeoutMs
  );

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelConfig.id,
      generationConfig: {
        temperature: modelConfig.temperature,
        responseMimeType: "text/plain",
      },
    });

    // Pass the AbortSignal — this actually cancels the HTTP request on timeout
    const result = await model.generateContent(prompt, {
      signal: controller.signal,
    } as any);

    const text = result.response.text();
    if (!text?.trim()) {
      throw new Error("Empty response from Gemini model");
    }
    return text;
  } catch (err: any) {
    // Distinguish abort-caused timeout from API errors
    if (
      controller.signal.aborted ||
      err?.name === "AbortError" ||
      err?.message?.includes("This operation was aborted")
    ) {
      throw new AITimeoutError(
        `Gemini ${modelConfig.id} timed out after ${modelConfig.timeoutMs / 1000}s`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Unified Provider Call ────────────────────────────────────────────────────
//
// For each model in the fallback chain, iterates ALL available API keys
// before giving up on that model. Timeout errors propagate immediately
// (they are NOT key failures — the key may work for a different model).

export async function callModelProvider(
  modelConfig: ModelConfig,
  prompt: string,
  onKeyRotate?: (fromIndex: number, toIndex: number, reason: string) => void
): Promise<string> {
  if (modelConfig.provider !== "google") {
    throw new Error(`Unsupported provider: "${modelConfig.provider}". Only "google" (Gemini) is supported.`);
  }

  const totalKeys = keyManager.getTotalKeys();
  if (totalKeys === 0) {
    throw new Error(
      "No Gemini API keys configured. Add GEMINI_API_KEY_1 through GEMINI_API_KEY_5 to .env.local"
    );
  }

  for (let attempt = 0; attempt < totalKeys; attempt++) {
    const keyInfo = keyManager.getAvailableKey();
    if (!keyInfo) {
      throw new AIRateLimitError(
        `All Gemini API keys are currently rate-limited for model ${modelConfig.id}.`,
        "google"
      );
    }

    try {
      return await callGoogleGemini(modelConfig, prompt, keyInfo.key);
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);

      // Timeout: NOT a key failure — key might work for a lighter model.
      // Propagate immediately so the fallback chain can try the next model.
      if (err instanceof AITimeoutError) {
        console.warn(`[Provider] ${modelConfig.name} timeout on key ${keyInfo.index}. Trying next model.`);
        throw err;
      }

      // 404 / model not found: NOT a key failure — skip this model entirely
      if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
        console.warn(`[Provider] ${modelConfig.name} model not found (404). Trying next model.`);
        throw err;
      }

      // Key-specific failures: quota, rate-limit, server errors
      const isKeyFailure =
        msg.includes("429") ||
        msg.toLowerCase().includes("quota") ||
        msg.toLowerCase().includes("resource exhausted") ||
        msg.includes("503") ||
        msg.includes("500") ||
        msg.includes("502") ||
        msg.includes("504") ||
        msg.toLowerCase().includes("overloaded") ||
        err instanceof AIRateLimitError;

      if (isKeyFailure) {
        keyManager.markKeyFailed(keyInfo.index, msg);
        const next = keyManager.getAvailableKey();
        if (onKeyRotate && next) onKeyRotate(keyInfo.index, next.index, msg);
        continue; // try next key for same model
      }

      // All other errors: propagate
      throw err;
    }
  }

  throw new AIRateLimitError(
    `All ${totalKeys} Gemini API keys exhausted for model ${modelConfig.id}.`,
    "google"
  );
}

// ─── Per-Key Provider Call ────────────────────────────────────────────────────
//
// FIX: No longer throws when a key is cooling/unavailable.
// Instead returns null so the fallback matrix can continue to the next key.
// This prevents runWithRetry from restarting the entire matrix for unavailable keys.

export async function callModelProviderWithKey(
  modelConfig: ModelConfig,
  prompt: string,
  keyIndex: number
): Promise<string | null> {
  if (modelConfig.provider !== "google") {
    throw new Error(`Unsupported provider: "${modelConfig.provider}". Only "google" (Gemini) is supported.`);
  }

  // FIX: If the key is not available (cooling/quota-exceeded), return null to skip.
  // Do NOT throw — throwing causes the outer runWithRetry to restart the whole matrix.
  if (!keyManager.isKeyAvailable(keyIndex)) {
    const state = keyManager.getKeyState(keyIndex);
    console.warn(
      `[Provider] Skipping key ${keyIndex} (${state?.status ?? "unknown"}). Model: ${modelConfig.name}`
    );
    return null; // Signal to caller: skip this key, try the next one
  }

  const keyInfo = keyManager.getKeyByIndex(keyIndex);
  if (!keyInfo) {
    console.warn(`[Provider] Key at index ${keyIndex} does not exist.`);
    return null;
  }

  try {
    return await callGoogleGemini(modelConfig, prompt, keyInfo.key);
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);

    // Timeout: NOT a key failure — key might work for a lighter model.
    // Return null to let the matrix continue to the next model for this key.
    if (err instanceof AITimeoutError) {
      console.warn(`[Provider] ${modelConfig.name} timeout on key ${keyIndex}. Continuing...`);
      return null;
    }

    // 404 / model not found: NOT a key failure — skip this model but keep the key
    if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
      console.warn(`[Provider] ${modelConfig.name} model not found (404) for key ${keyIndex}. Skipping model.`);
      return null;
    }

    // Key-specific failures: quota, rate-limit, server errors
    const isKeyFailure =
      msg.includes("429") ||
      msg.toLowerCase().includes("quota") ||
      msg.toLowerCase().includes("resource exhausted") ||
      msg.includes("503") ||
      msg.includes("500") ||
      msg.includes("502") ||
      msg.includes("504") ||
      msg.toLowerCase().includes("overloaded") ||
      err instanceof AIRateLimitError;

    if (isKeyFailure) {
      keyManager.markKeyFailed(keyIndex, msg);
      console.warn(`[Provider] Key ${keyIndex} marked failed for model ${modelConfig.name}: ${msg}`);
      return null; // FIX: return null instead of re-throwing
    }

    // For unexpected errors, log and return null to keep the pipeline alive
    console.error(`[Provider] Unexpected error on key ${keyIndex}, model ${modelConfig.name}: ${msg}`);
    return null;
  }
}
