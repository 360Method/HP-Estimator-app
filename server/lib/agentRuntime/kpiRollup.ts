/**
 * server/lib/agentRuntime/kpiRollup.ts
 *
 * Seat → department → company aggregation. Each metric is re-computed from its
 * contributing seat rows at rollup time; we don't mutate prior rows. Latest
 * value per (scope, scopeId/Key, key) wins.
 *
 * Aggregation rules per unit:
 *   - usd, count  → SUM
 *   - pct, days   → AVG
 *
 * Daily cron (4am Pacific): seat → department.
 * Weekly cron (Mon 4am Pacific): department → company.
 *
 * Earlier-morning slot is intentional: department-head briefings fire
 * around 5–6am PT and need rollups already on disk when they pull KPIs.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { aiAgents, kpiMetrics } from "../../../drizzle/schema";
import {
  claimCronRun,
  markCronRunResult,
  pacificDateKey,
  pacificIsoWeekKey,
} from "./cronRuns";

type Unit = "usd" | "pct" | "count" | "days" | string;

function aggForUnit(unit: Unit): "sum" | "avg" {
  if (unit === "pct" || unit === "days") return "avg";
  return "sum";
}

export type RecordSeatKpiInput = {
  agentId: number;
  key: string;
  value: number;
  unit?: string;
  period?: string;
  sourceTaskId?: number;
};

export async function recordSeatKpi(input: RecordSeatKpiInput): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(kpiMetrics).values({
    scope: "seat",
    scopeId: input.agentId,
    scopeKey: null,
    key: input.key,
    value: input.value.toFixed(4),
    unit: input.unit ?? "count",
    period: (input.period as never) ?? "realtime",
    sourceTaskId: input.sourceTaskId ?? null,
  });
}

/** Roll up seat-level rows into department-level rows. */
export async function rollupSeatsToDepartments(): Promise<{ inserted: number }> {
  const db = await getDb();
  if (!db) return { inserted: 0 };

  // Latest seat value per (agentId, key)
  const seatRows = await db
    .select({
      agentId: kpiMetrics.scopeId,
      key: kpiMetrics.key,
      value: kpiMetrics.value,
      unit: kpiMetrics.unit,
      computedAt: kpiMetrics.computedAt,
    })
    .from(kpiMetrics)
    .where(eq(kpiMetrics.scope, "seat"))
    .orderBy(desc(kpiMetrics.computedAt));

  // Reduce to latest per (agentId, key)
  const latestByPair = new Map<string, { agentId: number; key: string; value: number; unit: string }>();
  for (const r of seatRows) {
    if (r.agentId == null) continue;
    const pair = `${r.agentId}|${r.key}`;
    if (!latestByPair.has(pair)) {
      latestByPair.set(pair, {
        agentId: Number(r.agentId),
        key: r.key,
        value: Number(r.value),
        unit: r.unit,
      });
    }
  }
  if (latestByPair.size === 0) return { inserted: 0 };

  const agentIds = Array.from(new Set(Array.from(latestByPair.values()).map((v) => v.agentId)));
  const agents = await db.select().from(aiAgents).where(inArray(aiAgents.id, agentIds));
  const deptByAgent = new Map<number, string>();
  for (const a of agents) deptByAgent.set(a.id, a.department);

  // Group by (department, key)
  type Group = { dept: string; key: string; values: number[]; unit: string };
  const groups = new Map<string, Group>();
  for (const { agentId, key, value, unit } of latestByPair.values()) {
    const dept = deptByAgent.get(agentId);
    if (!dept) continue;
    const gk = `${dept}|${key}`;
    const g = groups.get(gk);
    if (g) {
      g.values.push(value);
    } else {
      groups.set(gk, { dept, key, values: [value], unit });
    }
  }

  let inserted = 0;
  for (const g of groups.values()) {
    const agg = aggForUnit(g.unit);
    const value =
      agg === "sum"
        ? g.values.reduce((a, b) => a + b, 0)
        : g.values.reduce((a, b) => a + b, 0) / g.values.length;
    await db.insert(kpiMetrics).values({
      scope: "department",
      scopeId: null,
      scopeKey: g.dept,
      key: g.key,
      value: value.toFixed(4),
      unit: g.unit,
      period: "daily",
    });
    inserted++;
  }
  return { inserted };
}

/** Roll up department-level rows into company-level rows. */
export async function rollupDepartmentsToCompany(): Promise<{ inserted: number }> {
  const db = await getDb();
  if (!db) return { inserted: 0 };

  const deptRows = await db
    .select({
      scopeKey: kpiMetrics.scopeKey,
      key: kpiMetrics.key,
      value: kpiMetrics.value,
      unit: kpiMetrics.unit,
      computedAt: kpiMetrics.computedAt,
    })
    .from(kpiMetrics)
    .where(eq(kpiMetrics.scope, "department"))
    .orderBy(desc(kpiMetrics.computedAt));

  const latestByPair = new Map<string, { dept: string; key: string; value: number; unit: string }>();
  for (const r of deptRows) {
    if (!r.scopeKey) continue;
    const pair = `${r.scopeKey}|${r.key}`;
    if (!latestByPair.has(pair)) {
      latestByPair.set(pair, {
        dept: r.scopeKey,
        key: r.key,
        value: Number(r.value),
        unit: r.unit,
      });
    }
  }
  if (latestByPair.size === 0) return { inserted: 0 };

  const groups = new Map<string, { key: string; values: number[]; unit: string }>();
  for (const { key, value, unit } of latestByPair.values()) {
    const g = groups.get(key);
    if (g) {
      g.values.push(value);
    } else {
      groups.set(key, { key, values: [value], unit });
    }
  }

  let inserted = 0;
  for (const g of groups.values()) {
    const agg = aggForUnit(g.unit);
    const value =
      agg === "sum"
        ? g.values.reduce((a, b) => a + b, 0)
        : g.values.reduce((a, b) => a + b, 0) / g.values.length;
    await db.insert(kpiMetrics).values({
      scope: "company",
      scopeId: null,
      scopeKey: null,
      key: g.key,
      value: value.toFixed(4),
      unit: g.unit,
      period: "weekly",
    });
    inserted++;
  }
  return { inserted };
}

// ─── Cron timer plumbing ───────────────────────────────────────────────────────
// Pacific Time 4am trigger — we poll every 15 minutes and fire when the current
// Pacific hour is 4 and we haven't fired in the last 12h (daily) / 6.5 days (weekly).

const ROLLUP_HOUR_PT = 4;

let dailyInterval: NodeJS.Timeout | null = null;
let lastDaily = 0;
let lastWeekly = 0;

function isPacificRollupHour(): boolean {
  const nowIso = new Date().toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    hour12: false,
  });
  const hour = Number(nowIso.split(", ")[1]?.split(":")[0] ?? -1);
  return hour === ROLLUP_HOUR_PT;
}

function isMonday(): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
  }).format(new Date());
  return parts === "Mon";
}

export function startKpiCron(periodMs: number = 15 * 60 * 1000) {
  if (dailyInterval) return;
  dailyInterval = setInterval(async () => {
    try {
      const now = Date.now();
      if (isPacificRollupHour() && now - lastDaily > 12 * 60 * 60 * 1000) {
        // DB-backed dedupe survives Railway restarts; the in-memory
        // `lastDaily` shaves a DB round-trip on the off-hour ticks.
        const dayKey = pacificDateKey();
        if (await claimCronRun("kpi_daily_rollup", dayKey)) {
          try {
            const result = await rollupSeatsToDepartments();
            await markCronRunResult(
              "kpi_daily_rollup",
              dayKey,
              "succeeded",
              `inserted=${result.inserted}`,
            );
            console.log(`[kpiCron] daily rollup ${dayKey}: inserted=${result.inserted}`);
          } catch (err) {
            await markCronRunResult(
              "kpi_daily_rollup",
              dayKey,
              "failed",
              err instanceof Error ? err.message.slice(0, 200) : "error",
            );
            throw err;
          }
        }
        lastDaily = now;
      }
      if (isPacificRollupHour() && isMonday() && now - lastWeekly > 6.5 * 24 * 60 * 60 * 1000) {
        const weekKey = pacificIsoWeekKey();
        if (await claimCronRun("kpi_weekly_rollup", weekKey)) {
          try {
            const result = await rollupDepartmentsToCompany();
            await markCronRunResult(
              "kpi_weekly_rollup",
              weekKey,
              "succeeded",
              `inserted=${result.inserted}`,
            );
            console.log(`[kpiCron] weekly rollup ${weekKey}: inserted=${result.inserted}`);
          } catch (err) {
            await markCronRunResult(
              "kpi_weekly_rollup",
              weekKey,
              "failed",
              err instanceof Error ? err.message.slice(0, 200) : "error",
            );
            throw err;
          }
        }
        lastWeekly = now;
      }
    } catch (err) {
      console.warn("[kpiCron]", err);
    }
  }, periodMs);
}

export function stopKpiCron() {
  if (dailyInterval) clearInterval(dailyInterval);
  dailyInterval = null;
}
