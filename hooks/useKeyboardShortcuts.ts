"use client";

import { useEffect } from "react";

interface ShortcutHandlers {
  onFocusSearch?: () => void;
  onEscape?: () => void;
  onExport?: () => void;
  onCopy?: () => void;
}

/**
 * Register global keyboard shortcut listeners.
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Focus Search Box: Cmd+K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (handlers.onFocusSearch) {
          e.preventDefault();
          handlers.onFocusSearch();
        }
      }

      // 2. Escape: Dismiss suggestion overlays or close modals
      if (e.key === "Escape") {
        if (handlers.onEscape) {
          e.preventDefault();
          handlers.onEscape();
        }
      }

      // 3. Trigger Export Menu: Alt+E
      if (e.altKey && e.key.toLowerCase() === "e") {
        if (handlers.onExport) {
          e.preventDefault();
          handlers.onExport();
        }
      }

      // 4. Copy Whole Report: Alt+C
      if (e.altKey && e.key.toLowerCase() === "c") {
        if (handlers.onCopy) {
          e.preventDefault();
          handlers.onCopy();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlers]);
}
export default useKeyboardShortcuts;
