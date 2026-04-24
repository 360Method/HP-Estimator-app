/**
 * server/lib/agentRuntime/scheduler.ts
 *
 * Two responsibilities, run on the same setInterval tick:
 *
 *   1. Drain queued tasks (event/manual/delegated triggers) for autonomous
 *      agents and execute them via runAgent.
 *
 *   2. Evaluate ai_agent_schedules cron expressions and enqueue a new
 *      `schedule`-type task whenever an entry is due and hasn't fired this
 *      minute (de-duped via `lastRunAt`). The drain step in (1) then picks
 *      it up the same tick.
 *
 * Phase 4 added cron — we don't pull in `node-cron` because the existing
 * 30s tick is enough granularity for the schedules we care about (weekly
 * briefs, daily reports, every-15-min health check).
 */

import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../db";
import { aiAgents, aiAgentTasks, aiAgentSchedules } from "../../../drizzle/schema";
import { runAgent } from "./runtime";
import { shouldFire } from "./cron";

export async function tick(): Promise<{ ran: number; skipped: number; scheduled: number }> {
  const db = await getDb();
  if (!db) return { ran: 0, skipped: 0, scheduled: 0 };

  // ── 1. Cron evaluation: enqueue tasks for any schedules due this minute ───
  let scheduled = 0;
  try {
    scheduled = await fireDueSchedules();
  } catch (err) {
    console.warn("[agentScheduler] cron eval failed:", err);
  }

  // ── 2. Drain queued tasks ────────────────────────────────────────────────
  const queued = await db
    .select()
    .from(aiAgentTasks)
    .where(eq(aiAgentTasks.status, "queued"))
    .limit(25);

  if (queued.length === 0) return { ran: 0, skipped: 0, scheduled };

  const agentIds = Array.from(new Set(queued.map((t) => t.agentId)));
  const agents = await db.select().from(aiAgents).where(inArray(aiAgents.id, agentIds));
  const autonomousIds = new Set(agents.filter((a) => a.status === "autonomous").map((a) => a.id));

  let ran = 0;
  let skipped = 0;
  for (const task of queued) {
    if (!autonomousIds.has(task.agentId)) {
      skipped++;
      continue;
    }
    try {
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(task.triggerPayload ?? "{}");
      } catch {
        payload = {};
      }
      await runAgent({
        agentId: task.agentId,
        triggerType: task.triggerType,
        triggerPayload: payload,
        existingTaskId: task.id,
      });
      ran++;
    } catch (err) {
      console.warn("[agentScheduler] run failed", err);
      skipped++;
    }
  }
  return { ran, skipped, scheduled };
}

/**
 * Walks every enabled schedule, evaluates its cron expression against the
 * current minute (in the schedule's timezone), and queues a task for any
 * that match. Updates lastRunAt to dedupe across ticks. Returns the count.
 */
export async function fireDueSchedules(now: Date = new Date()): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const schedules = await db
    .select()
    .from(aiAgentSchedules)
    .where(eq(aiAgentSchedules.enabled, true));
  if (schedules.length === 0) return 0;

  // Filter to autonomous agents only — paused/draft agents shouldn't have their
  // queues backed up by cron firings they'll never process.
  const agentIds = Array.from(new Set(schedules.map((s) => s.agentId)));
  const agents = agentIds.length
    ? await db.select().from(aiAgents).where(inArray(aiAgents.id, agentIds))
    : [];
  const autonomousIds = new Set(agents.filter((a) => a.status === "autonomous").map((a) => a.id));

  let fired = 0;
  for (const sch of schedules) {
    if (!autonomousIds.has(sch.agentId)) continue;
    if (!shouldFire(sch.cronExpression, now, sch.lastRunAt ?? null, sch.timezone)) continue;
    try {
      let payload: Record<string, unknown> = { scheduleId: sch.id };
      if (sch.payload) {
        try {
          const parsed = JSON.parse(sch.payload);
          if (parsed && typeof parsed === "object") {
            payload = { scheduleId: sch.id, ...(parsed as Record<string, unknown>) };
          }
        } catch {
          // ignore malformed payload JSON
        }
      }
      await db.insert(aiAgentTasks).values({
        agentId: sch.agentId,
        triggerType: "schedule",
        triggerPayload: JSON.stringify({ cron: sch.cronExpression, ...payload }),
        status: "queued",
      });
      await db
        .update(aiAgentSchedules)
        .set({ lastRunAt: now })
        .where(eq(aiAgentSchedules.id, sch.id));
      fired++;
    } catch (err) {
      console.warn(`[agentScheduler] schedule #${sch.id} fire failed:`, err);
    }
  }
  return fired;
}

let interval: NodeJS.Timeout | null = null;
export function startScheduler(periodMs: number = 30_000) {
  if (interval) return;
  interval = setInterval(() => {
    tick().catch((err) => console.warn("[agentScheduler]", err));
  }, periodMs);
}

export function stopScheduler() {
  if (interval) clearInterval(interval);
  interval = null;
}
