import type { Profile } from "@/lib/schema";

// ─── PDF Export ───────────────────────────────────────────────────────────────
export function exportToPdf(): void {
  if (typeof window === "undefined") return;

  const html = document.documentElement;
  const wasDark = html.classList.contains("dark");

  // 1. Force light mode — remove dark class so no dark Tailwind styles apply
  html.classList.remove("dark");

  // 2. Also add a print-mode marker class for extra CSS targeting
  html.classList.add("print-mode");

  // 3. Hide all toast/alert overlays before printing
  const hiddenEls: { el: HTMLElement; prev: string }[] = [];
  const hide = (el: HTMLElement) => {
    hiddenEls.push({ el, prev: el.style.display });
    el.style.display = "none";
  };
  document.querySelectorAll<HTMLElement>('[role="alert"]').forEach(hide);
  document.querySelectorAll<HTMLElement>(".no-print").forEach(hide);
  // Also hide any fixed overlays (dropdowns, modals, toasts)
  document.querySelectorAll<HTMLElement>(".fixed").forEach(el => {
    // Only hide things that are NOT the report itself
    if (!el.closest(".report-document")) hide(el);
  });

  // 4. Restore everything after the print dialog closes
  const restore = () => {
    if (wasDark) html.classList.add("dark");
    html.classList.remove("print-mode");
    hiddenEls.forEach(({ el, prev }) => { el.style.display = prev; });
  };
  window.addEventListener("afterprint", restore, { once: true });

  // 5. Delay so browser re-renders in light mode before opening print dialog
  setTimeout(() => {
    window.print();
  }, 250);
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
