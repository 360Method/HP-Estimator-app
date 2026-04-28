/**
 * server/integratorStream.ts
 *
 * Server-Sent Events streaming endpoint for the Visionary Console
 * Integrator chat. The /admin/chat tRPC `send` mutation still exists for
 * the legacy chat surface; this endpoint is the streaming variant the
 * console at /admin/visionary uses.
 *
 * Wire format (per SSE spec, one event per `\n\n` block):
 *   event: delta        — incremental text from the assistant
 *   data: {"text":"..."}
 *
 *   event: tool_use     — emitted once per tool the model wants to call
 *   data: {"key":"...","input":{...},"requiresApproval":boolean}
 *
 *   event: tool_result  — emitted after each non-approval tool runs
 *   data: {"key":"...","output":...}  OR  {"key":"...","error":"..."}
 *
 *   event: done         — final summary (cost, tokens, persisted message id)
 *   data: {"messageId":N,"costUsd":"0.0042","inputTokens":N,"outputTokens":N,"needsApproval":false}
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
const MAX_TOKENS = 2048;

const VISIONARY_PROMPT_ADDENDUM = `\n\n[Visionary Console]\nMarcin runs Handy Pioneers from the Visionary Console at /admin/visionary. When he gives you a directive, route it to the right team via the agentTeams_assignTask tool. Use agentTeams_list first to find the right team, then agentTeams_broadcast for context the team needs. Stream your reasoning as you work — short, action-first sentences.`;

function sse(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
  // Flush — express + node http buffer aggressively otherwise.
  // @ts-expect-error flush exists at runtime in some setups
  if (typeof res.flush === "function") res.flush();
}

export function registerIntegratorStreamRoutes(app: Express): void {
  app.post(
    "/api/admin/integrator-stream",
    express.json({ limit: "1mb" }),
    async (req: Request, res: Response) => {
      // 1) Auth + admin check
      let user;
      try {
        user = await sdk.authenticateRequest(req);
      } catch {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      if (!user || (user as { role?: string }).role !== "admin") {
        res.status(403).json({ error: "Admin only" });
        return;
      }

      const body = (req.body ?? {}) as { conversationId?: number; message?: string };
      const conversationId = Number(body.conversationId);
      const message = String(body.message ?? "").trim();
      if (!conversationId || !message) {
        res.status(400).json({ error: "conversationId and message required" });
        return;
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        res.status(500).json({ error: "ANTHROPIC_API_KEY not set" });
        return;
      }

      const d = await getDb();
      if (!d) {
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
        res.status(412).json({ error: "No integrator agent seeded. Run scripts/seed-ai-agents.mjs." });
        return;
      }

      // 4) Begin SSE response
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();

      // Heartbeat so reverse proxies don't hang up the long-poll.
      const heartbeat = setInterval(() => {
        res.write(": heartbeat\n\n");
      }, 15_000);
      req.on("close", () => clearInterval(heartbeat));

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

        // 8) Stream
        const client = new Anthropic({ apiKey });
        const stream = client.messages.stream({
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

        stream.on("text", (textDelta: string) => {
          sse(res, "delta", { text: textDelta });
        });

        const finalMessage = await stream.finalMessage();

        const inputTokens = finalMessage.usage.input_tokens;
        const outputTokens = finalMessage.usage.output_tokens;
        const costUsd = priceRun({ model: integrator.model, inputTokens, outputTokens });

        // 9) Parse the final message for text + tool requests
        const textParts: string[] = [];
        const toolRequests: Array<{ key: string; input: Record<string, unknown>; name: string }> = [];
        for (const block of finalMessage.content) {
          if (block.type === "text") textParts.push(block.text);
          else if (block.type === "tool_use") {
            let key = block.name;
            for (const tk of toolKeys) {
              const def = getTool(tk);
              if (def?.definition.name === block.name) {
                key = tk;
                break;
              }
            }
            toolRequests.push({ key, input: block.input as Record<string, unknown>, name: block.name });
          }
        }
        const text = textParts.join("\n\n");

        // 10) Synthetic task row to give tool handlers a ctx.taskId
        const taskInsert = await d.insert(aiAgentTasks).values({
          agentId: integrator.id,
          triggerType: "manual",
          triggerPayload: JSON.stringify({ via: "visionary_console_stream", conversationId }),
          status: "running",
          startedAt: new Date(),
        });
        const taskId = Number((taskInsert as { insertId?: number }).insertId ?? 0);

        // 11) Execute tools (or park for approval)
        const toolCallsLog: Array<{
          key: string;
          input: unknown;
          output?: unknown;
          error?: string;
          requiresApproval?: boolean;
        }> = [];

        for (const req of toolRequests) {
          const tool = getTool(req.key);
          sse(res, "tool_use", {
            key: req.key,
            input: req.input,
            requiresApproval: tool?.requiresApproval ?? false,
          });
          if (!tool) {
            toolCallsLog.push({ key: req.key, input: req.input, error: "Unknown tool" });
            sse(res, "tool_result", { key: req.key, error: "Unknown tool" });
            continue;
          }
          if (tool.requiresApproval) {
            toolCallsLog.push({ key: req.key, input: req.input, requiresApproval: true });
            continue;
          }
          try {
            const out = await tool.handler({
              input: req.input,
              ctx: { agentId: integrator.id, taskId, db: d },
            });
            toolCallsLog.push({ key: req.key, input: req.input, output: out });
            sse(res, "tool_result", { key: req.key, output: out });
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            toolCallsLog.push({ key: req.key, input: req.input, error: errMsg });
            sse(res, "tool_result", { key: req.key, error: errMsg });
          }
        }

        const needsApproval = toolCallsLog.some((c) => c.requiresApproval);
        await d
          .update(aiAgentTasks)
          .set({
            status: needsApproval ? "awaiting_approval" : "completed",
            completedAt: needsApproval ? null : new Date(),
          })
          .where(eq(aiAgentTasks.id, taskId));

        // 12) Audit run + persist assistant message
        await d.insert(aiAgentRuns).values({
          taskId,
          agentId: integrator.id,
          input: message,
          output: text,
          toolCalls: JSON.stringify(toolCallsLog),
          inputTokens,
          outputTokens,
          costUsd: costUsd.toFixed(4),
          durationMs: 0,
          status: "success",
          errorMessage: null,
        });

        const assistantInsert = await d.insert(integratorChatMessages).values({
          conversationId,
          userId: user.id,
          role: "assistant",
          content: text,
          toolCalls: JSON.stringify(toolCallsLog),
          inputTokens,
          outputTokens,
          costUsd: costUsd.toFixed(4),
        });
        const assistantId = Number((assistantInsert as { insertId?: number }).insertId ?? 0);

        // 13) Conversation timestamp + auto-title
        const patch: Record<string, unknown> = { lastMessageAt: new Date() };
        if (!conv.title) patch.title = message.slice(0, 80);
        await d
          .update(integratorChatConversations)
          .set(patch)
          .where(eq(integratorChatConversations.id, conversationId));

        sse(res, "done", {
          messageId: assistantId,
          costUsd: costUsd.toFixed(4),
          inputTokens,
          outputTokens,
          needsApproval,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        sse(res, "error", { message: msg });
      } finally {
        clearInterval(heartbeat);
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
