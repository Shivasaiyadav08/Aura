# Aura — AI Research Intelligence Platform

> Generate citation-backed executive intelligence profiles on any public figure — real or fictional — powered by Gemini with multi-key rotation, automatic model fallback, and entity-accurate image resolution.

[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square)](https://nextjs.org)
[![Gemini](https://img.shields.io/badge/Google-Gemini-4285F4?style=flat-square)](https://ai.google.dev)
[![Tavily](https://img.shields.io/badge/Tavily-Search-orange?style=flat-square)](https://tavily.com)

---

## Overview

Aura takes a person's **name + context** and produces a structured, citation-backed intelligence dossier covering biography, career timeline, education, achievements, net worth, and recent activities — plus an accurately matched portrait photo.

**Key differentiators:**
- 🔁 **16-attempt AI fallback chain** (4 models × 4 API keys) — zero single points of failure
- 🔍 **Entity-accurate image pipeline** — Gemini Vision verifies every image before display
- 🎌 **Fictional character support** — anime, manga, and game characters via AniList
- 📱 **Mobile-first layout** — vertical stack (search → profile → recents), no hamburger
- 🖨️ **PDF export** — A4-optimised print CSS with full citations

---

## Architecture

```
Browser
  └─ /research (page.tsx)
       ├─ [Mobile] Search Form (top, collapsible after submit)
       ├─ [Mobile] Profile Output (middle, scrollable)
       ├─ [Mobile] Recent Profiles strip (bottom, expandable)
       └─ [Desktop] Fixed sidebar (320 px) + scrollable content
            │
            ▼  POST /api/profile
       route.ts
         ├─ 1. Rate limit check       (lib/rate-limiter.ts)
         ├─ 2. Cache check            (lib/cache.ts)
         ├─ 3. Tavily web search      (lib/search.ts)
         ├─ 4. AI profile generation  (lib/ai/fallback.ts)
         ├─ 5. Schema validation      (lib/ai/validator.ts)
         ├─ 6. Image resolution       (lib/image-resolver.ts)
         └─ 7. Cache & respond        (lib/cache.ts)
```

---

## AI Resilience: 16-Attempt Fallback Chain

With 4+ Gemini accounts, every request has **16 total attempts** before failing:

```
Model                     Keys tried per model     Total
─────────────────────────────────────────────────────────
gemini-2.5-flash          key1 → key2 → key3 → key4    4
gemini-2.5-flash-lite     key1 → key2 → key3 → key4    4
gemini-2.0-flash          key1 → key2 → key3 → key4    4
gemini-1.5-flash          key1 → key2 → key3 → key4    4
─────────────────────────────────────────────────────────
Total                                                   16
```

**Key cooldown states:**

| Status | Trigger | Cooldown |
|--------|---------|----------|
| `quota-exceeded` | HTTP 429 / Resource Exhausted | 2 minutes |
| `cooling` | HTTP 500 / 503 / overloaded | 45 seconds |
| `rate-limited` | Other transient errors | 60 seconds |
| `available` | Default / after cooldown | — |

Keys restore automatically. Users never see provider names or error codes.

---

## Image Resolution Pipeline

The `ImageSearchService` (`lib/image-resolver.ts`) is the core innovation for accurate image matching.

### The Problem with Name-Only Search

Searching `"Vinh Giang"` returns a Vietnamese movie poster.  
Searching `"John Smith"` returns any of thousands of people.

### Solution: Entity-Accurate 6-Phase Pipeline

```
Phase 1 ─ Extract Metadata from Tavily Sources (free — no extra API calls)
           │  Parses already-fetched search results for:
           │  • Wikipedia URL    • GitHub username
           │  • LinkedIn URL     • Personal website
           │  • Company domain
           │
Phase 2 ─ Build Rich Disambiguating Query
           │  "Vinh Giang"  →  "Vinh Giang communication coach 52Kards official portrait"
           │  "Luffy"       →  "Monkey D. Luffy One Piece official artwork"
           │
Phase 3 ─ Modular Provider Pipeline (parallel execution)
           │
           │  Real People               Fictional Characters
           │  ─────────────             ─────────────────────
           │  1. Wikipedia (exact URL)  1. AniList GraphQL API
           │  2. Wikipedia (query)      2. Wikipedia (query)
           │  3. Wikidata P18 portrait  3. DuckDuckGo
           │  4. GitHub avatar
           │  5. OG image (website)
           │  6. DuckDuckGo
           │  7. Unavatar (last resort)
           │
Phase 4 ─ Multi-Factor Identity Confidence Scoring
           │  base_score (source authority)
           │  + name tokens in URL      (+10 full match, +5 partial)
           │  + company name in URL     (+8)
           │  + Wikipedia/Wikidata      (+5)
           │  + personal site OG image  (+6)
           │  + GitHub avatar           (+4)
           │  + AniList official art    (+10)
           │  = identityScore (0–100)
           │  Candidates sorted descending
           │
Phase 5 ─ Gemini Vision Verification
           │  Sends image to gemini-2.0-flash with context-rich prompt:
           │  "Does this image show Satya Nadella, CEO of Microsoft?"
           │  → VERDICT: YES/NO  CONFIDENCE: 0-100
           │  Rejects if confidence < 80%
           │  Graceful degradation: if Gemini unavailable, trusts score ≥ 90
           │
Phase 6 ─ Cache with 30-Day TTL (compound key)
           Cache key: img:v4:satya-nadella:ceo-of-microsoft:microsoft
           (NOT just: img:satya-nadella)
           One profile's failed lookup never affects any other profile.
```

### Source Confidence Scores

| Source | Base Score | Notes |
|--------|-----------|-------|
| Wikipedia (exact URL) | 97 | Article URL from Tavily search results |
| Wikipedia (rich query) | 93 | Searched via enriched query |
| Wikidata P18 | 91 | Curated portrait property — very accurate |
| AniList | 90 | Official character art for anime/manga |
| GitHub avatar | 89 | Tied to a verified user identity |
| OG image (website) | 87 | From personal or company website |
| DuckDuckGo | 80 | Instant Answer image |
| Unavatar | 60 | Social aggregator — last resort, no verification |

### Example Queries Generated

| Name + Context | Query Used |
|---------------|-----------|
| `Satya Nadella` + `CEO of Microsoft` | `Satya Nadella CEO Microsoft CEO of Microsoft official portrait` |
| `Jensen Huang` + `CEO of NVIDIA` | `Jensen Huang CEO NVIDIA CEO of NVIDIA official portrait` |
| `Vinh Giang` + `Magician` | `Vinh Giang communication coach 52Kards Magician official portrait` |
| `Monkey D. Luffy` + `One Piece` | `Monkey D. Luffy One Piece official artwork` |
| `Naruto Uzumaki` + `Seventh Hokage` | `Naruto Uzumaki Seventh Hokage official artwork` |

---

## Public Sources & References

### Profile Generation
| Source | Purpose | API Key Required |
|--------|---------|-----------------|
| **Tavily** | Parallel web search — fetches 15 results from news, Wikipedia, official sites | Yes (`TAVILY_API_KEY`) |
| **Google Gemini** | AI profile structuring and generation from search results | Yes (`GEMINI_API_KEY`) |

### Image Resolution
| Source | Purpose | API Key Required |
|--------|---------|-----------------|
| **Wikipedia API** | `pageimages` endpoint — official article thumbnails | No |
| **Wikidata API** | `P18` portrait property — curated person photos | No |
| **AniList GraphQL** | Anime/manga character official artwork | No |
| **DuckDuckGo** | Instant Answer images for public figures | No |
| **GitHub Avatars** | `avatars.githubusercontent.com` — developer profiles | No |
| **OG images** | Open Graph `og:image` from personal/company websites | No |
| **Unavatar.io** | Social media avatar aggregator — last resort | No |
| **Gemini Vision** | Verifies each image before display (`gemini-2.0-flash`) | Reuses Gemini key |

---

## Setup

### 1. Clone & Install

```bash
git clone https://github.com/Shivasaiyadav08/Aura.git
cd Aura
npm install
```

### 2. Configure Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# ── Gemini (required — get free keys at aistudio.google.com) ──────────────────
GEMINI_API_KEY=AIza...         # primary key (same as KEY_1 is fine)
GEMINI_API_KEY_1=AIza...       # Google account 1
GEMINI_API_KEY_2=AIza...       # Google account 2
GEMINI_API_KEY_3=AIza...       # Google account 3
GEMINI_API_KEY_4=AIza...       # Google account 4

# ── Tavily search (required — get free key at tavily.com) ────────────────────
TAVILY_API_KEY=tvly-...

# ── Cache (optional — falls back to in-memory if omitted) ────────────────────
REDIS_URL=rediss://...         # Upstash Redis or any Redis with TLS
```

> **Free tiers are sufficient.** Gemini free tier: 15 req/min per key.  
> Tavily free tier: 1,000 searches/month.

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Folder Structure

```
app/
  page.tsx                 Landing page
  research/
    page.tsx               Main research interface (mobile + desktop layout)
  layout.tsx               HTML shell, fonts, providers
  globals.css              Design system, animations, print CSS
  api/
    profile/route.ts       POST — generate profile (maxDuration=60s)
    health/route.ts        GET  — system status + key states

components/
  ProfileForm.tsx           Search form with autocomplete + suggestions
  ProfileReport.tsx         Full report renderer + PDF export
  LoadingState.tsx          Skeleton + animated progress bar

lib/
  image-resolver.ts         ImageSearchService — full 6-phase pipeline
    ├─ extractSourceMetadata()   Phase 1: Parse Tavily results for metadata
    ├─ buildRichQuery()          Phase 2: Build disambiguating query
    ├─ ImageProvider (interface) Phase 3: Modular provider contract
    ├─ WikipediaExactProvider    Provider: Wikipedia via exact URL
    ├─ WikipediaQueryProvider    Provider: Wikipedia via rich query
    ├─ WikidataProvider          Provider: Wikidata P18 portrait
    ├─ GitHubProvider            Provider: GitHub avatar
    ├─ OgImageProvider           Provider: OG image from website
    ├─ AniListProvider           Provider: Anime character art
    ├─ DuckDuckGoProvider        Provider: DDG instant answer
    ├─ UnavatarProvider          Provider: Social aggregator fallback
    ├─ computeIdentityScore()    Phase 4: Multi-factor scoring
    ├─ verifyWithGemini()        Phase 5: Gemini Vision verification
    └─ resolveProfileImage()     Phase 6: Orchestrator + cache

  ai/
    provider.ts            GeminiKeyManager (status tracking, rotation)
    models.ts              Model registry + FALLBACK_CHAIN
    fallback.ts            Orchestrates model × key attempts
    validator.ts           Profile schema validation
    errors.ts              Typed AI error classes
    retry.ts               Retry with exponential backoff
  search.ts                Tavily parallel search (3 concurrent queries)
  prompts.ts               buildProfilePrompt / buildRepairPrompt
  schema.ts                Zod profile schema (30+ fields)
  cache.ts                 Redis + in-memory SmartCache
  image-resolver.ts        ImageSearchService (see above)
  rate-limiter.ts          Per-IP request throttling
  logger.ts                Analytics logger
  utils.ts                 Shared helpers

hooks/
  useSearchHistory.ts      localStorage search history with favorites

providers/
  theme.tsx                Dark/light mode provider
  toast.tsx                Toast notification provider
```

---

## API Reference

### `POST /api/profile`

**Request:**
```json
{ "name": "Satya Nadella", "context": "CEO of Microsoft" }
```

**Success Response:**
```json
{
  "success": true,
  "profile": {
    "profileImageUrl": "https://upload.wikimedia.org/...",
    "executiveSummary": "...",
    "basicDetails": { "fullName": "Satya Nadella", "currentRole": "CEO", ... },
    "biography": "...",
    "careerTimeline": [...],
    "education": [...],
    "sources": [{ "id": "1", "title": "...", "url": "...", "snippet": "..." }],
    "sourceQuality": "Well sourced"
  },
  "modelUsed": "gemini-2.5-flash",
  "latencyMs": 9240,
  "cacheHit": false
}
```

**Error Response (always sanitised — no internal details leaked):**
```json
{ "success": false, "error": "We're experiencing unusually high demand. Please try again shortly." }
```

### `GET /api/health`

Returns key rotation status, environment config, and analytics.

---

## Adding a New Image Provider

1. Create a class implementing `ImageProvider` in `lib/image-resolver.ts`:

```typescript
class MyNewProvider implements ImageProvider {
  readonly name = "my-provider";

  async fetch(q: ImageSearchQuery): Promise<Pick<ImageCandidate, "url" | "source" | "baseScore"> | null> {
    // q.personName, q.richQuery, q.pctx, q.metadata, q.isFictional
    const imgUrl = await myApi.search(q.richQuery);
    if (!imgUrl) return null;
    return { url: imgUrl, source: this.name, baseScore: 85 };
  }
}
```

2. Add it to the provider list:

```typescript
const REAL_PERSON_PROVIDERS: ImageProvider[] = [
  // ... existing providers ...
  new MyNewProvider(),   // ← add here
];
```

That's it. The pipeline automatically scores, verifies, and caches its output.

---

## Performance

| Scenario | Latency |
|---------|---------|
| Cache hit (Redis) | ~50 ms |
| Cache hit (memory) | ~5 ms |
| First generation (cold) | 12–35 s |
| Image verification (Gemini Vision) | +3–8 s |
| All keys rate-limited | Automatic fallback — no error shown |

---

## Deployment (Vercel)

1. Push to GitHub
2. Import in [Vercel dashboard](https://vercel.com/import)
3. Add all environment variables (`Settings → Environment Variables`)
4. Deploy — `maxDuration = 60` is already configured for long AI requests

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | ✅ | Primary Gemini key |
| `GEMINI_API_KEY_1` – `_4` | Recommended | One key per Google account (16-attempt chain) |
| `TAVILY_API_KEY` | ✅ | Web search API |
| `REDIS_URL` | Optional | Persistent cache — falls back to in-memory |
| `NEXT_PUBLIC_APP_URL` | Optional | Absolute URL for metadata |

---

## Accuracy Design Principles

1. **Never search by name alone** — always include role, company, or franchise
2. **Multiple sources, not one** — cross-validate across Wikipedia, Wikidata, GitHub, AniList
3. **Gemini Vision as gate** — pixel-level verification before any image is shown
4. **No image > wrong image** — if no candidate passes verification, show professional initials
5. **Independent caching** — compound key ensures one profile never corrupts another
6. **Fictional character support** — AniList for anime/manga, Wikipedia for others

---

## PDF Export

Click **Export PDF** in the report action bar. The browser's print dialog opens with A4-optimised CSS — no decorative elements, proper page breaks, full citation preservation.
