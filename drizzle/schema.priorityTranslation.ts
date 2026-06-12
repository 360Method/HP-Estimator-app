/**
 * drizzle/schema.priorityTranslation.ts
 *
 * Priority Translation + portal schema additions.
 * Kept in its own file so the primary schema.ts stays focused on HP's core domain.
 */

import {
  index,
  json,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

// ─── portalAccounts ────────────────────────────────────────────────────────
export const portalAccounts = pgTable(
  "portalAccounts",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    email: varchar("email", { length: 320 }).notNull().unique(),
    firstName: varchar("firstName", { length: 128 }).notNull().default(""),
    lastName: varchar("lastName", { length: 128 }).notNull().default(""),
    phone: varchar("phone", { length: 32 }).notNull().default(""),
    customerId: varchar("customerId", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    lastLoginAt: timestamp("lastLoginAt"),
  },
  (t) => ({
    emailIdx: index("portalAccounts_email_idx").on(t.email),
    customerIdIdx: index("portalAccounts_customerId_idx").on(t.customerId),
  }),
);

export type DbPortalAccount = typeof portalAccounts.$inferSelect;
export type InsertDbPortalAccount = typeof portalAccounts.$inferInsert;

// ─── portalMagicLinks ──────────────────────────────────────────────────────
export const portalMagicLinks = pgTable(
  "portalMagicLinks",
  {
    // SHA-256 hex of the raw token the homeowner clicked with. We never
    // store the raw token at rest.
    tokenHash: varchar("tokenHash", { length: 64 }).primaryKey(),
    portalAccountId: varchar("portalAccountId", { length: 64 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    consumedAt: timestamp("consumedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    accountIdx: index("portalMagicLinks_account_idx").on(t.portalAccountId),
  }),
);

export type DbPortalMagicLink = typeof portalMagicLinks.$inferSelect;
export type InsertDbPortalMagicLink = typeof portalMagicLinks.$inferInsert;

// ─── portalProperties ──────────────────────────────────────────────────────
export const portalProperties = pgTable(
  "portalProperties",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    portalAccountId: varchar("portalAccountId", { length: 64 }).notNull(),
    street: varchar("street", { length: 255 }).notNull().default(""),
    unit: varchar("unit", { length: 64 }).notNull().default(""),
    city: varchar("city", { length: 128 }).notNull().default(""),
    state: varchar("state", { length: 64 }).notNull().default(""),
    zip: varchar("zip", { length: 10 }).notNull().default(""),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    accountIdx: index("portalProperties_account_idx").on(t.portalAccountId),
    accountZipStreetIdx: uniqueIndex("portalProperties_account_zip_street_idx")
      .on(t.portalAccountId, t.street, t.zip),
  }),
);

export type DbPortalProperty = typeof portalProperties.$inferSelect;
export type InsertDbPortalProperty = typeof portalProperties.$inferInsert;

// ─── homeHealthRecords ─────────────────────────────────────────────────────
export type HealthRecordFinding = {
  source: "priority_translation" | "baseline_assessment" | "manual" | "spot_inspection";
  source_id: string;
  category: string;
  finding: string;
  /** "What this means for your home" — translated, time-horizon framed. Optional for back-compat. */
  interpretation?: string;
  /** "How we'd approach it" — sequencing + character of work. Optional for back-compat. */
  recommended_approach?: string;
  urgency: "NOW" | "SOON" | "WAIT";
  investment_range_low_usd: number;
  investment_range_high_usd: number;
  reasoning: string;
  status: "open" | "in_progress" | "resolved" | "dismissed";
  added_at: string;
};

export const homeHealthRecords = pgTable(
  "homeHealthRecords",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    propertyId: varchar("propertyId", { length: 64 }).notNull(),
    portalAccountId: varchar("portalAccountId", { length: 64 }).notNull(),
    findings: json("findings").$type<HealthRecordFinding[]>().notNull(),
    summary: text("summary"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => ({
    propertyIdx: uniqueIndex("homeHealthRecords_property_idx").on(t.propertyId),
  }),
);

export type DbHomeHealthRecord = typeof homeHealthRecords.$inferSelect;
export type InsertDbHomeHealthRecord = typeof homeHealthRecords.$inferInsert;

// ─── priorityTranslations ──────────────────────────────────────────────────
export type PriorityTranslationStatus =
  | "submitted"
  | "processing"
  /** Spot inspections only: AI draft is on the consultant's device, not customer-visible. */
  | "awaiting_review"
  | "completed"
  | "failed";

/** Where the row came from: the public funnel or a staff-run spot inspection. */
export type PriorityTranslationSource = "roadmap_funnel" | "spot_inspection";

/** A photo captured on-site during a spot inspection (Cloudinary). */
export type SpotInspectionPhoto = {
  url: string;
  fileKey: string;
  caption?: string;
  /** 0-based index of the finding this photo belongs under in the PDF. */
  findingIndex?: number;
};

export type ClaudePriorityTranslationResponse = {
  /** Back-compat: first paragraph of executive_summary. Older readers fall back here. */
  summary_1_paragraph: string;
  /** 2–3 paragraph stewardship narrative addressed to the homeowner. */
  executive_summary?: string;
  /** 1 paragraph: era of home, PNW climate context, what shapes the standard of care. */
  property_character?: string;
  /** 1 paragraph: stewardship invitation + next-step framing. */
  closing?: string;
  findings: Array<{
    category: string;
    finding: string;
    /** "What this means for your home" — interpretation in plain language. */
    interpretation?: string;
    /** "How we'd approach it" — sequencing + character of work. */
    recommended_approach?: string;
    urgency: "NOW" | "SOON" | "WAIT";
    investment_range_low_usd: number;
    investment_range_high_usd: number;
    reasoning: string;
    /** 1-based report pages where the inspector documents this finding — used to place the inspector's photos beside it. */
    source_pages?: number[];
  }>;
};

export const priorityTranslations = pgTable(
  "priorityTranslations",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    portalAccountId: varchar("portalAccountId", { length: 64 }).notNull(),
    propertyId: varchar("propertyId", { length: 64 }).notNull(),
    homeHealthRecordId: varchar("homeHealthRecordId", { length: 64 }),
    pdfStoragePath: text("pdfStoragePath"),
    reportUrl: text("reportUrl"),
    notes: text("notes"),
    /** sha256 of the submitted report (PDF bytes, or extracted text for URL-only) — dedupe guardrail. */
    pdfSha256: varchar("pdfSha256", { length: 64 }),
    /** Submitter IP (X-Forwarded-For aware) — per-IP daily cap guardrail. */
    submitIp: varchar("submitIp", { length: 45 }),
    /** roadmap_funnel (public) | spot_inspection (staff-run on-site). */
    source: varchar("source", { length: 32 })
      .notNull()
      .default("roadmap_funnel")
      .$type<PriorityTranslationSource>(),
    /** Direct CRM link for staff-created rows (funnel rows use the email bridge). */
    hpCustomerId: varchar("hpCustomerId", { length: 64 }),
    /**
     * CRM properties.id this spot inspection belongs to. Distinct from
     * propertyId above, which is PORTAL-namespace and NOT NULL.
     */
    crmPropertyId: varchar("crmPropertyId", { length: 64 }),
    /** JSON SpotInspectionPhoto[] — on-site photos (Cloudinary). */
    capturedPhotosJson: json("capturedPhotosJson").$type<SpotInspectionPhoto[]>(),
    /** The consultant's on-site narration; `notes` stays homeowner-facing. */
    techNotes: text("techNotes"),
    /** Staff user id who approved the mini roadmap for delivery. */
    approvedBy: varchar("approvedBy", { length: 64 }),
    approvedAt: timestamp("approvedAt"),
    status: varchar("status", { length: 32 })
      .notNull()
      .default("submitted")
      .$type<PriorityTranslationStatus>(),
    claudeResponse: json("claudeResponse").$type<ClaudePriorityTranslationResponse>(),
    outputPdfPath: text("outputPdfPath"),
    deliveredAt: timestamp("deliveredAt"),
    failureReason: text("failureReason"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().$onUpdate(() => new Date()).notNull(),
  },
  (t) => ({
    accountIdx: index("priorityTranslations_account_idx").on(t.portalAccountId),
    propertyIdx: index("priorityTranslations_property_idx").on(t.propertyId),
    statusIdx: index("priorityTranslations_status_idx").on(t.status),
  }),
);

export type DbPriorityTranslation = typeof priorityTranslations.$inferSelect;
export type InsertDbPriorityTranslation = typeof priorityTranslations.$inferInsert;
