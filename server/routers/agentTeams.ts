/**
 * server/routers/agentTeams.ts
 *
 * Visionary Console Phase 1 — agent team coordination API.
 *
 * Five resources sit under this router:
 *   - teams      (list, get, create, pause/resume)
 *   - members    (add, remove)
 *   - tasks      (create, claim, updateStatus, list)
 *   - messages   (send, list)
 *   - handoffs   (propose, accept, decline, list)
 *
 * All adminProcedure-gated. Customer-centric: tasks that touch a customer
 * carry customerId so they surface inside the customer profile.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  aiAgents,
  aiAgentRuns,
  agentTeams,
  agentTeamMembers,
  agentTeamTasks,
  agentTeamMessages,
  agentTeamHandoffs,
  agentTeamArtifacts,
  agentTeamViolations,
} from "../../drizzle/schema";

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

const MEMBER_ROLES = ["frontend", "backend", "qa", "lead"] as const;
const TASK_STATUSES = ["open", "claimed", "in_progress", "blocked", "done"] as const;
const PRIORITIES = ["low", "normal", "high"] as const;

async function db() {
  const d = await getDb();
  if (!d) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return d;
}

export const agentTeamsRouter = router({
  // ── Teams ───────────────────────────────────────────────────────────────────
  listTeams: adminProcedure
    .input(z.object({ department: z.enum(DEPARTMENTS).optional() }).optional())
    .query(async ({ input }) => {
      const d = await db();
      const rows = input?.department
        ? await d.select().from(agentTeams).where(eq(agentTeams.department, input.department))
        : await d.select().from(agentTeams).orderBy(asc(agentTeams.id));

      // Counts per team for the admin overview cards.
      const teamIds = rows.map((t) => t.id);
      if (teamIds.length === 0) return [];
      const memberCounts = await d
        .select({ teamId: agentTeamMembers.teamId, c: sql<number>`COUNT(*)` })
        .from(agentTeamMembers)
        .where(inArray(agentTeamMembers.teamId, teamIds))
        .groupBy(agentTeamMembers.teamId);
      const openCounts = await d
        .select({ teamId: agentTeamTasks.teamId, c: sql<number>`COUNT(*)` })
        .from(agentTeamTasks)
        .where(and(inArray(agentTeamTasks.teamId, teamIds), inArray(agentTeamTasks.status, ["open", "claimed", "in_progress", "blocked"])))
        .groupBy(agentTeamTasks.teamId);
      const memMap = new Map<number, number>();
      for (const r of memberCounts) memMap.set(r.teamId, Number(r.c ?? 0));
      const openMap = new Map<number, number>();
      for (const r of openCounts) openMap.set(r.teamId, Number(r.c ?? 0));
      return rows.map((t) => ({
        ...t,
        memberCount: memMap.get(t.id) ?? 0,
        openTaskCount: openMap.get(t.id) ?? 0,
      }));
    }),

  getTeam: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const d = await db();
      const [team] = await d.select().from(agentTeams).where(eq(agentTeams.id, input.id)).limit(1);
      if (!team) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
      const members = await d
        .select({
          id: agentTeamMembers.id,
          seatId: agentTeamMembers.seatId,
          role: agentTeamMembers.role,
          joinedAt: agentTeamMembers.joinedAt,
          seatName: aiAgents.seatName,
          seatStatus: aiAgents.status,
          seatDepartment: aiAgents.department,
        })
        .from(agentTeamMembers)
        .leftJoin(aiAgents, eq(aiAgents.id, agentTeamMembers.seatId))
        .where(eq(agentTeamMembers.teamId, input.id));
      const tasks = await d
        .select()
        .from(agentTeamTasks)
        .where(eq(agentTeamTasks.teamId, input.id))
        .orderBy(desc(agentTeamTasks.createdAt))
        .limit(50);
      const messages = await d
        .select()
        .from(agentTeamMessages)
        .where(eq(agentTeamMessages.teamId, input.id))
        .orderBy(desc(agentTeamMessages.createdAt))
        .limit(50);
      return { team, members, tasks, messages };
    }),

  createTeam: adminProcedure
    .input(
      z.object({
        department: z.enum(DEPARTMENTS),
        name: z.string().min(1).max(120),
        purpose: z.string().max(2000).optional(),
        teamLeadSeatId: z.number().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const d = await db();
      const inserted = await d.insert(agentTeams).values({
        department: input.department,
        name: input.name,
        purpose: input.purpose ?? null,
        teamLeadSeatId: input.teamLeadSeatId ?? null,
        status: "active",
      });
      const id = Number((inserted as { insertId?: number }).insertId ?? 0);
      return { id };
    }),

  setTeamStatus: adminProcedure
    .input(z.object({ id: z.number(), status: z.enum(["active", "paused"]) }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d.update(agentTeams).set({ status: input.status }).where(eq(agentTeams.id, input.id));
      return { ok: true };
    }),

  // ── Members ─────────────────────────────────────────────────────────────────
  addMember: adminProcedure
    .input(z.object({ teamId: z.number(), seatId: z.number(), role: z.enum(MEMBER_ROLES).default("backend") }))
    .mutation(async ({ input }) => {
      const d = await db();
      const [seat] = await d.select().from(aiAgents).where(eq(aiAgents.id, input.seatId)).limit(1);
      if (!seat) throw new TRPCError({ code: "NOT_FOUND", message: "Seat not found" });
      try {
        await d.insert(agentTeamMembers).values({
          teamId: input.teamId,
          seatId: input.seatId,
          role: input.role,
        });
      } catch (err) {
        // Unique constraint on (teamId, seatId) — surface a clean error.
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes("duplicate")) {
          throw new TRPCError({ code: "CONFLICT", message: "Seat already on this team" });
        }
        throw err;
      }
      // If the role is `lead`, also pin teamLeadSeatId on the team row.
      if (input.role === "lead") {
        await d
          .update(agentTeams)
          .set({ teamLeadSeatId: input.seatId })
          .where(eq(agentTeams.id, input.teamId));
      }
      return { ok: true };
    }),

  removeMember: adminProcedure
    .input(z.object({ teamId: z.number(), seatId: z.number() }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d
        .delete(agentTeamMembers)
        .where(
          and(eq(agentTeamMembers.teamId, input.teamId), eq(agentTeamMembers.seatId, input.seatId))
        );
      // If they were the lead, clear teamLeadSeatId.
      const [team] = await d.select().from(agentTeams).where(eq(agentTeams.id, input.teamId)).limit(1);
      if (team && team.teamLeadSeatId === input.seatId) {
        await d.update(agentTeams).set({ teamLeadSeatId: null }).where(eq(agentTeams.id, input.teamId));
      }
      return { ok: true };
    }),

  // ── Tasks ───────────────────────────────────────────────────────────────────
  listTasks: adminProcedure
    .input(
      z
        .object({
          teamId: z.number().optional(),
          status: z.enum(TASK_STATUSES).optional(),
          customerId: z.string().max(64).optional(),
          limit: z.number().min(1).max(200).default(100),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const d = await db();
      const filters = [] as Array<ReturnType<typeof eq>>;
      if (input?.teamId !== undefined) filters.push(eq(agentTeamTasks.teamId, input.teamId));
      if (input?.status) filters.push(eq(agentTeamTasks.status, input.status));
      if (input?.customerId) filters.push(eq(agentTeamTasks.customerId, input.customerId));
      const where = filters.length > 0 ? and(...filters) : undefined;
      const rows = where
        ? await d
            .select()
            .from(agentTeamTasks)
            .where(where)
            .orderBy(desc(agentTeamTasks.createdAt))
            .limit(input?.limit ?? 100)
        : await d
            .select()
            .from(agentTeamTasks)
            .orderBy(desc(agentTeamTasks.createdAt))
            .limit(input?.limit ?? 100);
      return rows;
    }),

  createTask: adminProcedure
    .input(
      z.object({
        teamId: z.number(),
        title: z.string().min(1).max(255),
        description: z.string().max(20_000).optional(),
        priority: z.enum(PRIORITIES).default("normal"),
        dueAt: z.date().optional(),
        customerId: z.string().max(64).nullable().optional(),
        sourceEventType: z.string().max(80).optional(),
        sourceEventPayload: z.record(z.string(), z.unknown()).optional(),
        ownerFiles: z.array(z.string().max(500)).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const d = await db();
      const inserted = await d.insert(agentTeamTasks).values({
        teamId: input.teamId,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority,
        dueAt: input.dueAt ?? null,
        customerId: input.customerId ?? null,
        sourceEventType: input.sourceEventType ?? null,
        sourceEventPayload: input.sourceEventPayload ? JSON.stringify(input.sourceEventPayload) : null,
        ownerFiles: input.ownerFiles ? JSON.stringify(input.ownerFiles) : null,
        status: "open",
      });
      const id = Number((inserted as { insertId?: number }).insertId ?? 0);
      return { id };
    }),

  claimTask: adminProcedure
    .input(z.object({ taskId: z.number(), seatId: z.number() }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d
        .update(agentTeamTasks)
        .set({ status: "claimed", claimedBySeatId: input.seatId })
        .where(eq(agentTeamTasks.id, input.taskId));
      return { ok: true };
    }),

  updateTaskStatus: adminProcedure
    .input(
      z.object({
        taskId: z.number(),
        status: z.enum(TASK_STATUSES),
        notes: z.string().max(20_000).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const d = await db();
      const [existing] = await d
        .select()
        .from(agentTeamTasks)
        .where(eq(agentTeamTasks.id, input.taskId))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });

      const patch: Record<string, unknown> = { status: input.status };
      if (input.status === "done") patch.completedAt = new Date();
      if (input.notes) {
        const stamp = new Date().toISOString();
        const line = `[${stamp}] (${input.status}) ${input.notes}`;
        patch.notes = existing.notes ? `${existing.notes}\n${line}` : line;
      }
      await d.update(agentTeamTasks).set(patch).where(eq(agentTeamTasks.id, input.taskId));
      return { ok: true };
    }),

  // ── Messages ────────────────────────────────────────────────────────────────
  listMessages: adminProcedure
    .input(z.object({ teamId: z.number(), limit: z.number().min(1).max(200).default(100) }))
    .query(async ({ input }) => {
      const d = await db();
      const rows = await d
        .select()
        .from(agentTeamMessages)
        .where(eq(agentTeamMessages.teamId, input.teamId))
        .orderBy(desc(agentTeamMessages.createdAt))
        .limit(input.limit);
      return rows;
    }),

  sendMessage: adminProcedure
    .input(
      z.object({
        teamId: z.number(),
        fromSeatId: z.number(),
        toSeatId: z.number().nullable().optional(),
        body: z.string().min(1).max(20_000),
        threadId: z.number().nullable().optional(),
        attachments: z.array(z.string().max(500)).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const d = await db();
      const inserted = await d.insert(agentTeamMessages).values({
        teamId: input.teamId,
        fromSeatId: input.fromSeatId,
        toSeatId: input.toSeatId ?? null,
        body: input.body,
        threadId: input.threadId ?? null,
        attachments: input.attachments ? JSON.stringify(input.attachments) : null,
      });
      const id = Number((inserted as { insertId?: number }).insertId ?? 0);
      return { id };
    }),

  // ── Handoffs ────────────────────────────────────────────────────────────────
  listHandoffs: adminProcedure
    .input(
      z
        .object({
          status: z.enum(["pending", "accepted", "declined"]).optional(),
          limit: z.number().min(1).max(100).default(50),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const d = await db();
      const rows = input?.status
        ? await d
            .select()
            .from(agentTeamHandoffs)
            .where(eq(agentTeamHandoffs.status, input.status))
            .orderBy(desc(agentTeamHandoffs.createdAt))
            .limit(input.limit)
        : await d
            .select()
            .from(agentTeamHandoffs)
            .orderBy(desc(agentTeamHandoffs.createdAt))
            .limit(input?.limit ?? 50);
      return rows;
    }),

  proposeHandoff: adminProcedure
    .input(
      z.object({
        fromTeamId: z.number(),
        toTeamId: z.number(),
        eventType: z.string().min(1).max(80),
        payload: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const d = await db();
      const inserted = await d.insert(agentTeamHandoffs).values({
        fromTeamId: input.fromTeamId,
        toTeamId: input.toTeamId,
        eventType: input.eventType,
        payload: input.payload ? JSON.stringify(input.payload) : null,
        status: "pending",
      });
      const id = Number((inserted as { insertId?: number }).insertId ?? 0);
      return { id };
    }),

  acceptHandoff: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d
        .update(agentTeamHandoffs)
        .set({ status: "accepted", acceptedAt: new Date() })
        .where(eq(agentTeamHandoffs.id, input.id));
      return { ok: true };
    }),

  declineHandoff: adminProcedure
    .input(z.object({ id: z.number(), reason: z.string().max(2000) }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d
        .update(agentTeamHandoffs)
        .set({ status: "declined", declineReason: input.reason, declinedAt: new Date() })
        .where(eq(agentTeamHandoffs.id, input.id));
      return { ok: true };
    }),

  /**
   * Visionary Console aggregate read — single round-trip for the right pane.
   * Returns active tasks across all teams, recent handoffs, and a department
   * cost rollup.
   */
  consoleSummary: adminProcedure.query(async () => {
    const d = await db();
    const teams = await d.select().from(agentTeams).orderBy(asc(agentTeams.id));
    const activeTasks = await d
      .select()
      .from(agentTeamTasks)
      .where(inArray(agentTeamTasks.status, ["open", "claimed", "in_progress", "blocked"]))
      .orderBy(desc(agentTeamTasks.createdAt))
      .limit(50);
    const recentHandoffs = await d
      .select()
      .from(agentTeamHandoffs)
      .orderBy(desc(agentTeamHandoffs.createdAt))
      .limit(20);

    // Phase 2 enrichments — DMs, blocked tasks, violations, per-team daily cost.
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const recentMessages = await d
      .select()
      .from(agentTeamMessages)
      .where(sql`${agentTeamMessages.toSeatId} IS NOT NULL`) // direct messages only, not broadcasts
      .orderBy(desc(agentTeamMessages.createdAt))
      .limit(15);
    const recentViolations = await d
      .select()
      .from(agentTeamViolations)
      .orderBy(desc(agentTeamViolations.createdAt))
      .limit(10);
    const blockedTasks = activeTasks.filter((t) => t.status === "blocked");

    // Per-team daily cost rollup — sums every member seat's run cost since midnight.
    const memberSeats = await d
      .select({ teamId: agentTeamMembers.teamId, seatId: agentTeamMembers.seatId })
      .from(agentTeamMembers);
    const seatToTeam = new Map<number, number[]>();
    for (const m of memberSeats) {
      const arr = seatToTeam.get(m.seatId) ?? [];
      arr.push(m.teamId);
      seatToTeam.set(m.seatId, arr);
    }
    const seatIds = Array.from(seatToTeam.keys());
    const teamCostToday = new Map<number, number>();
    if (seatIds.length > 0) {
      const runs = await d
        .select({
          agentId: aiAgentRuns.agentId,
          costSum: sql<number>`COALESCE(SUM(${aiAgentRuns.costUsd}), 0)`,
        })
        .from(aiAgentRuns)
        .where(and(inArray(aiAgentRuns.agentId, seatIds), gte(aiAgentRuns.createdAt, since)))
        .groupBy(aiAgentRuns.agentId);
      for (const r of runs) {
        const teamIds = seatToTeam.get(r.agentId) ?? [];
        for (const tid of teamIds) {
          teamCostToday.set(tid, (teamCostToday.get(tid) ?? 0) + Number(r.costSum ?? 0));
        }
      }
    }
    const teamCostRollup = teams.map((t) => ({
      teamId: t.id,
      department: t.department,
      name: t.name,
      spentTodayUsd: teamCostToday.get(t.id) ?? 0,
      capUsd: Number(t.costCapDailyUsd),
      atCap: (teamCostToday.get(t.id) ?? 0) >= Number(t.costCapDailyUsd),
    }));

    return {
      teams,
      activeTasks,
      recentHandoffs,
      recentMessages,
      recentViolations,
      blockedTasks,
      teamCostRollup,
    };
  }),

  // ── Phase 2 — execute team task (parallel fan-out to all 3 teammates) ─────
  executeTask: adminProcedure
    .input(z.object({ taskId: z.number() }))
    .mutation(async ({ input }) => {
      const { executeTeamTask } = await import("../lib/agentRuntime/teamCoordinator");
      const result = await executeTeamTask({ taskId: input.taskId, triggerType: "manual" });
      return result;
    }),

  // ── Phase 2 — artifact + violation read ──────────────────────────────────
  listArtifacts: adminProcedure
    .input(
      z.object({
        taskId: z.number().optional(),
        teamId: z.number().optional(),
        limit: z.number().min(1).max(200).default(100),
      })
    )
    .query(async ({ input }) => {
      const d = await db();
      const filters = [] as Array<ReturnType<typeof eq>>;
      if (input.taskId !== undefined) filters.push(eq(agentTeamArtifacts.taskId, input.taskId));
      if (input.teamId !== undefined) filters.push(eq(agentTeamArtifacts.teamId, input.teamId));
      const where = filters.length > 0 ? and(...filters) : undefined;
      const rows = where
        ? await d.select().from(agentTeamArtifacts).where(where).orderBy(desc(agentTeamArtifacts.createdAt)).limit(input.limit)
        : await d.select().from(agentTeamArtifacts).orderBy(desc(agentTeamArtifacts.createdAt)).limit(input.limit);
      return rows.map((r) => ({
        ...r,
        content: safeParseJson(r.contentJson),
      }));
    }),

  listViolations: adminProcedure
    .input(
      z
        .object({
          teamId: z.number().optional(),
          limit: z.number().min(1).max(100).default(50),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const d = await db();
      const rows = input?.teamId
        ? await d
            .select()
            .from(agentTeamViolations)
            .where(eq(agentTeamViolations.teamId, input.teamId))
            .orderBy(desc(agentTeamViolations.createdAt))
            .limit(input.limit)
        : await d
            .select()
            .from(agentTeamViolations)
            .orderBy(desc(agentTeamViolations.createdAt))
            .limit(input?.limit ?? 50);
      return rows;
    }),

  setCostCap: adminProcedure
    .input(z.object({ teamId: z.number(), costCapDailyUsd: z.number().min(0).max(1000) }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d
        .update(agentTeams)
        .set({ costCapDailyUsd: input.costCapDailyUsd.toFixed(2) })
        .where(eq(agentTeams.id, input.teamId));
      return { ok: true };
    }),

  listAllMessages: adminProcedure
    .input(
      z
        .object({
          teamId: z.number().optional(),
          directOnly: z.boolean().default(false),
          limit: z.number().min(1).max(500).default(100),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const d = await db();
      const filters = [] as Array<ReturnType<typeof eq>>;
      if (input?.teamId !== undefined) filters.push(eq(agentTeamMessages.teamId, input.teamId));
      const baseWhere = filters.length > 0 ? and(...filters) : undefined;
      const directWhere = input?.directOnly
        ? sql`${agentTeamMessages.toSeatId} IS NOT NULL`
        : undefined;
      const where =
        baseWhere && directWhere
          ? and(baseWhere, directWhere)
          : (baseWhere ?? directWhere);
      const rows = where
        ? await d
            .select()
            .from(agentTeamMessages)
            .where(where)
            .orderBy(desc(agentTeamMessages.createdAt))
            .limit(input?.limit ?? 100)
        : await d
            .select()
            .from(agentTeamMessages)
            .orderBy(desc(agentTeamMessages.createdAt))
            .limit(input?.limit ?? 100);
      return rows;
    }),
});

function safeParseJson(s: string | null): unknown {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
