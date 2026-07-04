// ─── API Request / Response Types ─────────────────────────────────────────────

export interface ProfileRequest {
  name: string;
  context: string;
}

export interface ProfileResponse {
  success: true;
  profile: import("./schema").Profile;
}

export interface ErrorResponse {
  success: false;
  error: string;
}

export type ApiResponse = ProfileResponse | ErrorResponse;

// ─── Internal Search Types ────────────────────────────────────────────────────

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
