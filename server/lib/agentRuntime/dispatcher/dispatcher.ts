/**
 * server/lib/agentRuntime/dispatcher/dispatcher.ts
 *
 * The single router that replaces the 8-department seat system. Triggers
 * (events, cron, manual) are matched against the SOP registry and become
 * tasks on ONE ai_agents row — the singleton "Dispatcher" seat. That row
 * satisfies the NOT NULL agentId columns on tasks/runs, carries the GLOBAL
 * daily cost cap + run limit (runtime.ts enforces them per-agent), and its
 * status is the kill switch: paused = nothing runs, autonomous = live.
 *
 * Per-SOP behavior (system prompt, tools, model, maxTurns, per-SOP run limit,
 * approval posture) comes from the SOP file, applied by runtime.ts when a
 * task carries a sopPath.
 *
 * Subagents: the built-in `agent.spawnSubtask` tool lets a running SOP
 * delegate to another SOP. Child tasks carry parentTaskId; depth is capped
 * at 2 so a loop of SOPs spawning SOPs can't run away.
 */

import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { aiAgents, aiAgentTasks, aiAgentRuns } from "../../../../drizzle/schema";
import { registerTool } from "../tools";
import { claimCronRun } from "../cronRuns";
import { shouldFire } from "../cron";
import { getSop, sopsForEvent, sopsWithCron, type SopDefinition } from "./sopRegistry";

export const DISPATCHER_SEAT_NAME = "Dispatcher";
const MAX_SUBTASK_DEPTH = 2;

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

// ─── Boot-time additive columns (idempotent; prod drizzle state has drifted before) ──

export async function ensureDispatcherColumns(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`ALTER TABLE IF EXISTS ai_agent_tasks ADD COLUMN IF NOT EXISTS "sopPath" varchar(255)`);
    await db.execute(sql`ALTER TABLE IF EXISTS ai_agent_tasks ADD COLUMN IF NOT EXISTS "parentTaskId" integer`);
    await db.execute(sql`ALTER TABLE IF EXISTS ai_agent_runs ADD COLUMN IF NOT EXISTS "sopPath" varchar(255)`);
  } catch (err) {
    console.warn("[dispatcher] ensureDispatcherColumns failed (non-fatal):", err);
  }
}

// ─── The singleton Dispatcher seat ───────────────────────────────────────────

let dispatcherIdCache: number | null = null;

/**
 * Find-or-create the Dispatcher row. Created PAUSED — flipping it to
 * autonomous is a deliberate human action (the hub's on/off switch), never
 * a side effect of a deploy. Prod runs with AGENTS_ENABLED=true, so this
 * default is the safety that keeps promoted code dark until switched on.
 */
export async function getDispatcherAgentId(db: Db): Promise<number> {
  if (dispatcherIdCache) return dispatcherIdCache;
  const existing = (
    await db.select().from(aiAgents).where(eq(aiAgents.seatName, DISPATCHER_SEAT_NAME)).limit(1)
  )[0];
  if (existing) {
    dispatcherIdCache = existing.id;
    return existing.id;
  }
  const [inserted] = await db
    .insert(aiAgents)
    .values({
      seatName: DISPATCHER_SEAT_NAME,
      department: "integrator",
      role: "SOP dispatcher — routes triggers to the SOP library; per-task instructions come from the SOP file.",
      systemPrompt:
        "You are the Handy Pioneers dispatcher. This prompt is a placeholder: every run you execute carries its own SOP as the system prompt.",
      model: "claude-haiku-4-5",
      status: "paused",
      isDepartmentHead: false,
      costCapDailyUsd: "10.00",
      runLimitDaily: 300,
    })
    .returning({ id: aiAgents.id });
  const id = Number(inserted?.id ?? 0);
  dispatcherIdCache = id || null;
  console.log(`[dispatcher] Created Dispatcher seat #${id} (paused).`);
  return id;
}

export async function isDispatcherAutonomous(db: Db): Promise<boolean> {
  const id = await getDispatcherAgentId(db);
  const row = (await db.select().from(aiAgents).where(eq(aiAgents.id, id)).limit(1))[0];
  return row?.status === "autonomous";
}

/**
 * Seat-system retirement (2026-06-11). Disables every non-Dispatcher seat and
 * every legacy event subscription and schedule row. Idempotent and run on
 * every boot, so a re-enabled seat or subscription cannot creep back in.
 * History (tasks, runs, handoffs) is kept; nothing is deleted.
 */
export async function retireLegacySeats(db: Db): Promise<void> {
  try {
    const dispatcherId = await getDispatcherAgentId(db);
    const seats = await db
      .update(aiAgents)
      .set({ status: "disabled" })
      .where(and(sql`${aiAgents.id} != ${dispatcherId}`, sql`${aiAgents.status} != 'disabled'`))
      .returning({ id: aiAgents.id });
    const subs = await db.execute(
      sql`UPDATE ai_agent_event_subscriptions SET enabled = false WHERE enabled = true`,
    );
    const schedules = await db.execute(
      sql`UPDATE ai_agent_schedules SET enabled = false WHERE enabled = true`,
    );
    if (seats.length > 0) {
      console.log(
        `[dispatcher] Retired ${seats.length} legacy seat(s); subscriptions and schedules disabled.`,
      );
    }
    void subs;
    void schedules;
  } catch (err) {
    console.warn("[dispatcher] retireLegacySeats failed (non-fatal):", err);
  }
}

// ─── Per-SOP daily run limit ─────────────────────────────────────────────────

export async function sopRunsLast24h(db: Db, sopPath: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(aiAgentRuns)
    .where(and(eq(aiAgentRuns.sopPath, sopPath), gte(aiAgentRuns.createdAt, since)));
  return Number(rows[0]?.count ?? 0);
}

// ─── Trigger entry points ────────────────────────────────────────────────────

async function enqueueSopTask(
  db: Db,
  sop: SopDefinition,
  triggerType: "event" | "schedule" | "delegated" | "manual",
  payload: Record<string, unknown>,
  parentTaskId?: number,
): Promise<number> {
  const dispatcherId = await getDispatcherAgentId(db);
  const [inserted] = await db
    .insert(aiAgentTasks)
    .values({
      agentId: dispatcherId,
      triggerType,
      triggerPayload: JSON.stringify(payload ?? {}),
      status: "queued",
      sopPath: sop.sopPath,
      parentTaskId: parentTaskId ?? null,
    })
    .returning({ id: aiAgentTasks.id });
  return Number(inserted?.id ?? 0);
}

/**
 * Event entry point — called by triggerBus.emitAgentEvent after the legacy
 * subscription match. Queues one task per enabled SOP subscribed to the event.
 * Failures are logged and swallowed; a trigger must never break a business write.
 */
export async function dispatchEvent(
  eventName: string,
  payload: Record<string, unknown> = {},
): Promise<{ queuedTaskIds: number[] }> {
  const queuedTaskIds: number[] = [];
  try {
    const sops = sopsForEvent(eventName);
    if (sops.length === 0) return { queuedTaskIds };
    const db = await getDb();
    if (!db) return { queuedTaskIds };
    for (const sop of sops) {
      try {
        const id = await enqueueSopTask(db, sop, "event", { event: eventName, ...payload });
        if (id) queuedTaskIds.push(id);
      } catch (err) {
        console.warn(`[dispatcher] queue failed for SOP ${sop.sopPath} on '${eventName}':`, err);
      }
    }
  } catch (err) {
    console.warn(`[dispatcher] dispatchEvent '${eventName}' failed (non-fatal):`, err);
  }
  return { queuedTaskIds };
}

/**
 * Cron entry point — called from the scheduler tick. Evaluates each SOP's
 * cron in its timezone; dedupes via the cron_runs store (survives redeploys),
 * keyed to the minute so a 30s tick can't double-fire.
 */
export async function dispatchCron(now: Date = new Date()): Promise<number> {
  let fired = 0;
  try {
    const sops = sopsWithCron();
    if (sops.length === 0) return 0;
    const db = await getDb();
    if (!db) return 0;
    if (!(await isDispatcherAutonomous(db))) return 0;

    const minuteKey = now.toISOString().slice(0, 16); // UTC minute — match already happened in the SOP's tz
    for (const sop of sops) {
      if (!shouldFire(sop.cron!, now, null, sop.timezone)) continue;
      const claimed = await claimCronRun(`sop:${sop.sopPath}`, minuteKey);
      if (!claimed) continue;
      try {
        await enqueueSopTask(db, sop, "schedule", { cron: sop.cron });
        fired++;
      } catch (err) {
        console.warn(`[dispatcher] cron enqueue failed for SOP ${sop.sopPath}:`, err);
      }
    }
  } catch (err) {
    console.warn("[dispatcher] dispatchCron failed (non-fatal):", err);
  }
  return fired;
}

// ─── Human SOPs: the OS creates tasks, people execute ────────────────────────
//
// kind=human SOP documents never reach the LLM runtime. On a matching event
// or cron they insert an os_tasks row (the human work queue) with a link back
// to the customer/opportunity and the SOP that spawned it. Deterministic, no
// model call, no external send, so it is governed by each SOP's enabled flag
// rather than the Dispatcher kill switch (which stops AI runs).

type HumanSopRow = {
  docId: string;
  title: string;
  events: string | null;
  cron: string | null;
  timezone: string | null;
  taskTitleTemplate: string | null;
  taskDueOffsetHours: number | null;
  defaultAssigneeUserId: number | null;
};

async function loadHumanSops(db: Db): Promise<HumanSopRow[]> {
  const { osDocuments } = await import("../../../../drizzle/schema");
  const rows = await db
    .select({
      docId: osDocuments.docId,
      title: osDocuments.title,
      events: osDocuments.events,
      cron: osDocuments.cron,
      timezone: osDocuments.timezone,
      taskTitleTemplate: osDocuments.taskTitleTemplate,
      taskDueOffsetHours: osDocuments.taskDueOffsetHours,
      defaultAssigneeUserId: osDocuments.defaultAssigneeUserId,
    })
    .from(osDocuments)
    .where(
      and(
        eq(osDocuments.type, "SOP"),
        eq(osDocuments.kind, "human"),
        eq(osDocuments.status, "final"),
        eq(osDocuments.enabled, true),
      ),
    );
  return rows;
}

function fillTemplate(template: string, payload: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = payload[key];
    return v === undefined || v === null ? `(${key})` : String(v);
  });
}

function deriveTaskLink(payload: Record<string, unknown>): { linkType: string | null; linkId: string | null } {
  if (payload.customerId) return { linkType: "customer", linkId: String(payload.customerId) };
  if (payload.opportunityId) return { linkType: "opportunity", linkId: String(payload.opportunityId) };
  if (payload.invoiceId) return { linkType: "invoice", linkId: String(payload.invoiceId) };
  if (payload.vendorId) return { linkType: "vendor", linkId: String(payload.vendorId) };
  return { linkType: null, linkId: null };
}

async function spawnHumanTask(
  db: Db,
  sop: HumanSopRow,
  payload: Record<string, unknown>,
): Promise<number | null> {
  const { osTasks } = await import("../../../../drizzle/schema");
  const { linkType, linkId } = deriveTaskLink(payload);

  // Dedupe: one open task per SOP + link target. A still-open task from the
  // last firing means the human has not caught up; do not pile on duplicates.
  const existing = await db
    .select({ id: osTasks.id })
    .from(osTasks)
    .where(
      and(
        eq(osTasks.sourceDocId, sop.docId),
        linkId === null ? sql`${osTasks.linkId} IS NULL` : eq(osTasks.linkId, linkId),
        sql`${osTasks.status} IN ('open', 'in_progress')`,
      ),
    )
    .limit(1);
  if (existing.length > 0) return null;

  const title = sop.taskTitleTemplate ? fillTemplate(sop.taskTitleTemplate, payload) : sop.title;
  const dueAt =
    sop.taskDueOffsetHours !== null && sop.taskDueOffsetHours !== undefined
      ? new Date(Date.now() + sop.taskDueOffsetHours * 60 * 60 * 1000)
      : null;
  const [inserted] = await db
    .insert(osTasks)
    .values({
      title: title.slice(0, 300),
      detail: `From SOP ${sop.docId} (${sop.title}).`,
      status: "open",
      dueAt,
      assigneeUserId: sop.defaultAssigneeUserId ?? null,
      sourceType: "sop",
      sourceDocId: sop.docId,
      linkType,
      linkId,
    })
    .returning({ id: osTasks.id });
  return Number(inserted?.id ?? 0) || null;
}

/** Event entry point for human SOPs — called alongside dispatchEvent. */
export async function dispatchHumanSops(
  eventName: string,
  payload: Record<string, unknown> = {},
): Promise<{ spawnedTaskIds: number[] }> {
  const spawnedTaskIds: number[] = [];
  try {
    const db = await getDb();
    if (!db) return { spawnedTaskIds };
    const sops = await loadHumanSops(db);
    for (const sop of sops) {
      const events = (sop.events ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (!events.includes(eventName)) continue;
      try {
        const id = await spawnHumanTask(db, sop, { event: eventName, ...payload });
        if (id) spawnedTaskIds.push(id);
      } catch (err) {
        console.warn(`[dispatcher] human task spawn failed for ${sop.docId} on '${eventName}':`, err);
      }
    }
  } catch (err) {
    console.warn(`[dispatcher] dispatchHumanSops '${eventName}' failed (non-fatal):`, err);
  }
  return { spawnedTaskIds };
}

/** Cron entry point for human SOPs — called from the scheduler tick. */
export async function dispatchHumanCron(now: Date = new Date()): Promise<number> {
  let spawned = 0;
  try {
    const db = await getDb();
    if (!db) return 0;
    const sops = await loadHumanSops(db);
    const minuteKey = now.toISOString().slice(0, 16);
    for (const sop of sops) {
      if (!sop.cron) continue;
      if (!shouldFire(sop.cron, now, null, sop.timezone ?? "America/Los_Angeles")) continue;
      const claimed = await claimCronRun(`hsop:${sop.docId}`, minuteKey);
      if (!claimed) continue;
      try {
        const id = await spawnHumanTask(db, sop, { cron: sop.cron });
        if (id) spawned++;
      } catch (err) {
        console.warn(`[dispatcher] human cron spawn failed for ${sop.docId}:`, err);
      }
    }
  } catch (err) {
    console.warn("[dispatcher] dispatchHumanCron failed (non-fatal):", err);
  }
  return spawned;
}

// ─── Subagents ───────────────────────────────────────────────────────────────

export async function getTaskDepth(db: Db, taskId: number): Promise<number> {
  let depth = 0;
  let current: number | null = taskId;
  while (current && depth <= MAX_SUBTASK_DEPTH) {
    const rows: Array<{ parentTaskId: number | null }> = await db
      .select({ parentTaskId: aiAgentTasks.parentTaskId })
      .from(aiAgentTasks)
      .where(eq(aiAgentTasks.id, current))
      .limit(1);
    const parent = rows[0]?.parentTaskId ?? null;
    if (!parent) break;
    depth++;
    current = parent;
  }
  return depth;
}

registerTool({
  key: "agent.spawnSubtask",
  requiresApproval: false,
  definition: {
    name: "agent_spawn_subtask",
    description:
      "Delegate a narrower piece of work to another SOP. The subtask runs asynchronously with the target SOP's own instructions and tool list; you will not see its result in this run. Use it to fan out work, not to chain a conversation.",
    input_schema: {
      type: "object",
      properties: {
        sopPath: {
          type: "string",
          description: "Registry key of the target SOP, e.g. 'comms/voicemail-callback'.",
        },
        payload: {
          type: "object",
          description: "Trigger payload handed to the subtask (IDs, context).",
        },
        note: {
          type: "string",
          description: "One sentence on why you are delegating — recorded for the audit trail.",
        },
      },
      required: ["sopPath"],
    },
  },
  handler: async ({ input, ctx }) => {
    const db = ctx.db as Db;
    const targetPath = String(input.sopPath ?? "");
    const target = getSop(targetPath);
    if (!target) throw new Error(`SOP '${targetPath}' not found in the registry.`);
    if (!target.enabled || target.kind !== "agent") {
      throw new Error(`SOP '${targetPath}' is not enabled for dispatch.`);
    }
    const depth = await getTaskDepth(db, ctx.taskId);
    if (depth >= MAX_SUBTASK_DEPTH) {
      throw new Error(`Subtask depth limit (${MAX_SUBTASK_DEPTH}) reached — finish the work directly.`);
    }
    const payload = (input.payload && typeof input.payload === "object" ? input.payload : {}) as Record<string, unknown>;
    const taskId = await enqueueSopTask(
      db,
      target,
      "delegated",
      { ...payload, delegatedBy: ctx.taskId, note: input.note ?? null },
      ctx.taskId,
    );
    return { ok: true, taskId, sopPath: targetPath };
  },
});
