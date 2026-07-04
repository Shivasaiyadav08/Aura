"use client";

import { useState, useRef, useCallback } from "react";
import type { Profile } from "@/lib/schema";
import { ProfileForm } from "@/components/ProfileForm";
import { ProfileReport } from "@/components/ProfileReport";
import { LoadingState } from "@/components/LoadingState";
import { useSearchHistory } from "@/hooks/useSearchHistory";
import { useTheme } from "@/providers/theme";
import { useToast } from "@/providers/toast";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type AppState =
  | { status: "idle" }
  | { status: "loading"; name: string; context: string }
  | { status: "success"; profile: Profile; name: string; context: string }
  | { status: "error"; message: string; name?: string; context?: string };

// ─── Icons ────────────────────────────────────────────────────────────────────

const SunIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);
const MoonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);
const StarFilledIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
);
const StarIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);
const PencilIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const TrashIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
  </svg>
);
const ClockIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);
const MenuIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
);
const XIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const SearchIcon = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);
const HomeIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

// ─── History Item ─────────────────────────────────────────────────────────────

interface HistoryItemProps {
  item: any;
  isEditing: boolean;
  editingName: string;
  onSelect: () => void;
  onStartEdit: (e: React.MouseEvent) => void;
  onSaveRename: (e: React.MouseEvent | React.KeyboardEvent) => void;
  onEditNameChange: (val: string) => void;
  onToggleFav: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}

function HistoryItem({ item, isEditing, editingName, onSelect, onStartEdit, onSaveRename, onEditNameChange, onToggleFav, onDelete }: HistoryItemProps) {
  return (
    <div
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onSelect()}
      className="group flex items-center gap-2 px-2 py-2 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors duration-100"
    >
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center text-[10px] font-bold text-blue-700 dark:text-slate-400 flex-shrink-0 border border-blue-100 dark:border-slate-700">
        {item.name.split(" ").slice(0, 2).map((w: string) => w[0] || "").join("").toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <input
            type="text"
            value={editingName}
            onChange={e => onEditNameChange(e.target.value)}
            onClick={e => e.stopPropagation()}
            onKeyDown={e => { if (e.key === "Enter") onSaveRename(e); }}
            className="w-full text-xs font-semibold bg-white dark:bg-slate-900 border border-blue-400 rounded px-1.5 py-0.5 focus:outline-none text-slate-900 dark:text-white"
            autoFocus
          />
        ) : (
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">{item.name}</span>
        )}
        <span className="text-[10px] text-slate-500 dark:text-slate-500 block truncate">{item.context}</span>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {isEditing ? (
          <button onClick={onSaveRename as any} className="p-1 rounded text-emerald-600 text-[10px] font-bold hover:bg-emerald-50 dark:hover:bg-emerald-950/30">✓</button>
        ) : (
          <button onClick={onStartEdit} className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700" title="Rename"><PencilIcon /></button>
        )}
        <button onClick={onToggleFav} className={`p-1 rounded hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors ${item.isFavorite ? "text-amber-500" : "text-slate-400 hover:text-amber-500"}`} title={item.isFavorite ? "Unfavorite" : "Favorite"}>
          {item.isFavorite ? <StarFilledIcon /> : <StarIcon />}
        </button>
        <button onClick={onDelete} className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors" title="Delete"><TrashIcon /></button>
      </div>
    </div>
  );
}

// ─── Research Page ────────────────────────────────────────────────────────────

export default function ResearchPage() {
  const [state, setState] = useState<AppState>({ status: "idle" });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const { history, saveToHistory, deleteEntry, toggleFavorite, renameEntry, clearHistory } = useSearchHistory();

  const handleSubmit = useCallback(async (name: string, context: string) => {
    setState({ status: "loading", name, context });
    setSidebarOpen(false);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, context }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setState({ status: "error", message: data.error || "We&apos;re experiencing unusually high demand. Please try again shortly.", name, context });
        return;
      }
      setState({ status: "success", profile: data.profile, name, context });
      saveToHistory(name, context, data.profile);
      toast(`Report for ${name} generated successfully.`, "success");
    } catch {
      setState({ status: "error", message: "Unable to connect. Please check your internet connection and try again.", name, context });
    }
  }, [saveToHistory, toast]);

  const handleHistorySelect = useCallback(async (item: any) => {
    setState({ status: "success", profile: item.profile, name: item.name, context: item.context });
    setSidebarOpen(false);

    // Re-resolve image from Wikipedia if not in saved profile
    if (!item.profile.profileImageUrl && item.profile.sources?.length > 0) {
      const wikiSource = item.profile.sources.find((s: any) => s.url?.includes("wikipedia.org/wiki/"));
      if (wikiSource) {
        try {
          const title = decodeURIComponent((wikiSource.url.match(/\/wiki\/([^#?]+)/) || [])[1] || "");
          if (title) {
            const res = await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&format=json&pithumbsize=600&origin=*`);
            const data = await res.json();
            const pages = data.query?.pages;
            if (pages) {
              const thumb = pages[Object.keys(pages)[0]]?.thumbnail?.source;
              if (thumb) setState(prev => prev.status === "success" ? { ...prev, profile: { ...prev.profile, profileImageUrl: thumb } } : prev);
            }
          }
        } catch { /* non-fatal */ }
      }
    }
    toast(`Loaded: ${item.name}`, "success");
  }, [toast]);

  const handleReset = () => { setState({ status: "idle" }); setEditingId(null); };

  const startEditing = (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditingName(name);
  };
  const saveRename = (id: string, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (editingName.trim().length >= 2) { renameEntry(id, editingName.trim()); setEditingId(null); toast("Renamed.", "success"); }
  };

  const favorites = history.filter(h => h.isFavorite);
  const recents = history.filter(h => !h.isFavorite).slice(0, 15);

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-4 py-4 border-b border-slate-100 dark:border-slate-800/60 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-md shadow-blue-500/20">A</div>
          <div>
            <span className="text-sm font-black text-slate-900 dark:text-white tracking-tight font-outfit">Aura</span>
            <span className="ml-1.5 text-[9px] font-semibold text-slate-500 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5">Research</span>
          </div>
        </div>
      </div>

      {/* Search form */}
      <div className="px-4 py-4 border-b border-slate-100 dark:border-slate-800/60 flex-shrink-0">
        <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-500 mb-3">Research Target</p>
        <ProfileForm onSubmit={handleSubmit} isLoading={state.status === "loading"} inputRef={searchInputRef} />
      </div>

      {/* History */}
      <div className="flex-1 overflow-y-auto">
        {favorites.length > 0 && (
          <div>
            <p className="sidebar-section-title flex items-center gap-1.5">⭐ Favorites</p>
            <div className="px-2 pb-2 space-y-0.5">
              {favorites.map(item => (
                <HistoryItem key={item.id} item={item} isEditing={editingId === item.id} editingName={editingName}
                  onSelect={() => handleHistorySelect(item)} onStartEdit={e => startEditing(item.id, item.name, e)}
                  onSaveRename={e => saveRename(item.id, e)} onEditNameChange={setEditingName}
                  onToggleFav={e => { e.stopPropagation(); toggleFavorite(item.id); }}
                  onDelete={e => { e.stopPropagation(); deleteEntry(item.id); }} />
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between pr-4">
            <p className="sidebar-section-title flex items-center gap-1.5"><ClockIcon /> Recent</p>
            {history.length > 0 && (
              <button onClick={clearHistory} className="text-[9px] font-bold text-red-500 hover:text-red-600 uppercase tracking-wider">Clear</button>
            )}
          </div>
          {recents.length === 0 ? (
            <p className="px-4 py-3 text-[11px] text-slate-500 dark:text-slate-500 italic">No recent searches. Try a public figure above.</p>
          ) : (
            <div className="px-2 pb-2 space-y-0.5">
              {recents.map(item => (
                <HistoryItem key={item.id} item={item} isEditing={editingId === item.id} editingName={editingName}
                  onSelect={() => handleHistorySelect(item)} onStartEdit={e => startEditing(item.id, item.name, e)}
                  onSaveRename={e => saveRename(item.id, e)} onEditNameChange={setEditingName}
                  onToggleFav={e => { e.stopPropagation(); toggleFavorite(item.id); }}
                  onDelete={e => { e.stopPropagation(); deleteEntry(item.id); }} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-100 dark:border-slate-800/60 p-3 flex items-center justify-between flex-shrink-0">
        <button onClick={toggleTheme}
          className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors"
          aria-label="Toggle theme"
        >
          {theme === "light" ? <MoonIcon /> : <SunIcon />}
          {theme === "light" ? "Dark mode" : "Light mode"}
        </button>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] text-slate-500 dark:text-slate-500 font-medium">AI Ready</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="app-header no-print px-4 sm:px-5">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <button className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
              <MenuIcon />
            </button>
            <Link href="/" className="hidden sm:flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors">
              <HomeIcon /> Home
            </Link>
          </div>

          <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            {state.status === "success" && (
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {state.name}
                <span className="ml-1.5 text-slate-400 dark:text-slate-500 font-normal">· {state.context}</span>
              </span>
            )}
            {state.status === "idle" && <span className="font-medium">Aura Intelligence Research</span>}
            {state.status === "loading" && (
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                Building report for {state.name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {(state.status === "success" || state.status === "error") && (
              <button onClick={handleReset} className="text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors">
                New Search
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="app-body">
        {/* Desktop sidebar */}
        <aside className="app-sidebar hidden lg:flex flex-col no-print">
          <SidebarContent />
        </aside>

        {/* Mobile sidebar */}
        {sidebarOpen && (
          <>
            <div className="app-sidebar-overlay no-print" onClick={() => setSidebarOpen(false)} />
            <div className="app-sidebar-mobile no-print">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <span className="text-sm font-black text-slate-900 dark:text-white font-outfit">Aura</span>
                <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
                  <XIcon />
                </button>
              </div>
              <SidebarContent />
            </div>
          </>
        )}

        {/* Main content */}
        <main className="app-content" role="main" aria-label="Research output">
          <div className="max-w-5xl mx-auto px-6 py-6">

            {state.status === "idle" && (
              <div className="flex flex-col items-center justify-center min-h-[calc(100vh-120px)] text-center px-4 animate-fade-in-up">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 flex items-center justify-center mb-6 text-blue-500">
                  <SearchIcon />
                </div>
                <h1 className="text-2xl font-black text-slate-900 dark:text-white mb-2 font-outfit tracking-tight">
                  Research Portal
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 max-w-sm leading-relaxed mb-8">
                  Enter a public figure&apos;s name and context in the sidebar to generate a citation-backed intelligence report.
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {[
                    { name: "Satya Nadella", context: "CEO of Microsoft" },
                    { name: "Jensen Huang", context: "CEO of NVIDIA" },
                    { name: "Sam Altman", context: "CEO of OpenAI" },
                  ].map(s => (
                    <button key={s.name} onClick={() => handleSubmit(s.name, s.context)}
                      className="text-xs font-semibold px-4 py-2 rounded-full border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-400 dark:hover:border-blue-600 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-all duration-150">
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {state.status === "loading" && <LoadingState />}

            {state.status === "error" && (
              <div role="alert" aria-live="assertive" className="max-w-lg mx-auto mt-20 text-center animate-fade-in-up">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800/50 flex items-center justify-center mx-auto mb-4 text-slate-500">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                </div>
                <h2 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-2 font-outfit">{state.message}</h2>
                {state.name && (
                  <button onClick={() => handleSubmit(state.name!, state.context || "")}
                    className="mt-4 px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl text-sm font-bold hover:opacity-90 transition-opacity">
                    Try Again
                  </button>
                )}
              </div>
            )}

            {state.status === "success" && (
              <div className="animate-fade-in-up">
                <ProfileReport profile={state.profile} personName={state.name} personContext={state.context} />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
