/**
 * Weekly Scorecard router (audit Rec 3). Exposes the metric catalog, the live
 * signals that can be derived directly today (jobs-below-floor from Rec 1,
 * open IDS from Rec 2), and persisted weekly snapshots. Admin-only.
 *
 * The remaining BOS metrics (PP ARR, conversion, visits-on-schedule, reviews,
 * receivables) are catalog entries awaiting their rollup wiring; `liveSignals`
 * returns what is computable now and marks the rest unknown.
 */
import { z } from "zod";
import { nanoid } from "nanoid";
import { and, count, eq, ne, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { opportunities, idsIssues, scorecardMetrics } from "../../drizzle/schema";
import { SCORECARD_METRICS, SCORECARD_METRICS_BY_KEY, computeGyr } from "../../shared/scorecard";

export const scorecardRouter = router({
  /** The full BOS metric catalog (keys, labels, targets, owners). */
  catalog: protectedProcedure.query(() => SCORECARD_METRICS),

  /**
   * Live-derivable scorecard signals. Currently wires the two metrics that come
   * directly from the margin (Rec 1) and IDS (Rec 2) work; other metrics return
   * value=null / status="unknown" pending their rollup.
   */
  liveSignals: protectedProcedure.query(async () => {
    const db = await getDb();
    const out: Record<string, { value: number | null; target: number; status: string }> = {};
    const put = (key: string, value: number | null) => {
      const m = SCORECARD_METRICS_BY_KEY[key];
      out[key] = { value, target: m?.target ?? 0, status: computeGyr(value, m?.target ?? 0, m?.direction ?? "lower") };
    };

    if (db) {
      // Jobs below the GM floor (Rec 1) — open estimates/jobs only.
      const belowFloorRows = await db
        .select({ n: count() })
        .from(opportunities)
        .where(and(eq(opportunities.belowFloor, true), eq(opportunities.archived, false)));
      put("jobs_below_floor", Number(belowFloorRows[0]?.n ?? 0));

      // Open IDS issues (Rec 2).
      const openIdsRows = await db
        .select({ n: count() })
        .from(idsIssues)
        .where(and(ne(idsIssues.status, "solved"), ne(idsIssues.status, "dropped")));
      put("ids_open", Number(openIdsRows[0]?.n ?? 0));
    } else {
      put("jobs_below_floor", null);
      put("ids_open", null);
    }
    return out;
  }),

  /** Persisted snapshots for a given L10 week. */
  listSnapshots: protectedProcedure
    .input(z.object({ weekStart: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(scorecardMetrics).where(eq(scorecardMetrics.weekStart, input.weekStart));
    }),

  /** Upsert a single (week, metric) snapshot row. */
  upsertSnapshot: protectedProcedure
    .input(
      z.object({
        weekStart: z.string(),
        metricKey: z.string().refine((k) => k in SCORECARD_METRICS_BY_KEY, "Unknown metric"),
        value: z.number().nullable(),
        status: z.enum(["green", "yellow", "red", "unknown"]).optional(),
        notes: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { ok: false as const };
      const m = SCORECARD_METRICS_BY_KEY[input.metricKey];
      const status = input.status ?? computeGyr(input.value, m.target, m.direction);
      await db
        .insert(scorecardMetrics)
        .values({
          id: nanoid(),
          weekStart: input.weekStart,
          metricKey: input.metricKey,
          value: input.value,
          target: m.target,
          status,
          ownerRole: m.ownerRole,
          notes: input.notes,
        })
        .onConflictDoUpdate({
          target: [scorecardMetrics.weekStart, scorecardMetrics.metricKey],
          set: { value: input.value, status, notes: input.notes, computedAt: sql`now()` },
        });
      return { ok: true as const, status };
    }),
});
