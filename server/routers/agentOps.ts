/**
 * server/routers/agentOps.ts
 *
 * The Agents Hub's backend: the SOP library (read-only — SOPs are code,
 * deployed via git) plus the dispatcher's master switch and live stats.
 * Everything else the hub shows reuses existing routers (aiAgents.runsFeed /
 * listTasks / approveTask, agentDrafts.*, agentPlaybooks.*).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { aiAgents, aiAgentRuns } from "../../drizzle/schema";
import { listSops } from "../lib/agentRuntime/dispatcher/sopRegistry";
import { DISPATCHER_SEAT_NAME, getDispatcherAgentId } from "../lib/agentRuntime/dispatcher/dispatcher";
// Side-effect imports: make sure the tool registry is fully populated before
// the library view validates SOP tool lists.
import "../lib/agentRuntime/phase2Tools";
import "../lib/agentRuntime/osTools";
import { getTool } from "../lib/agentRuntime/tools";

async function db() {
  const d = await getDb();
  if (!d) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return d;
}

export const agentOpsRouter = router({
  /** The SOP library with 7-day run stats per SOP. */
  listSops: adminProcedure.query(async () => {
    const d = await db();
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const stats = await d
      .select({
        sopPath: aiAgentRuns.sopPath,
        runs: sql<number>`COUNT(*)`,
        cost: sql<number>`COALESCE(SUM(${aiAgentRuns.costUsd}), 0)`,
        lastRunAt: sql<Date | null>`MAX(${aiAgentRuns.createdAt})`,
      })
      .from(aiAgentRuns)
      .where(and(gte(aiAgentRuns.createdAt, since7d), sql`${aiAgentRuns.sopPath} IS NOT NULL`))
      .groupBy(aiAgentRuns.sopPath);
    const bySop = new Map(stats.map((s) => [s.sopPath, s] as const));

    return listSops().map((sop) => ({
      sopPath: sop.sopPath,
      title: sop.title,
      events: sop.events,
      cron: sop.cron,
      timezone: sop.timezone,
      tools: sop.tools,
      unknownTools: sop.tools.filter((k) => !getTool(k)),
      approval: sop.approval,
      model: sop.model,
      maxTurns: sop.maxTurns,
      runLimitDaily: sop.runLimitDaily,
      enabled: sop.enabled,
      kind: sop.kind,
      body: sop.body,
      runs7d: Number(bySop.get(sop.sopPath)?.runs ?? 0),
      cost7dUsd: Number(bySop.get(sop.sopPath)?.cost ?? 0),
      lastRunAt: bySop.get(sop.sopPath)?.lastRunAt ?? null,
    }));
  }),

  /** Master switch state + today's spend against the global cap. */
  dispatcherStatus: adminProcedure.query(async () => {
    const d = await db();
    const id = await getDispatcherAgentId(d);
    const row = (await d.select().from(aiAgents).where(eq(aiAgents.id, id)).limit(1))[0];
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [today] = await d
      .select({
        cost: sql<number>`COALESCE(SUM(${aiAgentRuns.costUsd}), 0)`,
        runs: sql<number>`COUNT(*)`,
      })
      .from(aiAgentRuns)
      .where(and(eq(aiAgentRuns.agentId, id), gte(aiAgentRuns.createdAt, since24h)));
    return {
      agentId: id,
      seatName: DISPATCHER_SEAT_NAME,
      status: row?.status ?? "paused",
      costCapDailyUsd: Number(row?.costCapDailyUsd ?? 0),
      runLimitDaily: Number(row?.runLimitDaily ?? 0),
      cost24hUsd: Number(today?.cost ?? 0),
      runs24h: Number(today?.runs ?? 0),
      engineEnabled: process.env.AGENTS_ENABLED === "true",
    };
  }),

  /** The hub's unmissable on/off switch. paused = nothing runs. */
  setDispatcherStatus: adminProcedure
    .input(z.object({ status: z.enum(["autonomous", "paused"]) }))
    .mutation(async ({ input }) => {
      const d = await db();
      const id = await getDispatcherAgentId(d);
      await d.update(aiAgents).set({ status: input.status }).where(eq(aiAgents.id, id));
      return { ok: true, status: input.status };
    }),
});
