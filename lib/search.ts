import type { NormalizedSource, TavilyResponse, TavilyResult } from "@/types";
import { deduplicateSources } from "./utils";
import { cache } from "./cache";

const TAVILY_API_URL = "https://api.tavily.com/search";
const TAVILY_TIMEOUT_MS = 10000; // Fast timeout: 10s

// ─── Query Builders ──────────────────────────────────────────────────────────

function buildTargetedSearchQueries(name: string, context: string): string[] {
  const currentYear = new Date().getFullYear();
  return [
    `${name} ${context} biography career profile`,
    `${name} ${context} education background university degree`,
    `${name} ${context} official website link`,
    `${name} ${context} site:wikipedia.org`,
    `${name} ${context} linkedin or crunchbase or github`,
    `${name} ${context} net worth earnings assets`,
    `${name} ${context} latest news articles ${currentYear}`,
    `${name} ${context} twitter x social profile`,
  ];
}

// ─── Tavily Search Implementation ─────────────────────────────────────────────

async function tavilySearch(query: string, apiKey: string): Promise<TavilyResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS);

  try {
    const response = await fetch(TAVILY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        max_results: 3, // Smaller limit per query to increase speed and decrease payload
        search_depth: "advanced",
        include_answer: false,
        include_raw_content: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      if (response.status === 401) {
        throw new Error("Invalid Tavily API key. Check TAVILY_API_KEY in .env.local.");
      }
      if (response.status === 429) {
        throw new Error("Tavily API rate limit exceeded.");
      }
      throw new Error(`Tavily error HTTP ${response.status}: ${text.slice(0, 150)}`);
    }

    const data = (await response.json()) as TavilyResponse;
    return data.results || [];
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`Tavily search timed out for query: "${query}"`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Normalize Results ────────────────────────────────────────────────────────

function normalizeResult(result: TavilyResult): Omit<NormalizedSource, "id"> | null {
  if (!result.url || !result.title) return null;
  return {
    title: result.title.trim(),
    url: result.url.trim(),
    content: (result.content || "").trim(),
    snippet: result.snippet?.trim() ?? null,
  };
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────

/**
 * Searches the web for a person in parallel, normalizes sources,
 * and caches results. If information is extremely limited, returns
 * a default fallback source rather than failing.
 */
export async function searchForPerson(name: string, context: string): Promise<NormalizedSource[]> {
  const cacheKey = `search:${name.toLowerCase().trim()}:${context.toLowerCase().trim()}`;
  
  // 1. Check cache first
  const cachedSources = await cache.get<NormalizedSource[]>(cacheKey);
  if (cachedSources) {
    console.log(`[Search Cache Hit] Found sources in cache for: ${name}`);
    return cachedSources;
  }

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("TAVILY_API_KEY is not set. Please add it to your environment.");
  }

  const queries = buildTargetedSearchQueries(name, context);

  // Run all searches in parallel
  const settled = await Promise.allSettled(queries.map((q) => tavilySearch(q, apiKey)));

  const allResults: TavilyResult[] = [];
  const errors: string[] = [];

  for (const item of settled) {
    if (item.status === "fulfilled") {
      allResults.push(...item.value);
    } else {
      errors.push(item.reason?.message || String(item.reason));
    }
  }

  // If everything failed, throw the first error
  if (allResults.length === 0) {
    throw new Error(`Web search failed: ${errors[0] || "No search results returned."}`);
  }

  // Normalize
  const normalized = allResults
    .map(normalizeResult)
    .filter((r): r is Omit<NormalizedSource, "id"> => r !== null);

  // Deduplicate
  const deduplicated = deduplicateSources(normalized);

  // Sort by length and take the top 12 richest sources
  const sorted = deduplicated
    .sort((a, b) => b.content.length - a.content.length)
    .slice(0, 12);

  // If information is limited (fewer than 2 sources or content is tiny), append a friendly notice
  if (sorted.length === 0) {
    const limitedSource: NormalizedSource = {
      id: "S1",
      title: "Limited verified public information available",
      url: "https://limited-information-available.org",
      content: `Limited verified public information is available for "${name}" (${context}). Some individuals maintain a low public profile, have restricted social footprints, or have names common with other individuals.`,
      snippet: "No verified public profiles, publications, or articles were found for this query.",
    };
    await cache.set(cacheKey, [limitedSource]);
    return [limitedSource];
  }

  // Save to Cache
  await cache.set(cacheKey, sorted);

  return sorted;
}
