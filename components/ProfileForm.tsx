"use client";

import React, { useState, useEffect, useRef } from "react";
import type { SearchSuggestion } from "@/types";

const SUGGESTIONS: SearchSuggestion[] = [
  { name: "Satya Nadella", context: "CEO of Microsoft", category: "Technology" },
  { name: "Jensen Huang", context: "CEO of NVIDIA", category: "Technology" },
  { name: "Sam Altman", context: "CEO of OpenAI", category: "Technology" },
  { name: "Elon Musk", context: "CEO of Tesla & SpaceX", category: "Business" },
  { name: "Tim Cook", context: "CEO of Apple", category: "Technology" },
  { name: "Sundar Pichai", context: "CEO of Google", category: "Technology" },
  { name: "Mark Zuckerberg", context: "CEO of Meta", category: "Technology" },
  { name: "Jeff Bezos", context: "Founder of Amazon", category: "Business" },
  { name: "Taylor Swift", context: "Singer-songwriter", category: "Entertainment" },
  { name: "LeBron James", context: "NBA Athlete", category: "Sports" },
  { name: "Stephen King", context: "Acclaimed Author", category: "Literature" },
  { name: "Alex Honnold", context: "Professional Rock Climber", category: "Sports" },
];

interface ProfileFormProps {
  onSubmit: (name: string, context: string) => void;
  isLoading: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
}

export function ProfileForm({ onSubmit, isLoading, inputRef }: ProfileFormProps) {
  const [name, setName] = useState("");
  const [context, setContext] = useState("");
  const [errors, setErrors] = useState<{ name?: string; context?: string }>({});
  const [showSuggestions, setShowSuggestions] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close suggestions dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredSuggestions = name.trim() === ""
    ? SUGGESTIONS // Show all as "trending" when input is empty
    : SUGGESTIONS.filter((s) =>
        s.name.toLowerCase().includes(name.toLowerCase())
      );

  function validate(): boolean {
    const newErrors: { name?: string; context?: string } = {};
    if (name.trim().length < 2) {
      newErrors.name = "Name must be at least 2 characters.";
    } else if (name.trim().length > 100) {
      newErrors.name = "Name must be 100 characters or fewer.";
    }
    if (context.trim().length < 2) {
      newErrors.context = "Context must be at least 2 characters.";
    } else if (context.trim().length > 150) {
      newErrors.context = "Context must be 150 characters or fewer.";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setShowSuggestions(false);
    onSubmit(name.trim(), context.trim());
  }

  function handleSelectSuggestion(suggestion: SearchSuggestion) {
    setName(suggestion.name);
    setContext(suggestion.context);
    setShowSuggestions(false);
    setErrors({});
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label="Person profile search form"
      className="space-y-4"
    >
      {/* Name Input Field */}
      <div className="relative" ref={dropdownRef}>
        <label
          htmlFor="person-name"
          className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5"
        >
          Person Name
        </label>
        <div className="relative">
          <input
            id="person-name"
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            placeholder="e.g. Satya Nadella"
            maxLength={100}
            aria-required="true"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "name-error" : undefined}
            className={`w-full px-4 py-3 text-sm border rounded-xl
              bg-white dark:bg-[#070a13] text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600
              focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
              transition-all duration-200
              ${errors.name ? "border-red-400" : "border-slate-200 dark:border-slate-800"}`}
          />
          {name && (
            <button
              type="button"
              onClick={() => {
                setName("");
                setShowSuggestions(true);
              }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-600 hover:text-slate-200 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {errors.name && (
          <p id="name-error" role="alert" className="mt-1.5 text-xs text-red-650 dark:text-red-400">
            {errors.name}
          </p>
        )}

        {/* Autocomplete suggestions dropdown panel */}
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-18 bg-white dark:bg-[#090d16] border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-30 max-h-60 overflow-y-auto py-1 mt-1 animate-fade-in-up">
            <div className="px-3.5 py-1.5 text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-850">
              {name.trim() === "" ? "Trending Figures" : "Suggestions"}
            </div>
            {filteredSuggestions.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectSuggestion(s)}
                className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-900/50 flex items-center justify-between transition-colors text-xs font-semibold"
              >
                <div className="min-w-0">
                  <span className="text-slate-850 dark:text-slate-200 block truncate">{s.name}</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal block truncate">{s.context}</span>
                </div>
                <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-850 border border-slate-200/40 dark:border-slate-800 rounded px-1.5 py-0.5 uppercase tracking-wider scale-90">
                  {s.category}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Context / Disambiguation Input Field */}
      <div>
        <label
          htmlFor="person-context"
          className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5"
        >
          Context / Disambiguation
        </label>
        <input
          id="person-context"
          type="text"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="e.g. CEO of Microsoft"
          maxLength={150}
          aria-required="true"
          aria-invalid={!!errors.context}
          aria-describedby={errors.context ? "context-error" : "context-hint"}
          className={`w-full px-4 py-3 text-sm border rounded-xl
            bg-white dark:bg-[#070a13] text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600
            focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500
            transition-all duration-200
            ${errors.context ? "border-red-400" : "border-slate-200 dark:border-slate-800"}`}
        />
        {!errors.context && (
          <p id="context-hint" className="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500">
            Provide job titles, companies, or unique features to help AI identify the target.
          </p>
        )}
        {errors.context && (
          <p id="context-error" role="alert" className="mt-1 text-xs text-red-650 dark:text-red-400">
            {errors.context}
          </p>
        )}
      </div>

      {/* Submit Button */}
      <button
        id="generate-profile-btn"
        type="submit"
        disabled={isLoading}
        aria-label="Generate profile report"
        className="w-full py-3 px-6 text-sm font-bold rounded-xl text-white
          bg-blue-600 hover:bg-blue-700 active:scale-98
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all duration-150 border border-blue-500 dark:border-blue-600 shadow-md shadow-blue-500/10"
      >
        {isLoading ? "Crawling Sources..." : "Build Intelligence Dossier"}
      </button>
    </form>
  );
}
export default ProfileForm;
