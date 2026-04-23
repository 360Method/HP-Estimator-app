import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";

// In-memory per-user rate limiter (30 calls / 60 s). The pro app runs
// single-process on Railway, so this is sufficient. If we scale to multiple
// instances, swap for a Redis-backed counter.
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
      message: `Forge proxy rate limit exceeded (${RATE_LIMIT_MAX} calls/minute).`,
    });
  }
  bucket.count += 1;
}

const ALLOWED_PATHS = new Set(["chat/completions"]);

export const forgeRouter = router({
  // Proxies an authenticated user's request to the Forge API using the
  // server-held BUILT_IN_FORGE_API_KEY. The client never sees the key.
  proxy: protectedProcedure
    .input(
      z.object({
        path: z.string().min(1).max(128),
        params: z.record(z.any()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      checkRateLimit(ctx.user.id);

      const path = input.path.replace(/^\/+/, "");
      if (!ALLOWED_PATHS.has(path)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Forge proxy path not allowed: ${path}`,
        });
      }

      if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Forge API is not configured on the server.",
        });
      }

      const base = ENV.forgeApiUrl.endsWith("/") ? ENV.forgeApiUrl : `${ENV.forgeApiUrl}/`;
      const url = `${base}${path}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ENV.forgeApiKey}`,
        },
        body: JSON.stringify(input.params),
      });

      const text = await response.text();
      if (!response.ok) {
        console.warn(
          `[forge.proxy] upstream ${response.status} for ${path}:`,
          text.slice(0, 300)
        );
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: `Forge upstream error ${response.status}`,
        });
      }

      try {
        return JSON.parse(text);
      } catch {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "Forge response was not valid JSON",
        });
      }
    }),
});
