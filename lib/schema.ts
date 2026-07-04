import { z } from "zod";

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

export const CareerEventSchema = z.object({
  year: z.string(),
  event: z.string(),
  sourceIds: z.array(z.string()),
});

export const EducationEntrySchema = z.object({
  institution: z.string().nullable(),
  degree: z.string().nullable(),
  field: z.string().nullable(),
  year: z.string().nullable(),
  sourceIds: z.array(z.string()),
});

export const InterestSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  sourceIds: z.array(z.string()),
});

export const NetWorthSchema = z.object({
  value: z.string().nullable(),
  note: z.string().nullable(),
  sourceIds: z.array(z.string()),
});

export const RecentActivitySchema = z.object({
  date: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  sourceIds: z.array(z.string()),
});

export const SourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  snippet: z.string().nullable(),
});

export const AchievementSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  year: z.string().nullable(),
  sourceIds: z.array(z.string()),
});

export const AwardSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
  year: z.string().nullable(),
  sourceIds: z.array(z.string()),
});

export const CompanySchema = z.object({
  name: z.string(),
  role: z.string().nullable(),
  period: z.string().nullable(),
  sourceIds: z.array(z.string()),
});

export const BookSchema = z.object({
  title: z.string(),
  publisher: z.string().nullable(),
  year: z.string().nullable(),
  sourceIds: z.array(z.string()),
});

export const InvestmentSchema = z.object({
  company: z.string(),
  amount: z.string().nullable(),
  year: z.string().nullable(),
  sourceIds: z.array(z.string()),
});

export const BasicDetailsSchema = z.object({
  fullName: z.string().nullable(),
  nationality: z.string().nullable(),
  currentRole: z.string().nullable(),
  occupation: z.string().nullable(),
  industry: z.string().nullable(),
  currentCity: z.string().nullable(),
  currentCountry: z.string().nullable(),
  currentCompany: z.string().nullable(), // Added for detailed report mapping
  website: z.string().nullable(),        // Added for detailed report mapping
  socialLinks: z.array(z.string()).default([]), // Added for detailed report mapping
});

// ─── Root Profile Schema ──────────────────────────────────────────────────────

export const ProfileSchema = z.object({
  profileImageUrl: z.string().nullable().default(null),
  executiveSummary: z.string().nullable(),
  basicDetails: BasicDetailsSchema,
  biography: z.string().nullable(),
  careerTimeline: z.array(CareerEventSchema),
  education: z.array(EducationEntrySchema),
  interests: z.array(InterestSchema),
  skills: z.array(z.string()).default([]),
  achievements: z.array(AchievementSchema).default([]),
  awards: z.array(AwardSchema).default([]),
  companies: z.array(CompanySchema).default([]),
  books: z.array(BookSchema).default([]),
  investments: z.array(InvestmentSchema).default([]),
  netWorth: NetWorthSchema,
  recentActivities: z.array(RecentActivitySchema),
  sources: z.array(SourceSchema),
  sourceQuality: z.enum(["Well sourced", "Limited public evidence"]),
  sectionConfidence: z.object({
    executiveSummary: z.number().min(0).max(100).default(80),
    basicDetails: z.number().min(0).max(100).default(80),
    biography: z.number().min(0).max(100).default(80),
    careerTimeline: z.number().min(0).max(100).default(80),
    education: z.number().min(0).max(100).default(80),
    interests: z.number().min(0).max(100).default(80),
    netWorth: z.number().min(0).max(100).default(80),
    recentActivities: z.number().min(0).max(100).default(80),
  }).default({
    executiveSummary: 80,
    basicDetails: 80,
    biography: 80,
    careerTimeline: 80,
    education: 80,
    interests: 80,
    netWorth: 80,
    recentActivities: 80,
  }),
  citationQualityIndicator: z.enum(["Excellent", "Good", "Fair", "Poor"]).default("Good"),
});

// ─── Inferred TypeScript Types ────────────────────────────────────────────────

export type CareerEvent = z.infer<typeof CareerEventSchema>;
export type EducationEntry = z.infer<typeof EducationEntrySchema>;
export type Interest = z.infer<typeof InterestSchema>;
export type NetWorth = z.infer<typeof NetWorthSchema>;
export type RecentActivity = z.infer<typeof RecentActivitySchema>;
export type Source = z.infer<typeof SourceSchema>;
export type BasicDetails = z.infer<typeof BasicDetailsSchema>;
export type Achievement = z.infer<typeof AchievementSchema>;
export type Award = z.infer<typeof AwardSchema>;
export type Company = z.infer<typeof CompanySchema>;
export type Book = z.infer<typeof BookSchema>;
export type Investment = z.infer<typeof InvestmentSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
