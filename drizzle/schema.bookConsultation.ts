/**
 * drizzle/schema.bookConsultation.ts
 *
 * Project Estimator schema (MySQL). The Lead Nurturer's `agentDrafts` and
 * `nurturerPlaybooks` tables (shipped in PR #44) are reused for cadence and
 * draft delivery — see drizzle/schema.ts.
 *
 * The single new table here is `projectEstimates`, which captures the AI
 * estimator's orchestrator state. Boot-time `ensureBookConsultationTables()`
 * in server/_core/index.ts creates it if drizzle-kit's tracker has drifted
 * from prod.
 */

import {
  index,
  int,
  json,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

// ─── projectEstimates ───────────────────────────────────────────────────────
export type ProjectEstimateStatus =
  | "submitted"        // intake landed, worker not yet picked it up
  | "processing"       // Claude call in flight
  | "needs_info"       // confidence=low, questions queued for nurturer
  | "needs_review"     // confidence=medium, awaiting Marcin approval
  | "delivered"        // visible in customer portal
  | "failed";

export type EstimatorConfidence = "high" | "medium" | "low";

export type EstimatorEffortLine = {
  trade: string;                     // "carpentry", "plumbing", "interior_paint", etc.
  source: "internal" | "subcontractor";
  hours: number;
  rate_basis_usd: number;            // $150 internal, $100 sub-cost
  markup_multiplier: number;         // 1.0 internal (already post-markup), 1.5 default sub
  customer_line_total_usd: number;   // hours × rate × markup
  hard_cost_usd: number;             // hours × rate (sub) or hours × rate (internal — proxy)
  notes?: string;
};

export type EstimatorMaterialLine = {
  description: string;
  quantity: number;
  unit_cost_usd: number;
  markup_multiplier: number;         // 1.5 default
  customer_line_total_usd: number;
  hard_cost_usd: number;
  notes?: string;
};

export type EstimatorClaudeResponse = {
  scope_summary: string;             // 1 paragraph, stewardship voice
  effort_breakdown: EstimatorEffortLine[];
  materials: EstimatorMaterialLine[];
  hard_cost_subtotal_usd: number;
  customer_total_usd: number;
  customer_range_low_usd: number;    // total × 0.75
  customer_range_high_usd: number;   // total × 1.25
  gross_margin_pct: number;          // realized
  margin_floor_applied: boolean;     // true if uplift was needed
  confidence: EstimatorConfidence;
  missing_info_questions: string[];
  recommended_next_step: "estimate" | "walkthrough_first";
  voice_audit_passed: boolean;       // self-check the prompt does
};

export const projectEstimates = mysqlTable(
  "projectEstimates",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    /** FK → opportunities.id (the lead created at /book submit). */
    opportunityId: varchar("opportunityId", { length: 64 }).notNull(),
    /** FK → customers.id. */
    customerId: varchar("customerId", { length: 64 }).notNull(),
    /** FK → onlineRequests.id (the raw form submission). */
    onlineRequestId: int("onlineRequestId"),
    /** Optional FK → portalAccounts.id (auto-provisioned on submit). */
    portalAccountId: varchar("portalAccountId", { length: 64 }),
    status: varchar("status", { length: 32 })
      .notNull()
      .default("submitted")
      .$type<ProjectEstimateStatus>(),
    confidence: varchar("confidence", { length: 16 }).$type<EstimatorConfidence>(),
    /** Full Claude JSON response for audit + admin review. */
    claudeResponse: json("claudeResponse").$type<EstimatorClaudeResponse>(),
    /** Customer-facing range, denormalized for fast portal queries. */
    customerRangeLowUsd: int("customerRangeLowUsd"),
    customerRangeHighUsd: int("customerRangeHighUsd"),
    /** 1-paragraph scope summary surfaced on the portal page. */
    scopeSummary: text("scopeSummary"),
    /** Markdown of "what's included" (for the portal + future PDF). */
    inclusionsMd: text("inclusionsMd"),
    /** Internal margin audit string for Marcin. */
    marginAudit: text("marginAudit"),
    /** Set when status flips to delivered. */
    deliveredAt: timestamp("deliveredAt"),
    /** Customer-action timestamps. */
    viewedAt: timestamp("viewedAt"),
    proceedClickedAt: timestamp("proceedClickedAt"),
    walkthroughRequestedAt: timestamp("walkthroughRequestedAt"),
    declinedAt: timestamp("declinedAt"),
    /** Failure mode on processing errors. */
    failureReason: text("failureReason"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    opportunityIdx: index("projectEstimates_opportunity_idx").on(t.opportunityId),
    customerIdx: index("projectEstimates_customer_idx").on(t.customerId),
    statusIdx: index("projectEstimates_status_idx").on(t.status),
  }),
);

export type DbProjectEstimate = typeof projectEstimates.$inferSelect;
export type InsertDbProjectEstimate = typeof projectEstimates.$inferInsert;

// ─── Cadence step keys (compatible with main's agentDrafts.stepKey) ────────
// Inserted into agentDrafts.stepKey (varchar 64) alongside playbookKey
// = "book_consultation_followup". The Lead Nurturer worker doesn't
// auto-generate bodies for these — we pre-render them — so they're queued
// directly with status="ready".

export const BOOK_CONSULTATION_PLAYBOOK_KEY = "book_consultation_followup";

export type BookConsultationStepKey =
  | "concierge_personal_followup"   // T+4h
  | "estimate_ready_or_questions"   // T+24h
  | "estimate_view_nudge"           // T+48h
  | "membership_intro"              // T+5d
  | "long_term_nurture";            // T+10d
