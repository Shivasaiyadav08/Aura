import type { Profile } from "@/lib/schema";

// ─── PDF Export ───────────────────────────────────────────────────────────────
// 1. Forces light theme (avoids dark-mode PDF mess)
// 2. Hides toast/alert overlays so they don't bleed into the PDF
// 3. Restores everything after the print dialog closes

export function exportToPdf(): void {
  if (typeof window === "undefined") return;

  const html = document.documentElement;
  const wasDark = html.classList.contains("dark");

  // Switch to light mode for clean PDF output
  if (wasDark) html.classList.remove("dark");

  // Hide all toast/notification overlays immediately
  const hiddenEls: { el: HTMLElement; prev: string }[] = [];
  const hide = (el: HTMLElement) => {
    hiddenEls.push({ el, prev: el.style.display });
    el.style.display = "none";
  };

  // Toast container sits in a fixed bottom-right div
  document.querySelectorAll<HTMLElement>('[role="alert"]').forEach(hide);
  // Also hide any fixed overlay containers
  document.querySelectorAll<HTMLElement>(".fixed.bottom-6, .fixed.bottom-4").forEach(hide);

  // Restore everything after print dialog closes
  const restore = () => {
    if (wasDark) html.classList.add("dark");
    hiddenEls.forEach(({ el, prev }) => { el.style.display = prev; });
  };
  window.addEventListener("afterprint", restore, { once: true });

  // Delay so browser re-renders cleanly (no toast flicker) before print
  setTimeout(() => {
    window.print();
  }, 200);
}

// ─── JSON Export ─────────────────────────────────────────────────────────────

function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportToJson(name: string, profile: Profile): void {
  const json = JSON.stringify(profile, null, 2);
  const filename = `${name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}-profile.json`;
  triggerDownload(json, filename, "application/json;charset=utf-8");
}
