"use client";
import Link from "next/link";
import { useTheme } from "@/providers/theme";

const SunIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);
const MoonIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);
const ArrowRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
);
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    ),
    title: "Parallel Web Research",
    desc: "Simultaneously queries Wikipedia, LinkedIn, news archives, and public records. Returns ranked, deduplicated sources in seconds.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
    title: "4-Model AI Fallback",
    desc: "Uses Gemini 2.5 Flash → 2.0 Flash → 2.0 Lite → 1.5 Flash. Each model is tried with all API keys. Up to 16 attempts before any error.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
    title: "Citation-Backed Reports",
    desc: "Every claim is traceable to a numbered source. Executive summary, career timeline, education, net worth, and recent activities — all cited.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
    title: "Smart Key Rotation",
    desc: "Rate-limited API keys are automatically put on cooldown and replaced. Dead keys never block results — the system routes around them.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
      </svg>
    ),
    title: "Redis-Backed Cache",
    desc: "First search takes 8–25s. Repeat searches return in under 500ms via Redis cache. Falls back to in-memory if Redis is unavailable.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
        <rect x="6" y="14" width="12" height="8"/>
      </svg>
    ),
    title: "PDF Export",
    desc: "Export any report to a professional A4 PDF with one click. Includes all sections, citations, and source references. Print-optimized layout.",
  },
];

const STATS = [
  { value: "16", label: "Max AI attempts" },
  { value: "4", label: "Gemini models" },
  { value: "<1s", label: "Cache hit speed" },
  { value: "100%", label: "Error sanitized" },
];

export default function LandingPage() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="landing-shell bg-white dark:bg-[#06090f] text-slate-900 dark:text-white">

      {/* ── Navigation ───────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-slate-100 dark:border-slate-800/60 bg-white/90 dark:bg-[#06090f]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-lg shadow-blue-500/25">
              A
            </div>
            <span className="text-sm font-black tracking-tight font-outfit text-slate-900 dark:text-white">Aura</span>
            <span className="hidden sm:block text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/50 rounded px-1.5 py-0.5 ml-1">
              AI Research Platform
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Toggle theme"
            >
              {theme === "light" ? <MoonIcon /> : <SunIcon />}
            </button>
            <Link
              href="/research"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm shadow-blue-500/25 transition-all"
            >
              Open App
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pt-24 pb-20 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-blue-200 dark:border-blue-800/60 bg-blue-50 dark:bg-blue-950/30 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-[11px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-widest">
            Powered by Gemini AI
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tight leading-[1.05] font-outfit mb-6">
          <span className="text-slate-900 dark:text-white">Executive</span>
          <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-indigo-500 to-violet-600 dark:from-blue-400 dark:via-indigo-300 dark:to-violet-400">
            Intelligence Reports
          </span>
        </h1>

        <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed mb-10">
          Instant, citation-backed research reports on any public figure.
          Parallel web search, AI synthesis across 4 Gemini models, and automatic key rotation
          — so you always get results.
        </p>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/research"
            className="group flex items-center gap-2.5 px-7 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-lg shadow-blue-500/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            Start Research
            <span className="group-hover:translate-x-0.5 transition-transform">
              <ArrowRight />
            </span>
          </Link>
          <a
            href="/api/health"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-5 py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all"
          >
            System Status
          </a>
        </div>

        {/* Stats row */}
        <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-200 dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
          {STATS.map(s => (
            <div key={s.label} className="bg-white dark:bg-[#0c1018] px-6 py-5 text-center">
              <p className="text-3xl font-black text-blue-600 dark:text-blue-400 font-outfit">{s.value}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-500 font-semibold uppercase tracking-wider mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="text-center mb-12">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-blue-600 dark:text-blue-500 mb-3">Platform Capabilities</p>
          <h2 className="text-3xl font-black text-slate-900 dark:text-white font-outfit tracking-tight">
            Built for reliability at scale
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0c1018] hover:border-blue-200 dark:hover:border-blue-800/60 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-200"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4">
                {f.icon}
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2 font-outfit">{f.title}</h3>
              <p className="text-[13px] text-slate-600 dark:text-slate-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Fallback Chain Visual ─────────────────────────────────────────── */}
      <section className="border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-[#080b10]">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-blue-600 dark:text-blue-500 mb-3">Resilience Architecture</p>
            <h2 className="text-3xl font-black text-slate-900 dark:text-white font-outfit tracking-tight">
              Never fails because one key is busy
            </h2>
            <p className="mt-3 text-slate-600 dark:text-slate-400 text-sm max-w-lg mx-auto">
              With 4 accounts × 4 models, the system makes up to 16 attempts before showing any error to the user.
            </p>
          </div>

          <div className="max-w-3xl mx-auto">
            {[
              { model: "Gemini 2.5 Flash", timeout: "90s", badge: "Primary", color: "blue" },
              { model: "Gemini 2.0 Flash", timeout: "60s", badge: "Fallback 1", color: "indigo" },
              { model: "Gemini 2.0 Flash Lite", timeout: "45s", badge: "Fallback 2", color: "violet" },
              { model: "Gemini 1.5 Flash", timeout: "60s", badge: "Fallback 3", color: "purple" },
            ].map((row, i) => (
              <div key={row.model} className="flex items-center gap-4 mb-3">
                {/* Step number */}
                <div className="w-7 h-7 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-[11px] font-bold text-slate-500 dark:text-slate-400 flex-shrink-0">
                  {i + 1}
                </div>
                {/* Model row */}
                <div className="flex-1 flex items-center justify-between px-5 py-3.5 rounded-xl bg-white dark:bg-[#0c1018] border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{row.model}</span>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      row.badge === "Primary"
                        ? "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                    }`}>
                      {row.badge}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">{row.timeout} timeout</span>
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">× 4 keys</span>
                  </div>
                </div>
              </div>
            ))}

            <div className="mt-5 flex items-center gap-3 px-5 py-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40">
              <span className="text-emerald-600 dark:text-emerald-400"><CheckIcon /></span>
              <span className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">
                If all models succeed → profile delivered. If all fail → single clean error message shown.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA Banner ───────────────────────────────────────────────────── */}
      <section className="border-t border-slate-100 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-20 text-center">
          <h2 className="text-4xl font-black text-slate-900 dark:text-white font-outfit tracking-tight mb-4">
            Ready to research?
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-8 text-sm">
            Enter a name and context. Get a full intelligence report in under 30 seconds.
          </p>
          <Link
            href="/research"
            className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-xl shadow-blue-500/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            Start Research
            <ArrowRight />
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-[#06090f]">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-[9px]">A</div>
            <span className="text-sm font-bold text-slate-900 dark:text-white font-outfit">Aura</span>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            AI Research Platform · Built with Next.js, Gemini AI, Tavily Search
          </p>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">All systems operational</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
