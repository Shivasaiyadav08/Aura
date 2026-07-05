// ─── Provider Types ───────────────────────────────────────────────────────────

export type ProviderType = "google";

export interface ModelConfig {
  id: string;
  name: string;
  provider: ProviderType;
  temperature: number;
  timeoutMs: number;
}

// ─── Gemini Model Registry ────────────────────────────────────────────────────
// Timeouts are kept SHORT so the 60s Vercel function budget isn't blown
// by a single hanging request. The fallback chain handles quality degradation.

export const MODELS: Record<string, ModelConfig> = {
  "gemini-2.5-pro": {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "google",
    temperature: 0.1,
    timeoutMs: 25_000, // 25s
  },
  "gemini-2.5-flash": {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    temperature: 0.1,
    timeoutMs: 22_000, // 22s
  },
  "gemini-2.0-flash": {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "google",
    temperature: 0.1,
    timeoutMs: 20_000, // 20s
  },
  "gemini-2.0-flash-lite": {
    id: "gemini-2.0-flash-lite",
    name: "Gemini 2.0 Flash Lite",
    provider: "google",
    temperature: 0.1,
    timeoutMs: 15_000, // 15s
  },
  "gemini-1.5-flash": {
    id: "gemini-1.5-flash",
    name: "Gemini 1.5 Flash",
    provider: "google",
    temperature: 0.1,
    timeoutMs: 15_000, // 15s — most stable, broadest availability
  },
};

// ─── Fallback Chain ───────────────────────────────────────────────────────────
// Strategy: best quality → most reliable.
// The orchestrator iterates MODEL first, then KEY — so we exhaust all keys
// on the best model before falling to the next model tier.
export const FALLBACK_CHAIN: string[] = [
  "gemini-2.5-pro",        // Primary — most capable reasoning model
  "gemini-2.5-flash",      // Secondary
  "gemini-2.0-flash",      // Tertiary — proven stable
  "gemini-2.0-flash-lite", // Quaternary
  "gemini-1.5-flash",      // Final — maximum availability
];
