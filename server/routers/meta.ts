/**
 * Meta (Facebook / Instagram) tRPC router.
 * System-user token pattern — no per-user OAuth.
 * Agents may fetch data and draft content; nothing is posted automatically.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { ENV } from "../_core/env";
import { getDb } from "../db";
import { metaConnections } from "../../drizzle/schema";
import {
  isMetaConfigured,
  verifyMetaToken,
  fetchAdInsights,
  listMetaPages,
  fetchPageMessages,
} from "../integrations/meta/client";

async function getMetaConnection() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(metaConnections).limit(1);
  return rows[0] ?? null;
}

export const metaRouter = router({
  getConnectionStatus: protectedProcedure.query(async () => {
    const configured = isMetaConfigured();
    if (!configured) {
      return { configured: false, connected: false, adAccountId: null, tokenStatus: null, lastVerifiedAt: null };
    }
    const conn = await getMetaConnection();
    return {
      configured: true,
      connected: conn?.tokenStatus === "active",
      adAccountId: ENV.metaAdAccountId || null,
      tokenStatus: conn?.tokenStatus ?? "unknown",
      lastVerifiedAt: conn?.lastVerifiedAt ?? null,
    };
  }),

  verifyToken: protectedProcedure.mutation(async () => {
    if (!isMetaConfigured()) throw new Error("META_SYSTEM_USER_TOKEN not configured");
    const result = await verifyMetaToken();

    const db = await getDb();
    if (db) {
      const { eq } = await import("drizzle-orm");
      const conn = await getMetaConnection();
      const now = new Date();
      const status = result.valid ? "active" : "expired";
      if (conn) {
        await db.update(metaConnections).set({ tokenStatus: status, lastVerifiedAt: now }).where(eq(metaConnections.id, conn.id));
      } else {
        const pages = result.valid ? await listMetaPages().catch(() => []) : [];
        await db.insert(metaConnections).values({
          adAccountId: ENV.metaAdAccountId,
          pageIds: JSON.stringify(pages.map(p => p.id)),
          tokenStatus: status,
          lastVerifiedAt: now,
        });
      }
    }
    return result;
  }),

  // ── Agent tools (draft mode — read only) ─────────────────────────────────
  fetchAdInsights: protectedProcedure
    .input(z.object({
      datePreset: z.string().default("last_30d"),
      limit: z.number().min(1).max(100).default(25),
    }))
    .query(async ({ input }) => {
      if (!isMetaConfigured()) throw new Error("Meta not configured");
      return fetchAdInsights({ datePreset: input.datePreset, limit: input.limit });
    }),

  fetchPageMessages: protectedProcedure
    .input(z.object({ pageId: z.string(), limit: z.number().min(1).max(50).default(20) }))
    .query(async ({ input }) => {
      if (!isMetaConfigured()) throw new Error("Meta not configured");
      return fetchPageMessages(input.pageId, input.limit);
    }),

  draftAdCreative: protectedProcedure
    .input(z.object({
      objective: z.string(),
      targetAudience: z.string().optional(),
      headline: z.string().optional(),
      bodyText: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // Draft-only — never auto-submit to Meta Ads Manager
      return {
        draft: true,
        headline: input.headline ?? `${input.objective} — Handy Pioneers`,
        primaryText: input.bodyText ?? `Looking for reliable home repair? Handy Pioneers delivers quality work with written scope. ${input.targetAudience ? `Perfect for ${input.targetAudience}.` : ""}`,
        callToAction: "LEARN_MORE",
        note: "Review this draft in /admin/marketing/ads before submitting to Meta Ads Manager.",
      };
    }),

  draftPageReply: protectedProcedure
    .input(z.object({
      senderName: z.string(),
      messageSnippet: z.string(),
      context: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // Draft-only — never auto-send via Messenger
      return {
        draft: true,
        suggestedReply: `Hi ${input.senderName}, thanks for reaching out to Handy Pioneers! ${input.context ?? "We'd love to help with your home repair needs."}  Please call us at (360) 544-9858 or visit handypioneers.com to schedule a free consultation.`,
        note: "Review this draft in /admin/marketing/messages before sending.",
      };
    }),
});
