/**
 * drizzle/schema.priorityTranslation.ts
 *
 * Priority Translation + portal schema additions (MySQL).
 * Matches drizzle/0058_priority_translations.sql 1:1. Kept in its own file so
 * the primary schema.ts stays focused on HP's core domain.
 */

import {
  index,
  json,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

// ─── portalAccounts ────────────────────────────────────────────────────────
export const portalAccounts = mysqlTable(
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
export const portalMagicLinks = mysqlTable(
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
export const portalProperties = mysqlTable(
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
  source: "priority_translation" | "baseline_assessment" | "manual";
  source_id: string;
  category: string;
  finding: string;
  urgency: "NOW" | "SOON" | "WAIT";
  investment_range_low_usd: number;
  investment_range_high_usd: number;
  reasoning: string;
  status: "open" | "in_progress" | "resolved" | "dismissed";
  added_at: string;
};

export const homeHealthRecords = mysqlTable(
  "homeHealthRecords",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    propertyId: varchar("propertyId", { length: 64 }).notNull(),
    portalAccountId: varchar("portalAccountId", { length: 64 }).notNull(),
    findings: json("findings").$type<HealthRecordFinding[]>().notNull(),
    summary: text("summary"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
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

export const priorityTranslations = mysqlTable(
  "priorityTranslations",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    portalAccountId: varchar("portalAccountId", { length: 64 }).notNull(),
    propertyId: varchar("propertyId", { length: 64 }).notNull(),
    homeHealthRecordId: varchar("homeHealthRecordId", { length: 64 }),
    pdfStoragePath: text("pdfStoragePath"),
    reportUrl: text("reportUrl"),
    notes: text("notes"),
    status: varchar("status", { length: 32 })
      .notNull()
      .default("submitted")
      .$type<PriorityTranslationStatus>(),
    claudeResponse: json("claudeResponse").$type<ClaudePriorityTranslationResponse>(),
    outputPdfPath: text("outputPdfPath"),
    deliveredAt: timestamp("deliveredAt"),
    failureReason: text("failureReason"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    accountIdx: index("priorityTranslations_account_idx").on(t.portalAccountId),
    propertyIdx: index("priorityTranslations_property_idx").on(t.propertyId),
    statusIdx: index("priorityTranslations_status_idx").on(t.status),
  }),
);

export type DbPriorityTranslation = typeof priorityTranslations.$inferSelect;
export type InsertDbPriorityTranslation = typeof priorityTranslations.$inferInsert;
