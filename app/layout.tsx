import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/providers/theme";
import { ToastProvider } from "@/providers/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aura — AI Research Platform",
  description:
    "Generate citation-backed intelligence reports on public figures. Powered by multi-model AI with automatic fallback and parallel web search.",
  keywords: ["AI research", "public figure analysis", "executive intelligence", "profile generator"],
  authors: [{ name: "Aura AI" }],
  openGraph: {
    title: "Aura — AI Research Platform",
    description: "Instant, citation-backed intelligence reports on any public figure.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0d14" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Inline script to prevent theme flash before hydration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('aura-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
