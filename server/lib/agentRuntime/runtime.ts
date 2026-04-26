/**
 * server/lib/agentRuntime/runtime.ts
 *
 * Core executor. `runAgent(agentId, triggerPayload)`:
 *   1. Loads the agent config + its authorized tool keys.
 *   2. Checks daily cost + run-count ceilings. If exceeded → pauses the agent
 *      and records a `cost_exceeded` run.
 *   3. Calls Anthropic with the system prompt and authorized tools.
 *   4. If a tool call requires approval, parks the run in awaiting_approval
 *      and drops a notification for admins.
 *   5. Otherwise dispatches tool calls, persists the full audit trail, and
 *      returns the run record.
 *
 * This is intentionally a single-turn loop for Phase 1. Phase 2 will add
 * multi-turn tool dispatch once the tool registry has real procedures.
 */

import Anthropic from "@anthropic-ai/sdk";
import { eq, and, gte, sql } from "drizzle-orm";
import { getDb } from "../../db";
import {
  aiAgents,
  aiAgentTasks,
  aiAgentTools,
  aiAgentRuns,
  notifications,
  type DbAiAgent,
} from "../../../drizzle/schema";
import { getTool, getAnthropicToolDefinitions } from "./tools";
import { priceRun } from "./pricing";

const DEFAULT_MAX_TOKENS = 2048;

export type RunResult = {
  runId: number;
  taskId: number;
  status: "success" | "failed" | "tool_error" | "cost_exceeded" | "timed_out" | "awaiting_approval";
  costUsd: number;
  output: string;
  toolCalls: Array<{ key: string; input: unknown; output?: unknown; approved?: boolean }>;
};

export type RunAgentInput = {
  agentId: number;
  triggerType: "event" | "schedule" | "manual" | "delegated";
  triggerPayload: Record<string, unknown>;
  /** If provided, reuse the task row (e.g. approval re-run) instead of creating one. */
  existingTaskId?: number;
};

export async function runAgent(input: RunAgentInput): Promise<RunResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const agent = (await db.select().from(aiAgents).where(eq(aiAgents.id, input.agentId)).limit(1))[0] as
    | DbAiAgent
    | undefined;
  if (!agent) throw new Error(`Agent ${input.agentId} not found`);

  if (agent.status === "paused" || agent.status === "disabled") {
    throw new Error(`Agent ${agent.seatName} is ${agent.status} — cannot run.`);
  }

  // ── Cost + run-count ceiling ────────────────────────────────────────────────
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const todayRuns = await db
    .select({
      costSum: sql<number>`COALESCE(SUM(${aiAgentRuns.costUsd}), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(aiAgentRuns)
    .where(and(eq(aiAgentRuns.agentId, agent.id), gte(aiAgentRuns.createdAt, since)));
  const costToday = Number(todayRuns[0]?.costSum ?? 0);
  const runsToday = Number(todayRuns[0]?.count ?? 0);
  const capUsd = Number(agent.costCapDailyUsd);

  if (costToday >= capUsd || runsToday >= agent.runLimitDaily) {
    const taskId = await ensureTask(db, input);
    const runId = await insertRun(db, {
      taskId,
      agentId: agent.id,
      input: input.triggerPayload,
      output: null,
      toolCalls: [],
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      durationMs: 0,
      status: "cost_exceeded",
      errorMessage: `Daily ceiling hit: cost ${costToday}/${capUsd} usd, runs ${runsToday}/${agent.runLimitDaily}`,
    });
    await db.update(aiAgents).set({ status: "paused" }).where(eq(aiAgents.id, agent.id));
    await notifyAdmins(
      db,
      `Agent paused: ${agent.seatName} hit its daily ceiling`,
      `Cost today ${costToday.toFixed(2)} / ${capUsd.toFixed(2)} USD, runs ${runsToday}/${agent.runLimitDaily}.`,
      `/admin/ai-agents/${agent.id}`
    );
    return { runId, taskId, status: "cost_exceeded", costUsd: 0, output: "", toolCalls: [] };
  }

  // ── Load authorized tools ───────────────────────────────────────────────────
  const authorized = await db
    .select()
    .from(aiAgentTools)
    .where(and(eq(aiAgentTools.agentId, agent.id), eq(aiAgentTools.authorized, true)));
  const toolKeys = authorized.map((t) => t.toolKey);
  const toolDefs = getAnthropicToolDefinitions(toolKeys);

  // ── Ensure task row ─────────────────────────────────────────────────────────
  const taskId = await ensureTask(db, input);
  await db
    .update(aiAgentTasks)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(aiAgentTasks.id, taskId));

  // ── Call Anthropic ──────────────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const client = new Anthropic({ apiKey });

  const started = Date.now();
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: agent.model,
      max_tokens: DEFAULT_MAX_TOKENS,
      system: [
        { type: "text", text: agent.systemPrompt, cache_control: { type: "ephemeral" } },
      ],
      tools: toolDefs.length > 0 ? toolDefs : undefined,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            trigger: input.triggerType,
            payload: input.triggerPayload,
          }),
        },
      ],
    });
  } catch (err) {
    const runId = await insertRun(db, {
      taskId,
      agentId: agent.id,
      input: input.triggerPayload,
      output: null,
      toolCalls: [],
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      durationMs: Date.now() - started,
      status: "failed",
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    await db
      .update(aiAgentTasks)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(aiAgentTasks.id, taskId));
    return { runId, taskId, status: "failed", costUsd: 0, output: "", toolCalls: [] };
  }

  const durationMs = Date.now() - started;
  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const costUsd = priceRun({ model: agent.model, inputTokens, outputTokens });

  // ── Parse output + tool calls ───────────────────────────────────────────────
  const textParts: string[] = [];
  const toolRequests: Array<{ key: string; input: Record<string, unknown>; name: string }> = [];
  for (const block of response.content) {
    if (block.type === "text") textParts.push(block.text);
    else if (block.type === "tool_use") {
      // Map Anthropic tool name → our toolKey (we use dot notation, Anthropic needs underscores)
      const key = Array.from(
        { length: 1 },
        () => {
          for (const tk of toolKeys) {
            const def = getTool(tk);
            if (def?.definition.name === block.name) return tk;
          }
          return block.name;
        }
      )[0];
      toolRequests.push({ key, input: block.input as Record<string, unknown>, name: block.name });
    }
  }

  const output = textParts.join("\n\n");

  // ── Approval gate: if any requested tool needs approval, park the run ───────
  const needsApproval = toolRequests.some((r) => getTool(r.key)?.requiresApproval);
  if (needsApproval) {
    const runId = await insertRun(db, {
      taskId,
      agentId: agent.id,
      input: input.triggerPayload,
      output,
      toolCalls: toolRequests.map((r) => ({ key: r.key, input: r.input })),
      inputTokens,
      outputTokens,
      costUsd,
      durationMs,
      status: "success",
      errorMessage: null,
    });
    await db
      .update(aiAgentTasks)
      .set({ status: "awaiting_approval" })
      .where(eq(aiAgentTasks.id, taskId));
    await notifyAdmins(
      db,
      `${agent.seatName} needs approval`,
      output.slice(0, 280) || "Draft awaiting your review.",
      `/admin/ai-agents/tasks`
    );
    return { runId, taskId, status: "awaiting_approval", costUsd, output, toolCalls: toolRequests };
  }

  // ── Dispatch tool calls that don't require approval ────────────────────────
  const toolResults: Array<{ key: string; input: unknown; output?: unknown; error?: string }> = [];
  let toolError: string | null = null;
  for (const req of toolRequests) {
    const tool = getTool(req.key);
    if (!tool) {
      toolError = `Unknown tool ${req.key}`;
      toolResults.push({ key: req.key, input: req.input, error: toolError });
      break;
    }
    try {
      const out = await tool.handler({ input: req.input, ctx: { agentId: agent.id, taskId, db } });
      toolResults.push({ key: req.key, input: req.input, output: out });
    } catch (err) {
      toolError = err instanceof Error ? err.message : String(err);
      toolResults.push({ key: req.key, input: req.input, error: toolError });
      break;
    }
  }

  const finalStatus = toolError ? "tool_error" : "success";
  const runId = await insertRun(db, {
    taskId,
    agentId: agent.id,
    input: input.triggerPayload,
    output,
    toolCalls: toolResults,
    inputTokens,
    outputTokens,
    costUsd,
    durationMs,
    status: finalStatus,
    errorMessage: toolError,
  });

  await db
    .update(aiAgentTasks)
    .set({ status: toolError ? "failed" : "completed", completedAt: new Date() })
    .where(eq(aiAgentTasks.id, taskId));

  await db.update(aiAgents).set({ lastRunAt: new Date() }).where(eq(aiAgents.id, agent.id));

  return {
    runId,
    taskId,
    status: finalStatus,
    costUsd,
    output,
    toolCalls: toolResults,
  };
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function ensureTask(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, input: RunAgentInput): Promise<number> {
  if (input.existingTaskId) return input.existingTaskId;
  const inserted = await db.insert(aiAgentTasks).values({
    agentId: input.agentId,
    triggerType: input.triggerType,
    triggerPayload: JSON.stringify(input.triggerPayload ?? {}),
    status: "running",
    startedAt: new Date(),
  });
  // drizzle-orm 0.45+: result is the header object directly, not an array
  return Number((inserted as { insertId?: number }).insertId ?? 0);
}

type RunInsert = {
  taskId: number;
  agentId: number;
  input: unknown;
  output: string | null;
  toolCalls: unknown;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  status: "success" | "failed" | "tool_error" | "cost_exceeded" | "timed_out";
  errorMessage: string | null;
};

async function insertRun(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  r: RunInsert
): Promise<number> {
  const inserted = await db.insert(aiAgentRuns).values({
    taskId: r.taskId,
    agentId: r.agentId,
    input: JSON.stringify(r.input ?? null),
    output: r.output,
    toolCalls: JSON.stringify(r.toolCalls ?? []),
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    costUsd: r.costUsd.toFixed(4),
    durationMs: r.durationMs,
    status: r.status,
    errorMessage: r.errorMessage,
  });
  return Number((inserted as { insertId?: number }).insertId ?? 0);
}

async function notifyAdmins(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  title: string,
  body: string,
  linkUrl: string
) {
  // Write an admin-role notification. Caught internally — notifications failing
  // must never fail the run.
  try {
    await db.insert(notifications).values({
      userId: 1, // owner fallback; the role='admin' filter surfaces it to any admin
      role: "admin",
      eventType: "ai_agent",
      title,
      body,
      linkUrl,
      priority: "high",
    });
  } catch (err) {
    console.warn("[agentRuntime] Failed to notify admins:", err);
  }
}
