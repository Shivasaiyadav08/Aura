# Aura — AI Intelligence Research Platform

> Enter a name. Get a complete, citation-backed intelligence report in seconds.

[![Live Demo](https://img.shields.io/badge/Live-aura--azure--theta.vercel.app-blue?style=flat-square)](https://aura-azure-theta.vercel.app)
[![GitHub](https://img.shields.io/badge/GitHub-Shivasaiyadav08%2FAura-181717?style=flat-square&logo=github)](https://github.com/Shivasaiyadav08/Aura)
[![Next.js 14](https://img.shields.io/badge/Next.js-14-black?style=flat-square)](https://nextjs.org)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

---

## What it does

Aura researches any public figure — real person or fictional character — and generates a structured intelligence profile with:

- Executive summary · biography · career timeline · education
- Net worth · achievements · awards · recent activities
- Citation-backed sources for every claim
- Accurately matched portrait image (verified by Gemini Vision)
- One-click PDF export

---
## sample

### (PDF IMAGES)
<img width="598" height="839" alt="Screenshot 2026-07-05 190017" src="https://github.com/user-attachments/assets/a2438622-ab53-4e27-9d39-aff93d0277a0" />
<img width="747" height="418" alt="Screenshot 2026-07-05 190041" src="https://github.com/user-attachments/assets/a1d37c5e-7caa-4801-a005-22b260e142c0" />


## How to use

1. **Open the app** → [aura-azure-theta.vercel.app/research](https://aura-azure-theta.vercel.app/research)
2. **Enter a name** — e.g. `Satya Nadella`
3. **Enter context** — e.g. `CEO of Microsoft` (helps disambiguate common names)
4. Click **Build Intelligence Dossier**
5. Wait 10–30 seconds for the report to generate
6. Browse the report, click source citations, or click **Export PDF**

**Tips:**
- Use the **Recent** panel (desktop sidebar / mobile bottom strip) to revisit past searches
- ⭐ **Favourite** a search to pin it to the top
- Works for anime/manga characters too — try `Monkey D. Luffy` + `One Piece`

---

## Full System Flow

```
User enters: "Satya Nadella" + "CEO of Microsoft"
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  1. RATE LIMIT CHECK                                        │
│     lib/rate-limiter.ts  — per-IP throttling                │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  2. CACHE CHECK                                             │
│     lib/cache.ts  — Redis (or in-memory fallback)           │
│     Cache hit → return immediately (~50 ms)                 │
└──────────────────────────┬──────────────────────────────────┘
                           │ Cache miss
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  3. PARALLEL WEB SEARCH                                     │
│     lib/search.ts  — Tavily API                             │
│     3 concurrent queries:                                   │
│       • "Satya Nadella CEO Microsoft"                       │
│       • "Satya Nadella Microsoft biography career"          │
│       • "Satya Nadella net worth achievements 2024"         │
│     Returns 15 ranked, deduplicated sources with content    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  4. AI PROFILE GENERATION                                   │
│     lib/ai/fallback.ts  — 16-attempt fallback chain         │
│                                                             │
│     Model 1: gemini-2.5-flash  × [key1, key2, key3, key4]  │
│     Model 2: gemini-2.0-flash  × [key1, key2, key3, key4]  │
│     Model 3: gemini-2.0-flash-lite × [all keys]            │
│     Model 4: gemini-1.5-flash  × [all keys]                │
│                                                             │
│     Each attempt:                                           │
│       → Send search results + structured prompt             │
│       → Parse JSON profile (30+ fields)                     │
│       → Validate with Zod schema                            │
│       → On failure: try next key, then next model           │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  5. IMAGE RESOLUTION  (lib/image-resolver.ts)               │
│                                                             │
│  Phase 1 — Extract metadata from Tavily results (free)      │
│    Wikipedia URL · GitHub username · personal site          │
│                                                             │
│  Phase 2 — Build rich query (never name-only)               │
│    "Satya Nadella CEO Microsoft official portrait"          │
│                                                             │
│  Phase 3 — Search 8 providers in parallel                   │
│    Wikipedia (exact) → Wikipedia (query) → Wikidata P18     │
│    → GitHub avatar → OG image → DuckDuckGo → AniList        │
│    → Unavatar (last resort)                                 │
│                                                             │
│  Phase 4 — Identity confidence scoring                      │
│    source authority + name in URL + company match           │
│                                                             │
│  Phase 5 — Gemini Vision verification                       │
│    "Does this image show Satya Nadella, CEO of Microsoft?"  │
│    Accept only if confidence ≥ 80%                          │
│    Reject → try next candidate                              │
│    All rejected → return null (show initials placeholder)   │
│                                                             │
│  Phase 6 — Cache URL for 30 days (compound key)             │
│    img:v4:satya-nadella:ceo-of-microsoft:microsoft          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  6. CACHE & RESPOND                                         │
│     Cache full profile · Return JSON to browser             │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
                    Profile rendered in UI
```

---

## Technologies & Purpose

| Technology | Role | Why |
|-----------|------|-----|
| **Next.js 14** | Full-stack framework | App Router, API routes, SSR/static hybrid, one deploy |
| **TypeScript** | Language | Type safety across the entire stack |
| **Tailwind CSS** | Styling | Utility-first, design tokens, dark mode |
| **Google Gemini API** | AI profile generation + Vision verification | Best-in-class reasoning + multimodal (image verification) |
| **Tavily Search API** | Web research | Real-time, AI-optimised search with content extraction |
| **Zod** | Schema validation | Runtime type checking of AI-generated JSON |
| **Redis (Upstash)** | Persistent cache | Sub-100ms repeat responses; falls back to in-memory |
| **AniList GraphQL** | Anime character images | Official licensed artwork for fictional characters |
| **Wikipedia API** | Person images + article data | Free, authoritative, global coverage |
| **Wikidata API** | P18 portrait property | Curated person photos, linked to knowledge graph |
| **DuckDuckGo API** | Fallback images | Instant Answer images for public figures |
| **Vercel** | Deployment | Edge-optimised, auto-deploy from GitHub, free tier |

### AI Resilience — 16-Attempt Fallback

```
gemini-2.5-flash     × 4 keys  =  4 attempts   (primary)
gemini-2.0-flash     × 4 keys  =  4 attempts   (fallback 1)
gemini-2.0-flash-lite × 4 keys =  4 attempts   (fallback 2)
gemini-1.5-flash     × 4 keys  =  4 attempts   (fallback 3)
──────────────────────────────────────────────────────
Total: 16 attempts before any error is shown
```

Rate-limited keys go on automatic cooldown and are skipped. They restore themselves — no manual intervention needed.

---

## Project Structure

```
app/
  page.tsx                  Landing page
  research/page.tsx         Main research interface
  layout.tsx                HTML shell, fonts, theme providers
  globals.css               Design system, animations, print CSS
  api/
    profile/route.ts        POST /api/profile  (maxDuration = 60s)
    health/route.ts         GET  /api/health   (system status)

components/
  ProfileForm.tsx           Search form + autocomplete suggestions
  ProfileReport.tsx         Report renderer, PDF export, citation links
  LoadingState.tsx          Animated skeleton + progress indicator

lib/
  image-resolver.ts         ImageSearchService — full 8-provider pipeline
  search.ts                 Tavily parallel search (3 concurrent queries)
  cache.ts                  Redis + in-memory SmartCache with TTL
  rate-limiter.ts           Per-IP throttling
  logger.ts                 Request analytics
  utils.ts                  Shared helpers
  schema.ts                 Zod profile schema (30+ fields)
  ai/
    fallback.ts             16-attempt model × key orchestrator
    provider.ts             GeminiKeyManager — status tracking, cooldowns
    models.ts               Model registry + fallback chain
    validator.ts            AI output validation
    errors.ts               Typed AI error classes

hooks/
  useSearchHistory.ts       localStorage search history, favourites, rename

providers/
  theme.tsx                 Dark / light mode
  toast.tsx                 Toast notifications
```

---

## Setup

### 1. Clone & install

```bash
git clone https://github.com/Shivasaiyadav08/Aura.git
cd Aura
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

```env
# ── Gemini AI (required)
# Get free keys at: https://aistudio.google.com/app/apikey
GEMINI_API_KEY=AIza...


# ── Tavily Search (required)
# Get free key at: https://tavily.com  (1,000 searches/month free)
TAVILY_API_KEY=tvly-...

# ── Redis Cache (optional)
# Falls back to in-memory if not set
# Recommended: https://upstash.com  (free tier available)
REDIS_URL=rediss://...
```

### 3. Run

```bash
npm run dev
# Open http://localhost:3000
```

### 4. Deploy to Vercel

```bash
# Push to GitHub, then:
# 1. Import repo at vercel.com/import
# 2. Add all env vars in Settings → Environment Variables
# 3. Deploy — no extra config needed
```

---

## Environment Variables

| Variable | Required | Description |
|----------|:--------:|-------------|
| `GEMINI_API_KEY` | ✅ | Primary Gemini key |
| `TAVILY_API_KEY` | ✅ | Web search |
| `REDIS_URL` | Optional | Persistent cache (Upstash recommended) |
| `NEXT_PUBLIC_APP_URL` | Optional | Absolute URL for metadata |

---

## Performance

| Scenario | Response time |
|---------|:------------:|
| Cache hit (Redis) | ~50 ms |
| Cache hit (in-memory) | ~5 ms |
| First generation | 10–30 s |
| + Image resolution | +3–8 s |
| All keys rate-limited | Automatic fallback, no downtime |

---

## Adding a New Image Provider

The image pipeline is fully modular. To add a new source:

```typescript
// lib/image-resolver.ts

class MyNewProvider implements ImageProvider {
  readonly name = "my-source";

  async fetch(q: ImageSearchQuery): Promise<Pick<ImageCandidate, "url" | "source" | "baseScore"> | null> {
    const url = await myApi.search(q.richQuery);
    return url ? { url, source: this.name, baseScore: 85 } : null;
  }
}

// Register it:
const REAL_PERSON_PROVIDERS: ImageProvider[] = [
  ...existingProviders,
  new MyNewProvider(),  // ← add here
];
```

The pipeline handles scoring, Gemini verification, caching, and fallback automatically.

---

## Future Improvements

### 🖼️ Image Accuracy
| Improvement | Description |
|------------|-------------|
| **Google Knowledge Graph API** | Direct entity lookup by name + type → returns the canonical image used in Google Search. Highest possible accuracy. Requires GCP project. |
| **Getty Images / Shutterstock API** | Professional editorial photos for public figures. Paid but extremely accurate. |
| **Bing Image Search API** | Supports filtering by `imageType=Photo` and `safeSearch`. Better than DuckDuckGo for less-prominent figures. |
| **Reverse image search validation** | After finding a candidate, use Google Vision or Bing to reverse-search it — confirm the top result matches the person's name. |
| **Face detection pre-filter** | Before sending to Gemini Vision, use a face-detection API to ensure the image contains exactly one face. Eliminates group photos and logos cheaply. |
| **Company LinkedIn scraping (via Proxycurl)** | LinkedIn headshots are authoritative. Proxycurl provides structured LinkedIn data including profile photos. |
| **Official website structured data** | Parse `schema.org/Person` JSON-LD from personal websites for authoritative images. |
| **Persistent candidate store** | Store all rejected candidates with their scores in a DB for debugging and manual correction. |

### 🤖 AI Profile Quality
| Improvement | Description |
|------------|-------------|
| **Perplexity API** | Real-time web-search-augmented LLM — better for recent events and less-prominent people. |
| **Multiple source corroboration** | Cross-check facts across sources before including. Claim only added if ≥ 2 sources agree. |
| **Structured Wikipedia extraction** | Directly parse Wikipedia infoboxes instead of relying on LLM inference for basic facts. |
| **Real-time news integration** | Include a "Latest News" section using a news API (NewsAPI, GDELT). |
| **Confidence intervals per field** | Show per-field confidence ranges in the UI so users know which data is solid vs. inferred. |

### ⚡ Performance & Scale
| Improvement | Description |
|------------|-------------|
| **Streaming responses** | Stream the AI output token-by-token to the client — users see data appearing immediately instead of waiting. |
| **Background image resolution** | Return the profile immediately, resolve the image asynchronously, push via WebSocket or SSE. |
| **Vectorised search history** | Use embeddings to find semantically similar past searches and suggest them. |
| **Rate limit dashboard** | Admin panel showing API key health, usage per key, and cooldown status in real time. |

### 🌐 Coverage
| Improvement | Description |
|------------|-------------|
| **Multi-language profiles** | Search in the subject's native language (Japanese for anime, French for French politicians). |
| **Company profiles** | Extend the schema to support organisations, not just people. |
| **Batch research** | Research multiple people at once, e.g. a full executive team. |
| **Browser extension** | Trigger a profile from any webpage by right-clicking a person's name. |

---

## License

MIT — see [LICENSE](LICENSE)

---

<div align="center">
  Built by <a href="https://github.com/Shivasaiyadav08">Shivasaiyadav08</a> · Powered by Gemini · Tavily · Next.js
</div>
