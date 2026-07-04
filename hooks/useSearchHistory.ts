"use client";

import { useState, useEffect } from "react";
import type { SearchHistoryEntry } from "@/types";
import type { Profile } from "@/lib/schema";

/**
 * Custom hook to manage the local search history of profiles in localStorage.
 */
export function useSearchHistory() {
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);

  // Load from local storage on mount
  useEffect(() => {
    const stored = localStorage.getItem("aura_search_history");
    if (stored) {
      try {
        setHistory(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse search history", e);
      }
    }
  }, []);

  const saveToHistory = (name: string, context: string, profile: Profile) => {
    const newEntry: SearchHistoryEntry = {
      id: Math.random().toString(36).substring(2, 9),
      name,
      context,
      timestamp: Date.now(),
      profile,
      isFavorite: false,
    };

    setHistory((prev) => {
      // Avoid duplicate entries of the same person/context in recent list
      const filtered = prev.filter(
        (item) =>
          item.name.toLowerCase() !== name.toLowerCase() ||
          item.context.toLowerCase() !== context.toLowerCase()
      );
      const updated = [newEntry, ...filtered].slice(0, 50); // Keep max 50 items
      localStorage.setItem("aura_search_history", JSON.stringify(updated));
      return updated;
    });
  };

  const deleteEntry = (id: string) => {
    setHistory((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      localStorage.setItem("aura_search_history", JSON.stringify(updated));
      return updated;
    });
  };

  const toggleFavorite = (id: string) => {
    setHistory((prev) => {
      const updated = prev.map((item) =>
        item.id === id ? { ...item, isFavorite: !item.isFavorite } : item
      );
      localStorage.setItem("aura_search_history", JSON.stringify(updated));
      return updated;
    });
  };

  const renameEntry = (id: string, newName: string) => {
    setHistory((prev) => {
      const updated = prev.map((item) =>
        item.id === id ? { ...item, name: newName } : item
      );
      localStorage.setItem("aura_search_history", JSON.stringify(updated));
      return updated;
    });
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem("aura_search_history");
  };

  return {
    history,
    saveToHistory,
    deleteEntry,
    toggleFavorite,
    renameEntry,
    clearHistory,
  };
}
export default useSearchHistory;
