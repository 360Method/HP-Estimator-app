/**
 * drizzle/schema.priorityTranslation.ts
 *
 * Priority Translation + portal schema additions. These definitions match
 * drizzle/0045_priority_translations.sql 1:1. When the broken-git-state is
 * resolved on origin/main, re-export these from drizzle/schema.ts:
 *
 *     export * from "./schema.priorityTranslation";
 *
 * Kept in its own file to avoid a merge conflict in the (currently missing)
 * canonical schema.ts.
 */

import { jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

// ─── portal_accounts ────────────────────────────────────────────────────────
export const portalAccounts = pgTable("portal_accounts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  firstName: varchar("first_name", { length: 128 }).notNull().default(""),
  lastName: varchar("last_name", { length: 128 }).notNull().default(""),
  phone: varchar("phone", { length: 32 }).notNull().default(""),
  customerId: varchar("customer_id", { length: 64 }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { mode: "date" }),
});

export type DbPortalAccount = typeof portalAccounts.$inferSelect;
export type InsertDbPortalAccount = typeof portalAccounts.$inferInsert;

// ─── portal_magic_links ────────────────────────────────────────────────────
export const portalMagicLinks = pgTable("portal_magic_links", {
  token: varchar("token", { length: 128 }).primaryKey(),
  portalAccountId: varchar("portal_account_id", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  consumedAt: timestamp("consumed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export type DbPortalMagicLink = typeof portalMagicLinks.$inferSelect;
export type InsertDbPortalMagicLink = typeof portalMagicLinks.$inferInsert;

// ─── portal_properties ─────────────────────────────────────────────────────
export const portalProperties = pgTable("portal_properties", {
  id: varchar("id", { length: 64 }).primaryKey(),
  portalAccountId: varchar("portal_account_id", { length: 64 }).notNull(),
  street: varchar("street", { length: 255 }).notNull().default(""),
  unit: varchar("unit", { length: 64 }).notNull().default(""),
  city: varchar("city", { length: 128 }).notNull().default(""),
  state: varchar("state", { length: 64 }).notNull().default(""),
  zip: varchar("zip", { length: 10 }).notNull().default(""),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export type DbPortalProperty = typeof portalProperties.$inferSelect;
export type InsertDbPortalProperty = typeof portalProperties.$inferInsert;

// ─── home_health_records ───────────────────────────────────────────────────
export type HealthRecordFinding = {
  source: "priority_translation" | "baseline_assessment" | "manual";
  source_id: string;
  category: string;
  finding: string;
  urgency: "NOW" | "SOON" | "WAIT";
  investment_range_low_usd: number;
  investment_range_high_usd: number;
  reasoning: string;
  status: "open" | "in_progress" | "resolved" | "dismissed";
  added_at: string; // ISO
};

export const homeHealthRecords = pgTable("home_health_records", {
  id: varchar("id", { length: 64 }).primaryKey(),
  propertyId: varchar("property_id", { length: 64 }).notNull(),
  portalAccountId: varchar("portal_account_id", { length: 64 }).notNull(),
  findings: jsonb("findings").$type<HealthRecordFinding[]>().notNull().default([]),
  summary: text("summary"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export type DbHomeHealthRecord = typeof homeHealthRecords.$inferSelect;
export type InsertDbHomeHealthRecord = typeof homeHealthRecords.$inferInsert;

// ─── priority_translations ────────────────────────────────────────────────
export type PriorityTranslationStatus =
  | "submitted"
  | "processing"
  | "completed"
  | "failed";

export type ClaudePriorityTranslationResponse = {
  summary_1_paragraph: string;
  findings: Array<{
    category: string;
    finding: string;
    urgency: "NOW" | "SOON" | "WAIT";
    investment_range_low_usd: number;
    investment_range_high_usd: number;
    reasoning: string;
  }>;
};

export const priorityTranslations = pgTable("priority_translations", {
  id: varchar("id", { length: 64 }).primaryKey(),
  portalAccountId: varchar("portal_account_id", { length: 64 }).notNull(),
  propertyId: varchar("property_id", { length: 64 }).notNull(),
  homeHealthRecordId: varchar("home_health_record_id", { length: 64 }),
  pdfStoragePath: text("pdf_storage_path"),
  reportUrl: text("report_url"),
  notes: text("notes"),
  status: varchar("status", { length: 32 }).notNull().default("submitted").$type<PriorityTranslationStatus>(),
  claudeResponse: jsonb("claude_response").$type<ClaudePriorityTranslationResponse>(),
  outputPdfPath: text("output_pdf_path"),
  deliveredAt: timestamp("delivered_at", { mode: "date" }),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export type DbPriorityTranslation = typeof priorityTranslations.$inferSelect;
export type InsertDbPriorityTranslation = typeof priorityTranslations.$inferInsert;
