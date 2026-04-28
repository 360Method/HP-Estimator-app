/**
 * server/integratorStream.ts
 *
 * Server-Sent Events streaming endpoint for the Visionary Console
 * Integrator chat. The /admin/chat tRPC `send` mutation still exists for
 * the legacy chat surface; this endpoint is the streaming variant the
 * console at /admin/visionary uses.
 *
 * Wire format (per SSE spec, one event per `\n\n` block):
 *   event: connect      — emitted once after headers flush; primes proxies
 *   data: {"ok":true,"conversationId":N,"agent":"..."}
 *
 *   event: delta        — incremental text from the assistant for the
 *                         CURRENT turn. Multiple turns may stream during a
 *                         multi-tool-use loop; clients should reset their
 *                         accumulated text when they receive `text_reset`.
 *   data: {"text":"..."}
 *
 *   event: text_reset   — the prior turn's text was an acknowledgment; the
 *                         model is about to call tools and synthesize.
 *                         Clients must clear their accumulated text.
 *   data: {"reason":"tool_call_pending","iteration":N}
 *
 *   event: tool_use     — emitted once per tool the model wants to call
 *   data: {"key":"...","input":{...},"requiresApproval":boolean,"turn":N}
 *
 *   event: tool_result  — emitted after each non-approval tool runs
 *   data: {"key":"...","output":...,"turn":N}  OR  {"key":"...","error":"..."}
 *
 *   event: done         — final summary (cost, tokens, persisted message id,
 *                         turn count, total tool call count)
 *   data: {"messageId":N,"costUsd":"0.0042","inputTokens":N,"outputTokens":N,
 *          "needsApproval":bool,"turns":N,"toolCallCount":N}
 *
 *   event: error
 *   data: {"message":"..."}
 */

import type { Express, Request, Response } from "express";
import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq } from "drizzle-orm";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import {
  aiAgents,
  aiAgentRuns,
  aiAgentTasks,
  aiAgentTools,
  integratorChatConversations,
  integratorChatMessages,
} from "../drizzle/schema";
import { getAnthropicToolDefinitions, getTool } from "./lib/agentRuntime/tools";
import { priceRun } from "./lib/agentRuntime/pricing";
// Side-effect: registers the agent-teams tools alongside the rest.
import "./lib/agentRuntime/phase2Tools";

const MAX_HISTORY_MSGS = 30;
const MAX_TOKENS = 4096;
const MAX_TOOL_ITERATIONS = 6;

/**
 * System-prompt addendum injected at chat time. The strong "no promises"
 * language is load-bearing: without it the model defaults to
 * acknowledgment-style text ("I'll pull the KPIs now") followed by a
 * tool_use block, which used to leave the user staring at a placeholder
 * after the tools ran. Combined with the multi-turn loop below, the model
 * now MUST execute its tools and return a synthesis in the final turn.
 */
const VISIONARY_PROMPT_ADDENDUM = `

[Visionary Console — operating posture]
Marcin runs Handy Pioneers from the Visionary Console at /admin/visionary. He
sees every tool call you make in the UI, with inputs and outputs. He does not
need narration.

CRITICAL: NEVER respond with placeholder/promise text. Forbidden patterns:
  - "I'll pull..." / "I'll route..." / "I'll ping..." / "I'll check..."
  - "Pulling now..." / "Routing now..." / "One moment..." / "Let me look..."
  - "Got it — I'll..." / "On it..."

These are ALL banned. They produce a response that LOOKS done but contains
zero information. Marcin will not see a follow-up message; he sees only this
turn's output.

The correct pattern: when you need data, CALL THE TOOL in this same turn,
wait for the result, then deliver the synthesis with concrete numbers, names,
and findings. The runtime executes your tool calls and feeds the results
back to you in the same conversation; you must use them to write the actual
answer.

If a tool requires approval (parked), that's fine — say so concisely
("Drafted a Sales-team broadcast; parked for your tap in /admin/ai-agents/tasks")
and continue with whatever else you can deliver.

When routing work to a department, use agentTeams_list to find the team,
then agentTeams_assignTask to create the task, then agentTeams_broadcast for
context the team needs. After those execute, summarize what was assigned
with the task IDs and team names — that's the value you deliver to Marcin.`;

function sse(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  // Flush — express + node http buffer aggressively otherwise.
  // @ts-expect-error flush exists at runtime in some setups
  if (typeof res.flush === "function") res.flush();
}

function logTag(...args: unknown[]) {
  console.log("[integrator-stream]", ...args);
}
function logErr(...args: unknown[]) {
  console.error("[integrator-stream]", ...args);
}

export function registerIntegratorStreamRoutes(app: Express): void {
  // Lightweight health probe — proves the route is mounted and the runtime
  // dependencies (env, DB, integrator seat) are wired. Auth-gated so we don't
  // leak runtime state.
  app.get("/api/admin/integrator-stream/health", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user || (user as { role?: string }).role !== "admin") {
        res.status(401).json({ ok: false, reason: "unauthorized" });
        return;
      }
      const d = await getDb();
      const dbOk = !!d;
      const apiKey = !!process.env.ANTHROPIC_API_KEY;
      let integratorSeated = false;
      if (d) {
        const [integrator] = await d
          .select({ id: aiAgents.id })
          .from(aiAgents)
          .where(eq(aiAgents.department, "integrator"))
          .limit(1);
        integratorSeated = !!integrator;
      }
      res.json({ ok: dbOk && apiKey && integratorSeated, db: dbOk, anthropicKey: apiKey, integratorSeated });
    } catch (err) {
      res.status(500).json({ ok: false, reason: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post(
    "/api/admin/integrator-stream",
    express.json({ limit: "1mb" }),
    async (req: Request, res: Response) => {
      const reqStart = Date.now();
      logTag("POST /api/admin/integrator-stream — entered");
      // 1) Auth + admin check
      let user;
      try {
        user = await sdk.authenticateRequest(req);
      } catch {
        logTag("auth fail");
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      if (!user || (user as { role?: string }).role !== "admin") {
        logTag("non-admin user", user?.email);
        res.status(403).json({ error: "Admin only" });
        return;
      }

      const body = (req.body ?? {}) as { conversationId?: number; message?: string };
      const conversationId = Number(body.conversationId);
      const message = String(body.message ?? "").trim();
      if (!conversationId || !message) {
        logTag("bad request body", { conversationId, msgLen: message.length });
        res.status(400).json({ error: "conversationId and message required" });
        return;
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        logErr("ANTHROPIC_API_KEY not set on this Railway environment");
        res.status(500).json({ error: "ANTHROPIC_API_KEY not set on the server" });
        return;
      }

      const d = await getDb();
      if (!d) {
        logErr("getDb returned null");
        res.status(500).json({ error: "Database not available" });
        return;
      }

      // 2) Verify conversation ownership
      const [conv] = await d
        .select()
        .from(integratorChatConversations)
        .where(eq(integratorChatConversations.id, conversationId))
        .limit(1);
      if (!conv || conv.userId !== user.id) {
        logTag("conversation lookup failed", { conversationId, owner: conv?.userId, asker: user.id });
        res.status(404).json({ error: "Conversation not found" });
        return;
      }

      // 3) Find the integrator agent
      const [integrator] = await d
        .select()
        .from(aiAgents)
        .where(eq(aiAgents.department, "integrator"))
        .limit(1);
      if (!integrator) {
        logErr("No integrator seat seeded");
        res.status(412).json({ error: "No integrator agent seeded. Run scripts/seed-ai-agents.mjs." });
        return;
      }

      // 4) Begin SSE response — set headers, flush, prime the wire with a
      //    connect event so Cloudflare/Railway forward the response without
      //    waiting for buffer fill. The connect event also lets the client
      //    confirm the stream is live before any model latency.
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.setHeader("Content-Encoding", "identity");
      res.flushHeaders?.();
      // Padding bytes (8 KB of comment) — proxies that buffer until a chunk
      // threshold need this to release the response. Comments are spec-legal
      // and ignored by SSE clients.
      res.write(`: ${"-".repeat(2048)}\n\n`);
      sse(res, "connect", { ok: true, conversationId, agent: integrator.seatName });
      logTag("stream opened", { conversationId, agent: integrator.seatName });

      // Heartbeat so reverse proxies don't hang up the long-poll.
      const heartbeat = setInterval(() => {
        res.write(": heartbeat\n\n");
      }, 15_000);

      // Track Anthropic stream so we can abort it if the client disconnects.
      let activeStream: { abort: () => void } | null = null;
      req.on("close", () => {
        clearInterval(heartbeat);
        if (activeStream) {
          try {
            activeStream.abort();
          } catch {
            /* ignore */
          }
        }
      });

      try {
        // 5) Persist the user's message before we call Anthropic
        await d.insert(integratorChatMessages).values({
          conversationId,
          userId: user.id,
          role: "user",
          content: message,
        });

        // 6) Load history + authorized tools
        const history = await d
          .select()
          .from(integratorChatMessages)
          .where(eq(integratorChatMessages.conversationId, conversationId))
          .orderBy(desc(integratorChatMessages.createdAt))
          .limit(MAX_HISTORY_MSGS);
        history.reverse();

        const toolRows = await d
          .select()
          .from(aiAgentTools)
          .where(and(eq(aiAgentTools.agentId, integrator.id), eq(aiAgentTools.authorized, true)));
        const toolKeys = toolRows.map((t) => t.toolKey);
        const toolDefs = getAnthropicToolDefinitions(toolKeys);

        // 7) Briefing
        const briefing = await buildContextBriefing(d);

        const messages: Anthropic.MessageParam[] = history.map((m) => ({
          role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
          content: m.content,
        }));

        // 8) Multi-turn agentic tool-use loop.
        //
        // Each iteration calls Anthropic with the running messages array. If
        // the model emits tool_use blocks, we execute the tools, append the
        // assistant turn + tool_result blocks to messages, and loop. When the
        // model finally returns a text-only turn, that's the synthesis we
        // stream to the user and persist.
        //
        // Why this matters: prior to this loop, a single turn was made and
        // any tool_use blocks were executed AFTER the response had already
        // streamed. The user saw "I'll pull the KPIs..." (acknowledgment) and
        // never saw the synthesis with actual numbers. Now the model is forced
        // to consume its own tool results before producing user-visible text.
        const client = new Anthropic({ apiKey });
        logTag("starting agentic loop", { model: integrator.model, tools: toolKeys.length, history: messages.length });

        // Synthetic task row so tool handlers have a ctx.taskId. One per
        // request, shared across all loop iterations.
        const taskInsert = await d.insert(aiAgentTasks).values({
          agentId: integrator.id,
          triggerType: "manual",
          triggerPayload: JSON.stringify({ via: "visionary_console_stream", conversationId }),
          status: "running",
          startedAt: new Date(),
        });
        const taskId = Number((taskInsert as { insertId?: number }).insertId ?? 0);

        const allToolCalls: Array<{
          key: string;
          input: unknown;
          output?: unknown;
          error?: string;
          requiresApproval?: boolean;
          turn: number;
        }> = [];
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let finalSynthesisText = "";
        let needsApproval = false;
        let firstDeltaAt: number | null = null;
        let iteration = 0;

        // Map a model-emitted tool name back to our internal toolKey.
        const nameToKey = (name: string): string => {
          for (const tk of toolKeys) {
            const def = getTool(tk);
            if (def?.definition.name === name) return tk;
          }
          return name;
        };

        while (iteration < MAX_TOOL_ITERATIONS) {
          iteration += 1;
          logTag(`turn ${iteration} → calling Anthropic`, { msgCount: messages.length });

          const turnStream = client.messages.stream({
            model: integrator.model,
            max_tokens: MAX_TOKENS,
            system: [
              {
                type: "text",
                text: `${integrator.systemPrompt}${VISIONARY_PROMPT_ADDENDUM}\n\n[Live ops context]\n${briefing}`,
                cache_control: { type: "ephemeral" },
              },
            ],
            tools: toolDefs.length > 0 ? toolDefs : undefined,
            messages,
          });
          activeStream = turnStream;

          // Stream this turn's text deltas live. If the turn ends up
          // containing tool_use blocks, we'll emit a `text_reset` afterward
          // so the client clears the acknowledgment text before tools render.
          turnStream.on("text", (textDelta: string) => {
            if (firstDeltaAt === null) {
              firstDeltaAt = Date.now();
              logTag("first delta", `${firstDeltaAt - reqStart}ms`);
            }
            sse(res, "delta", { text: textDelta });
          });
          turnStream.on("error", (err) => {
            logErr(`turn ${iteration} stream error`, err);
          });

          const turnFinal = await turnStream.finalMessage();
          totalInputTokens += turnFinal.usage.input_tokens;
          totalOutputTokens += turnFinal.usage.output_tokens;

          const toolUseBlocks = turnFinal.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
          );
          const textParts = turnFinal.content
            .filter((b): b is Anthropic.TextBlock => b.type === "text")
            .map((b) => b.text);
          const turnText = textParts.join("\n\n");

          if (toolUseBlocks.length === 0) {
            // ── Final synthesis turn. The deltas already streamed live.
            finalSynthesisText = turnText;
            logTag(`turn ${iteration} → final (no more tools)`, { textLen: turnText.length });
            break;
          }

          // ── Intermediate turn: clear the acknowledgment text on the
          //    client so it doesn't bleed into the final synthesis.
          if (turnText.length > 0) {
            sse(res, "text_reset", { reason: "tool_call_pending", iteration });
          }

          // Append the assistant turn (text + tool_use) as-is so the next
          // call to Anthropic sees the same blocks it produced.
          messages.push({ role: "assistant", content: turnFinal.content });

          // Execute each tool, build tool_result blocks for the next user msg.
          const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];

          for (const tu of toolUseBlocks) {
            const key = nameToKey(tu.name);
            const tool = getTool(key);

            sse(res, "tool_use", {
              key,
              input: tu.input,
              requiresApproval: tool?.requiresApproval ?? false,
              turn: iteration,
            });

            if (!tool) {
              const errMsg = `Unknown tool: ${tu.name}`;
              allToolCalls.push({ key, input: tu.input, error: errMsg, turn: iteration });
              toolResultBlocks.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: errMsg,
                is_error: true,
              });
              sse(res, "tool_result", { key, error: errMsg, turn: iteration });
              continue;
            }

            if (tool.requiresApproval) {
              needsApproval = true;
              allToolCalls.push({ key, input: tu.input, requiresApproval: true, turn: iteration });
              // Give the model a synthetic "parked" result so the loop can
              // continue. The model should acknowledge in its synthesis that
              // the action is queued for Marcin's approval.
              toolResultBlocks.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content:
                  "[Parked for human approval — Marcin will review this draft in /admin/ai-agents/tasks. Mention that it's queued in your final response and continue with whatever else you can deliver in this turn.]",
              });
              sse(res, "tool_result", {
                key,
                output: { parked: true, queue: "/admin/ai-agents/tasks" },
                turn: iteration,
              });
              continue;
            }

            try {
              const out = await tool.handler({
                input: tu.input as Record<string, unknown>,
                ctx: { agentId: integrator.id, taskId, db: d },
              });
              allToolCalls.push({ key, input: tu.input, output: out, turn: iteration });
              const resultStr = typeof out === "string" ? out : JSON.stringify(out);
              toolResultBlocks.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: resultStr,
              });
              sse(res, "tool_result", { key, output: out, turn: iteration });
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              allToolCalls.push({ key, input: tu.input, error: errMsg, turn: iteration });
              toolResultBlocks.push({
                type: "tool_result",
                tool_use_id: tu.id,
                content: errMsg,
                is_error: true,
              });
              sse(res, "tool_result", { key, error: errMsg, turn: iteration });
            }
          }

          // Append the tool_result blocks as a user message and loop.
          messages.push({ role: "user", content: toolResultBlocks });
          logTag(`turn ${iteration} → ${toolUseBlocks.length} tools executed, looping`);
        }

        if (!finalSynthesisText) {
          // We hit MAX_TOOL_ITERATIONS without the model producing text-only
          // output. Force a final synthesis turn with tools disabled so it
          // has to summarize. If that still fails, fall back to a stub.
          logTag(`max iterations (${MAX_TOOL_ITERATIONS}) reached, forcing synthesis`);
          try {
            const forceFinal = await client.messages.create({
              model: integrator.model,
              max_tokens: MAX_TOKENS,
              system: [
                {
                  type: "text",
                  text: `${integrator.systemPrompt}${VISIONARY_PROMPT_ADDENDUM}\n\nYou have used the maximum tool budget for this turn. Synthesize what you've learned into a single concise answer for Marcin. Lead with the numbers and findings; do not request more tools.`,
                },
              ],
              messages,
            });
            finalSynthesisText = forceFinal.content
              .filter((b): b is Anthropic.TextBlock => b.type === "text")
              .map((b) => b.text)
              .join("\n\n");
            totalInputTokens += forceFinal.usage.input_tokens;
            totalOutputTokens += forceFinal.usage.output_tokens;
            // Stream the forced synthesis as a single delta (no live stream).
            if (finalSynthesisText) sse(res, "delta", { text: finalSynthesisText });
          } catch (err) {
            logErr("forced synthesis failed", err);
            finalSynthesisText = `[Reached max tool-use iterations (${MAX_TOOL_ITERATIONS}) without a synthesis. Try a more specific question.]`;
            sse(res, "delta", { text: finalSynthesisText });
          }
        }

        const costUsd = priceRun({
          model: integrator.model,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
        });

        await d
          .update(aiAgentTasks)
          .set({
            status: needsApproval ? "awaiting_approval" : "completed",
            completedAt: needsApproval ? null : new Date(),
          })
          .where(eq(aiAgentTasks.id, taskId));

        // 9) Audit run + persist assistant message (final synthesis only)
        await d.insert(aiAgentRuns).values({
          taskId,
          agentId: integrator.id,
          input: message,
          output: finalSynthesisText,
          toolCalls: JSON.stringify(allToolCalls),
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          costUsd: costUsd.toFixed(4),
          durationMs: Date.now() - reqStart,
          status: "success",
          errorMessage: null,
        });

        const assistantInsert = await d.insert(integratorChatMessages).values({
          conversationId,
          userId: user.id,
          role: "assistant",
          content: finalSynthesisText,
          toolCalls: JSON.stringify(allToolCalls),
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          costUsd: costUsd.toFixed(4),
        });
        const assistantId = Number((assistantInsert as { insertId?: number }).insertId ?? 0);

        // 10) Conversation timestamp + auto-title
        const patch: Record<string, unknown> = { lastMessageAt: new Date() };
        if (!conv.title) patch.title = message.slice(0, 80);
        await d
          .update(integratorChatConversations)
          .set(patch)
          .where(eq(integratorChatConversations.id, conversationId));

        sse(res, "done", {
          messageId: assistantId,
          costUsd: costUsd.toFixed(4),
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          needsApproval,
          turns: iteration,
          toolCallCount: allToolCalls.length,
        });
        logTag("DONE", {
          conversationId,
          totalMs: Date.now() - reqStart,
          costUsd: costUsd.toFixed(4),
          turns: iteration,
          tools: allToolCalls.length,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        logErr("ERROR in stream pipeline", msg, stack);
        sse(res, "error", { message: msg });
      } finally {
        clearInterval(heartbeat);
        activeStream = null;
        res.end();
      }
    }
  );
}

async function buildContextBriefing(d: NonNullable<Awaited<ReturnType<typeof getDb>>>): Promise<string> {
  const { sql } = await import("drizzle-orm");
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [pending] = await d
    .select({ c: sql<number>`COUNT(*)` })
    .from(aiAgentTasks)
    .where(eq(aiAgentTasks.status, "awaiting_approval"));
  const [recent] = await d
    .select({
      runs: sql<number>`COUNT(*)`,
      cost: sql<number>`COALESCE(SUM(${aiAgentRuns.costUsd}), 0)`,
    })
    .from(aiAgentRuns)
    .where(sql`${aiAgentRuns.createdAt} >= ${since}`);
  const failed = await d
    .select({ c: sql<number>`COUNT(*)` })
    .from(aiAgentRuns)
    .where(and(sql`${aiAgentRuns.createdAt} >= ${since}`, eq(aiAgentRuns.status, "failed")));
  return [
    `Pending approvals: ${Number(pending?.c ?? 0)}`,
    `Last 24h: ${Number(recent?.runs ?? 0)} agent runs, $${Number(recent?.cost ?? 0).toFixed(2)} spent, ${Number(failed[0]?.c ?? 0)} failed`,
  ].join("\n");
}
