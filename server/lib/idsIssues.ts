/**
 * IDS Issues Log (audit Rec 2) — server helpers for the BOS
 * "Identify / Discuss / Solve" list. Issues auto-create from operational
 * triggers (starting with the Rec 1 margin-floor breach) or are entered
 * manually, and are worked at the weekly L10.
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { idsIssues, type DbIdsIssue, type InsertDbIdsIssue } from "../../drizzle/schema";

/** The 8 BOS issue categories. */
export const IDS_CATEGORIES = {
  "CAT-1": "Phase 1 quality (baseline / inspection)",
  "CAT-2": "Phase 2 execution (job delivery)",
  "CAT-3": "Subcontractor / trade",
  "CAT-4": "Margin erosion",
  "CAT-5": "Client relationship",
  "CAT-6": "Documentation",
  "CAT-7": "Financial / collections",
  "CAT-8": "Rocks / strategic",
} as const;
export type IdsCategory = keyof typeof IDS_CATEGORIES;

export type IdsStatus = "open" | "discussing" | "solved" | "dropped";
export type IdsSource =
  | "manual"
  | "margin_floor"
  | "estimate_variance"
  | "visit_slip"
  | "scorecard_red";

export function isValidCategory(c: string): c is IdsCategory {
  return Object.prototype.hasOwnProperty.call(IDS_CATEGORIES, c);
}

// ─── Pure issue builders (unit-testable, no DB) ────────────────────────────

/** Stable dedupe key for the margin-floor issue tied to one opportunity. */
export function marginFloorDedupeKey(opportunityId: string): string {
  return `margin_floor:${opportunityId}`;
}

export interface BuiltIssue {
  category: IdsCategory;
  title: string;
  source: IdsSource;
  priority: "low" | "normal" | "high";
  dedupeKey: string;
}

/** Build the CAT-4 margin-erosion issue for a below-floor opportunity. */
export function buildMarginFloorIssue(args: {
  opportunityId: string;
  title?: string | null;
  grossMarginBps?: number | null;
  minGmBps?: number | null;
}): BuiltIssue {
  const gmPct = args.grossMarginBps != null ? (args.grossMarginBps / 100).toFixed(1) : "?";
  const floorPct = args.minGmBps != null ? (args.minGmBps / 100).toFixed(0) : "?";
  const label = args.title?.trim() || `Opportunity ${args.opportunityId}`;
  return {
    category: "CAT-4",
    title: `${label} is priced below the gross-margin floor (${gmPct}% GM vs ${floorPct}% floor).`,
    source: "margin_floor",
    priority: "high",
    dedupeKey: marginFloorDedupeKey(args.opportunityId),
  };
}

// ─── DB helpers (null-safe; no-op when DATABASE_URL is absent) ──────────────

export async function listIdsIssues(opts?: {
  status?: IdsStatus;
  category?: IdsCategory;
  limit?: number;
}): Promise<DbIdsIssue[]> {
  const db = await getDb();
  if (!db) return [];
  const conds = [];
  if (opts?.status) conds.push(eq(idsIssues.status, opts.status));
  if (opts?.category) conds.push(eq(idsIssues.category, opts.category));
  const where = conds.length ? and(...conds) : undefined;
  return db
    .select()
    .from(idsIssues)
    .where(where as any)
    .orderBy(desc(idsIssues.createdAt))
    .limit(opts?.limit ?? 500);
}

export async function getIdsIssueByDedupeKey(dedupeKey: string): Promise<DbIdsIssue | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(idsIssues).where(eq(idsIssues.dedupeKey, dedupeKey)).limit(1);
  return rows[0] ?? null;
}

export async function createIdsIssue(data: InsertDbIdsIssue): Promise<DbIdsIssue | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.insert(idsIssues).values(data).returning();
  return rows[0] ?? null;
}

export async function updateIdsIssue(id: string, patch: Partial<InsertDbIdsIssue>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(idsIssues).set(patch).where(eq(idsIssues.id, id));
}

/**
 * Idempotently keep the margin-floor IDS issue in sync with an opportunity's
 * belowFloor state. Opens (or refreshes) a CAT-4 issue when below floor; closes
 * an open one when the breach clears. Safe to call on every opportunity save.
 */
export async function syncMarginFloorIssue(args: {
  opportunityId: string;
  customerId?: string | null;
  title?: string | null;
  belowFloor: boolean;
  grossMarginBps?: number | null;
  minGmBps?: number | null;
  nowIso?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const nowIso = args.nowIso ?? new Date().toISOString();
  const dedupeKey = marginFloorDedupeKey(args.opportunityId);
  const existing = await getIdsIssueByDedupeKey(dedupeKey);

  if (args.belowFloor) {
    const built = buildMarginFloorIssue(args);
    if (existing) {
      // Refresh the statement + reopen if it had been auto/again-resolved.
      await updateIdsIssue(existing.id, {
        title: built.title,
        status: existing.status === "solved" || existing.status === "dropped" ? "open" : existing.status,
        resolvedAt: null,
      });
    } else {
      const { nanoid } = await import("nanoid");
      await createIdsIssue({
        id: nanoid(),
        category: built.category,
        title: built.title,
        status: "open",
        priority: built.priority,
        source: built.source,
        dedupeKey,
        opportunityId: args.opportunityId,
        customerId: args.customerId ?? undefined,
      });
    }
  } else if (existing && existing.status !== "solved" && existing.status !== "dropped") {
    // Breach cleared — auto-resolve the open margin issue.
    await updateIdsIssue(existing.id, { status: "solved", resolvedAt: nowIso });
  }
}
