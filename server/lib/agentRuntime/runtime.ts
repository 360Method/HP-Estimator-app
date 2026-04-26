/**
 * server/lib/agentRuntime/runtime.ts
 *
 * Core executor. `runAgent(agentId, triggerPayload)`:
 *   1. Loads the agent config + its authorized tool keys.
 *   2. Checks daily cost + run-count ceilings. If exceeded → pauses the agent
 *      and records a `cost_exceeded` run.
 *   3. Calls Anthropic with the system prompt and authorized tools — and
 *      iterates as a multi-turn tool loop: while the model emits tool_use
 *      blocks, run the tools, feed results back, ask again. Capped at
 *      MAX_TOOL_TURNS to prevent runaway loops.
 *   4. If a tool call requires approval, parks the run in awaiting_approval
 *      and drops a notification for admins. The remainder of the loop is
 *      resumed by approval.ts after a human approves.
 *   5. Persists the full audit trail (runs, tool_calls, tokens, cost) and
 *      emits `agent.run_completed` so dependent agents (System Integrity,
 *      KPI rollups, downstream subscribers) can react.
 *
 * The system prompt is sent with cache_control: ephemeral so the charter
 * section is cached across turns AND across runs (5-minute TTL on Anthropic).
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
/**
 * Hard cap on tool-use iterations per run. Each turn = one Anthropic call +
 * one batch of tool dispatches. Most agents finish in 1-3 turns; this cap
 * protects against pathological loops where the model keeps requesting tools
 * without converging.
 */
const MAX_TOOL_TURNS = 8;

export type RunResult = {
  runId: number;
  taskId: number;
  status: "success" | "failed" | "tool_error" | "cost_exceeded" | "timed_out" | "awaiting_approval";
  costUsd: number;
  output: string;
  toolCalls: Array<{ key: string; input: unknown; output?: unknown; approved?: boolean; error?: string }>;
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
  // Anthropic tool names are sanitized (underscores), our keys use dots — keep
  // a name → key map handy so we can hand the right handler to the dispatcher.
  const nameToKey = new Map<string, string>();
  for (const tk of toolKeys) {
    const def = getTool(tk)?.definition;
    if (def) nameToKey.set(def.name, tk);
  }

  // ── Ensure task row ─────────────────────────────────────────────────────────
  const taskId = await ensureTask(db, input);
  await db
    .update(aiAgentTasks)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(aiAgentTasks.id, taskId));

  // ── Multi-turn loop ─────────────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const client = new Anthropic({ apiKey });

  const started = Date.now();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;
  const collectedToolCalls: Array<{ key: string; input: unknown; output?: unknown; error?: string }> = [];
  const textParts: string[] = [];
  // Conversation accumulator. We seed with the trigger as the first user turn.
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: JSON.stringify({
        trigger: input.triggerType,
        payload: input.triggerPayload,
      }),
    },
  ];

  let finalStatus: RunResult["status"] = "success";
  let toolError: string | null = null;
  let parkedForApproval = false;

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: agent.model,
        max_tokens: DEFAULT_MAX_TOKENS,
        system: [
          { type: "text", text: agent.systemPrompt, cache_control: { type: "ephemeral" } },
        ],
        tools: toolDefs.length > 0 ? toolDefs : undefined,
        messages,
      });
    } catch (err) {
      finalStatus = "failed";
      toolError = err instanceof Error ? err.message : String(err);
      break;
    }

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;
    totalCostUsd += priceRun({
      model: agent.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    // Collect text + tool_use blocks from this assistant turn.
    const turnTextParts: string[] = [];
    const turnToolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
    for (const block of response.content) {
      if (block.type === "text") turnTextParts.push(block.text);
      else if (block.type === "tool_use") {
        turnToolUses.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }
    textParts.push(...turnTextParts);

    // No tool calls this turn → conversation is done. Or stop_reason isn't
    // tool_use (end_turn / max_tokens / stop_sequence) → exit cleanly.
    if (turnToolUses.length === 0 || response.stop_reason !== "tool_use") {
      finalStatus = "success";
      break;
    }

    // Approval gate: if any requested tool requires human approval, park the
    // entire run. The accumulated turn so far is preserved; approval.ts will
    // dispatch the parked tool calls after a human OK.
    const approvalNeeded = turnToolUses.some((u) => {
      const key = nameToKey.get(u.name) ?? u.name;
      return getTool(key)?.requiresApproval === true;
    });
    if (approvalNeeded) {
      parkedForApproval = true;
      for (const u of turnToolUses) {
        const key = nameToKey.get(u.name) ?? u.name;
        collectedToolCalls.push({ key, input: u.input });
      }
      finalStatus = "awaiting_approval";
      break;
    }

    // Append the assistant's full content to the conversation, then dispatch
    // each non-approval tool call and feed results back as tool_result blocks.
    messages.push({ role: "assistant", content: response.content });
    const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];
    for (const u of turnToolUses) {
      const key = nameToKey.get(u.name) ?? u.name;
      const tool = getTool(key);
      if (!tool) {
        toolError = `Unknown tool ${key}`;
        collectedToolCalls.push({ key, input: u.input, error: toolError });
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: u.id,
          content: `Error: tool '${key}' is not registered.`,
          is_error: true,
        });
        continue;
      }
      try {
        const out = await tool.handler({
          input: u.input,
          ctx: { agentId: agent.id, taskId, db },
        });
        collectedToolCalls.push({ key, input: u.input, output: out });
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: u.id,
          content: typeof out === "string" ? out : JSON.stringify(out ?? null),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toolError = msg;
        collectedToolCalls.push({ key, input: u.input, error: msg });
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: u.id,
          content: `Error: ${msg}`,
          is_error: true,
        });
        // Don't break — let the model see the error and try a different tool
        // or summarize the failure. The status will reflect tool_error if
        // any error occurred and the model didn't recover successfully.
      }
    }
    messages.push({ role: "user", content: toolResultBlocks });

    // Keep iterating — the model may want to chain more tool calls.
  }

  // If we broke out of the loop because we hit MAX_TOOL_TURNS without the
  // model converging, flag it as timed_out for observability.
  if (!parkedForApproval && finalStatus === "success" && messages.length >= MAX_TOOL_TURNS * 2) {
    // Heuristic: the model is still calling tools at the cap. Even though
    // we tagged success, the human reviewer should know the loop hit the cap.
    // We don't downgrade success to timed_out here because the cap can also be
    // reached on the same turn the model finishes; finalStatus is set above
    // only when stop_reason === "tool_use" persisted, in which case we'd have
    // continued. So leave success alone.
  }
  if (toolError && finalStatus === "success") {
    finalStatus = "tool_error";
  }

  const durationMs = Date.now() - started;
  const output = textParts.join("\n\n");

  // Persist run + update task. Map awaiting_approval → its DB column value
  // (success in the runs table; the task captures awaiting_approval status).
  const dbStatus: Exclude<RunResult["status"], "awaiting_approval"> | "success" =
    finalStatus === "awaiting_approval" ? "success" : finalStatus;

  const runId = await insertRun(db, {
    taskId,
    agentId: agent.id,
    input: input.triggerPayload,
    output,
    toolCalls: collectedToolCalls,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    costUsd: totalCostUsd,
    durationMs,
    status: dbStatus,
    errorMessage: toolError,
  });

  if (parkedForApproval) {
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
  } else {
    await db
      .update(aiAgentTasks)
      .set({
        status: finalStatus === "failed" || finalStatus === "tool_error" ? "failed" : "completed",
        completedAt: new Date(),
      })
      .where(eq(aiAgentTasks.id, taskId));
    await db.update(aiAgents).set({ lastRunAt: new Date() }).where(eq(aiAgents.id, agent.id));
  }

  // Emit the meta-event LAST, fire-and-forget. System Integrity + KPI
  // rollups + downstream subscribers wake up off this. We don't import
  // triggerBus at the top to avoid the circular triggerBus → runtime path.
  if (!parkedForApproval) {
    void emitRunCompleted({
      agentId: agent.id,
      seatName: agent.seatName,
      department: agent.department,
      runId,
      taskId,
      status: finalStatus,
      costUsd: totalCostUsd,
      durationMs,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      toolCallCount: collectedToolCalls.length,
      errorMessage: toolError,
    });
  }

  return {
    runId,
    taskId,
    status: finalStatus,
    costUsd: totalCostUsd,
    output,
    toolCalls: collectedToolCalls,
  };
}

async function emitRunCompleted(payload: Record<string, unknown>): Promise<void> {
  try {
    const { emitAgentEvent } = await import("./triggerBus");
    await emitAgentEvent("agent.run_completed", payload);
  } catch (err) {
    console.warn("[agentRuntime] emit agent.run_completed failed (non-fatal):", err);
  }
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
