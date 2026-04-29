/**
 * tRPC router for the database reactivation campaign.
 *
 * Endpoints:
 *   listCampaigns                — list all reengagement campaigns
 *   createCampaign               — create a new cohort run
 *   listDrafts(campaignId, segment?, status?) — drafts for the review UI
 *   updateDraft                  — edit subject/body inline
 *   approveDraft / rejectDraft   — single-row decisions
 *   bulkApproveSegment           — approve everything in a segment for a campaign
 *   regenerate                   — discard pending drafts and re-run the generator
 *   stats                        — counts per segment for the stat strip
 *   segmentPreview               — dry-run segmentation against a leadSource filter
 *   generateForCustomers         — generate drafts for an explicit customer id list
 *   sendTestEmail                — send a single approved draft to an override address (synthetic test)
 *
 * All endpoints are admin-gated.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  reengagementCampaigns,
  reengagementDrafts,
} from "../../drizzle/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { generateDraftsForCampaign } from "../lib/reengagement/draftGenerator";
import { segmentAll, buildCustomerHistory } from "../lib/reengagement/segmenter";
import { sendEmail } from "../gmail";

const segmentEnum = z.enum(["hot", "warm", "cold", "custom"]);
const draftSegmentEnum = z.enum(["hot", "warm", "cold"]);
const draftStatusEnum = z.enum([
  "pending",
  "approved",
  "rejected",
  "queued",
  "sent",
  "bounced",
  "replied",
  "failed",
]);
const channelEnum = z.enum(["email", "sms"]);

export const reengagementRouter = router({
  listCampaigns: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    return db
      .select()
      .from(reengagementCampaigns)
      .orderBy(desc(reengagementCampaigns.createdAt));
  }),

  createCampaign: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(160),
        segment: segmentEnum.default("custom"),
        description: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const result = await db.insert(reengagementCampaigns).values({
        name: input.name,
        segment: input.segment,
        description: input.description,
        createdBy: ctx.user?.email ?? ctx.user?.openId ?? null,
        status: "draft",
      });
      const insertId = Number((result as unknown as { insertId: number | string }).insertId);
      const [row] = await db
        .select()
        .from(reengagementCampaigns)
        .where(eq(reengagementCampaigns.id, insertId))
        .limit(1);
      return row;
    }),

  segmentPreview: adminProcedure
    .input(
      z.object({
        leadSourceLike: z.string().max(64).optional(),
      }).optional(),
    )
    .query(async ({ input }) => {
      const segments = await segmentAll({ leadSourceLike: input?.leadSourceLike });
      const summarize = (arr: { customerId: string; firstName: string; lastName: string; email: string; mobilePhone: string; lastWorkDate: string | null; lastWorkSummary: string }[]) =>
        arr.slice(0, 50).map((c) => ({
          customerId: c.customerId,
          name: `${c.firstName} ${c.lastName}`.trim() || "(no name)",
          email: c.email,
          phone: c.mobilePhone,
          lastWorkDate: c.lastWorkDate,
          lastWorkSummary: c.lastWorkSummary,
        }));
      return {
        counts: {
          hot: segments.hot.length,
          warm: segments.warm.length,
          cold: segments.cold.length,
          skipped: segments.skipped.length,
        },
        skippedReasons: segments.skipped.reduce<Record<string, number>>((acc, s) => {
          acc[s.reason] = (acc[s.reason] ?? 0) + 1;
          return acc;
        }, {}),
        sample: {
          hot: summarize(segments.hot),
          warm: summarize(segments.warm),
          cold: summarize(segments.cold),
        },
      };
    }),

  generateForCustomers: adminProcedure
    .input(
      z.object({
        campaignId: z.number().int(),
        customerIds: z.array(z.string()).min(1).max(500),
      }),
    )
    .mutation(async ({ input }) => {
      // Run generation in-process. For large batches the caller should pass
      // a smaller customerIds list — the pilot is 20.
      const result = await generateDraftsForCampaign({
        campaignId: input.campaignId,
        customerIds: input.customerIds,
        verbose: true,
      });
      return result;
    }),

  generatePilot: adminProcedure
    .input(
      z.object({
        campaignId: z.number().int(),
        segment: draftSegmentEnum,
        limit: z.number().int().min(1).max(100).default(20),
        leadSourceLike: z.string().max(64).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      // Run a fresh segmentation, take the first N from the requested bucket,
      // and generate drafts for them. Used for "Generate 20 HOT pilot drafts".
      const segments = await segmentAll({ leadSourceLike: input.leadSourceLike });
      const cohort = segments[input.segment].slice(0, input.limit);
      if (cohort.length === 0) {
        return { generated: 0, skipped: [], errors: [], draftIds: [], cohortSize: 0 };
      }
      const result = await generateDraftsForCampaign({
        campaignId: input.campaignId,
        customerIds: cohort.map((c) => c.customerId),
        verbose: true,
      });
      return { ...result, cohortSize: cohort.length };
    }),

  listDrafts: adminProcedure
    .input(
      z.object({
        campaignId: z.number().int(),
        segment: draftSegmentEnum.optional(),
        status: draftStatusEnum.optional(),
        channel: channelEnum.optional(),
        limit: z.number().int().min(1).max(500).default(200),
      }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const conditions = [eq(reengagementDrafts.campaignId, input.campaignId)];
      if (input.segment) conditions.push(eq(reengagementDrafts.segment, input.segment));
      if (input.status) conditions.push(eq(reengagementDrafts.status, input.status));
      if (input.channel) conditions.push(eq(reengagementDrafts.channel, input.channel));
      return db
        .select()
        .from(reengagementDrafts)
        .where(and(...conditions))
        .orderBy(desc(reengagementDrafts.createdAt))
        .limit(input.limit);
    }),

  stats: adminProcedure
    .input(z.object({ campaignId: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db
        .select({
          segment: reengagementDrafts.segment,
          channel: reengagementDrafts.channel,
          status: reengagementDrafts.status,
          n: sql<number>`COUNT(*)`,
        })
        .from(reengagementDrafts)
        .where(eq(reengagementDrafts.campaignId, input.campaignId))
        .groupBy(reengagementDrafts.segment, reengagementDrafts.channel, reengagementDrafts.status);
      return rows.map((r) => ({ ...r, n: Number(r.n) }));
    }),

  updateDraft: adminProcedure
    .input(
      z.object({
        id: z.number().int(),
        subject: z.string().max(300).optional(),
        body: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.subject !== undefined) patch.subject = input.subject;
      if (input.body !== undefined) patch.body = input.body;
      await db
        .update(reengagementDrafts)
        .set(patch)
        .where(eq(reengagementDrafts.id, input.id));
      return { ok: true };
    }),

  approveDraft: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db
        .update(reengagementDrafts)
        .set({
          status: "approved",
          approvedBy: ctx.user?.email ?? ctx.user?.openId ?? null,
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(reengagementDrafts.id, input.id));
      return { ok: true };
    }),

  rejectDraft: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db
        .update(reengagementDrafts)
        .set({ status: "rejected", updatedAt: new Date() })
        .where(eq(reengagementDrafts.id, input.id));
      return { ok: true };
    }),

  bulkApproveSegment: adminProcedure
    .input(
      z.object({
        campaignId: z.number().int(),
        segment: draftSegmentEnum,
        channel: channelEnum.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const conditions = [
        eq(reengagementDrafts.campaignId, input.campaignId),
        eq(reengagementDrafts.segment, input.segment),
        eq(reengagementDrafts.status, "pending"),
      ];
      if (input.channel) conditions.push(eq(reengagementDrafts.channel, input.channel));
      await db
        .update(reengagementDrafts)
        .set({
          status: "approved",
          approvedBy: ctx.user?.email ?? ctx.user?.openId ?? null,
          approvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(...conditions));
      return { ok: true };
    }),

  /**
   * Synthetic test send — bypasses pacing/approval. Sends the rendered draft
   * body+subject to a test address you control. Used for the "Marcin reviews
   * a single email lands in inbox" verification step.
   */
  sendTestEmail: adminProcedure
    .input(
      z.object({
        draftId: z.number().int(),
        toEmail: z.string().email(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [draft] = await db
        .select()
        .from(reengagementDrafts)
        .where(eq(reengagementDrafts.id, input.draftId))
        .limit(1);
      if (!draft) throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
      if (draft.channel !== "email") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Test send only supported for email drafts" });
      }
      const { messageId } = await sendEmail({
        to: input.toEmail,
        subject: `[TEST] ${draft.subject ?? "Re-engagement draft"}`,
        body: `[This is a synthetic test send — not delivered to the real customer.]\n\n${draft.body}`,
      });
      return { messageId };
    }),

  /**
   * Inspect a single customer's history (for debugging draft quality).
   */
  customerHistory: adminProcedure
    .input(z.object({ customerId: z.string() }))
    .query(async ({ input }) => {
      const h = await buildCustomerHistory(input.customerId);
      return h;
    }),
});
