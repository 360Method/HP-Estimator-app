/**
 * server/lib/agentRuntime/handoffs.ts
 *
 * Agent-to-agent handoff (escalation) path. The runtime exposes this as a
 * future tool; Phase 1 ships the helper + enforcement so when Phase 2 wires
 * an `agent.handoff` tool, the validation is already in place.
 */

import { eq, inArray } from "drizzle-orm";
import { getDb } from "../../db";
import { aiAgents, aiAgentHandoffs, aiAgentTasks } from "../../../drizzle/schema";
import { canHandoff } from "./hierarchy";

export async function recordHandoff(args: {
  fromAgentId: number;
  toAgentId: number;
  taskId: number;
  reason: string;
}): Promise<{ ok: true }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const agents = await db
    .select()
    .from(aiAgents)
    .where(inArray(aiAgents.id, [args.fromAgentId, args.toAgentId]));
  const from = agents.find((a) => a.id === args.fromAgentId);
  const to = agents.find((a) => a.id === args.toAgentId);
  if (!from || !to) throw new Error("Handoff endpoints not found");

  const roster = await db.select().from(aiAgents);
  const check = canHandoff({ from, to, roster });
  if (!check.ok) throw new Error(check.reason);

  await db.insert(aiAgentHandoffs).values({
    fromAgentId: args.fromAgentId,
    toAgentId: args.toAgentId,
    taskId: args.taskId,
    reason: args.reason,
  });
  // Re-assign the task to the receiver, put it back in the queue.
  await db
    .update(aiAgentTasks)
    .set({ agentId: args.toAgentId, status: "queued" })
    .where(eq(aiAgentTasks.id, args.taskId));
  return { ok: true };
}
