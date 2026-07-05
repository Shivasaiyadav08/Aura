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

  // Per-(key, model) quota tracking.
  // Key: `${keyIndex}:${modelId}`, Value: timestamp when this combo recovers
  private modelQuotaCooldowns = new Map<string, number>();

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

  /** Check if a specific (key, model) combination is currently in quota cooldown */
  public isModelCooling(keyIndex: number, modelId: string): boolean {
    const mapKey = `${keyIndex}:${modelId}`;
    const until = this.modelQuotaCooldowns.get(mapKey);
    if (!until) return false;
    if (Date.now() >= until) {
      this.modelQuotaCooldowns.delete(mapKey);
      return false;
    }
    return true;
  }

  /** Mark a specific (key, model) combination as quota-exceeded */
  public markModelFailed(keyIndex: number, modelId: string, cooldownMs: number): void {
    const mapKey = `${keyIndex}:${modelId}`;
    this.modelQuotaCooldowns.set(mapKey, Date.now() + cooldownMs);
    // Also increment overall key fail count for monitoring
    if (keyIndex >= 0 && keyIndex < this.states.length) {
      this.states[keyIndex].failCount++;
      this.states[keyIndex].lastError = `quota-exceeded for model ${modelId}`;
    }
    console.warn(`[KeyManager] Key ${keyIndex} + model ${modelId} → quota cooldown ${Math.round(cooldownMs / 1000)}s`);
  }

  /** Get minimum cooldown (ms) across ALL (key, model) combinations */
  public getMinModelCooldownMs(): number {
    const now = Date.now();
    let min = Infinity;
    Array.from(this.modelQuotaCooldowns.values()).forEach(until => {
      const remaining = until - now;
      if (remaining > 0 && remaining < min) min = remaining;
    });
    return min === Infinity ? 0 : min;
  }

  /** Returns true if there is at least one (key, model) combination not in cooldown */
  public hasAnyAvailable(modelIds: string[]): boolean {
    for (let k = 0; k < this.keys.length; k++) {
      for (const modelId of modelIds) {
        if (!this.isModelCooling(k, modelId)) return true;
      }
    }
    return false;
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
        s.failCount = 0;
      }
    }
  }

  /** Get the next available key (round-robin, skipping disabled keys) */
  public getAvailableKey(): { key: string; index: number } | null {
    this.refreshStatuses();
    for (let i = 0; i < this.keys.length; i++) {
      const idx = (this.roundRobinIndex + i) % this.keys.length;
      if (this.states[idx].status !== "disabled") {
        this.roundRobinIndex = (idx + 1) % this.keys.length;
        return { key: this.keys[idx], index: idx };
      }
    }
    return null;
  }

  /** Mark a key as globally failed (for non-quota errors like 500, 503) */
  public markKeyFailed(index: number, errorMsg: string): void {
    if (index < 0 || index >= this.states.length) return;
    const s = this.states[index];
    s.failCount++;
    s.lastError = errorMsg;

    const lower = errorMsg.toLowerCase();
    const isServer =
      errorMsg.includes("503") || errorMsg.includes("500") ||
      errorMsg.includes("502") || errorMsg.includes("504") ||
      lower.includes("overloaded") || lower.includes("unavailable");

    if (isServer) {
      s.status = "cooling";
      s.cooldownUntil = Date.now() + 10_000; // 10s for server errors
    } else {
      s.status = "rate-limited";
      s.cooldownUntil = Date.now() + 15_000; // 15s for rate limits
    }

    const remaining = s.cooldownUntil ? Math.round((s.cooldownUntil - Date.now()) / 1000) : 0;
    console.warn(`[KeyManager] Key ${index} → ${s.status} (${remaining}s)`);
  }

  public getKeyByIndex(index: number): { key: string; index: number } | null {
    if (index >= 0 && index < this.keys.length) {
      return { key: this.keys[index], index };
    }
    return null;
  }

  public getKeyState(index: number): KeyState | null {
    this.refreshStatuses();
    if (index >= 0 && index < this.states.length) {
      return { ...this.states[index] };
    }
    return null;
  }

  public isKeyAvailable(index: number): boolean {
    this.refreshStatuses();
    if (index < 0 || index >= this.states.length) return false;
    return this.states[index].status !== "disabled";
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

async function callGoogleGemini(
  modelConfig: ModelConfig,
  prompt: string,
  apiKey: string
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), modelConfig.timeoutMs);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelConfig.id,
      generationConfig: {
        temperature: modelConfig.temperature,
        responseMimeType: "text/plain",
      },
    });

    const result = await model.generateContent(prompt, {
      signal: controller.signal,
    } as any);

    const text = result.response.text();
    if (!text?.trim()) {
      throw new Error("Empty response from Gemini model");
    }
    return text;
  } catch (err: any) {
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

// ─── Per-Key Provider Call ────────────────────────────────────────────────────
//
// CRITICAL FIX: Key failure state is now tracked per (key, model) pair.
//
// Previously: one model's quota failure blocked ALL other models on that key.
// Now: key-0 quota-exceeded for gemini-2.5-pro does NOT block key-0 from
// being tried with gemini-2.5-flash (separate quota bucket on Google's side).
//
// Returns null (never throws) so the fallback matrix continues cleanly.

export async function callModelProviderWithKey(
  modelConfig: ModelConfig,
  prompt: string,
  keyIndex: number
): Promise<string | null> {
  if (modelConfig.provider !== "google") {
    throw new Error(`Unsupported provider: "${modelConfig.provider}". Only "google" is supported.`);
  }

  // Only skip if this exact (key, model) combination is in quota cooldown
  if (keyManager.isModelCooling(keyIndex, modelConfig.id)) {
    return null; // This specific key+model combo is cooling — skip
  }

  const keyInfo = keyManager.getKeyByIndex(keyIndex);
  if (!keyInfo) {
    return null;
  }

  try {
    const text = await callGoogleGemini(modelConfig, prompt, keyInfo.key);
    return text;
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);

    // Timeout: not a quota failure, not a key failure.
    // Return null so the matrix tries the next model/key without penalizing this combo.
    if (err instanceof AITimeoutError) {
      console.warn(`[Provider] Timeout — Key ${keyIndex}, Model: ${modelConfig.name}`);
      return null;
    }

    // 404 / model not found: skip this model (not a key failure)
    if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
      console.warn(`[Provider] Model not found — Key ${keyIndex}, Model: ${modelConfig.name}`);
      return null;
    }

    const lower = msg.toLowerCase();

    // Quota / rate-limit: mark ONLY this (key, model) pair as cooling.
    // Other models on this key may still have quota available.
    const isQuota =
      msg.includes("429") ||
      lower.includes("quota") ||
      lower.includes("resource exhausted") ||
      lower.includes("rate limit") ||
      lower.includes("too many requests");

    if (isQuota) {
      // 62s cooldown — Gemini free tier resets per minute
      keyManager.markModelFailed(keyIndex, modelConfig.id, 62_000);
      return null;
    }

    // Server errors (500, 502, 503, 504, overloaded): mark the whole key briefly
    const isServer =
      msg.includes("503") || msg.includes("500") ||
      msg.includes("502") || msg.includes("504") ||
      lower.includes("overloaded") || lower.includes("unavailable");

    if (isServer) {
      keyManager.markKeyFailed(keyIndex, msg);
      return null;
    }

    // Any other error: log and skip
    console.error(`[Provider] Unexpected error — Key ${keyIndex}, Model: ${modelConfig.name}: ${msg}`);
    return null;
  }
}

// ─── Unified Provider Call (used by image resolver) ──────────────────────────

export async function callModelProvider(
  modelConfig: ModelConfig,
  prompt: string,
  onKeyRotate?: (fromIndex: number, toIndex: number, reason: string) => void
): Promise<string> {
  if (modelConfig.provider !== "google") {
    throw new Error(`Unsupported provider: "${modelConfig.provider}". Only "google" is supported.`);
  }

  const totalKeys = keyManager.getTotalKeys();
  if (totalKeys === 0) {
    throw new Error("No Gemini API keys configured.");
  }

  for (let attempt = 0; attempt < totalKeys; attempt++) {
    const keyInfo = keyManager.getAvailableKey();
    if (!keyInfo) {
      throw new AIRateLimitError(`All Gemini API keys are exhausted for model ${modelConfig.id}.`, "google");
    }

    // Skip if this (key, model) is cooling
    if (keyManager.isModelCooling(keyInfo.index, modelConfig.id)) {
      continue;
    }

    try {
      return await callGoogleGemini(modelConfig, prompt, keyInfo.key);
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);

      if (err instanceof AITimeoutError) throw err;
      if (msg.includes("404") || msg.toLowerCase().includes("not found")) throw err;

      const lower = msg.toLowerCase();
      const isQuota = msg.includes("429") || lower.includes("quota") || lower.includes("resource exhausted");

      if (isQuota) {
        keyManager.markModelFailed(keyInfo.index, modelConfig.id, 62_000);
        const next = keyManager.getAvailableKey();
        if (onKeyRotate && next) onKeyRotate(keyInfo.index, next.index, msg);
        continue;
      }

      keyManager.markKeyFailed(keyInfo.index, msg);
      continue;
    }
  }

  throw new AIRateLimitError(`All ${totalKeys} keys exhausted for model ${modelConfig.id}.`, "google");
}
