/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                        ImageSearchService v4                               ║
 * ║                                                                            ║
 * ║  Entity-accurate profile image resolution.                                 ║
 * ║                                                                            ║
 * ║  Pipeline                                                                  ║
 * ║  ────────                                                                  ║
 * ║  1. Extract structured metadata from Tavily search results                 ║
 * ║     (Wikipedia URL, GitHub username, personal site, company domain)        ║
 * ║  2. Build a rich, disambiguating search query                              ║
 * ║     e.g. "Satya Nadella CEO Microsoft official portrait"                   ║
 * ║  3. Collect image candidates from modular providers (in priority order):   ║
 * ║     Real people  → Wikipedia · Wikidata · GitHub · OG-image · DuckDuckGo  ║
 * ║     Fictional    → Wikipedia · AniList · DuckDuckGo                       ║
 * ║  4. Score candidates using a multi-factor identity confidence model        ║
 * ║     (source authority + name match + company match + domain match)        ║
 * ║  5. Verify top candidates with Gemini Vision (reject if < 80 %)           ║
 * ║  6. Cache the verified URL for 30 days under a compound key               ║
 * ║     (name + context + company) — never just the name                      ║
 * ║  7. Return null (→ initials placeholder) if no image passes verification  ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { keyManager } from "@/lib/ai/provider";
import { cache } from "@/lib/cache";

// ─── Public types ─────────────────────────────────────────────────────────────

/** Structured metadata extracted from Tavily search results. */
export interface ExtractedSourceMetadata {
  wikipediaUrl?  : string;
  githubUsername?: string;
  linkedinUrl?   : string;
  personalSite?  : string;
  companyDomain? : string;
}

/** Caller-supplied profile context used for query building and scoring. */
export interface ProfileImageContext {
  context?         : string;   // user-supplied disambiguation ("CEO of Microsoft")
  occupation?      : string;   // from AI profile
  company?         : string;   // from AI profile (basicDetails.currentCompany)
  industry?        : string;
  nationality?     : string;
  location?        : string;   // city / country
  knownOrganization?: string;  // franchise for fictional chars
}

/** A single image candidate with source, URL, and scoring details. */
export interface ImageCandidate {
  url        : string;
  source     : string;          // provider name
  baseScore  : number;          // source authority 0-100
  identityScore: number;        // final score after identity boosting
  debug?     : {                // optional debug details (nice-to-have)
    nameMatch  : boolean;
    companyMatch: boolean;
    domainMatch: boolean;
    urlContainsName: boolean;
  };
}

/** Interface every image provider must implement (modular — add new providers easily). */
export interface ImageProvider {
  readonly name: string;
  fetch(query: ImageSearchQuery): Promise<Pick<ImageCandidate, "url" | "source" | "baseScore"> | null>;
}

/** All data an ImageProvider receives during a search. */
export interface ImageSearchQuery {
  personName  : string;
  richQuery   : string;         // "Satya Nadella CEO Microsoft official portrait"
  pctx        : ProfileImageContext;
  metadata    : ExtractedSourceMetadata;
  isFictional : boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Base authority scores per source (out of 100). */
const BASE_SCORE = {
  WIKIPEDIA_EXACT : 97,
  WIKIPEDIA_QUERY : 93,
  WIKIDATA        : 91,
  GITHUB          : 89,
  OG_PERSONAL_SITE: 87,
  ANILIST         : 90,   // high — officially licensed character art
  DUCKDUCKGO      : 80,
  UNAVATAR        : 60,
} as const;

const FETCH_TIMEOUT_MS    = 10_000;
const VERIFY_TIMEOUT_MS   = 22_000;
const MIN_VERIFY_CONF     = 88;             // reject if Gemini < 88 %
const IMG_CACHE_TTL_MS    = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_CANDIDATES      = 6;             // verify at most this many candidates

// ─── Fictional character detection ───────────────────────────────────────────

const FICTIONAL_KEYWORDS = [
  "anime","manga","fictional","character","one piece","naruto","dragon ball",
  "bleach","attack on titan","demon slayer","jujutsu kaisen","my hero academia",
  "fairy tail","one punch man","sword art online","hunter x hunter","haikyuu",
  "death note","fullmetal alchemist","black clover","boruto","chainsaw man",
  "spy x family","mob psycho","overlord","re:zero","pokemon","video game",
  "game character","cartoon","comic book","marvel","dc comics","superhero",
  "light novel","visual novel","isekai","shonen","seinen","webtoon","manhwa",
];

function detectFictional(pctx: ProfileImageContext): boolean {
  const blob = [
    pctx.context, pctx.occupation, pctx.company,
    pctx.industry, pctx.knownOrganization,
  ].filter(Boolean).join(" ").toLowerCase();
  return FICTIONAL_KEYWORDS.some(kw => blob.includes(kw));
}

// ─── Phase 1: Source metadata extraction ─────────────────────────────────────
//
// Reuses the Tavily search results already fetched for profile generation —
// zero extra API calls for metadata discovery.

const GITHUB_RE   = /github\.com\/([a-zA-Z0-9-]{1,39})(?:\/[^"'\s]*)?/;
const LINKEDIN_RE = /linkedin\.com\/in\/([a-zA-Z0-9-]{3,100})/;
const WIKI_RE     = /en\.wikipedia\.org\/wiki\/([^"'\s#?]+)/;

export function extractSourceMetadata(
  sources: { url: string; title?: string; content?: string; snippet?: string | null }[],
  personName: string
): ExtractedSourceMetadata {
  const meta: ExtractedSourceMetadata = {};
  const nameLower = personName.toLowerCase();

  for (const src of sources) {
    const urlLower = src.url.toLowerCase();

    // Wikipedia
    if (!meta.wikipediaUrl && WIKI_RE.test(src.url)) {
      meta.wikipediaUrl = src.url;
    }

    // GitHub — only accept profiles that contain the person's last name in the URL
    if (!meta.githubUsername) {
      const match = src.url.match(GITHUB_RE);
      if (match) {
        const username = match[1];
        // Heuristic: username must share at least one name token to avoid
        // matching unrelated GitHub repos
        const nameTokens = nameLower.split(/\s+/);
        if (nameTokens.some(t => t.length > 2 && username.toLowerCase().includes(t))) {
          meta.githubUsername = username;
        }
      }
    }

    // LinkedIn
    if (!meta.linkedinUrl) {
      const match = src.url.match(LINKEDIN_RE);
      if (match) meta.linkedinUrl = src.url;
    }

    // Personal site — a URL that contains a name token but isn't a major platform
    if (!meta.personalSite) {
      const MAJOR_PLATFORMS = ["linkedin", "twitter", "facebook", "instagram",
        "youtube", "wikipedia", "github", "reddit", "crunchbase", "bloomberg",
        "reuters", "forbes", "imdb", "medium", "substack"];
      const isMajor = MAJOR_PLATFORMS.some(p => urlLower.includes(p));
      if (!isMajor) {
        const nameTokens = nameLower.split(/\s+/);
        if (nameTokens.some(t => t.length > 3 && urlLower.includes(t))) {
          try {
            meta.personalSite = new URL(src.url).origin;
          } catch { /* skip malformed URLs */ }
        }
      }
    }

    // Company domain — infer from content mentioning the company domain
    if (!meta.companyDomain && src.content) {
      const companyMatch = src.content.match(/(?:at|@)\s+([\w-]+\.(?:com|org|io|co))/i);
      if (companyMatch) meta.companyDomain = companyMatch[1];
    }
  }

  return meta;
}

// ─── Phase 2: Rich query builder ─────────────────────────────────────────────
//
// Never search by name alone. Always include disambiguating context.
// "John Smith" → "John Smith CEO Stripe San Francisco official portrait"

export function buildRichQuery(
  personName: string,
  pctx: ProfileImageContext,
  metadata: ExtractedSourceMetadata,
  isFictional: boolean
): string {
  const parts: string[] = [personName];

  if (isFictional) {
    if (pctx.knownOrganization) parts.push(pctx.knownOrganization);
    if (pctx.context)           parts.push(pctx.context);
    parts.push("official artwork");
  } else {
    // Add role + company for disambiguation
    const role    = pctx.occupation ?? "";
    const company = pctx.company    ?? "";
    const ctx     = pctx.context    ?? "";
    const loc     = pctx.location   ?? "";

    if (role    && !parts.join(" ").includes(role))    parts.push(role);
    if (company && !parts.join(" ").includes(company)) parts.push(company);
    // Include user-provided context if not already covered
    if (ctx && !parts.join(" ").toLowerCase().includes(ctx.toLowerCase()))
      parts.push(ctx);
    if (loc) parts.push(loc);
    parts.push("official portrait");
  }

  return parts.filter(Boolean).join(" ");
}

// ─── Phase 3: Image Providers (modular — add new ones below) ─────────────────

// ── Utility ───────────────────────────────────────────────────────────────────

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, r) => setTimeout(() => r(new Error(`Timeout ${ms}ms`)), ms)),
  ]);
}

const BAD_FILENAME_PATTERNS = [
  /\blogo\b/i, /\bflag\b/i, /\bmap\b/i, /coat.of.arms/i, /\bseal\b/i,
  /emblem/i, /\bchart\b/i, /\bgraph\b/i, /building/i, /temple/i,
  /church/i, /mosque/i, /monument/i, /\bstatue\b/i, /landscape/i,
  /aerial/i, /campus/i, /tower/i, /stadium/i, /palace/i, /castle/i,
  /\bicon\b/i, /\bsymbol\b/i, /\bbanner\b/i,
];
function isPersonPhoto(filename: string): boolean {
  return !BAD_FILENAME_PATTERNS.some(p => p.test(filename));
}

// ── Provider 1: Wikipedia (exact URL from Tavily results) ─────────────────────

class WikipediaExactProvider implements ImageProvider {
  readonly name = "wikipedia-exact";

  async fetch(q: ImageSearchQuery) {
    if (!q.metadata.wikipediaUrl) return null;
    try {
      const match = q.metadata.wikipediaUrl.match(/\/wiki\/([^#?]+)/);
      if (!match) return null;
      const title = decodeURIComponent(match[1]);

      const url = `https://en.wikipedia.org/w/api.php?action=query` +
        `&titles=${encodeURIComponent(title)}&prop=pageimages` +
        `&format=json&pithumbsize=500&origin=*`;

      const res  = await withTimeout(fetch(url), FETCH_TIMEOUT_MS);
      if (!res.ok) return null;
      const data = await res.json();
      const page = Object.values(data.query?.pages ?? {})[0] as any;

      if (page?.pageimage && isPersonPhoto(page.pageimage) && page.thumbnail?.source) {
        return { url: page.thumbnail.source, source: this.name, baseScore: BASE_SCORE.WIKIPEDIA_EXACT };
      }
      return null;
    } catch { return null; }
  }
}

// ── Provider 2: Wikipedia (via rich query search) ─────────────────────────────

class WikipediaQueryProvider implements ImageProvider {
  readonly name = "wikipedia-query";

  async fetch(q: ImageSearchQuery) {
    try {
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search` +
        `&srsearch=${encodeURIComponent(q.richQuery)}&srlimit=3&format=json&origin=*`;

      const sRes  = await withTimeout(fetch(searchUrl), FETCH_TIMEOUT_MS);
      if (!sRes.ok) return null;
      const sData = await sRes.json();
      const hits  = (sData.query?.search ?? []) as { title: string }[];

      for (const hit of hits.slice(0, 3)) {
        const imgUrl = `https://en.wikipedia.org/w/api.php?action=query` +
          `&titles=${encodeURIComponent(hit.title)}&prop=pageimages` +
          `&format=json&pithumbsize=500&origin=*`;

        const iRes  = await withTimeout(fetch(imgUrl), FETCH_TIMEOUT_MS);
        if (!iRes.ok) continue;
        const iData = await iRes.json();
        const page  = Object.values(iData.query?.pages ?? {})[0] as any;

        if (page?.pageimage && isPersonPhoto(page.pageimage) && page.thumbnail?.source) {
          return { url: page.thumbnail.source, source: this.name, baseScore: BASE_SCORE.WIKIPEDIA_QUERY };
        }
      }
      return null;
    } catch { return null; }
  }
}

// ── Provider 3: Wikidata P18 (portrait property) ──────────────────────────────

class WikidataProvider implements ImageProvider {
  readonly name = "wikidata";

  async fetch(q: ImageSearchQuery) {
    if (q.isFictional) return null;   // Wikidata is less useful for fictional chars
    try {
      const searchQ   = q.pctx.occupation ? `${q.personName} ${q.pctx.occupation}` : q.personName;
      const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities` +
        `&search=${encodeURIComponent(searchQ)}&language=en&limit=3&format=json&origin=*&type=item`;

      const sRes  = await withTimeout(fetch(searchUrl), FETCH_TIMEOUT_MS);
      if (!sRes.ok) return null;
      const sData = await sRes.json();

      for (const entity of (sData.search ?? []).slice(0, 3)) {
        const pRes = await withTimeout(
          fetch(`https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${entity.id}&property=P18&format=json&origin=*`),
          FETCH_TIMEOUT_MS
        );
        if (!pRes.ok) continue;
        const pData    = await pRes.json();
        const filename = pData.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
        if (!filename || typeof filename !== "string" || !isPersonPhoto(filename)) continue;

        const encoded = encodeURIComponent(filename.replace(/ /g, "_"));
        const iRes    = await withTimeout(
          fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=File:${encoded}&prop=imageinfo&iiprop=url&format=json&origin=*&iiurlwidth=500`),
          FETCH_TIMEOUT_MS
        );
        if (!iRes.ok) continue;
        const iData = await iRes.json();
        const iPage = Object.values(iData.query?.pages ?? {})[0] as any;
        const imgUrl = iPage?.imageinfo?.[0]?.thumburl ?? iPage?.imageinfo?.[0]?.url;
        if (imgUrl) return { url: imgUrl, source: this.name, baseScore: BASE_SCORE.WIKIDATA };
      }
      return null;
    } catch { return null; }
  }
}

// ── Provider 4: GitHub Avatar ─────────────────────────────────────────────────

class GitHubProvider implements ImageProvider {
  readonly name = "github";

  async fetch(q: ImageSearchQuery) {
    if (q.isFictional || !q.metadata.githubUsername) return null;
    try {
      const avatarUrl = `https://avatars.githubusercontent.com/${q.metadata.githubUsername}?size=400`;
      const res = await withTimeout(fetch(avatarUrl, { method: "HEAD" }), FETCH_TIMEOUT_MS);
      if (res.ok) return { url: avatarUrl, source: this.name, baseScore: BASE_SCORE.GITHUB };
      return null;
    } catch { return null; }
  }
}

// ── Provider 5: OG image from personal / company website ──────────────────────

class OgImageProvider implements ImageProvider {
  readonly name = "og-image";

  async fetch(q: ImageSearchQuery) {
    if (q.isFictional || !q.metadata.personalSite) return null;
    try {
      const res = await withTimeout(fetch(q.metadata.personalSite), FETCH_TIMEOUT_MS);
      if (!res.ok) return null;
      const html    = await res.text();
      // Match og:image, twitter:image, and schema.org image in one sweep
      const ogMatch = html.match(
        /<meta[^>]+(?:property="og:image"|name="twitter:image")[^>]+content="([^"]+)"/i
      ) ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+(?:property="og:image"|name="twitter:image")/i);
      if (!ogMatch?.[1]) return null;

      let imgUrl = ogMatch[1];
      if (imgUrl.startsWith("/")) imgUrl = q.metadata.personalSite + imgUrl;

      return { url: imgUrl, source: this.name, baseScore: BASE_SCORE.OG_PERSONAL_SITE };
    } catch { return null; }
  }
}

// ── Provider 6: AniList — anime & manga characters ────────────────────────────

class AniListProvider implements ImageProvider {
  readonly name = "anilist";

  async fetch(q: ImageSearchQuery) {
    if (!q.isFictional) return null;
    try {
      const gql = `query ($search: String) { Character(search: $search) { image { large } } }`;
      const res = await withTimeout(
        fetch("https://graphql.anilist.co", {
          method : "POST",
          headers: { "Content-Type": "application/json" },
          body   : JSON.stringify({ query: gql, variables: { search: q.personName } }),
        }),
        FETCH_TIMEOUT_MS
      );
      if (!res.ok) return null;
      const data  = await res.json();
      const image = data.data?.Character?.image?.large;
      if (image) return { url: image, source: this.name, baseScore: BASE_SCORE.ANILIST };
      return null;
    } catch { return null; }
  }
}

// ── Provider 7: DuckDuckGo Instant Answer ─────────────────────────────────────

class DuckDuckGoProvider implements ImageProvider {
  readonly name = "duckduckgo";

  async fetch(q: ImageSearchQuery) {
    try {
      const res = await withTimeout(
        fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(q.richQuery)}&format=json&no_html=1&skip_disambig=1`),
        FETCH_TIMEOUT_MS
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.Image?.trim()) return null;
      const imgUrl = data.Image.startsWith("//") ? `https:${data.Image}` : data.Image;
      if (imgUrl.includes("logo") || imgUrl.includes("icon")) return null;
      return { url: imgUrl, source: this.name, baseScore: BASE_SCORE.DUCKDUCKGO };
    } catch { return null; }
  }
}

// ── Provider 8: Unavatar (last resort, real people only) ─────────────────────

class UnavatarProvider implements ImageProvider {
  readonly name = "unavatar";

  async fetch(q: ImageSearchQuery) {
    if (q.isFictional || !q.personName?.trim()) return null;
    return {
      url      : `https://unavatar.io/${encodeURIComponent(q.personName)}?fallback=false`,
      source   : this.name,
      baseScore: BASE_SCORE.UNAVATAR,
    };
  }
}

// ─── Provider registry ────────────────────────────────────────────────────────
//
// Add new providers here — they run in the order declared.

const REAL_PERSON_PROVIDERS: ImageProvider[] = [
  new WikipediaExactProvider(),
  new WikipediaQueryProvider(),
  new WikidataProvider(),
  new GitHubProvider(),
  new OgImageProvider(),
  new DuckDuckGoProvider(),
  new UnavatarProvider(),
];

const FICTIONAL_PROVIDERS: ImageProvider[] = [
  new AniListProvider(),
  new WikipediaQueryProvider(),
  new DuckDuckGoProvider(),
];

// ─── Phase 4: Identity confidence scoring ─────────────────────────────────────
//
// Boosts a candidate's score when the URL or source contains signals that
// confirm the image is of the right person (not just any image on the page).

function computeIdentityScore(
  candidate: Pick<ImageCandidate, "url" | "source" | "baseScore">,
  personName: string,
  pctx: ProfileImageContext
): ImageCandidate {
  let bonus = 0;
  const urlLower = candidate.url.toLowerCase();
  const nameTokens = personName.toLowerCase().split(/\s+/).filter(t => t.length > 2);

  // ① Name tokens in URL → up to +10
  const urlMatchCount = nameTokens.filter(t => urlLower.includes(t)).length;
  const urlContainsName = urlMatchCount > 0;
  if (urlMatchCount >= nameTokens.length)     bonus += 10;   // full name match
  else if (urlMatchCount >= nameTokens.length - 1) bonus += 5;

  // ② Company name in URL → +8
  const companyLower = (pctx.company ?? "").toLowerCase().replace(/\s+/g, "");
  const companyMatch = companyLower.length > 2 && urlLower.includes(companyLower);
  if (companyMatch) bonus += 8;

  // ③ Wikipedia source gets extra trust → +5
  const domainMatch = candidate.source.startsWith("wikipedia") || candidate.source === "wikidata";
  if (domainMatch) bonus += 5;

  // ④ Official personal site → +6
  if (candidate.source === "og-image") bonus += 6;

  // ⑤ GitHub avatar is clearly tied to a user → +4
  if (candidate.source === "github") bonus += 4;

  // ⑥ AniList art is canonically correct for fictional chars → +10
  if (candidate.source === "anilist") bonus += 10;

  // ⑦ Penalty: No name tokens and no company domain matches in the URL/source path (only for general query/web sources)
  const isDirectApi = ["github", "anilist", "wikipedia-exact"].includes(candidate.source);
  if (!isDirectApi && !urlContainsName && !companyMatch) {
    bonus -= 30; // heavy penalty for mismatch
  }

  const nameMatch = nameTokens.every(t => urlLower.includes(t));

  return {
    ...candidate,
    identityScore: Math.min(candidate.baseScore + bonus, 100),
    debug: { nameMatch, companyMatch, domainMatch, urlContainsName },
  };
}

// ─── Phase 5: Gemini Vision verification ─────────────────────────────────────
//
// Fetches the image as base64 and asks Gemini if it matches the person.
// Returns verified=true only when confidence ≥ MIN_VERIFY_CONF.
// Gracefully degrades: if Gemini is unavailable, high-score sources are trusted.

async function verifyWithGemini(
  candidate  : ImageCandidate,
  personName : string,
  pctx       : ProfileImageContext,
  isFictional: boolean
): Promise<{ verified: boolean; geminConf: number }> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10_000);
    let res: Response;
    try {
      res = await fetch(candidate.url, { signal: controller.signal });
    } finally { clearTimeout(t); }

    if (!res.ok) return { verified: false, geminConf: 0 };
    const buf = await res.arrayBuffer();
    if (buf.byteLength === 0) return { verified: false, geminConf: 0 };

    // Skip Gemini for very large images (>4 MB) — trust source score instead
    if (buf.byteLength > 4 * 1024 * 1024) {
      return { verified: candidate.identityScore >= 88, geminConf: candidate.identityScore };
    }

    const base64   = Buffer.from(buf).toString("base64");
    const mimeType = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0];

    // Build a rich, context-aware verification prompt
    const subjectParts: string[] = [personName];
    if (!isFictional) {
      if (pctx.occupation) subjectParts.push(pctx.occupation);
      if (pctx.company)    subjectParts.push(pctx.company);
      if (pctx.context)    subjectParts.push(pctx.context);
      if (pctx.location)   subjectParts.push(pctx.location);
    } else {
      if (pctx.context ?? pctx.knownOrganization)
        subjectParts.push(`from ${pctx.context ?? pctx.knownOrganization}`);
    }

    const prompt = isFictional
      ? `This image is supposed to be official artwork of the fictional character "${personName}" (${pctx.context ?? ""}).
Does this image clearly depict ${personName}?
VERDICT: YES or NO
CONFIDENCE: 0-100
REASON: one sentence`
      : `This image is supposed to be a photo of ${subjectParts.join(", ")}.
Does this image show ${personName} specifically? Answer YES only if you see a single person matching this identity. Answer NO for buildings, landscapes, logos, multiple people, or a clearly different individual.
VERDICT: YES or NO
CONFIDENCE: 0-100
REASON: one sentence`;

    const keyInfo = keyManager.getAvailableKey();
    if (!keyInfo) {
      const isVeryHighConfidence =
        candidate.identityScore >= 94 &&
        ["wikipedia-exact", "github", "anilist"].includes(candidate.source);
      return { verified: isVeryHighConfidence, geminConf: candidate.identityScore };
    }

    const model = new GoogleGenerativeAI(keyInfo.key).getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await withTimeout(
      model.generateContent([{ inlineData: { data: base64, mimeType } }, prompt]),
      VERIFY_TIMEOUT_MS
    );

    const text      = result.response.text();
    const isYes     = /VERDICT:\s*YES/i.test(text);
    const confMatch = text.match(/CONFIDENCE:\s*(\d+)/i);
    const gemConf   = parseInt(confMatch?.[1] ?? "0", 10);
    const reasonMatch = text.match(/REASON:\s*(.+)/i);

    console.log(
      `[Gemini] ${candidate.source}: ${isYes ? "YES" : "NO"} ${gemConf}% — ${reasonMatch?.[1]?.trim() ?? ""}`
    );

    return { verified: isYes && gemConf >= MIN_VERIFY_CONF, geminConf: gemConf };
  } catch (err) {
    console.warn(`[Gemini] Vision unavailable — ${err instanceof Error ? err.message : err}`);
    // Graceful degradation: only trust absolute top-tier authoritative sources (exact Wikipedia page matches or GitHub direct)
    const isVeryHighConfidence =
      candidate.identityScore >= 94 &&
      ["wikipedia-exact", "github", "anilist"].includes(candidate.source);
    return { verified: isVeryHighConfidence, geminConf: candidate.identityScore };
  }
}

// ─── Phase 6: Compound cache key ─────────────────────────────────────────────
//
// Key = name + context + company.  NEVER just the name alone — prevents
// cache collisions between different people who share a common name.

function buildCacheKey(personName: string, pctx: ProfileImageContext): string {
  const parts = [personName];
  if (pctx.context) parts.push(pctx.context);
  if (pctx.company) parts.push(pctx.company);
  const slug = parts
    .join(":")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9:-]/g, "")
    .slice(0, 120);
  return `img:v4:${slug}`;
}

// ─── Main resolver (public API) ───────────────────────────────────────────────

/**
 * Resolves the highest-confidence verified portrait for a person.
 *
 * @param tavilySources  Raw Tavily sources from searchForPerson() — rich content + URLs
 * @param personName     Full name of the subject
 * @param context        User-supplied disambiguation ("CEO of Microsoft")
 * @param profileData    Structured fields from the AI-generated profile
 * @returns              Verified image URL, or null (→ show initials placeholder)
 */
export async function resolveProfileImage(
  tavilySources: { url: string; title?: string; content?: string; snippet?: string | null }[],
  personName   : string,
  context?     : string,
  profileData? : {
    occupation? : string | null;
    company?    : string | null;
    industry?   : string | null;
    nationality?: string | null;
    location?   : string | null;
  }
): Promise<string | null> {

  const pctx: ProfileImageContext = {
    context,
    occupation       : profileData?.occupation    ?? undefined,
    company          : profileData?.company        ?? undefined,
    industry         : profileData?.industry       ?? undefined,
    nationality      : profileData?.nationality    ?? undefined,
    location         : profileData?.location       ?? undefined,
    knownOrganization: context,
  };

  // ── Cache lookup (compound key) ───────────────────────────────────────────
  const cacheKey = buildCacheKey(personName, pctx);
  const cached   = await cache.get<string>(cacheKey);
  if (cached) {
    console.log(`[ImageSearch] Cache hit → "${cacheKey}"`);
    return cached;
  }

  // ── Phase 1: Extract metadata from Tavily results ─────────────────────────
  const metadata    = extractSourceMetadata(tavilySources, personName);
  const isFictional = detectFictional(pctx);
  const richQuery   = buildRichQuery(personName, pctx, metadata, isFictional);

  console.log(`[ImageSearch] "${personName}" | Fictional: ${isFictional} | Query: "${richQuery}"`);
  console.log(`[ImageSearch] Metadata:`, JSON.stringify(metadata));

  // ── Phase 2: Collect candidates from all providers (parallel) ────────────
  const providers = isFictional ? FICTIONAL_PROVIDERS : REAL_PERSON_PROVIDERS;
  const query: ImageSearchQuery = { personName, richQuery, pctx, metadata, isFictional };

  const settled = await Promise.allSettled(providers.map(p => p.fetch(query)));

  const raw: Pick<ImageCandidate, "url" | "source" | "baseScore">[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value) {
      console.log(`[ImageSearch] ✓ ${providers[i].name}: ${r.value.url.slice(0, 80)}`);
      raw.push(r.value);
    } else if (r.status === "rejected") {
      console.warn(`[ImageSearch] ✗ ${providers[i].name}: ${r.reason?.message}`);
    }
  });

  // De-duplicate URLs
  const seen     = new Set<string>();
  const deduped  = raw.filter(c => { if (seen.has(c.url)) return false; seen.add(c.url); return true; });

  // ── Phase 3: Score candidates using identity confidence model ─────────────
  const scored = deduped
    .map(c => computeIdentityScore(c, personName, pctx))
    .sort((a, b) => b.identityScore - a.identityScore)
    .slice(0, MAX_CANDIDATES);

  console.log(
    `[ImageSearch] ${scored.length} candidate(s): ${scored.map(c => `${c.source}(${c.identityScore})`).join(", ")}`
  );

  // ── Phase 4: Verify top candidates with Gemini Vision ────────────────────
  for (const candidate of scored) {
    // Unavatar: bypass verification (no guaranteed correct person in the image)
    if (candidate.source === "unavatar") {
      console.log(`[ImageSearch] Unavatar used as last resort (no verification)`);
      await cache.set(cacheKey, candidate.url, IMG_CACHE_TTL_MS);
      return candidate.url;
    }

    const { verified, geminConf } = await verifyWithGemini(
      candidate, personName, pctx, isFictional
    );

    if (verified) {
      console.log(`[ImageSearch] ✓ Accepted ${candidate.source} @ Gemini ${geminConf}%`);
      await cache.set(cacheKey, candidate.url, IMG_CACHE_TTL_MS);
      return candidate.url;
    }
    console.log(`[ImageSearch] ✗ Rejected ${candidate.source} @ Gemini ${geminConf}%`);
  }

  console.log(`[ImageSearch] No verified image found — showing initials for "${personName}"`);
  return null;
}

// ─── Backward-compat export ───────────────────────────────────────────────────

export async function getWikipediaImageUrl(wikiUrl: string): Promise<string | null> {
  const provider = new WikipediaExactProvider();
  const result   = await provider.fetch({
    personName: "", richQuery: "", pctx: {}, isFictional: false,
    metadata  : { wikipediaUrl: wikiUrl },
  });
  return result?.url ?? null;
}
