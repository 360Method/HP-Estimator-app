/**
 * server/routers/integratorChat.ts
 *
 * Marcin's chat with the Integrator AI. The Integrator is the ai_agents row
 * in department='integrator' (created by seed-ai-agents.mjs). This router:
 *
 *   - listConversations: paginate the user's chat sessions
 *   - createConversation: open a new session
 *   - listMessages: load history for one conversation
 *   - send: append a user message, call Anthropic with the integrator's
 *     systemPrompt + recent context, persist the assistant reply, return both.
 *
 * Tools are loaded from ai_agent_tools for the integrator agent — same set
 * the runtime uses, so a chat-driven action and an autonomous action go
 * through identical authorization.
 */

import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  aiAgents,
  aiAgentRuns,
  aiAgentTasks,
  aiAgentTools,
  integratorChatConversations,
  integratorChatMessages,
} from "../../drizzle/schema";
import { getAnthropicToolDefinitions, getTool } from "../lib/agentRuntime/tools";
import { priceRun } from "../lib/agentRuntime/pricing";
// Side-effect: registers Phase-2 tool wrappers.
import "../lib/agentRuntime/phase2Tools";

const MAX_HISTORY_MSGS = 30;
const MAX_TOKENS = 2048;

async function db() {
  const d = await getDb();
  if (!d) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return d;
}

async function getIntegratorAgent() {
  const d = await db();
  const [agent] = await d
    .select()
    .from(aiAgents)
    .where(eq(aiAgents.department, "integrator"))
    .limit(1);
  return agent ?? null;
}

export const integratorChatRouter = router({
  listConversations: adminProcedure.query(async ({ ctx }) => {
    const d = await db();
    const rows = await d
      .select()
      .from(integratorChatConversations)
      .where(
        and(
          eq(integratorChatConversations.userId, ctx.user.id),
          eq(integratorChatConversations.archived, false)
        )
      )
      .orderBy(desc(integratorChatConversations.updatedAt))
      .limit(50);
    return rows;
  }),

  createConversation: adminProcedure
    .input(z.object({ title: z.string().max(200).optional() }))
    .mutation(async ({ ctx, input }) => {
      const d = await db();
      const inserted = await d.insert(integratorChatConversations).values({
        userId: ctx.user.id,
        title: input.title ?? null,
      });
      const id = Number((inserted as { insertId?: number }).insertId ?? 0);
      return { id };
    }),

  archiveConversation: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const d = await db();
      await d
        .update(integratorChatConversations)
        .set({ archived: true })
        .where(
          and(
            eq(integratorChatConversations.id, input.id),
            eq(integratorChatConversations.userId, ctx.user.id)
          )
        );
      return { ok: true };
    }),

  listMessages: adminProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ ctx, input }) => {
      const d = await db();
      const [conv] = await d
        .select()
        .from(integratorChatConversations)
        .where(eq(integratorChatConversations.id, input.conversationId))
        .limit(1);
      if (!conv || conv.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      }
      const rows = await d
        .select()
        .from(integratorChatMessages)
        .where(eq(integratorChatMessages.conversationId, input.conversationId))
        .orderBy(asc(integratorChatMessages.createdAt));
      return rows;
    }),

  /**
   * Append a user message, call the Integrator agent's model, persist the
   * reply, return both rows. Single-turn for now — matches the behavior of
   * the autonomous runtime. Tool calls that don't require approval execute
   * inline and are recorded on the assistant message.
   */
  send: adminProcedure
    .input(z.object({ conversationId: z.number(), message: z.string().min(1).max(20_000) }))
    .mutation(async ({ ctx, input }) => {
      const d = await db();
      const [conv] = await d
        .select()
        .from(integratorChatConversations)
        .where(eq(integratorChatConversations.id, input.conversationId))
        .limit(1);
      if (!conv || conv.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      }

      const integrator = await getIntegratorAgent();
      if (!integrator) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No integrator agent seeded. Run scripts/seed-ai-agents.mjs first.",
        });
      }

      // 1) Persist user message
      await d.insert(integratorChatMessages).values({
        conversationId: input.conversationId,
        userId: ctx.user.id,
        role: "user",
        content: input.message,
      });

      // 2) Load recent history (last 30 messages, ascending)
      const history = await d
        .select()
        .from(integratorChatMessages)
        .where(eq(integratorChatMessages.conversationId, input.conversationId))
        .orderBy(desc(integratorChatMessages.createdAt))
        .limit(MAX_HISTORY_MSGS);
      history.reverse();

      // 3) Authorized tools for the integrator agent
      const toolRows = await d
        .select()
        .from(aiAgentTools)
        .where(and(eq(aiAgentTools.agentId, integrator.id), eq(aiAgentTools.authorized, true)));
      const toolKeys = toolRows.map((t) => t.toolKey);
      const toolDefs = getAnthropicToolDefinitions(toolKeys);

      // 4) Build context briefing (recent agent runs, pending approvals)
      const briefing = await buildContextBriefing();

      // 5) Call Anthropic
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "ANTHROPIC_API_KEY not set" });
      }
      const client = new Anthropic({ apiKey });

      const messages: Anthropic.MessageParam[] = history.map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      }));

      let response: Anthropic.Message;
      try {
        response = await client.messages.create({
          model: integrator.model,
          max_tokens: MAX_TOKENS,
          system: [
            {
              type: "text",
              text: `${integrator.systemPrompt}\n\n[Live ops context]\n${briefing}`,
              cache_control: { type: "ephemeral" },
            },
          ],
          tools: toolDefs.length > 0 ? toolDefs : undefined,
          messages,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Anthropic call failed: ${msg}` });
      }

      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;
      const costUsd = priceRun({ model: integrator.model, inputTokens, outputTokens });

      // 6) Parse assistant response — text + tool requests
      const textParts: string[] = [];
      const toolRequests: Array<{ key: string; input: Record<string, unknown>; name: string }> = [];
      for (const block of response.content) {
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

      // 7) Execute non-approval tools inline; flag approval-required for UI
      const toolCallsLog: Array<{
        key: string;
        input: unknown;
        output?: unknown;
        error?: string;
        requiresApproval?: boolean;
      }> = [];

      // Create a synthetic task row so any tool that requires the agent runtime's
      // task context (e.g. kpis.record uses ctx.taskId) can write through cleanly.
      const taskInsert = await d.insert(aiAgentTasks).values({
        agentId: integrator.id,
        triggerType: "manual",
        triggerPayload: JSON.stringify({ via: "integrator_chat", conversationId: input.conversationId }),
        status: "running",
        startedAt: new Date(),
      });
      const taskId = Number((taskInsert as { insertId?: number }).insertId ?? 0);

      for (const req of toolRequests) {
        const tool = getTool(req.key);
        if (!tool) {
          toolCallsLog.push({ key: req.key, input: req.input, error: "Unknown tool" });
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
        } catch (err) {
          toolCallsLog.push({
            key: req.key,
            input: req.input,
            error: err instanceof Error ? err.message : String(err),
          });
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

      // 8) Persist run (audit trail) + assistant message
      await d.insert(aiAgentRuns).values({
        taskId,
        agentId: integrator.id,
        input: input.message,
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
        conversationId: input.conversationId,
        userId: ctx.user.id,
        role: "assistant",
        content: text,
        toolCalls: JSON.stringify(toolCallsLog),
        inputTokens,
        outputTokens,
        costUsd: costUsd.toFixed(4),
      });
      const assistantId = Number((assistantInsert as { insertId?: number }).insertId ?? 0);

      // 9) Update conversation timestamp + auto-title if blank
      const patch: Record<string, unknown> = { lastMessageAt: new Date() };
      if (!conv.title) {
        patch.title = input.message.slice(0, 80);
      }
      await d
        .update(integratorChatConversations)
        .set(patch)
        .where(eq(integratorChatConversations.id, input.conversationId));

      return {
        assistantMessageId: assistantId,
        text,
        toolCalls: toolCallsLog,
        costUsd,
        inputTokens,
        outputTokens,
        needsApproval,
      };
    }),

  /**
   * Convenience: create a fresh conversation seeded with a "share to integrator"
   * snapshot of the page the user came from. Powers the Share-to-Integrator
   * button.
   */
  startFromContext: adminProcedure
    .input(
      z.object({
        sourcePath: z.string().max(500),
        sourceTitle: z.string().max(200).optional(),
        snapshot: z.record(z.string(), z.unknown()).optional(),
        question: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const d = await db();
      const title = input.sourceTitle ? `From: ${input.sourceTitle}` : `From: ${input.sourcePath}`;
      const inserted = await d.insert(integratorChatConversations).values({
        userId: ctx.user.id,
        title: title.slice(0, 200),
      });
      const conversationId = Number((inserted as { insertId?: number }).insertId ?? 0);
      const intro = [
        `Context shared from ${input.sourcePath}.`,
        input.sourceTitle ? `Page: ${input.sourceTitle}` : null,
        input.snapshot ? `Snapshot:\n\`\`\`json\n${JSON.stringify(input.snapshot, null, 2)}\n\`\`\`` : null,
        input.question ? `\nQuestion: ${input.question}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      await d.insert(integratorChatMessages).values({
        conversationId,
        userId: ctx.user.id,
        role: "user",
        content: intro,
      });
      return { conversationId };
    }),
});

/**
 * Briefing handed to the Integrator: last 24h agent activity, pending
 * approvals, top KPI deltas. Compact — keep under ~1KB so it doesn't blow the
 * cache window for short user prompts.
 */
async function buildContextBriefing(): Promise<string> {
  const d = await db();
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
  const lines = [
    `Pending approvals: ${Number(pending?.c ?? 0)}`,
    `Last 24h: ${Number(recent?.runs ?? 0)} agent runs, $${Number(recent?.cost ?? 0).toFixed(2)} spent, ${Number(failed[0]?.c ?? 0)} failed`,
  ];
  return lines.join("\n");
}
