// ─── Provider Types ───────────────────────────────────────────────────────────

export type ProviderType = "google";

export interface ModelConfig {
  id: string;
  name: string;
  provider: ProviderType;
  temperature: number;
  timeoutMs: number;
  disableThinking?: boolean; // Set true for 2.5-flash to avoid long thinking delays
}

// ─── Gemini Model Registry ────────────────────────────────────────────────────
//
// ORDERING RATIONALE (from logs):
// - gemini-2.5-pro:   quota-exceeded instantly (5 × ~1s = fast) ← START HERE for quality
// - gemini-2.5-flash: TIMES OUT at 22s × 5 keys = 110s (blocks entire budget!) ← must reduce timeout and disable thinking
// - gemini-2.0-flash: quota-exceeded instantly (works, just over limit)
// - gemini-2.0-flash-lite: quota-exceeded instantly (highest free RPM: 30)
// - gemini-1.5-flash: 404 MODEL NOT FOUND (deprecated — use gemini-1.5-flash-latest)
//
// NEW CHAIN ORDER: fast/reliable models first so quota-exceeded ones
// are skipped in milliseconds and we reach 2.5-flash quickly with budget remaining.

export const MODELS: Record<string, ModelConfig> = {
  // Fast, high-quota models — will get quota-exceeded quickly but cheaply
  "gemini-2.0-flash-lite": {
    id: "gemini-2.0-flash-lite",
    name: "Gemini 2.0 Flash Lite",
    provider: "google",
    temperature: 0.1,
    timeoutMs: 18_000, // 18s
  },
  "gemini-2.0-flash": {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "google",
    temperature: 0.1,
    timeoutMs: 20_000, // 20s
  },
  // Fixed: gemini-1.5-flash is DEPRECATED (returns 404). Correct ID is gemini-1.5-flash-latest
  "gemini-1.5-flash-latest": {
    id: "gemini-1.5-flash-latest",
    name: "Gemini 1.5 Flash",
    provider: "google",
    temperature: 0.1,
    timeoutMs: 18_000, // 18s
  },
  // 2.5-flash with thinking DISABLED — without this it times out at 22s every time
  "gemini-2.5-flash": {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    temperature: 0.1,
    timeoutMs: 20_000, // 20s — thinking disabled so this is achievable
    disableThinking: true,
  },
  "gemini-2.5-pro": {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "google",
    temperature: 0.1,
    timeoutMs: 25_000, // 25s — last resort
    disableThinking: true,
  },
};

// ─── Fallback Chain ───────────────────────────────────────────────────────────
// FAST → SLOW. Quota-exceeded responses are instant (~200ms), so trying fast
// models first costs almost nothing and we reach thinking-disabled 2.5 models
// within our 55s budget.
export const FALLBACK_CHAIN: string[] = [
  "gemini-2.0-flash-lite",   // 30 RPM free — highest quota, fastest, 18s timeout
  "gemini-2.0-flash",        // 15 RPM free — proven stable, 20s timeout
  "gemini-1.5-flash-latest", // 15 RPM free — fixed deprecated ID, 18s timeout
  "gemini-2.5-flash",        // 10 RPM free — thinking disabled, 20s timeout
  "gemini-2.5-pro",          // 5 RPM free — best quality, last resort, 25s timeout
];
