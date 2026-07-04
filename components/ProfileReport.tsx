"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import type { Profile, Source } from "@/lib/schema";
import { displayValue, isEmpty, sourceIdToNumber } from "@/lib/utils";
import { useToast } from "@/providers/toast";
import { exportToPdf } from "@/lib/export";

interface ProfileReportProps {
  profile: Profile;
  personName: string;
  personContext: string;
}

// ─── Helper: Inline Citation Badges ──────────────────────────────────────────

function Citations({
  sourceIds,
  sources,
}: {
  sourceIds: string[];
  sources: Source[];
}) {
  if (!sourceIds || sourceIds.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-0.5 ml-0.5 select-none no-print">
      {sourceIds.map((id) => {
        const num = sourceIdToNumber(id);
        const source = sources.find((s) => s.id === id);
        return (
          <a
            key={id}
            href={source?.url || "#"}
            target="_blank"
            rel="noopener noreferrer"
            title={source?.title || "View Source"}
            className="citation"
          >
            {num}
          </a>
        );
      })}
    </span>
  );
}

// ─── Helper: Section Label with side rule ────────────────────────────────────

function SectionLabel({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="report-section-label">
      <span className="text-slate-400 dark:text-slate-500 flex-shrink-0">{icon}</span>
      <span className="report-section-label-text">{children}</span>
      <span className="report-section-label-line" />
    </div>
  );
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

const Icons = {
  user: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  list: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  ),
  book: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    </svg>
  ),
  briefcase: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
    </svg>
  ),
  graduationCap: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
    </svg>
  ),
  star: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
  award: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>
    </svg>
  ),
  building: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h1v1H9zM9 13h1v1H9zM9 17h1v1H9zM14 9h1v1h-1zM14 13h1v1h-1zM14 17h1v1h-1z"/>
    </svg>
  ),
  bookOpen: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  ),
  trendingUp: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
    </svg>
  ),
  dollarSign: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  ),
  newspaper: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/>
      <path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/>
    </svg>
  ),
  link: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  ),
  zap: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  heart: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  ),
  copy: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  ),
  printer: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
      <rect x="6" y="14" width="12" height="8"/>
    </svg>
  ),
  download: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  chevronDown: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  ),
  externalLink: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  ),
  check: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  arrowLeft: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
    </svg>
  ),
};

// ─── Profile Image Component ──────────────────────────────────────────────────

function ProfileImage({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Reset error/loaded state whenever the image URL changes.
  // Without this, switching from a profile that had a broken image to one
  // with a valid image would keep imgError=true and show the initials fallback.
  useEffect(() => {
    setImgError(false);
    setImgLoaded(false);
  }, [imageUrl]);

  // Generate initials-based fallback
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");

  const showImage = imageUrl && !imgError;

  return (
    <div className="relative flex-shrink-0">
      <div
        className="w-40 h-40 md:w-48 md:h-48 rounded-xl overflow-hidden border-2 border-slate-200 dark:border-slate-700 shadow-[0_8px_24px_rgba(0,0,0,0.10)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.35)] bg-slate-100 dark:bg-slate-800 flex items-center justify-center"
        style={{ minWidth: "160px" }}
      >
        {showImage ? (
          <>
            {!imgLoaded && (
              <div className="absolute inset-0 skeleton-pulse rounded-xl" />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={`Profile photo of ${name}`}
              className={`w-full h-full object-cover object-top transition-opacity duration-500 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />
          </>
        ) : (
          // Initials avatar fallback
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-800 dark:to-slate-700">
            <span className="text-4xl font-black text-blue-600 dark:text-blue-400 tracking-tight select-none">
              {initials}
            </span>
            <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-1 font-medium uppercase tracking-widest">
              No Photo
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Metric Badge ─────────────────────────────────────────────────────────────

function MetricPill({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/60">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {label}
      </span>
      <span
        className={`text-[11px] font-bold ${accent ? "text-blue-600 dark:text-blue-400" : "text-slate-700 dark:text-slate-300"}`}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Main ProfileReport Component ─────────────────────────────────────────────

export function ProfileReport({ profile, personName, personContext }: ProfileReportProps) {
  const { toast } = useToast();

  // ── Metrics ───────────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const textToAnalyze = [
      profile.executiveSummary || "",
      profile.biography || "",
      ...profile.careerTimeline.map((e) => e.event),
      ...profile.education.map((edu) => `${edu.institution} ${edu.degree} ${edu.field}`),
      ...profile.recentActivities.map((act) => `${act.title} ${act.description}`),
    ].join(" ");
    const wordCount = textToAnalyze.split(/\s+/).filter(Boolean).length;
    const readingTime = Math.max(1, Math.ceil(wordCount / 200));

    const totalFields = 10;
    let filledFields = 0;
    if (!isEmpty(profile.executiveSummary)) filledFields++;
    if (!isEmpty(profile.biography)) filledFields++;
    if (!isEmpty(profile.basicDetails.fullName)) filledFields++;
    if (!isEmpty(profile.basicDetails.nationality)) filledFields++;
    if (!isEmpty(profile.basicDetails.currentRole)) filledFields++;
    if (!isEmpty(profile.basicDetails.industry)) filledFields++;
    if (profile.careerTimeline.length > 0) filledFields++;
    if (profile.education.length > 0) filledFields++;
    if (!isEmpty(profile.netWorth?.value)) filledFields++;
    if (profile.recentActivities.length > 0) filledFields++;
    const completeness = Math.round((filledFields / totalFields) * 100);

    const conf = profile.sectionConfidence || {};
    const confValues = Object.values(conf);
    const avgConfidence =
      confValues.length > 0
        ? Math.round(confValues.reduce((sum: number, val: any) => sum + val, 0) / confValues.length)
        : 85;

    return { readingTime, completeness, avgConfidence };
  }, [profile]);

  // ── Copy helpers ──────────────────────────────────────────────────────────
  const copySection = useCallback((title: string, text: string) => {
    navigator.clipboard.writeText(text);
    toast(`${title} copied!`, "success");
  }, [toast]);

  const copyFullReport = useCallback(() => {
    const reportText = `
PROFILE REPORT: ${profile.basicDetails.fullName || personName}
Context: ${personContext}
Generated: ${new Date().toLocaleDateString()}

EXECUTIVE SUMMARY
${profile.executiveSummary || "Not publicly available"}

BASIC DETAILS
- Full Name: ${profile.basicDetails.fullName || "N/A"}
- Nationality: ${profile.basicDetails.nationality || "N/A"}
- Current Role: ${profile.basicDetails.currentRole || "N/A"}
- Occupation: ${profile.basicDetails.occupation || "N/A"}
- Industry: ${profile.basicDetails.industry || "N/A"}
- City/Country: ${profile.basicDetails.currentCity || "N/A"}, ${profile.basicDetails.currentCountry || "N/A"}

BIOGRAPHY
${profile.biography || "Not publicly available"}
    `.trim();
    navigator.clipboard.writeText(reportText);
    toast("Full report copied!", "success");
  }, [profile, personName, personContext, toast]);

  const displayName =
    displayValue(profile.basicDetails.fullName) !== "Not publicly available"
      ? displayValue(profile.basicDetails.fullName)
      : personName;

  return (
    <div className="space-y-4 animate-fade-in-up">

      {/* ── Sticky Action Bar ─────────────────────────────────────────────── */}
      <div className="action-bar rounded-xl no-print">
        <div className="px-5 py-2.5 flex items-center justify-between gap-4 flex-wrap">

          {/* Left: Report metadata */}
          <div className="flex items-center gap-3 flex-wrap">
            {profile.sourceQuality === "Well sourced" ? (
              <span className="badge-well-sourced">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Well Sourced
              </span>
            ) : (
              <span className="badge-limited">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Limited Evidence
              </span>
            )}
            <MetricPill label="Confidence" value={`${metrics.avgConfidence}%`} />
            <MetricPill label="Read" value={`${metrics.readingTime} min`} />
            <MetricPill label="Completeness" value={`${metrics.completeness}%`} accent />
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={copyFullReport}
              title="Copy full report to clipboard"
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
            >
              {Icons.copy}
              Copy
            </button>
            <button
              id="export-pdf-btn"
              onClick={() => exportToPdf()}
              title="Export as PDF (opens print dialog)"
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm shadow-blue-500/20 transition-all border border-blue-500"
            >
              {Icons.printer}
              Export PDF
            </button>
          </div>
        </div>
      </div>

      {/* ── Report Document ──────────────────────────────────────────────── */}
      <article className="report-document overflow-hidden">

        {/* ── Document Header ──────────────────────────────────────────── */}
        <div className="px-8 pt-8 pb-6 border-b border-slate-100 dark:border-slate-800/80">
          {/* Eyebrow label */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">
              Executive Intelligence Profile
            </span>
            <span className="text-slate-200 dark:text-slate-700">·</span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
              {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            </span>
          </div>

          {/* Large Report Title */}
          <h1 className="text-[28px] md:text-[36px] font-black text-slate-900 dark:text-white tracking-tight leading-none font-outfit mb-1">
            {displayName}
          </h1>
          {(!isEmpty(profile.basicDetails.currentRole) || !isEmpty(profile.basicDetails.industry)) && (
            <p className="text-[14px] text-slate-500 dark:text-slate-400 font-medium mt-2">
              {[
                displayValue(profile.basicDetails.currentRole) !== "Not publicly available" && displayValue(profile.basicDetails.currentRole),
                displayValue(profile.basicDetails.industry) !== "Not publicly available" && displayValue(profile.basicDetails.industry),
              ]
                .filter(Boolean)
                .join("  ·  ")}
            </p>
          )}

          {/* Thin divider */}
          <div className="mt-5 h-px bg-gradient-to-r from-blue-500/30 via-slate-200 to-transparent dark:from-blue-500/20 dark:via-slate-700 dark:to-transparent" />
        </div>

        {/* ── Hero: Profile Image + Executive Summary ─────────────────── */}
        {(!isEmpty(profile.executiveSummary) || profile.profileImageUrl) && (
          <div className="report-section">
            <div className="flex flex-col md:flex-row gap-7">
              {/* Profile Image — key forces remount (and state reset) when imageUrl changes */}
              <ProfileImage key={profile.profileImageUrl ?? `no-image-${displayName}`} imageUrl={profile.profileImageUrl} name={displayName} />

              {/* Executive Summary */}
              <div className="flex-1 min-w-0">
                <SectionLabel icon={Icons.user}>Executive Summary</SectionLabel>
                {!isEmpty(profile.executiveSummary) ? (
                  <div className="relative">
                    <p className="text-[14px] text-slate-700 dark:text-slate-300 leading-[1.8] font-normal">
                      {profile.executiveSummary}
                    </p>
                    <button
                      onClick={() => copySection("Executive Summary", profile.executiveSummary || "")}
                      className="no-print mt-3 inline-flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      {Icons.copy}
                      Copy summary
                    </button>
                  </div>
                ) : (
                  <p className="text-[13px] text-slate-400 italic">Not publicly available.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Basic Details Table ──────────────────────────────────────── */}
        <div className="report-section">
          <SectionLabel icon={Icons.list}>Basic Details</SectionLabel>
          <div className="overflow-x-auto">
            <table className="report-table">
              <thead>
                <tr>
                  {["Full Name", "Nationality", "Occupation", "Industry", "Current Company", "Location", "Website"].map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {[
                    profile.basicDetails.fullName,
                    profile.basicDetails.nationality,
                    profile.basicDetails.occupation || profile.basicDetails.currentRole,
                    profile.basicDetails.industry,
                    profile.basicDetails.currentCompany,
                    [profile.basicDetails.currentCity, profile.basicDetails.currentCountry].filter(Boolean).join(", "),
                    profile.basicDetails.website,
                  ].map((val, i) => (
                    <td key={i}>
                      {isEmpty(val as string) ? (
                        <span className="text-slate-350 dark:text-slate-600 italic text-[12px]">—</span>
                      ) : i === 6 && !isEmpty(val as string) ? (
                        <a
                          href={val as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                        >
                          {(val as string).replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
                          {Icons.externalLink}
                        </a>
                      ) : val}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Social Links */}
          {profile.basicDetails.socialLinks && profile.basicDetails.socialLinks.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {profile.basicDetails.socialLinks.map((link, i) => {
                let domain = link;
                try { domain = new URL(link).hostname.replace("www.", ""); } catch {}
                return (
                  <a
                    key={i}
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30 rounded-full px-3 py-1 transition-colors"
                  >
                    {Icons.link}
                    {domain}
                  </a>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Biography ────────────────────────────────────────────────── */}
        <div className="report-section">
          <div className="flex items-start justify-between">
            <SectionLabel icon={Icons.book}>Biography</SectionLabel>
            {!isEmpty(profile.biography) && (
              <button
                onClick={() => copySection("Biography", profile.biography || "")}
                className="no-print ml-4 flex-shrink-0 text-slate-350 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400 transition-colors"
                title="Copy biography"
              >
                {Icons.copy}
              </button>
            )}
          </div>
          {isEmpty(profile.biography) ? (
            <p className="text-[13px] text-slate-400 italic">No biography details available.</p>
          ) : (
            <p className="text-[14px] text-slate-700 dark:text-slate-300 leading-[1.85] font-normal whitespace-pre-line">
              {profile.biography}
            </p>
          )}
        </div>

        {/* ── Career Timeline + Education (2-col desktop) ──────────────── */}
        <div className="report-section grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Career Timeline */}
          <div>
            <SectionLabel icon={Icons.briefcase}>Career Timeline</SectionLabel>
            {!profile.careerTimeline || profile.careerTimeline.length === 0 ? (
              <p className="text-[13px] text-slate-400 italic">No career history recorded.</p>
            ) : (
              <div className="relative pl-5 space-y-5">
                <div className="timeline-track" />
                {profile.careerTimeline.map((item, idx) => (
                  <div key={idx} className="relative group">
                    <div className="timeline-dot" />
                    <div className="pl-5">
                      <span className="inline-block text-[10px] font-bold font-mono text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border border-blue-200/50 dark:border-blue-900/50 rounded-full px-2.5 py-0.5 mb-1.5">
                        {item.year}
                      </span>
                      <p className="text-[13px] text-slate-700 dark:text-slate-300 leading-relaxed">
                        {item.event}
                        <Citations sourceIds={item.sourceIds} sources={profile.sources} />
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Education */}
          <div>
            <SectionLabel icon={Icons.graduationCap}>Education</SectionLabel>
            {!profile.education || profile.education.length === 0 ? (
              <p className="text-[13px] text-slate-400 italic">No academic credentials on record.</p>
            ) : (
              <div className="space-y-3">
                {profile.education.map((item, idx) => (
                  <div key={idx} className="edu-card group">
                    {/* Degree icon dot */}
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200/50 dark:border-indigo-900/40 flex items-center justify-center text-indigo-500 dark:text-indigo-400 mt-0.5">
                      {Icons.graduationCap}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-200 leading-snug">
                        {displayValue(item.institution)}
                        <Citations sourceIds={item.sourceIds} sources={profile.sources} />
                      </p>
                      <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {[item.degree, item.field ? `in ${item.field}` : null].filter(Boolean).join(" ")}
                        {item.year && <span className="text-slate-400 dark:text-slate-600 ml-1.5">· {item.year}</span>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Skills + Interests (2-col desktop) ──────────────────────── */}
        {((profile.skills && profile.skills.length > 0) || (profile.interests && profile.interests.length > 0)) && (
          <div className="report-section grid grid-cols-1 md:grid-cols-2 gap-8">

            {/* Skills */}
            {profile.skills && profile.skills.length > 0 && (
              <div>
                <SectionLabel icon={Icons.zap}>Skills</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {profile.skills.map((skill, idx) => (
                    <span key={idx} className="report-tag">{skill}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Interests */}
            {profile.interests && profile.interests.length > 0 && (
              <div>
                <SectionLabel icon={Icons.heart}>Interests</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {profile.interests.map((item, idx) => (
                    <span key={idx} className="report-tag">
                      {item.name}
                      {item.description && (
                        <span className="text-slate-400 dark:text-slate-500 font-normal"> — {item.description}</span>
                      )}
                      <Citations sourceIds={item.sourceIds} sources={profile.sources} />
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Achievements ─────────────────────────────────────────────── */}
        {profile.achievements && profile.achievements.length > 0 && (
          <div className="report-section">
            <SectionLabel icon={Icons.star}>Achievements</SectionLabel>
            <div className="space-y-3">
              {profile.achievements.map((item, idx) => (
                <div
                  key={idx}
                  className="flex gap-4 p-4 rounded-xl bg-slate-50/50 dark:bg-slate-900/30 border border-slate-150 dark:border-slate-800/50 hover:border-blue-200 dark:hover:border-blue-900/50 transition-colors"
                >
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-950/50 border border-blue-200/60 dark:border-blue-800/40 flex items-center justify-center text-[10px] font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                      {item.title}
                      {item.year && <span className="ml-2 text-[11px] font-normal text-slate-400 dark:text-slate-500">({item.year})</span>}
                      <Citations sourceIds={item.sourceIds} sources={profile.sources} />
                    </p>
                    {item.description && (
                      <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{item.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Awards ──────────────────────────────────────────────────── */}
        {profile.awards && profile.awards.length > 0 && (
          <div className="report-section">
            <SectionLabel icon={Icons.award}>Awards & Honours</SectionLabel>
            <div className="space-y-3">
              {profile.awards.map((item, idx) => (
                <div
                  key={idx}
                  className="flex gap-4 p-4 rounded-xl bg-amber-50/40 dark:bg-amber-950/10 border border-amber-200/50 dark:border-amber-900/30 hover:border-amber-300/60 dark:hover:border-amber-800/40 transition-colors"
                >
                  <div className="flex-shrink-0 text-amber-500 dark:text-amber-400 mt-0.5">{Icons.award}</div>
                  <div className="flex-1">
                    <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                      {item.title}
                      {item.year && <span className="ml-2 text-[11px] font-normal text-slate-400 dark:text-slate-500">({item.year})</span>}
                      <Citations sourceIds={item.sourceIds} sources={profile.sources} />
                    </p>
                    {item.description && (
                      <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{item.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Companies ────────────────────────────────────────────────── */}
        {profile.companies && profile.companies.length > 0 && (
          <div className="report-section">
            <SectionLabel icon={Icons.building}>Companies & Affiliations</SectionLabel>
            <div className="overflow-x-auto">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Role</th>
                    <th>Period</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.companies.map((item, idx) => (
                    <tr key={idx}>
                      <td className="font-semibold text-slate-800 dark:text-slate-200">
                        {item.name}
                        <Citations sourceIds={item.sourceIds} sources={profile.sources} />
                      </td>
                      <td>{isEmpty(item.role) ? <span className="text-slate-400 italic text-[12px]">—</span> : item.role}</td>
                      <td>{isEmpty(item.period) ? <span className="text-slate-400 italic text-[12px]">—</span> : item.period}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Books ────────────────────────────────────────────────────── */}
        {profile.books && profile.books.length > 0 && (
          <div className="report-section">
            <SectionLabel icon={Icons.bookOpen}>Books & Publications</SectionLabel>
            <div className="space-y-3">
              {profile.books.map((item, idx) => (
                <div key={idx} className="flex gap-4 p-4 rounded-xl bg-slate-50/50 dark:bg-slate-900/30 border border-slate-150 dark:border-slate-800/50">
                  <div className="flex-shrink-0 text-slate-400 dark:text-slate-500 mt-0.5">{Icons.bookOpen}</div>
                  <div>
                    <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">
                      {item.title}
                      <Citations sourceIds={item.sourceIds} sources={profile.sources} />
                    </p>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {[item.publisher, item.year].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Investments ──────────────────────────────────────────────── */}
        {profile.investments && profile.investments.length > 0 && (
          <div className="report-section">
            <SectionLabel icon={Icons.trendingUp}>Investments</SectionLabel>
            <div className="overflow-x-auto">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Company / Venture</th>
                    <th>Amount</th>
                    <th>Year</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.investments.map((item, idx) => (
                    <tr key={idx}>
                      <td className="font-semibold text-slate-800 dark:text-slate-200">
                        {item.company}
                        <Citations sourceIds={item.sourceIds} sources={profile.sources} />
                      </td>
                      <td>{isEmpty(item.amount) ? <span className="text-slate-400 italic text-[12px]">Undisclosed</span> : item.amount}</td>
                      <td>{isEmpty(item.year) ? <span className="text-slate-400 italic text-[12px]">—</span> : item.year}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Net Worth ─────────────────────────────────────────────────── */}
        <div className="report-section">
          <SectionLabel icon={Icons.dollarSign}>Estimated Net Worth</SectionLabel>
          {isEmpty(profile.netWorth?.value) ? (
            <p className="text-[13px] text-slate-400 italic">Financial estimate not publicly available.</p>
          ) : (
            <div className="networth-card">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
                    Estimated Value
                  </p>
                  <p className="text-[28px] font-black text-slate-900 dark:text-white tracking-tight font-outfit">
                    {profile.netWorth.value}
                    <Citations sourceIds={profile.netWorth.sourceIds} sources={profile.sources} />
                  </p>
                  {profile.netWorth.note && (
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-2 max-w-md leading-relaxed">
                      {profile.netWorth.note}
                    </p>
                  )}
                </div>

                {/* Confidence badge */}
                <div className="flex-shrink-0 flex flex-col items-start sm:items-end gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Data Confidence</span>
                  <span className="text-[22px] font-black text-blue-600 dark:text-blue-400 font-outfit">
                    {profile.sectionConfidence?.netWorth ?? 80}%
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">{profile.citationQualityIndicator} quality</span>
                </div>
              </div>

              {/* Disclaimer */}
              <p className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700/60 text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
                <strong className="font-semibold">Disclaimer:</strong> Net worth figures are derived from public estimates by credible financial sources and may not reflect actual wealth. Figures are subject to market fluctuations and may be outdated.
              </p>
            </div>
          )}
        </div>

        {/* ── Recent News & Activities ─────────────────────────────────── */}
        <div className="report-section">
          <SectionLabel icon={Icons.newspaper}>Recent News & Activities</SectionLabel>
          {!profile.recentActivities || profile.recentActivities.length === 0 ? (
            <p className="text-[13px] text-slate-400 italic">No recent public activities on record.</p>
          ) : (
            <div className="space-y-3">
              {profile.recentActivities.map((item, idx) => (
                <div key={idx} className="news-card">
                  {/* Date column */}
                  <div className="flex-shrink-0 w-[72px]">
                    <span className="inline-block text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide leading-tight">
                      {item.date || "Recent"}
                    </span>
                  </div>
                  <div className="w-px bg-slate-200 dark:bg-slate-700 flex-shrink-0" />
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-200 leading-snug">
                      {item.title}
                      <Citations sourceIds={item.sourceIds} sources={profile.sources} />
                    </p>
                    {item.description && (
                      <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── References & Sources ─────────────────────────────────────── */}
        <div className="report-section">
          <SectionLabel icon={Icons.link}>References & Sources</SectionLabel>
          {!profile.sources || profile.sources.length === 0 ? (
            <p className="text-[13px] text-slate-400 italic">No sources cited.</p>
          ) : (
            <ol className="space-y-0">
              {profile.sources.map((item) => {
                const num = sourceIdToNumber(item.id);
                let domain = "";
                try {
                  domain = new URL(item.url).hostname.replace("www.", "");
                } catch {
                  domain = item.url;
                }
                const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
                return (
                  <li key={item.id} className="ref-item">
                    {/* Number */}
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[9px] font-bold text-slate-500 dark:text-slate-400 flex items-center justify-center font-mono mt-0.5">
                      {num}
                    </span>
                    {/* Favicon */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={faviconUrl}
                      alt=""
                      aria-hidden="true"
                      className="flex-shrink-0 w-3.5 h-3.5 rounded-sm mt-1 opacity-70"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline leading-snug break-words"
                      >
                        {item.title}
                        <span className="flex-shrink-0 opacity-60">{Icons.externalLink}</span>
                      </a>
                      <span className="block text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 font-mono">
                        {domain}
                      </span>
                      {item.snippet && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed line-clamp-2 bg-slate-50/70 dark:bg-slate-900/30 px-2.5 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800/60">
                          &ldquo;{item.snippet}&rdquo;
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* ── Document Footer ──────────────────────────────────────────── */}
        <div className="px-8 py-5 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-slate-800/60">
          <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
            <strong className="font-semibold text-slate-500 dark:text-slate-400">Note:</strong>{" "}
            Information compiled from publicly available web sources as of{" "}
            {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}.
            All data is subject to change. This report is generated by AI and may contain inaccuracies.
            Always verify with primary sources before making decisions.
          </p>
        </div>
      </article>
    </div>
  );
}

export default ProfileReport;
