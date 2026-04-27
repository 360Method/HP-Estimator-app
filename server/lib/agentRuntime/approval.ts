/**
 * server/lib/agentRuntime/approval.ts
 *
 * Moves awaiting-approval runs through to execution or rejection. An admin
 * clicks Approve → we read back the parked run's toolCalls and dispatch each
 * handler (skipping ones the admin rejected). Reject → we mark the task
 * rejected and the draft is discarded.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import {
  aiAgentRuns,
  aiAgentTasks,
} from "../../../drizzle/schema";
import { getTool } from "./tools";

export async function approveTask(args: {
  taskId: number;
  userId: number;
}): Promise<{ ok: true; executed: number; errors: string[] }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const task = (await db.select().from(aiAgentTasks).where(eq(aiAgentTasks.id, args.taskId)).limit(1))[0];
  if (!task) throw new Error(`Task ${args.taskId} not found`);
  if (task.status !== "awaiting_approval") {
    throw new Error(`Task ${args.taskId} is ${task.status}, not awaiting_approval`);
  }

  const latestRun = (
    await db
      .select()
      .from(aiAgentRuns)
      .where(eq(aiAgentRuns.taskId, args.taskId))
      .orderBy(aiAgentRuns.createdAt)
  ).slice(-1)[0];
  if (!latestRun) throw new Error(`No run to approve for task ${args.taskId}`);

  let toolCalls: Array<{ key: string; input: Record<string, unknown> }> = [];
  try {
    toolCalls = JSON.parse(latestRun.toolCalls ?? "[]");
  } catch {
    toolCalls = [];
  }

  let executed = 0;
  const errors: string[] = [];
  for (const call of toolCalls) {
    const tool = getTool(call.key);
    if (!tool) {
      errors.push(`Unknown tool ${call.key}`);
      continue;
    }
    try {
      await tool.handler({
        input: call.input,
        ctx: { agentId: latestRun.agentId, taskId: args.taskId, db },
      });
      executed++;
    } catch (err) {
      errors.push(`${call.key}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await db
    .update(aiAgentRuns)
    .set({ approvedByUserId: args.userId, approvedAt: new Date() })
    .where(eq(aiAgentRuns.id, latestRun.id));
  await db
    .update(aiAgentTasks)
    .set({ status: errors.length > 0 ? "failed" : "approved", completedAt: new Date() })
    .where(eq(aiAgentTasks.id, args.taskId));

  return { ok: true, executed, errors };
}

export async function rejectTask(args: {
  taskId: number;
  userId: number;
  reason?: string;
}): Promise<{ ok: true }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(aiAgentTasks)
    .set({ status: "rejected", completedAt: new Date() })
    .where(eq(aiAgentTasks.id, args.taskId));
  // Record the rejection on the latest run for audit.
  const latestRun = (
    await db
      .select()
      .from(aiAgentRuns)
      .where(eq(aiAgentRuns.taskId, args.taskId))
      .orderBy(aiAgentRuns.createdAt)
  ).slice(-1)[0];
  if (latestRun) {
    await db
      .update(aiAgentRuns)
      .set({
        approvedByUserId: args.userId,
        approvedAt: new Date(),
        errorMessage: args.reason ? `Rejected: ${args.reason}` : "Rejected by admin",
      })
      .where(eq(aiAgentRuns.id, latestRun.id));
  }
  return { ok: true };
}
