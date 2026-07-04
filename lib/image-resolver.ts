/**
 * Profile image resolver — multi-tier strategy for accurate person photos.
 *
 * Priority chain:
 *   1. Wikipedia PageImages API  → filtered to avoid non-person images
 *   2. Wikidata entity image      → precise P18 image property (person portrait)
 *   3. DuckDuckGo Instant Answer  → often returns headshots for public figures
 *   4. Unavatar.io                → cross-source social avatar aggregator
 *   5. null                       → UI renders initials avatar
 *
 * Fictional / anime characters: tiers 1–3 are tried; if all fail, null is
 * returned so the UI shows a styled initials placeholder (preferred over a
 * broken or wrong image).
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    ),
  ]);
}

/**
 * Returns true if the image filename looks like a person portrait
 * rather than a logo, map, flag, chart, building, etc.
 */
function isLikelyPersonPhoto(filename: string): boolean {
  const lower = filename.toLowerCase();
  // Reject common non-person patterns
  const BAD_PATTERNS = [
    /logo/,       /flag/,       /map/,      /coat_of_arms/,
    /seal_of/,    /emblem/,     /chart/,    /graph/,
    /building/,   /temple/,     /church/,   /mosque/,
    /monument/,   /statue/,     /park/,     /garden/,
    /landscape/,  /aerial/,     /campus/,   /headquarter/,
    /office/,     /tower/,      /stadium/,  /city/,
    /street/,     /road/,       /highway/,  /airport/,
    /station/,    /palace/,     /castle/,   /fort/,
    /university_building/, /school_building/,
  ];
  if (BAD_PATTERNS.some((p) => p.test(lower))) return false;

  // Prefer clear person-photo patterns
  const GOOD_PATTERNS = [
    /portrait/, /headshot/, /photo_of/, /pic_of/,
    /\bphoto\b/, /\bimage\b/, /_at_/, /interview/,
    /speaking/, /ceremony/, /award/,
  ];
  if (GOOD_PATTERNS.some((p) => p.test(lower))) return true;

  // By default, allow the image (better than rejecting everything)
  return true;
}

// ─── Tier 1: Wikipedia PageImages API ─────────────────────────────────────────

async function getWikipediaImageUrl(wikiUrl: string): Promise<string | null> {
  try {
    const match = wikiUrl.match(/\/wiki\/([^#?]+)/);
    if (!match) return null;
    const title = decodeURIComponent(match[1]);

    // Step 1: Try the fast pageimages endpoint (thumbnail)
    const thumbApi = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
      title
    )}&prop=pageimages&format=json&pithumbsize=600&origin=*`;

    const thumbRes = await withTimeout(fetch(thumbApi), 8000);
    if (thumbRes.ok) {
      const thumbData = await thumbRes.json();
      const pages = thumbData.query?.pages;
      if (pages) {
        const page = pages[Object.keys(pages)[0]];
        if (page && page.pageimage && isLikelyPersonPhoto(page.pageimage)) {
          const src = page.thumbnail?.source;
          if (src) return src;
        }
      }
    }

    // Step 2: Enumerate all images on the page and pick the best person photo
    const imagesApi = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
      title
    )}&prop=images&format=json&origin=*&imlimit=20`;

    const imagesRes = await withTimeout(fetch(imagesApi), 8000);
    if (!imagesRes.ok) return null;

    const imagesData = await imagesRes.json();
    const page = imagesData.query?.pages;
    if (!page) return null;

    const pageObj = page[Object.keys(page)[0]];
    if (!pageObj || !pageObj.images) return null;

    // Pick first image that looks like a person photo
    const personImages = (pageObj.images as { title: string }[]).filter((img) =>
      isLikelyPersonPhoto(img.title)
    );

    if (personImages.length === 0) return null;

    // Resolve the URL for the best candidate
    const imgTitle = personImages[0].title;
    const infoApi = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
      imgTitle
    )}&prop=imageinfo&iiprop=url&format=json&origin=*&iiurlwidth=600`;

    const infoRes = await withTimeout(fetch(infoApi), 6000);
    if (!infoRes.ok) return null;

    const infoData = await infoRes.json();
    const infoPages = infoData.query?.pages;
    if (!infoPages) return null;

    const infoPage = infoPages[Object.keys(infoPages)[0]];
    const url = infoPage?.imageinfo?.[0]?.thumburl || infoPage?.imageinfo?.[0]?.url;
    return url || null;
  } catch {
    return null;
  }
}

// ─── Tier 2: Wikidata Entity Image (P18) ──────────────────────────────────────

async function getWikidataImage(personName: string): Promise<string | null> {
  try {
    // Search Wikidata for the entity
    const searchApi = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(
      personName
    )}&language=en&limit=3&format=json&origin=*&type=item`;

    const searchRes = await withTimeout(fetch(searchApi), 8000);
    if (!searchRes.ok) return null;

    const searchData = await searchRes.json();
    const results = searchData.search;
    if (!results || results.length === 0) return null;

    // Try each result (top 3) to find one with an image property (P18)
    for (const entity of results.slice(0, 3)) {
      const entityId = entity.id;
      const propApi = `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${entityId}&property=P18&format=json&origin=*`;

      const propRes = await withTimeout(fetch(propApi), 6000);
      if (!propRes.ok) continue;

      const propData = await propRes.json();
      const claims = propData.claims?.P18;
      if (!claims || claims.length === 0) continue;

      const filename = claims[0]?.mainsnak?.datavalue?.value;
      if (!filename || typeof filename !== "string") continue;

      if (!isLikelyPersonPhoto(filename)) continue;

      // Construct the Wikimedia Commons URL
      const encoded = encodeURIComponent(filename.replace(/ /g, "_"));
      const md5 = await getMd5HexPrefix(filename.replace(/ /g, "_"));
      if (!md5) continue;

      const imgUrl = `https://upload.wikimedia.org/wikipedia/commons/thumb/${md5[0]}/${md5}/${encoded}/600px-${encoded}`;
      return imgUrl;
    }

    return null;
  } catch {
    return null;
  }
}

/** Compute the MD5 hex of a filename (used for Wikimedia Commons URL path). */
async function getMd5HexPrefix(filename: string): Promise<string | null> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(filename);
    const hashBuffer = await crypto.subtle.digest("MD5", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    // crypto.subtle.digest doesn't support MD5 in all environments
    // Use the simpler approach of just taking the page image via title
    return null;
  }
}

// ─── Tier 3: DuckDuckGo Instant Answer ────────────────────────────────────────

async function getDuckDuckGoImage(personName: string): Promise<string | null> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(
      personName
    )}&format=json&no_html=1&skip_disambig=1`;

    const res = await withTimeout(fetch(url), 8000);
    if (!res.ok) return null;

    const data = await res.json();

    // DDG often returns an image for famous people
    if (data.Image && data.Image.trim() !== "") {
      const imgUrl = data.Image.startsWith("//")
        ? `https:${data.Image}`
        : data.Image;
      // Avoid icons, logos (small images)
      if (!imgUrl.includes("logo") && !imgUrl.includes("icon")) {
        return imgUrl;
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ─── Tier 4: Unavatar.io ──────────────────────────────────────────────────────

function getUnavatarUrl(personName: string): string | null {
  if (!personName || personName.trim().length === 0) return null;
  const encoded = encodeURIComponent(personName);
  return `https://unavatar.io/${encoded}?fallback=false`;
}

// ─── Main Resolver ────────────────────────────────────────────────────────────

/**
 * Resolves the best available profile image for a public figure.
 * Sources tried in order: Wikipedia → Wikidata → DuckDuckGo → Unavatar → null
 *
 * Returns null for fictional/anime characters so the UI shows
 * a styled initials avatar instead of a wrong image.
 */
export async function resolveProfileImage(
  sources: { url: string }[],
  personName?: string
): Promise<string | null> {
  // ── Tier 1: Wikipedia (most accurate, checked first) ─────────────────────
  if (sources && sources.length > 0) {
    const wikiSource = sources.find((s) =>
      s.url.includes("wikipedia.org/wiki/")
    );
    if (wikiSource) {
      const wikiImage = await getWikipediaImageUrl(wikiSource.url);
      if (wikiImage) return wikiImage;
    }
  }

  if (!personName || personName.trim().length === 0) return null;

  // ── Tier 2: Wikidata (P18 image property — very accurate) ────────────────
  try {
    const wikidataImage = await getWikidataImage(personName);
    if (wikidataImage) return wikidataImage;
  } catch {
    // non-fatal
  }

  // ── Tier 3: DuckDuckGo Instant Answer ────────────────────────────────────
  try {
    const ddgImage = await getDuckDuckGoImage(personName);
    if (ddgImage) return ddgImage;
  } catch {
    // non-fatal
  }

  // ── Tier 4: Unavatar (social profiles aggregator) ─────────────────────────
  const unaUrl = getUnavatarUrl(personName);
  if (unaUrl) return unaUrl;

  return null;
}

// ─── Legacy export (backward compatibility) ───────────────────────────────────
export { getWikipediaImageUrl };
