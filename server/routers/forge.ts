import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";

// Client-facing LLM proxy.
//
// Historical name: "forge" — kept for client-contract compatibility with
// CalculatorSection.tsx which calls `trpcClient.forge.proxy.mutate({ path,
// params })`. Internally this now dispatches to Anthropic's Messages API via
// invokeLLM. No third-party LLM provider is contacted.

// ─── Rate limit: 30 calls / 60s / user, in-memory ──────────────────────────
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateLimitBuckets = new Map<number, { count: number; windowStart: number }>();

function checkRateLimit(userId: number) {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(userId);
  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(userId, { count: 1, windowStart: now });
    return;
  }
  if (bucket.count >= RATE_LIMIT_MAX) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `AI proxy rate limit exceeded (${RATE_LIMIT_MAX} calls/minute).`,
    });
  }
  bucket.count += 1;
}

// Brand-appropriate system prompt for the Calculator's cost-range analysis.
// Voice guardrails from the brand style: no "handyman", "cheap", "affordable",
// "simple", "easy". "Pricing analyst" framing keeps the LLM on task.
const CALCULATOR_SYSTEM_PROMPT =
  "You are a pricing analyst for a home services company operating in the Pacific Northwest. Respond only with JSON. No prose, no markdown fences, no commentary.";

const ALLOWED_PATHS = new Set(["chat/completions"]);

// Message shape the Calculator currently sends — OpenAI-style { role, content }.
const chatMessage = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

// Accept the lenient shape the browser historically posted to Forge. Only the
// fields we actually forward are enforced; anything else is dropped silently.
const chatParams = z
  .object({
    model: z.string().optional(),
    messages: z.array(chatMessage).min(1),
    max_tokens: z.number().int().positive().max(8000).optional(),
  })
  .passthrough();

export const forgeRouter = router({
  // Mutation name `proxy` kept for client compatibility. The upstream is now
  // Anthropic, not Forge — but the returned shape
  // `{ choices: [{ message: { content } }] }` is preserved.
  proxy: protectedProcedure
    .input(
      z.object({
        path: z.string().min(1).max(128),
        params: chatParams,
      })
    )
    .mutation(async ({ ctx, input }) => {
      checkRateLimit(ctx.user.id);

      const path = input.path.replace(/^\/+/, "");
      if (!ALLOWED_PATHS.has(path)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `AI proxy path not allowed: ${path}`,
        });
      }

      const messages = input.params.messages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      try {
        const result = await invokeLLM({
          messages,
          max_tokens: input.params.max_tokens ?? 500,
          systemOverride: CALCULATOR_SYSTEM_PROMPT,
        });
        const content = result.choices[0]?.message?.content ?? "";
        return {
          choices: [
            {
              message: { role: "assistant" as const, content },
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[forge.proxy] Anthropic upstream error:`, message);
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "AI upstream error",
        });
      }
    }),
});
