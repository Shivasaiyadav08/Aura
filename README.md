# Aura — AI Research Platform

> Generate citation-backed executive intelligence reports on any public figure — powered by Gemini with 4-account key rotation and automatic model fallback.

---

## Architecture

```
Browser
  └─ app/page.tsx          Fixed sidebar layout (320px) + scrollable content
       └─ /api/profile     Rate limit → Cache check → Search → AI Generation → Response
             ├─ lib/search       Tavily parallel web search
             ├─ lib/ai/fallback  4-model fallback chain (all keys tried per model)
             ├─ lib/ai/provider  Smart KeyManager (status tracking + cooldowns)
             └─ lib/cache        Redis (if available) or in-memory
```

## AI Resilience: Key Rotation × Model Fallback

With 4 Gemini accounts configured, the system has **16 total attempts** before giving up:

```
gemini-2.5-flash    × [key1, key2, key3, key4]  → 4 attempts
gemini-2.5-flash-lite × [key1, key2, key3, key4] → 4 attempts  
gemini-2.0-flash    × [key1, key2, key3, key4]  → 4 attempts
gemini-1.5-flash    × [key1, key2, key3, key4]  → 4 attempts
──────────────────────────────────────────────────────────────
Total: 16 attempts before showing a user-facing error
```

**Key states:**
| Status | Trigger | Cooldown |
|---|---|---|
| `quota-exceeded` | 429 / Resource Exhausted | 2 minutes |
| `cooling` | 500/503/overloaded | 45 seconds |
| `rate-limited` | Other transient errors | 60 seconds |
| `available` | Default / after cooldown | — |

Keys auto-restore after their cooldown period. Users **never see** provider names, key indices, or error codes.

---

## Setup

### 1. Clone + Install

```bash
git clone <repo-url>
cd AI-PROFILE
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# Gemini keys — one per Google account (minimum 1, recommended 4)
GEMINI_API_KEY=AIza...
GEMINI_API_KEY_1=AIza...   # account 1
GEMINI_API_KEY_2=AIza...   # account 2
GEMINI_API_KEY_3=AIza...   # account 3
GEMINI_API_KEY_4=AIza...   # account 4

# Search (required)
TAVILY_API_KEY=tvly-...

# Cache (optional — falls back to in-memory)
REDIS_URL=redis://...
```

Get free Gemini keys: https://aistudio.google.com/app/apikey (one per Google account)  
Get free Tavily key: https://tavily.com

### 3. Run

```bash
npm run dev
```

Visit: http://localhost:3000

---

## Folder Structure

```
app/
  page.tsx               Main layout (fixed sidebar + content)
  layout.tsx             HTML shell, fonts, theme flash prevention
  globals.css            Design system, animations, print CSS
  api/
    profile/route.ts     POST — generate profile
    health/route.ts      GET  — system status + key states

components/
  ProfileForm.tsx        Search form with autocomplete
  ProfileReport.tsx      Full report renderer
  LoadingState.tsx       Skeleton + progress bar

lib/
  ai/
    provider.ts          GeminiKeyManager (status tracking, rotation)
    models.ts            Model registry + FALLBACK_CHAIN
    fallback.ts          Orchestrates model × key attempts
    keyRotation.ts       Key stats helpers
    validator.ts         Profile schema validation
    errors.ts            Typed AI error classes
    retry.ts             Retry with exponential backoff
  search.ts              Tavily parallel search
  prompts.ts             buildProfilePrompt / buildRepairPrompt
  schema.ts              Zod profile schema
  cache.ts               Redis + in-memory cache
  export.ts              exportToPdf()
  image-resolver.ts      Wikipedia → Unavatar image pipeline
  rate-limiter.ts        Per-IP request throttling
  logger.ts              Analytics logger
  utils.ts               Shared utilities

types/
  index.ts               Shared TypeScript types
```

---

## API Reference

### `POST /api/profile`

**Request:**
```json
{ "name": "Satya Nadella", "context": "CEO of Microsoft" }
```

**Response (success):**
```json
{
  "success": true,
  "profile": { ... },
  "modelUsed": "Gemini 2.5 Flash",
  "latencyMs": 8240,
  "cacheHit": false
}
```

**Response (error — always sanitized):**
```json
{
  "success": false,
  "error": "We're experiencing unusually high demand. Please try again shortly."
}
```

### `GET /api/health`

Returns key status, environment config, and request analytics.

---

## Performance

| Scenario | Latency |
|---|---|
| Cache hit (Redis) | ~50ms |
| Cache hit (memory) | ~5ms |
| First search | 8–25s |
| All keys rate-limited | automatic fallback, no error |

---

## PDF Export

Click **Export PDF** in the report action bar — opens the browser's native print dialog. Save as PDF for a professional, paginated report. The print CSS is tuned for A4 layout with proper page breaks, no decorative elements, and full citation preservation.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Primary key (can duplicate KEY_1) |
| `GEMINI_API_KEY_1` – `_4` | Recommended | One key per Google account |
| `TAVILY_API_KEY` | Yes | Web search API key |
| `REDIS_URL` | Optional | Persistent cache (falls back to in-memory) |
| `NEXT_PUBLIC_APP_URL` | Optional | Used for absolute URLs |

---

## Deployment (Vercel)

1. Push to GitHub
2. Import in Vercel dashboard
3. Add all env vars (Settings → Environment Variables)
4. Deploy — no additional config needed
