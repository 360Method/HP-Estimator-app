/**
 * server/routers/kpis.ts
 *
 * KPI read + write API. Agents call `record` via the tool wrapper; the admin
 * dashboard consumes `company`, `department`, and `seat`.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { aiAgents, kpiMetrics } from "../../drizzle/schema";
import {
  rollupSeatsToDepartments,
  rollupDepartmentsToCompany,
} from "../lib/agentRuntime/kpiRollup";

const DEPARTMENTS = [
  "sales",
  "operations",
  "marketing",
  "finance",
  "customer_success",
  "vendor_network",
  "technology",
  "strategy",
  "integrator",
] as const;

async function db() {
  const d = await getDb();
  if (!d) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return d;
}

/** Latest row per metric key for a given scope filter. */
function pickLatest<T extends { key: string; computedAt: Date | string }>(rows: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const r of rows) {
    const prev = byKey.get(r.key);
    if (!prev || new Date(r.computedAt) > new Date(prev.computedAt)) byKey.set(r.key, r);
  }
  return Array.from(byKey.values());
}

export const kpisRouter = router({
  /** Latest company-wide metrics (one row per key). */
  company: adminProcedure.query(async () => {
    const d = await db();
    const rows = await d
      .select()
      .from(kpiMetrics)
      .where(eq(kpiMetrics.scope, "company"))
      .orderBy(desc(kpiMetrics.computedAt))
      .limit(500);
    return pickLatest(rows);
  }),

  /** Department latest per-key + the seat-level breakdown. */
  department: adminProcedure
    .input(z.object({ slug: z.enum(DEPARTMENTS) }))
    .query(async ({ input }) => {
      const d = await db();
      const deptRows = await d
        .select()
        .from(kpiMetrics)
        .where(and(eq(kpiMetrics.scope, "department"), eq(kpiMetrics.scopeKey, input.slug)))
        .orderBy(desc(kpiMetrics.computedAt))
        .limit(500);
      const agents = await d
        .select()
        .from(aiAgents)
        .where(eq(aiAgents.department, input.slug));
      const seatIds = agents.map((a) => a.id);
      const seatRows = seatIds.length
        ? await d
            .select()
            .from(kpiMetrics)
            .where(eq(kpiMetrics.scope, "seat"))
            .orderBy(desc(kpiMetrics.computedAt))
            .limit(1000)
        : [];
      const seatRowsFiltered = seatRows.filter((r) => r.scopeId != null && seatIds.includes(r.scopeId));
      return {
        department: pickLatest(deptRows),
        agents,
        seatMetrics: pickLatest(seatRowsFiltered),
      };
    }),

  /** Full metric history for a single agent. */
  seat: adminProcedure.input(z.object({ agentId: z.number() })).query(async ({ input }) => {
    const d = await db();
    const rows = await d
      .select()
      .from(kpiMetrics)
      .where(and(eq(kpiMetrics.scope, "seat"), eq(kpiMetrics.scopeId, input.agentId)))
      .orderBy(desc(kpiMetrics.computedAt))
      .limit(500);
    return rows;
  }),

  /** Agent-callable write (also wired as the built-in `kpis.record` tool). */
  record: adminProcedure
    .input(
      z.object({
        scope: z.enum(["seat", "department", "company"]),
        scopeId: z.number().nullable().optional(),
        scopeKey: z.string().nullable().optional(),
        key: z.string().min(1),
        value: z.number(),
        unit: z.string().min(1),
        period: z
          .enum([
            "realtime",
            "daily",
            "weekly",
            "monthly",
            "trailing_30",
            "trailing_90",
            "trailing_365",
          ])
          .default("realtime"),
      })
    )
    .mutation(async ({ input }) => {
      const d = await db();
      await d.insert(kpiMetrics).values({
        scope: input.scope,
        scopeId: input.scopeId ?? null,
        scopeKey: input.scopeKey ?? null,
        key: input.key,
        value: input.value.toFixed(4),
        unit: input.unit,
        period: input.period,
      });
      return { ok: true };
    }),

  /** Manual rollup triggers for dev / testing — gated by adminProcedure. */
  runSeatToDeptRollup: adminProcedure.mutation(async () => rollupSeatsToDepartments()),
  runDeptToCompanyRollup: adminProcedure.mutation(async () => rollupDepartmentsToCompany()),
});
