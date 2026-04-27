/**
 * Google Business Profile tRPC router.
 * Manages OAuth connection and provides read + draft-only agent tools.
 * NO review or post is ever submitted automatically — agents draft, humans send.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { ENV } from "../_core/env";
import { getDb } from "../db";
import { gbpTokens } from "../../drizzle/schema";
import { getGbpTokens, getValidGbpAccessToken, revokeGbpToken } from "../integrations/gbp/oauth";

async function gbpGet(path: string, token: string) {
  const resp = await fetch(`https://mybusiness.googleapis.com/v4/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`GBP API ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

export const gbpRouter = router({
  getConnectionStatus: protectedProcedure.query(async () => {
    const configured = !!(ENV.gbpClientId && ENV.gbpClientSecret);
    if (!configured) return { configured: false, connected: false, accountId: null, locationId: null };
    const tokens = await getGbpTokens();
    return {
      configured: true,
      connected: !!tokens,
      accountId: tokens?.accountId ?? null,
      locationId: tokens?.locationId ?? null,
      connectedAt: tokens?.connectedAt ?? null,
    };
  }),

  disconnect: protectedProcedure.mutation(async () => {
    const tokens = await getGbpTokens();
    if (!tokens) return { success: true };
    await revokeGbpToken(tokens.accessToken).catch(() => null);
    const db = await getDb();
    if (db) {
      const { eq } = await import("drizzle-orm");
      await db.delete(gbpTokens).where(eq(gbpTokens.id, tokens.id));
    }
    return { success: true };
  }),

  setLocation: protectedProcedure
    .input(z.object({ locationId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { eq } = await import("drizzle-orm");
      const tokens = await getGbpTokens();
      if (!tokens) throw new Error("GBP not connected");
      await db.update(gbpTokens).set({ locationId: input.locationId }).where(eq(gbpTokens.id, tokens.id));
      return { success: true };
    }),

  listLocations: protectedProcedure.query(async () => {
    const auth = await getValidGbpAccessToken();
    if (!auth) throw new Error("GBP not connected");

    const data = await gbpGet(`accounts/${auth.accountId}/locations`, auth.token);
    return (data.locations ?? []) as Array<{ name: string; locationName: string; storeCode?: string }>;
  }),

  // ── Agent tools (draft mode — read only) ─────────────────────────────────
  fetchReviews: protectedProcedure
    .input(z.object({ locationId: z.string().optional(), pageSize: z.number().min(1).max(50).default(20) }))
    .query(async ({ input }) => {
      const auth = await getValidGbpAccessToken();
      if (!auth) throw new Error("GBP not connected");

      const tokens = await getGbpTokens();
      const locationId = input.locationId ?? tokens?.locationId;
      if (!locationId) throw new Error("No location selected. Set a location first.");

      const data = await gbpGet(`${locationId}/reviews?pageSize=${input.pageSize}`, auth.token);
      return (data.reviews ?? []) as Array<{
        name: string;
        reviewer: { displayName: string; profilePhotoUrl?: string };
        starRating: string;
        comment?: string;
        createTime: string;
        updateTime: string;
        reviewReply?: { comment: string; updateTime: string };
      }>;
    }),

  draftReviewResponse: protectedProcedure
    .input(z.object({
      reviewName: z.string(),
      reviewComment: z.string().optional(),
      starRating: z.string(),
      reviewerName: z.string(),
    }))
    .mutation(async ({ input }) => {
      // Draft-only: generate response text but never auto-post
      return {
        draft: true,
        reviewName: input.reviewName,
        suggestedReply: `Hi ${input.reviewerName}, thank you for your ${input.starRating.toLowerCase()} review! ${input.reviewComment ? "We appreciate your feedback." : "We value your business and look forward to serving you again."} — The Handy Pioneers Team`,
        note: "Review this draft in /admin/marketing/reviews before posting.",
      };
    }),

  draftPostUpdate: protectedProcedure
    .input(z.object({
      topic: z.string(),
      callToAction: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // Draft-only: surface in inbox for human approval before posting
      return {
        draft: true,
        topic: input.topic,
        suggestedPost: `${input.topic}${input.callToAction ? ` — ${input.callToAction}` : ""}\n\nHandy Pioneers | Licensed & Insured | Vancouver, WA | (360) 544-9858`,
        note: "Review this draft in /admin/marketing/posts before publishing.",
      };
    }),
});
