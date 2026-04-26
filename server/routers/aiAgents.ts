/**
 * server/routers/aiAgents.ts
 *
 * Admin-only CRUD + control plane for the AI agent runtime (Phase 1).
 * No tool wiring yet — just enough endpoints to manage seat config, promote
 * drafts to autonomous, trigger manual runs, and approve parked runs.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  aiAgents,
  aiAgentTasks,
  aiAgentTools,
  aiAgentRuns,
} from "../../drizzle/schema";
import { runAgent } from "../lib/agentRuntime/runtime";
import { approveTask, rejectTask } from "../lib/agentRuntime/approval";
import { listToolKeys } from "../lib/agentRuntime/tools";
import { validateHierarchy } from "../lib/agentRuntime/hierarchy";
// Side-effect import: registers the 15 Phase-2 tool wrappers into the registry.
import "../lib/agentRuntime/phase2Tools";

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

const STATUSES = ["draft_queue", "autonomous", "paused", "disabled"] as const;

async function db() {
  const d = await getDb();
  if (!d) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return d;
}

export const aiAgentsRouter = router({
  // ── Agents ──────────────────────────────────────────────────────────────────
  list: adminProcedure.query(async () => {
    const d = await db();
    const agents = await d.select().from(aiAgents).orderBy(aiAgents.id);
    // Per-agent cost today + task counts — small enough set (<100) that N queries are fine in Phase 1.
    // Also include toolCount + pendingDrafts for the org-chart card surface.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rollups = await Promise.all(
      agents.map(async (a) => {
        const runAgg = (
          await d
            .select({
              costSum: sql<number>`COALESCE(SUM(${aiAgentRuns.costUsd}), 0)`,
              runs: sql<number>`COUNT(*)`,
            })
            .from(aiAgentRuns)
            .where(and(eq(aiAgentRuns.agentId, a.id), gte(aiAgentRuns.createdAt, since)))
        )[0];
        const queued = (
          await d
            .select({ count: sql<number>`COUNT(*)` })
            .from(aiAgentTasks)
            .where(and(eq(aiAgentTasks.agentId, a.id), eq(aiAgentTasks.status, "queued")))
        )[0];
        const drafts = (
          await d
            .select({ count: sql<number>`COUNT(*)` })
            .from(aiAgentTasks)
            .where(and(eq(aiAgentTasks.agentId, a.id), eq(aiAgentTasks.status, "awaiting_approval")))
        )[0];
        const tools = (
          await d
            .select({ count: sql<number>`COUNT(*)` })
            .from(aiAgentTools)
            .where(and(eq(aiAgentTools.agentId, a.id), eq(aiAgentTools.authorized, true)))
        )[0];
        return {
          ...a,
          costTodayUsd: Number(runAgg?.costSum ?? 0),
          runsToday: Number(runAgg?.runs ?? 0),
          queuedTasks: Number(queued?.count ?? 0),
          pendingDrafts: Number(drafts?.count ?? 0),
          toolCount: Number(tools?.count ?? 0),
        };
      })
    );
    return rollups;
  }),

  get: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const d = await db();
    const [agent] = await d.select().from(aiAgents).where(eq(aiAgents.id, input.id)).limit(1);
    if (!agent) throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });
    const tools = await d.select().from(aiAgentTools).where(eq(aiAgentTools.agentId, input.id));
    const recentRuns = await d
      .select()
      .from(aiAgentRuns)
      .where(eq(aiAgentRuns.agentId, input.id))
      .orderBy(desc(aiAgentRuns.createdAt))
      .limit(20);
    return { agent, tools, recentRuns };
  }),

  create: adminProcedure
    .input(
      z.object({
        seatName: z.string().min(1).max(80),
        department: z.enum(DEPARTMENTS),
        role: z.string().min(1),
        systemPrompt: z.string().min(1),
        model: z.string().optional(),
        reportsToSeatId: z.number().nullable().optional(),
        isDepartmentHead: z.boolean().optional(),
        costCapDailyUsd: z.number().positive().optional(),
        runLimitDaily: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const d = await db();
      const roster = await d.select().from(aiAgents);
      const candidate = {
        id: -1,
        department: input.department,
        isDepartmentHead: input.isDepartmentHead ?? false,
        reportsToSeatId: input.reportsToSeatId ?? null,
      };
      const v = validateHierarchy(candidate, roster);
      if (v) {
        throw new TRPCError({ code: "BAD_REQUEST", message: v.message });
      }
      const res = await d.insert(aiAgents).values({
        seatName: input.seatName,
        department: input.department,
        role: input.role,
        systemPrompt: input.systemPrompt,
        model: input.model ?? "claude-haiku-4-5-20251001",
        reportsToSeatId: input.reportsToSeatId ?? null,
        isDepartmentHead: input.isDepartmentHead ?? false,
        costCapDailyUsd: (input.costCapDailyUsd ?? 5).toFixed(2),
        runLimitDaily: input.runLimitDaily ?? 200,
      });
      return { id: Number((res as { insertId?: number }).insertId ?? 0) };
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        seatName: z.string().optional(),
        role: z.string().optional(),
        systemPrompt: z.string().optional(),
        model: z.string().optional(),
        reportsToSeatId: z.number().nullable().optional(),
        isDepartmentHead: z.boolean().optional(),
        costCapDailyUsd: z.number().positive().optional(),
        runLimitDaily: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const d = await db();
      // Hierarchy validation only fires when the parent/head flags/department
      // could change. Load roster + current row and apply the proposed patch.
      if (
        input.reportsToSeatId !== undefined ||
        input.isDepartmentHead !== undefined
      ) {
        const [current] = await d.select().from(aiAgents).where(eq(aiAgents.id, input.id)).limit(1);
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Agent not found" });
        const roster = (await d.select().from(aiAgents)).filter((a) => a.id !== input.id);
        const proposed = {
          id: input.id,
          department: current.department,
          isDepartmentHead:
            input.isDepartmentHead !== undefined ? input.isDepartmentHead : current.isDepartmentHead,
          reportsToSeatId:
            input.reportsToSeatId !== undefined ? input.reportsToSeatId : current.reportsToSeatId,
        };
        const v = validateHierarchy(proposed, roster);
        if (v) throw new TRPCError({ code: "BAD_REQUEST", message: v.message });
      }
      const patch: Record<string, unknown> = {};
      if (input.seatName !== undefined) patch.seatName = input.seatName;
      if (input.role !== undefined) patch.role = input.role;
      if (input.systemPrompt !== undefined) patch.systemPrompt = input.systemPrompt;
      if (input.model !== undefined) patch.model = input.model;
      if (input.reportsToSeatId !== undefined) patch.reportsToSeatId = input.reportsToSeatId;
      if (input.isDepartmentHead !== undefined) patch.isDepartmentHead = input.isDepartmentHead;
      if (input.costCapDailyUsd !== undefined) patch.costCapDailyUsd = input.costCapDailyUsd.toFixed(2);
      if (input.runLimitDaily !== undefined) patch.runLimitDaily = input.runLimitDaily;
      await d.update(aiAgents).set(patch).where(eq(aiAgents.id, input.id));
      return { ok: true };
    }),

  setStatus: adminProcedure
    .input(z.object({ id: z.number(), status: z.enum(STATUSES) }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d.update(aiAgents).set({ status: input.status }).where(eq(aiAgents.id, input.id));
      return { ok: true };
    }),

  togglePause: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const d = await db();
    const [agent] = await d.select().from(aiAgents).where(eq(aiAgents.id, input.id)).limit(1);
    if (!agent) throw new TRPCError({ code: "NOT_FOUND" });
    const next = agent.status === "paused" ? "autonomous" : "paused";
    await d.update(aiAgents).set({ status: next }).where(eq(aiAgents.id, input.id));
    return { status: next };
  }),

  promoteToAutonomous: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d.update(aiAgents).set({ status: "autonomous" }).where(eq(aiAgents.id, input.id));
      return { ok: true };
    }),

  // ── Tool wiring ────────────────────────────────────────────────────────────
  availableToolKeys: adminProcedure.query(async () => {
    return listToolKeys();
  }),

  setTools: adminProcedure
    .input(z.object({ agentId: z.number(), toolKeys: z.array(z.string()) }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d.delete(aiAgentTools).where(eq(aiAgentTools.agentId, input.agentId));
      if (input.toolKeys.length > 0) {
        await d.insert(aiAgentTools).values(
          input.toolKeys.map((toolKey) => ({
            agentId: input.agentId,
            toolKey,
            authorized: true,
          }))
        );
      }
      return { ok: true };
    }),

  // ── Runs + tasks ───────────────────────────────────────────────────────────
  triggerManualRun: adminProcedure
    .input(z.object({ id: z.number(), payload: z.record(z.unknown()).optional() }))
    .mutation(async ({ input }) => {
      const result = await runAgent({
        agentId: input.id,
        triggerType: "manual",
        triggerPayload: input.payload ?? {},
      });
      return result;
    }),

  listRuns: adminProcedure
    .input(z.object({ agentId: z.number().optional(), limit: z.number().default(50) }))
    .query(async ({ input }) => {
      const d = await db();
      const rows = input.agentId
        ? await d
            .select()
            .from(aiAgentRuns)
            .where(eq(aiAgentRuns.agentId, input.agentId))
            .orderBy(desc(aiAgentRuns.createdAt))
            .limit(input.limit)
        : await d
            .select()
            .from(aiAgentRuns)
            .orderBy(desc(aiAgentRuns.createdAt))
            .limit(input.limit);
      return rows;
    }),

  listTasks: adminProcedure
    .input(
      z.object({
        status: z
          .enum([
            "queued",
            "running",
            "awaiting_approval",
            "approved",
            "rejected",
            "completed",
            "failed",
          ])
          .optional(),
        limit: z.number().default(50),
      })
    )
    .query(async ({ input }) => {
      const d = await db();
      const rows = input.status
        ? await d
            .select()
            .from(aiAgentTasks)
            .where(eq(aiAgentTasks.status, input.status))
            .orderBy(desc(aiAgentTasks.createdAt))
            .limit(input.limit)
        : await d
            .select()
            .from(aiAgentTasks)
            .orderBy(desc(aiAgentTasks.createdAt))
            .limit(input.limit);
      // Join agent seatName for display
      const d2 = await db();
      const ids = Array.from(new Set(rows.map((r) => r.agentId)));
      const agents = ids.length
        ? await d2.select().from(aiAgents)
        : [];
      const byId = new Map(agents.map((a) => [a.id, a.seatName] as const));
      return rows.map((r) => ({ ...r, seatName: byId.get(r.agentId) ?? `#${r.agentId}` }));
    }),

  approveTask: adminProcedure
    .input(z.object({ taskId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return approveTask({ taskId: input.taskId, userId: ctx.user.id });
    }),

  rejectTask: adminProcedure
    .input(z.object({ taskId: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return rejectTask({ taskId: input.taskId, userId: ctx.user.id, reason: input.reason });
    }),

  // ── Phase 5: bulk control + observability ──────────────────────────────────
  /**
   * Flip every AI seat that's currently in `draft_queue` to `autonomous`.
   * Skips human seats (model='human' or department='integrator-human') and
   * already-disabled seats so this is idempotent and safe to click again.
   * Returns the count of agents actually transitioned.
   */
  activateAll: adminProcedure
    .input(z.object({ from: z.array(z.enum(STATUSES)).optional() }))
    .mutation(async ({ input }) => {
      const d = await db();
      const fromStatuses = input.from ?? ["draft_queue", "paused"];
      const all = await d.select().from(aiAgents);
      const candidates = all.filter((a) => fromStatuses.includes(a.status as typeof STATUSES[number]));
      let updated = 0;
      for (const a of candidates) {
        await d.update(aiAgents).set({ status: "autonomous" }).where(eq(aiAgents.id, a.id));
        updated++;
      }
      return { updated, total: all.length };
    }),

  /**
   * Emergency kill switch. Flips every autonomous seat to `paused` —
   * scheduler.ts will skip every queued task for these seats on the next
   * tick. Existing draft_queue/disabled seats are left alone.
   */
  pauseAll: adminProcedure.mutation(async () => {
    const d = await db();
    const all = await d.select().from(aiAgents);
    const live = all.filter((a) => a.status === "autonomous");
    for (const a of live) {
      await d.update(aiAgents).set({ status: "paused" }).where(eq(aiAgents.id, a.id));
    }
    return { paused: live.length, total: all.length };
  }),

  /**
   * Set the same status across multiple seats at once. Used by the control
   * page when the operator selects a department and toggles its agents.
   */
  bulkSetStatus: adminProcedure
    .input(z.object({ ids: z.array(z.number()).min(1), status: z.enum(STATUSES) }))
    .mutation(async ({ input }) => {
      const d = await db();
      let updated = 0;
      for (const id of input.ids) {
        await d.update(aiAgents).set({ status: input.status }).where(eq(aiAgents.id, id));
        updated++;
      }
      return { updated };
    }),

  /**
   * Cost rollups for the AdminDashboard tile + the control page header.
   * Returns total spend last 24h and 7d, plus a per-seat breakdown.
   */
  costSummary: adminProcedure.query(async () => {
    const d = await db();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [tot24] = await d
      .select({
        cost: sql<number>`COALESCE(SUM(${aiAgentRuns.costUsd}), 0)`,
        runs: sql<number>`COUNT(*)`,
      })
      .from(aiAgentRuns)
      .where(gte(aiAgentRuns.createdAt, since24h));
    const [tot7] = await d
      .select({
        cost: sql<number>`COALESCE(SUM(${aiAgentRuns.costUsd}), 0)`,
        runs: sql<number>`COUNT(*)`,
      })
      .from(aiAgentRuns)
      .where(gte(aiAgentRuns.createdAt, since7d));
    const perSeat = await d
      .select({
        agentId: aiAgentRuns.agentId,
        cost: sql<number>`COALESCE(SUM(${aiAgentRuns.costUsd}), 0)`,
        runs: sql<number>`COUNT(*)`,
      })
      .from(aiAgentRuns)
      .where(gte(aiAgentRuns.createdAt, since24h))
      .groupBy(aiAgentRuns.agentId);
    const agents = await d.select().from(aiAgents);
    const byId = new Map(agents.map((a) => [a.id, a] as const));
    return {
      totalCost24hUsd: Number(tot24?.cost ?? 0),
      totalRuns24h: Number(tot24?.runs ?? 0),
      totalCost7dUsd: Number(tot7?.cost ?? 0),
      totalRuns7d: Number(tot7?.runs ?? 0),
      perSeat: perSeat.map((p) => ({
        agentId: p.agentId,
        seatName: byId.get(p.agentId)?.seatName ?? `#${p.agentId}`,
        department: byId.get(p.agentId)?.department ?? "?",
        cost24hUsd: Number(p.cost ?? 0),
        runs24h: Number(p.runs ?? 0),
        capUsd: Number(byId.get(p.agentId)?.costCapDailyUsd ?? 0),
        status: byId.get(p.agentId)?.status ?? "?",
      })),
    };
  }),

  /**
   * Live runs feed for /admin/agents/runs — joins seatName, supports filters.
   */
  runsFeed: adminProcedure
    .input(
      z.object({
        seat: z.string().optional(),
        status: z.enum(["success", "failed", "tool_error", "cost_exceeded", "timed_out"]).optional(),
        limit: z.number().int().min(1).max(500).default(100),
      })
    )
    .query(async ({ input }) => {
      const d = await db();
      const conds = [] as any[];
      if (input.status) conds.push(eq(aiAgentRuns.status, input.status));
      const rows = conds.length
        ? await d
            .select()
            .from(aiAgentRuns)
            .where(and(...conds))
            .orderBy(desc(aiAgentRuns.createdAt))
            .limit(input.limit)
        : await d
            .select()
            .from(aiAgentRuns)
            .orderBy(desc(aiAgentRuns.createdAt))
            .limit(input.limit);
      const agents = await d.select().from(aiAgents);
      const byId = new Map(agents.map((a) => [a.id, a] as const));
      const filtered = input.seat
        ? rows.filter((r) => byId.get(r.agentId)?.seatName === input.seat)
        : rows;
      return filtered.map((r) => ({
        ...r,
        seatName: byId.get(r.agentId)?.seatName ?? `#${r.agentId}`,
        department: byId.get(r.agentId)?.department ?? "?",
      }));
    }),

  /**
   * Optimization tasks (System Integrity) — read + review.
   */
  listOptimizationTasks: adminProcedure
    .input(
      z
        .object({
          status: z.enum(["open", "acknowledged", "dismissed", "applied"]).optional(),
          limit: z.number().int().min(1).max(200).optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const { listOptimizationTasks } = await import("../lib/agentRuntime/systemIntegrity");
      return listOptimizationTasks({ status: input?.status, limit: input?.limit });
    }),

  reviewOptimizationTask: adminProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["acknowledged", "dismissed", "applied"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { reviewOptimizationTask } = await import("../lib/agentRuntime/systemIntegrity");
      await reviewOptimizationTask({ id: input.id, status: input.status, userId: ctx.user.id });
      return { ok: true };
    }),

  /**
   * On-demand: run System Integrity scan now (rather than wait for the hourly
   * cron). Useful for the /admin/agents/control "Scan now" button.
   */
  runSystemIntegrityScanNow: adminProcedure.mutation(async () => {
    const { scanForOptimizations } = await import("../lib/agentRuntime/systemIntegrity");
    const flags = await scanForOptimizations();
    return { flagsRaised: flags.length };
  }),
});
