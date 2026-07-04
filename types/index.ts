import type { Profile } from "@/lib/schema";

export interface ProfileRequest {
  name: string;
  context: string;
}

export interface ProfileResponse {
  success: true;
  profile: Profile;
  modelUsed?: string;
  latencyMs?: number;
  cacheHit?: boolean;
}

export interface ErrorResponse {
  success: false;
  error: string;
  isRetryable?: boolean;
}

export type ApiResponse = ProfileResponse | ErrorResponse;

export interface NormalizedSource {
  id: string;
  title: string;
  url: string;
  content: string;
  snippet: string | null;
}

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  snippet?: string;
  score?: number;
}

export interface TavilyResponse {
  results: TavilyResult[];
  query: string;
}

export interface SearchHistoryEntry {
  id: string;
  name: string;
  context: string;
  timestamp: number;
  profile: Profile;
  isFavorite?: boolean;
}

export interface SearchSuggestion {
  name: string;
  context: string;
  category: "Business" | "Technology" | "Politics" | "Entertainment" | "Sports" | "Literature" | "Other";
  avatarUrl?: string;
}

export interface LogData {
  timestamp: string;
  name: string;
  context: string;
  modelUsed?: string;
  fallbackCount?: number;
  retryCount?: number;
  latencyMs?: number;
  cacheHit?: boolean;
  status: "success" | "error";
  error?: string;
}

export interface CacheStats {
  hits: number;
  misses: number;
  total: number;
  hitRatio: number;
}
