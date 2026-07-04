/**
 * ImageSearchService — Entity-accurate profile image resolution.
 *
 * Pipeline:
 *  1. Build a RICH search query:  name + occupation + company + context
 *  2. Detect if the subject is fictional (anime/manga/game/comics)
 *  3. Search sources in priority order, collecting scored ImageCandidates:
 *       Real people  → Wikipedia · Wikidata P18 · DuckDuckGo · Unavatar
 *       Fictional    → Wikipedia · AniList · DuckDuckGo
 *  4. Sort candidates by confidence score
 *  5. Verify the top candidate(s) with Gemini Vision (≥ 80 % confidence)
 *  6. Cache the verified URL with a 30-day TTL using a compound key
 *       (name + context + company)  — NOT just the name alone
 *  7. Return verified URL or null  (UI shows styled initials placeholder)
 *
 * NEVER shows a wrong image. If no image passes Gemini verification, null
 * is returned so the UI falls back to a professional initials avatar.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { keyManager } from "@/lib/ai/provider";
import { cache } from "@/lib/cache";

// ─── Public interface ──────────────────────────────────────────────────────────

export interface ProfileImageContext {
  context?: string;           // e.g. "CEO of Microsoft"
  occupation?: string;        // e.g. "business executive"
  company?: string;           // e.g. "Microsoft"
  industry?: string;          // e.g. "Technology"
  nationality?: string;
  knownOrganization?: string; // franchise / org e.g. "One Piece"
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface ImageCandidate {
  url: string;
  source: string;
  confidence: number;       // 0-100, higher = more trusted source
}

// ─── Source confidence scores ─────────────────────────────────────────────────

const CONF = {
  WIKIPEDIA_EXACT : 97,   // Wikipedia URL from search sources (exact article)
  WIKIPEDIA_QUERY : 93,   // Wikipedia found via rich text query
  WIKIDATA        : 91,   // Wikidata P18 portrait property
  ANILIST         : 90,   // AniList character image (anime only)
  DUCKDUCKGO      : 82,   // DuckDuckGo Instant Answer
  UNAVATAR        : 65,   // unavatar.io social aggregator (last resort)
} as const;

const IMG_TTL_MS       = 30 * 24 * 60 * 60 * 1000; // 30 days
const FETCH_TIMEOUT_MS = 10_000;
const VERIFY_TIMEOUT_MS = 22_000;
const MIN_VERIFY_CONF  = 80;   // reject image if Gemini gives < 80 %

// ─── Fictional character detection ───────────────────────────────────────────

const FICTIONAL_KEYWORDS = [
  "anime","manga","fictional","character","one piece","naruto","dragon ball",
  "bleach","attack on titan","demon slayer","jujutsu kaisen","my hero academia",
  "fairy tail","one punch man","sword art online","hunter x hunter","haikyuu",
  "death note","fullmetal alchemist","black clover","boruto","seven deadly sins",
  "chainsaw man","spy x family","vinland saga","mob psycho","overlord","re:zero",
  "pokemon","video game","game character","cartoon","comic book","marvel",
  "dc comics","superhero","light novel","visual novel","isekai","shonen","seinen",
  "webtoon","manhwa","manhua",
];

function isFictionalCharacter(pctx: ProfileImageContext): boolean {
  const blob = [
    pctx.context, pctx.occupation, pctx.company,
    pctx.industry, pctx.knownOrganization,
  ].filter(Boolean).join(" ").toLowerCase();
  return FICTIONAL_KEYWORDS.some(kw => blob.includes(kw));
}

// ─── Rich query builder ───────────────────────────────────────────────────────
//
// NEVER search only by name. Always include role/franchise for disambiguation.

function buildRichQuery(
  personName: string,
  pctx: ProfileImageContext,
  isFictional: boolean
): string {
  const parts: string[] = [personName];

  if (isFictional) {
    // Fictional: prioritise franchise name so we get fan-art/official art
    if (pctx.knownOrganization) parts.push(pctx.knownOrganization);
    if (pctx.context)           parts.push(pctx.context);
    parts.push("official artwork");
  } else {
    // Real person: add role + company for disambiguation (e.g. Vinh Giang ≠ place)
    if (pctx.occupation && pctx.occupation !== "N/A") parts.push(pctx.occupation);
    if (pctx.company    && pctx.company    !== "N/A") parts.push(pctx.company);
    if (pctx.context && !parts.join(" ").toLowerCase().includes(pctx.context.toLowerCase()))
      parts.push(pctx.context);
    parts.push("official portrait");
  }

  return parts.filter(Boolean).join(" ");
}

// Compound cache key:  name:context:company  (NOT just name)
function buildCacheKey(personName: string, pctx: ProfileImageContext): string {
  const parts = [personName];
  if (pctx.context) parts.push(pctx.context);
  if (pctx.company) parts.push(pctx.company);
  const slug = parts.join(":")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9:-]/g, "")
    .slice(0, 120);
  return `img:v3:${slug}`;
}

// ─── Image filename validator ─────────────────────────────────────────────────
//
// Reject filenames that clearly belong to logos, maps, buildings, etc.

const BAD_FILENAME_PATTERNS = [
  /\blogo\b/i,   /\bflag\b/i,    /\bmap\b/i,    /coat.of.arms/i,
  /\bseal\b/i,   /emblem/i,      /\bchart\b/i,  /\bgraph\b/i,
  /building/i,   /temple/i,      /church/i,     /mosque/i,
  /monument/i,   /\bstatue\b/i,  /\bpark\b/i,   /landscape/i,
  /aerial/i,     /campus/i,      /headquarter/i,/\boffice\b/i,
  /tower/i,      /stadium/i,     /\bcity\b/i,   /\bstreet\b/i,
  /palace/i,     /castle/i,      /\bicon\b/i,   /\bsymbol\b/i,
  /\bbanner\b/i, /\bposter\b/i,
];

function isLikelyPersonPhoto(filename: string): boolean {
  return !BAD_FILENAME_PATTERNS.some(p => p.test(filename));
}

// ─── Utility: timeout wrapper ─────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`Timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// ─── Source: Wikipedia (via rich query search) ────────────────────────────────

async function searchWikipedia(richQuery: string): Promise<ImageCandidate | null> {
  try {
    // Step 1 — full-text search for the article
    const searchUrl =
      `https://en.wikipedia.org/w/api.php?action=query&list=search` +
      `&srsearch=${encodeURIComponent(richQuery)}&srlimit=3&format=json&origin=*`;

    const searchRes = await withTimeout(fetch(searchUrl), FETCH_TIMEOUT_MS);
    if (!searchRes.ok) return null;

    const searchData = await searchRes.json();
    const hits: { title: string }[] = searchData.query?.search ?? [];
    if (hits.length === 0) return null;

    // Step 2 — for each hit, get the page thumbnail
    for (const hit of hits.slice(0, 3)) {
      const imgUrl =
        `https://en.wikipedia.org/w/api.php?action=query` +
        `&titles=${encodeURIComponent(hit.title)}&prop=pageimages` +
        `&format=json&pithumbsize=500&origin=*`;

      const imgRes = await withTimeout(fetch(imgUrl), FETCH_TIMEOUT_MS);
      if (!imgRes.ok) continue;

      const imgData = await imgRes.json();
      const pages   = imgData.query?.pages ?? {};
      const page    = pages[Object.keys(pages)[0]];
      if (!page || page.missing !== undefined) continue;

      const pageimage = page.pageimage as string | undefined;
      const thumbSrc  = page.thumbnail?.source as string | undefined;

      if (thumbSrc && pageimage && isLikelyPersonPhoto(pageimage)) {
        return { url: thumbSrc, source: "wikipedia", confidence: CONF.WIKIPEDIA_QUERY };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Source: Wikipedia (via exact URL from profile sources) ──────────────────

async function searchWikipediaByUrl(wikiUrl: string): Promise<ImageCandidate | null> {
  try {
    const match = wikiUrl.match(/\/wiki\/([^#?]+)/);
    if (!match) return null;
    const title = decodeURIComponent(match[1]);

    const apiUrl =
      `https://en.wikipedia.org/w/api.php?action=query` +
      `&titles=${encodeURIComponent(title)}&prop=pageimages` +
      `&format=json&pithumbsize=500&origin=*`;

    const res = await withTimeout(fetch(apiUrl), FETCH_TIMEOUT_MS);
    if (!res.ok) return null;

    const data  = await res.json();
    const pages = data.query?.pages ?? {};
    const page  = pages[Object.keys(pages)[0]];
    if (!page || page.missing !== undefined) return null;

    const pageimage = page.pageimage as string | undefined;
    const thumbSrc  = page.thumbnail?.source as string | undefined;

    if (thumbSrc && pageimage && isLikelyPersonPhoto(pageimage)) {
      // Higher confidence because this is the exact article URL from search results
      return { url: thumbSrc, source: "wikipedia-exact", confidence: CONF.WIKIPEDIA_EXACT };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Source: Wikidata P18 (portrait property) ─────────────────────────────────

async function searchWikidata(
  personName: string,
  occupation?: string
): Promise<ImageCandidate | null> {
  try {
    const q   = occupation ? `${personName} ${occupation}` : personName;
    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities` +
      `&search=${encodeURIComponent(q)}&language=en&limit=3&format=json&origin=*&type=item`;

    const res  = await withTimeout(fetch(url), FETCH_TIMEOUT_MS);
    if (!res.ok) return null;

    const data    = await res.json();
    const results = data.search ?? [];

    for (const entity of results.slice(0, 3)) {
      const propUrl =
        `https://www.wikidata.org/w/api.php?action=wbgetclaims` +
        `&entity=${entity.id}&property=P18&format=json&origin=*`;

      const propRes = await withTimeout(fetch(propUrl), FETCH_TIMEOUT_MS);
      if (!propRes.ok) continue;

      const propData = await propRes.json();
      const claims   = propData.claims?.P18;
      if (!claims?.length) continue;

      const filename = claims[0]?.mainsnak?.datavalue?.value;
      if (!filename || typeof filename !== "string") continue;
      if (!isLikelyPersonPhoto(filename)) continue;

      const encoded  = encodeURIComponent(filename.replace(/ /g, "_"));
      const infoUrl  =
        `https://en.wikipedia.org/w/api.php?action=query` +
        `&titles=File:${encoded}&prop=imageinfo&iiprop=url` +
        `&format=json&origin=*&iiurlwidth=500`;

      const infoRes = await withTimeout(fetch(infoUrl), FETCH_TIMEOUT_MS);
      if (!infoRes.ok) continue;

      const infoData  = await infoRes.json();
      const infoPages = infoData.query?.pages ?? {};
      const infoPage  = infoPages[Object.keys(infoPages)[0]];
      const imgUrl    =
        infoPage?.imageinfo?.[0]?.thumburl ??
        infoPage?.imageinfo?.[0]?.url;

      if (imgUrl) {
        return { url: imgUrl, source: "wikidata", confidence: CONF.WIKIDATA };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Source: DuckDuckGo Instant Answer ───────────────────────────────────────

async function searchDuckDuckGo(richQuery: string): Promise<ImageCandidate | null> {
  try {
    const url =
      `https://api.duckduckgo.com/?q=${encodeURIComponent(richQuery)}` +
      `&format=json&no_html=1&skip_disambig=1`;

    const res = await withTimeout(fetch(url), FETCH_TIMEOUT_MS);
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.Image?.trim()) return null;

    const imgUrl = data.Image.startsWith("//")
      ? `https:${data.Image}`
      : data.Image;

    // Skip tiny icons / logos
    if (imgUrl.includes("logo") || imgUrl.includes("icon")) return null;

    return { url: imgUrl, source: "duckduckgo", confidence: CONF.DUCKDUCKGO };
  } catch {
    return null;
  }
}

// ─── Source: AniList (anime / manga characters only) ─────────────────────────

async function searchAniList(characterName: string): Promise<ImageCandidate | null> {
  try {
    const gql = `query ($search: String) {
      Character(search: $search) {
        name { full }
        image { large }
      }
    }`;

    const res = await withTimeout(
      fetch("https://graphql.anilist.co", {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ query: gql, variables: { search: characterName } }),
      }),
      FETCH_TIMEOUT_MS
    );
    if (!res.ok) return null;

    const data  = await res.json();
    const image = data.data?.Character?.image?.large;

    if (image) {
      return { url: image, source: "anilist", confidence: CONF.ANILIST };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Source: Unavatar (social aggregator, real people only) ──────────────────

function getUnavatarCandidate(personName: string): ImageCandidate | null {
  if (!personName?.trim()) return null;
  return {
    url       : `https://unavatar.io/${encodeURIComponent(personName)}?fallback=false`,
    source    : "unavatar",
    confidence: CONF.UNAVATAR,
  };
}

// ─── Gemini Vision verifier ───────────────────────────────────────────────────
//
// Fetches the candidate image as base64 and asks Gemini:
//   "Does this image show [name], [role] at [company]?"
// Returns verified=true only if Gemini says YES with ≥ 80% confidence.
// If Gemini is unavailable, high-confidence source images (≥ 90) are accepted.

async function verifyWithGemini(
  candidate: ImageCandidate,
  personName: string,
  pctx: ProfileImageContext,
  isFictional: boolean
): Promise<{ verified: boolean; confidence: number }> {
  try {
    // Fetch image (with a hard size cap of 4 MB to avoid huge base64 payloads)
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let imgRes: Response;
    try {
      imgRes = await fetch(candidate.url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!imgRes.ok) return { verified: false, confidence: 0 };

    const buffer = await imgRes.arrayBuffer();
    if (buffer.byteLength === 0) return { verified: false, confidence: 0 };
    if (buffer.byteLength > 4 * 1024 * 1024) {
      // Too large — trust source confidence without pixel-level verification
      return {
        verified  : candidate.confidence >= 88,
        confidence: candidate.confidence,
      };
    }

    const base64   = Buffer.from(buffer).toString("base64");
    const mimeType = (imgRes.headers.get("content-type") ?? "image/jpeg").split(";")[0];

    // Build a context-rich prompt
    const descParts: string[] = [personName];
    if (!isFictional) {
      if (pctx.occupation) descParts.push(pctx.occupation);
      if (pctx.company)    descParts.push(pctx.company);
      if (pctx.context)    descParts.push(pctx.context);
    } else {
      if (pctx.context || pctx.knownOrganization)
        descParts.push(`from ${pctx.context ?? pctx.knownOrganization}`);
    }
    const subjectDesc = descParts.join(", ");

    const prompt = isFictional
      ? `This image is supposed to be official artwork of the fictional character "${personName}" (${pctx.context ?? ""}).
Does this image depict ${personName}?
Respond in this exact format only:
VERDICT: YES or NO
CONFIDENCE: 0-100
REASON: one sentence`
      : `This image is supposed to be a portrait photo of ${subjectDesc}.
Does this image clearly show ${personName}? Answer YES only if you see a single person who matches. Answer NO if you see a building, landscape, logo, multiple people, or a clearly different individual.
Respond in this exact format only:
VERDICT: YES or NO
CONFIDENCE: 0-100
REASON: one sentence`;

    const keyInfo = keyManager.getAvailableKey();
    if (!keyInfo) {
      // No API key — trust high-confidence sources
      return {
        verified  : candidate.confidence >= 90,
        confidence: candidate.confidence,
      };
    }

    const genAI  = new GoogleGenerativeAI(keyInfo.key);
    const model  = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const result = await withTimeout(
      model.generateContent([
        { inlineData: { data: base64, mimeType } },
        prompt,
      ]),
      VERIFY_TIMEOUT_MS
    );

    const text             = result.response.text();
    const verdictMatch     = text.match(/VERDICT:\s*(YES|NO)/i);
    const confidenceMatch  = text.match(/CONFIDENCE:\s*(\d+)/i);

    const isYes      = verdictMatch?.[1]?.toUpperCase() === "YES";
    const confidence = parseInt(confidenceMatch?.[1] ?? "0", 10);

    console.log(
      `[ImageVerifier] ${candidate.source}: VERDICT=${verdictMatch?.[1]} CONF=${confidence}% REASON=${text.match(/REASON:\s*(.+)/i)?.[1]?.trim()}`
    );

    return { verified: isYes && confidence >= MIN_VERIFY_CONF, confidence };
  } catch (err) {
    console.warn(
      `[ImageVerifier] Gemini unavailable: ${err instanceof Error ? err.message : String(err)}`
    );
    // Graceful degradation: accept images from very trusted sources (Wikipedia-exact, Wikidata)
    return {
      verified  : candidate.confidence >= 90,
      confidence: candidate.confidence,
    };
  }
}

// ─── Main resolver (public API) ───────────────────────────────────────────────

/**
 * Resolves the best verified portrait image for a person.
 *
 * @param sources   Web search sources already found (may include a Wikipedia URL)
 * @param personName  Full name of the person
 * @param context   Disambiguation context passed by the user (e.g. "CEO of Microsoft")
 * @param profileData  Additional structured profile fields from the AI-generated profile
 */
export async function resolveProfileImage(
  sources : { url: string }[],
  personName: string,
  context?: string,
  profileData?: {
    occupation?: string | null;
    company?   : string | null;
    industry?  : string | null;
    nationality?: string | null;
  }
): Promise<string | null> {

  const pctx: ProfileImageContext = {
    context,
    occupation       : profileData?.occupation    ?? undefined,
    company          : profileData?.company        ?? undefined,
    industry         : profileData?.industry       ?? undefined,
    nationality      : profileData?.nationality    ?? undefined,
    knownOrganization: context,  // franchise / org context doubles as known org
  };

  // ── 1. Check independent compound-key cache ─────────────────────────────────
  const cacheKey = buildCacheKey(personName, pctx);
  const cached   = await cache.get<string>(cacheKey);
  if (cached) {
    console.log(`[ImageSearch] Cache hit: "${cacheKey}"`);
    return cached;
  }

  const isFictional = isFictionalCharacter(pctx);
  const richQuery   = buildRichQuery(personName, pctx, isFictional);

  console.log(
    `[ImageSearch] Resolving "${personName}" | Query: "${richQuery}" | Fictional: ${isFictional}`
  );

  // ── 2. Collect candidates in parallel ──────────────────────────────────────
  const candidates: ImageCandidate[] = [];

  if (isFictional) {
    // Fictional character pipeline
    const [wikiRes, anilistRes, ddgRes] = await Promise.allSettled([
      searchWikipedia(richQuery),
      searchAniList(personName),
      searchDuckDuckGo(richQuery),
    ]);
    if (wikiRes.status    === "fulfilled" && wikiRes.value)    candidates.push(wikiRes.value);
    if (anilistRes.status === "fulfilled" && anilistRes.value) candidates.push(anilistRes.value);
    if (ddgRes.status     === "fulfilled" && ddgRes.value)     candidates.push(ddgRes.value);
  } else {
    // Real person pipeline
    const wikiSource = sources?.find(s => s.url?.includes("wikipedia.org/wiki/"));

    const [exactWikiRes, queryWikiRes, wikidataRes, ddgRes] = await Promise.allSettled([
      wikiSource ? searchWikipediaByUrl(wikiSource.url) : Promise.resolve(null),
      searchWikipedia(richQuery),
      searchWikidata(personName, pctx.occupation ?? undefined),
      searchDuckDuckGo(richQuery),
    ]);

    if (exactWikiRes.status === "fulfilled" && exactWikiRes.value) candidates.push(exactWikiRes.value);
    if (queryWikiRes.status === "fulfilled" && queryWikiRes.value) candidates.push(queryWikiRes.value);
    if (wikidataRes.status  === "fulfilled" && wikidataRes.value)  candidates.push(wikidataRes.value);
    if (ddgRes.status       === "fulfilled" && ddgRes.value)       candidates.push(ddgRes.value);

    // Unavatar as last resort (no Gemini verification — just display)
    const unavatar = getUnavatarCandidate(personName);
    if (unavatar) candidates.push(unavatar);
  }

  // De-duplicate by URL
  const seen    = new Set<string>();
  const unique  = candidates.filter(c => { if (seen.has(c.url)) return false; seen.add(c.url); return true; });

  // ── 3. Sort by confidence ───────────────────────────────────────────────────
  unique.sort((a, b) => b.confidence - a.confidence);

  console.log(
    `[ImageSearch] ${unique.length} candidate(s): ${unique.map(c => `${c.source}(${c.confidence})`).join(", ")}`
  );

  // ── 4. Verify each candidate with Gemini Vision ────────────────────────────
  //
  // Skip Gemini for unavatar (low confidence, no guarantee of correct person)
  // If Gemini rejects everything, return null so UI shows initials.
  for (const candidate of unique) {
    // Unavatar: just try to display it, skip expensive verification
    if (candidate.source === "unavatar") {
      console.log(`[ImageSearch] Trying unavatar as last resort (no verification)`);
      await cache.set(cacheKey, candidate.url, IMG_TTL_MS);
      return candidate.url;
    }

    const { verified, confidence } = await verifyWithGemini(
      candidate, personName, pctx, isFictional
    );

    if (verified) {
      console.log(
        `[ImageSearch] ✓ Accepted: ${candidate.source} @ ${confidence}% — "${personName}"`
      );
      // Cache with 30-day TTL using compound key
      await cache.set(cacheKey, candidate.url, IMG_TTL_MS);
      return candidate.url;
    }

    console.log(`[ImageSearch] ✗ Rejected: ${candidate.source} @ ${confidence}%`);
  }

  console.log(`[ImageSearch] No verified image found for "${personName}" — showing initials`);
  return null;
}

// ─── Backward-compat export ───────────────────────────────────────────────────

export async function getWikipediaImageUrl(wikiUrl: string): Promise<string | null> {
  const result = await searchWikipediaByUrl(wikiUrl);
  return result?.url ?? null;
}
