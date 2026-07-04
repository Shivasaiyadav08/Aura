import type { Profile } from "@/lib/schema";

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validates an AI-generated profile for completeness, citation integrity,
 * and hallucination indicators. Returns { valid, reason }.
 */
export function validateGeneratedProfile(profile: Profile): ValidationResult {
  // 1. Critical sections must exist
  if (!profile.basicDetails || !profile.executiveSummary || !profile.biography) {
    return { valid: false, reason: "Missing critical sections (basicDetails, executiveSummary, or biography)." };
  }

  // 2. Count total citations across all sections
  let citationCount = 0;
  profile.careerTimeline.forEach(e => (citationCount += e.sourceIds?.length ?? 0));
  profile.education.forEach(e => (citationCount += e.sourceIds?.length ?? 0));
  profile.interests.forEach(e => (citationCount += e.sourceIds?.length ?? 0));
  profile.recentActivities.forEach(e => (citationCount += e.sourceIds?.length ?? 0));
  if (profile.netWorth?.sourceIds) citationCount += profile.netWorth.sourceIds.length;

  if (profile.sources.length > 0 && citationCount === 0) {
    return { valid: false, reason: "Response has sources but zero citations were mapped back to sections." };
  }

  // 3. All cited source IDs must exist in the sources list
  const validIds = new Set(profile.sources.map(s => s.id));
  const checkIds = (ids: string[]) => ids.every(id => validIds.has(id));

  const allCitationsValid =
    profile.careerTimeline.every(e => checkIds(e.sourceIds)) &&
    profile.education.every(e => checkIds(e.sourceIds)) &&
    profile.interests.every(e => checkIds(e.sourceIds)) &&
    profile.recentActivities.every(e => checkIds(e.sourceIds)) &&
    (!profile.netWorth?.sourceIds || checkIds(profile.netWorth.sourceIds));

  if (!allCitationsValid) {
    return { valid: false, reason: "Response contains sourceIds that do not exist in the sources array." };
  }

  // 4. Biography and executive summary must be distinct
  if (profile.biography && profile.executiveSummary && profile.biography === profile.executiveSummary) {
    return { valid: false, reason: "Biography is identical to the Executive Summary (possible hallucination)." };
  }

  return { valid: true };
}
