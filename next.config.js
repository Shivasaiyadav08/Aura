/** @type {import('next').NextConfig} */
const nextConfig = {
  // ─── Image Domains ──────────────────────────────────────────────────────────
  // Allow external images (Wikipedia profile photos, avatars)
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "*.wikipedia.org" },
      { protocol: "https", hostname: "unavatar.io" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
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
              "img-src 'self' data: blob: https://upload.wikimedia.org https://*.wikipedia.org https://unavatar.io https://avatars.githubusercontent.com https://*.googleusercontent.com",
              "connect-src 'self' https://api.tavily.com https://en.wikipedia.org https://generativelanguage.googleapis.com",
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
