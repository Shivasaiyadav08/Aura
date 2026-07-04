/**
 * Profile image resolver.
 * Tries multiple sources in priority order and returns the best available URL.
 * Tier 1: Wikipedia PageImages API
 * Tier 2: Unavatar.io (reliable cross-source avatar service)
 * Tier 3: null (UI will render initials avatar)
 */

// ─── Tier 1: Wikipedia ────────────────────────────────────────────────────────

async function getWikipediaImageUrl(wikipediaUrl: string): Promise<string | null> {
  try {
    const match = wikipediaUrl.match(/\/wiki\/([^#?]+)/);
    if (!match) return null;

    const title = decodeURIComponent(match[1]);
    const apiUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(
      title
    )}&prop=pageimages&format=json&pithumbsize=600&origin=*`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(apiUrl, { signal: controller.signal });
      if (!res.ok) return null;

      const data = await res.json();
      const pages = data.query?.pages;
      if (!pages) return null;

      const pageId = Object.keys(pages)[0];
      if (pageId === "-1") return null;

      const thumbnail = pages[pageId]?.thumbnail;
      return thumbnail?.source || null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

// ─── Tier 2: Unavatar.io ──────────────────────────────────────────────────────

function getUnavatarUrl(personName: string): string {
  // unavatar.io provides a unified avatar from multiple sources
  const encoded = encodeURIComponent(personName);
  return `https://unavatar.io/${encoded}?fallback=false`;
}

// ─── Main Resolver ────────────────────────────────────────────────────────────

/**
 * Resolves the best available profile image for a public figure.
 * Sources tried in order: Wikipedia → Unavatar
 */
export async function resolveProfileImage(
  sources: { url: string }[],
  personName?: string
): Promise<string | null> {
  // Tier 1: Wikipedia (most accurate for well-known figures)
  if (sources && sources.length > 0) {
    const wikiSource = sources.find((s) => s.url.includes("wikipedia.org/wiki/"));
    if (wikiSource) {
      const wikiImage = await getWikipediaImageUrl(wikiSource.url);
      if (wikiImage) return wikiImage;
    }
  }

  // Tier 2: Unavatar (works for many public figures via social profiles)
  if (personName && personName.trim().length > 0) {
    return getUnavatarUrl(personName);
  }

  return null;
}

// ─── Legacy export (backward compatibility) ───────────────────────────────────
export { getWikipediaImageUrl };
