/**
 * server/lib/agentRuntime/scheduler.ts
 *
 * Polls the ai_agent_tasks table for queued tasks whose agent is autonomous,
 * and invokes runAgent on each. Intended to be called from a setInterval
 * started in server/_core/index.ts. Phase 1 ships the skeleton; Phase 2+ will
 * add per-agent concurrency limits and time-window gating.
 */

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../db";
import { aiAgents, aiAgentTasks } from "../../../drizzle/schema";
import { runAgent } from "./runtime";

export async function tick(): Promise<{ ran: number; skipped: number }> {
  const db = await getDb();
  if (!db) return { ran: 0, skipped: 0 };

  const queued = await db
    .select()
    .from(aiAgentTasks)
    .where(eq(aiAgentTasks.status, "queued"))
    .limit(25);

  if (queued.length === 0) return { ran: 0, skipped: 0 };

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
  return { ran, skipped };
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
