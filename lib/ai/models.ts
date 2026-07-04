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
// Only verified working model IDs. Timeouts are generous to avoid burning
// quota on cancelled requests (timed-out requests still consume API quota).

export const MODELS: Record<string, ModelConfig> = {
  "gemini-2.5-flash": {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    temperature: 0.1,
    timeoutMs: 90_000, // 90s — 2.5-flash needs time to think
  },
  "gemini-2.0-flash": {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "google",
    temperature: 0.1,
    timeoutMs: 60_000, // 60s
  },
  "gemini-2.0-flash-lite": {
    id: "gemini-2.0-flash-lite",
    name: "Gemini 2.0 Flash Lite",
    provider: "google",
    temperature: 0.1,
    timeoutMs: 45_000, // 45s — lighter model, faster
  },
  "gemini-1.5-flash": {
    id: "gemini-1.5-flash",
    name: "Gemini 1.5 Flash",
    provider: "google",
    temperature: 0.1,
    timeoutMs: 60_000, // 60s — most stable, broadest availability
  },
};

// ─── Fallback Chain ───────────────────────────────────────────────────────────
// Strategy: best quality → most reliable
// Each model is tried with ALL available API keys before moving to next.
// 4 keys × 4 models = up to 16 total attempts.

export const FALLBACK_CHAIN: string[] = [
  "gemini-2.5-flash",      // Primary — most capable
  "gemini-2.0-flash",      // Secondary — proven stable
  "gemini-2.0-flash-lite", // Tertiary — lighter, different quota pool
  "gemini-1.5-flash",      // Final — maximum availability
];
