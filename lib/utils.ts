import type { NormalizedSource } from "./types";

// ─── URL Canonicalization ──────────────────────────────────────────────────────

/**
 * Returns a canonical version of a URL for deduplication purposes.
 * - Lowercases hostname
 * - Removes trailing slash from pathname
 * - Removes common UTM query params
 */
export function canonicalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);

    // Lowercase hostname
    url.hostname = url.hostname.toLowerCase();

    // Remove trailing slash from pathname (but keep root "/")
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }

    // Remove UTM parameters and other tracking params
    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
      "ref",
      "source",
    ];
    trackingParams.forEach((p) => url.searchParams.delete(p));

    // Remove fragment
    url.hash = "";

    return url.toString();
  } catch {
    // If URL is malformed, return as-is lowercased
    return rawUrl.toLowerCase();
  }
}

// ─── Source Deduplication ─────────────────────────────────────────────────────

/**
 * Deduplicates sources by canonical URL and assigns sequential IDs.
 * Keeps the entry with more content when duplicates exist.
 */
export function deduplicateSources(
  sources: Omit<NormalizedSource, "id">[]
): NormalizedSource[] {
  const seen = new Map<string, Omit<NormalizedSource, "id">>();

  for (const source of sources) {
    const key = canonicalizeUrl(source.url);
    const existing = seen.get(key);
    if (!existing || source.content.length > existing.content.length) {
      seen.set(key, source);
    }
  }

  return Array.from(seen.values()).map((source, index) => ({
    ...source,
    id: `S${index + 1}`,
  }));
}

// ─── Citation Helpers ─────────────────────────────────────────────────────────

/**
 * Converts a source ID like "S3" to a display number like 3.
 */
export function sourceIdToNumber(sourceId: string): number {
  const match = sourceId.match(/^S(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

// ─── Safe Text ────────────────────────────────────────────────────────────────

/**
 * Returns the value or "Not publicly available" if null/undefined/empty.
 */
export function displayValue(value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim() === "") {
    return "Not publicly available";
  }
  return value;
}

/**
 * Checks if a value is effectively empty.
 */
export function isEmpty(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === "";
}

// ─── JSON Extraction ──────────────────────────────────────────────────────────

/**
 * Attempts to extract a JSON object from a string that may contain
 * surrounding markdown code fences or other noise.
 */
export function extractJson(raw: string): string {
  // Try to strip markdown code fence ```json ... ```
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  // Try to extract the first { ... } block
  const braceStart = raw.indexOf("{");
  const braceEnd = raw.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd !== -1 && braceEnd > braceStart) {
    return raw.slice(braceStart, braceEnd + 1);
  }

  return raw.trim();
}
