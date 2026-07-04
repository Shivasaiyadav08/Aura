import type { NormalizedSource } from "./types";
import type { Profile } from "./schema";

// ─── JSON Schema Description for Gemini ──────────────────────────────────────

const JSON_SHAPE = `{
  "executiveSummary": string | null,
  "basicDetails": {
    "fullName": string | null,
    "nationality": string | null,
    "currentRole": string | null,
    "occupation": string | null,
    "industry": string | null,
    "currentCity": string | null,
    "currentCountry": string | null,
    "currentCompany": string | null,
    "website": string | null,
    "socialLinks": string[]
  },
  "biography": string | null,
  "careerTimeline": [
    {
      "year": string,
      "event": string,
      "sourceIds": string[]
    }
  ],
  "education": [
    {
      "institution": string | null,
      "degree": string | null,
      "field": string | null,
      "year": string | null,
      "sourceIds": string[]
    }
  ],
  "interests": [
    {
      "name": string,
      "description": string | null,
      "sourceIds": string[]
    }
  ],
  "skills": string[],
  "achievements": [
    {
      "title": string,
      "description": string | null,
      "year": string | null,
      "sourceIds": string[]
    }
  ],
  "awards": [
    {
      "title": string,
      "description": string | null,
      "year": string | null,
      "sourceIds": string[]
    }
  ],
  "companies": [
    {
      "name": string,
      "role": string | null,
      "period": string | null,
      "sourceIds": string[]
    }
  ],
  "books": [
    {
      "title": string,
      "publisher": string | null,
      "year": string | null,
      "sourceIds": string[]
    }
  ],
  "investments": [
    {
      "company": string,
      "amount": string | null,
      "year": string | null,
      "sourceIds": string[]
    }
  ],
  "netWorth": {
    "value": string | null,
    "note": string | null,
    "sourceIds": string[]
  },
  "recentActivities": [
    {
      "date": string | null,
      "title": string,
      "description": string | null,
      "sourceIds": string[]
    }
  ],
  "sources": [
    {
      "id": string,
      "title": string,
      "url": string,
      "snippet": string | null
    }
  ],
  "sourceQuality": "Well sourced" | "Limited public evidence",
  "sectionConfidence": {
    "executiveSummary": number, // 0 to 100 confidence score based on source evidence density
    "basicDetails": number,     // 0 to 100 confidence score based on source evidence density
    "biography": number,        // 0 to 100 confidence score based on source evidence density
    "careerTimeline": number,   // 0 to 100 confidence score based on source evidence density
    "education": number,        // 0 to 100 confidence score based on source evidence density
    "interests": number,        // 0 to 100 confidence score based on source evidence density
    "netWorth": number,         // 0 to 100 confidence score based on source evidence density
    "recentActivities": number  // 0 to 100 confidence score based on source evidence density
  },
  "citationQualityIndicator": "Excellent" | "Good" | "Fair" | "Poor"
}`;

// ─── Prompt Builder ───────────────────────────────────────────────────────────

export function buildProfilePrompt(
  name: string,
  context: string,
  sources: NormalizedSource[]
): string {
  const sourceBlock = sources
    .map(
      (s) =>
        `SOURCE ${s.id}
Title: ${s.title}
URL: ${s.url}
Snippet: ${s.snippet ?? "N/A"}
Content: ${s.content.slice(0, 1500)}`
    )
    .join("\n\n---\n\n");

  return `You are a structured data extraction assistant.

TASK:
Extract a factual profile for the following person using ONLY the provided source evidence below.

PERSON:
Name: ${name}
Context: ${context}

STRICT RULES — YOU MUST FOLLOW THESE EXACTLY:
1. Use ONLY the information found in the provided sources. Do NOT use any general knowledge or training data.
2. If a piece of information is not found in the sources, return null for that field.
3. Do NOT invent, guess, or extrapolate any facts.
4. Every significant claim MUST include the relevant sourceIds (e.g., ["S1", "S3"]).
5. sourceIds must reference the exact IDs given in the sources below (S1, S2, S3, etc.).
6. The "sources" array in your output must list ALL sources provided below.
7. Set "sourceQuality" to "Well sourced" if you found substantial evidence across multiple sources, or "Limited public evidence" if evidence was sparse.
8. Return ONLY valid JSON. No markdown. No code fences. No commentary. No explanation before or after.
9. Your entire response must be a single valid JSON object matching the schema exactly.
10. Arrays may be empty [] if no evidence is found. Do NOT omit array fields.

REQUIRED JSON SCHEMA:
${JSON_SHAPE}

SOURCE EVIDENCE:
${sourceBlock}

Return the JSON object now:`;
}

// ─── Repair Prompt ────────────────────────────────────────────────────────────

export function buildRepairPrompt(
  originalPrompt: string,
  badOutput: string,
  validationError: string
): string {
  return `Your previous response contained invalid JSON or failed schema validation.

VALIDATION ERROR:
${validationError}

YOUR PREVIOUS (INVALID) RESPONSE:
${badOutput.slice(0, 3000)}

Fix the JSON so it exactly matches the required schema. 
Return ONLY the corrected JSON object. No markdown. No commentary. No code fences.

ORIGINAL INSTRUCTIONS:
${originalPrompt}`;
}
