/** @type {import('next').NextConfig} */
const nextConfig = {
  // ─── Image Domains ──────────────────────────────────────────────────────────
  // Allow external images from all providers used by ImageSearchService
  images: {
    remotePatterns: [
      // Wikipedia / Wikimedia / Wikidata
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "*.wikipedia.org" },
      { protocol: "https", hostname: "commons.wikimedia.org" },
      // GitHub avatars
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      // Google (Unavatar fallback + favicon service)
      { protocol: "https", hostname: "*.googleusercontent.com" },
      { protocol: "https", hostname: "www.google.com" },
      // Unavatar
      { protocol: "https", hostname: "unavatar.io" },
      // AniList CDN
      { protocol: "https", hostname: "s4.anilist.co" },
      { protocol: "https", hostname: "*.anilist.co" },
      // DuckDuckGo instant answers
      { protocol: "https", hostname: "*.duckduckgo.com" },
      { protocol: "https", hostname: "duckduckgo.com" },
      // General og-image/personal sites — permissive wildcard
      { protocol: "https", hostname: "**" },
    ],
  },

  // ─── Security Headers ───────────────────────────────────────────────────────
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://fonts.googleapis.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              // ── img-src: all image providers used by ImageSearchService ──
              "img-src 'self' data: blob:"
                + " https://upload.wikimedia.org"
                + " https://*.wikipedia.org"
                + " https://commons.wikimedia.org"
                + " https://unavatar.io"
                + " https://avatars.githubusercontent.com"
                + " https://*.googleusercontent.com"
                + " https://www.google.com"
                + " https://*.anilist.co"
                + " https://*.duckduckgo.com"
                + " https://*.wikia.com"
                + " https://*.wikia-services.com"
                + " https://*.fandom.com"
                + " https://i.imgur.com"
                + " https://*.imgur.com"
                + " https://media.licdn.com"
                + " https://pbs.twimg.com"
                + " https://*.twimg.com",
              // ── connect-src: API endpoints called by client + server ──
              "connect-src 'self'"
                + " https://api.tavily.com"
                + " https://en.wikipedia.org"
                + " https://www.wikidata.org"
                + " https://generativelanguage.googleapis.com"
                + " https://graphql.anilist.co"
                + " https://api.duckduckgo.com",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },

  // ─── External packages for server-side use ──────────────────────────────────
  experimental: {
    serverComponentsExternalPackages: ["ioredis"],
  },

  // ─── TypeScript & ESLint ────────────────────────────────────────────────────
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

module.exports = nextConfig;
