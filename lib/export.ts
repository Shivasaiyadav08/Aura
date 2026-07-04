import type { Profile } from "@/lib/schema";

// ─── PDF Export ───────────────────────────────────────────────────────────────
// Forces light theme before printing (avoids dark-mode PDF mess),
// then restores the original theme after the print dialog closes.

export function exportToPdf(): void {
  if (typeof window === "undefined") return;

  const html = document.documentElement;
  const wasDark = html.classList.contains("dark");

  // 1. Switch to light mode for clean PDF output
  if (wasDark) {
    html.classList.remove("dark");
  }

  // 2. Restore dark mode after print dialog is dismissed
  const restore = () => {
    if (wasDark) html.classList.add("dark");
  };
  window.addEventListener("afterprint", restore, { once: true });

  // 3. Small delay so the browser re-renders without dark styles before printing
  setTimeout(() => {
    window.print();
  }, 80);
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
