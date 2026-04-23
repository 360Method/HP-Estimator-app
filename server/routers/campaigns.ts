/**
 * Campaigns — marketing blasts to a static recipient list.
 * Distinct from automations (per-event triggers); campaigns are one-shot
 * sends with per-recipient tracking for opens/clicks/bounces.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { campaigns, campaignRecipients, campaignSends } from "../../drizzle/schema";
import { and, desc, eq } from "drizzle-orm";

const channelEnum = z.enum(["email", "sms"]);
const statusEnum = z.enum(["draft", "scheduled", "sending", "sent", "cancelled"]);

export const campaignsRouter = router({
  list: protectedProcedure
    .input(z.object({ status: statusEnum.optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const base = db.select().from(campaigns);
      const rows = input?.status
        ? await base.where(eq(campaigns.status, input.status)).orderBy(desc(campaigns.createdAt))
        : await base.orderBy(desc(campaigns.createdAt));
      return rows;
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [row] = await db.select().from(campaigns).where(eq(campaigns.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found" });
      return row;
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(160),
        channel: channelEnum.default("email"),
        emailTemplateId: z.number().int().optional(),
        subjectOverride: z.string().max(300).optional(),
        smsBody: z.string().optional(),
        scheduledAt: z.string().datetime().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [row] = await db
        .insert(campaigns)
        .values({
          name: input.name,
          channel: input.channel,
          emailTemplateId: input.emailTemplateId,
          subjectOverride: input.subjectOverride,
          smsBody: input.smsBody,
          scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
          createdBy: ctx.user?.email ?? ctx.user?.openId ?? null,
          status: "draft",
        })
        .returning();
      return row;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        name: z.string().min(1).max(160).optional(),
        channel: channelEnum.optional(),
        emailTemplateId: z.number().int().nullable().optional(),
        subjectOverride: z.string().max(300).nullable().optional(),
        smsBody: z.string().nullable().optional(),
        scheduledAt: z.string().datetime().nullable().optional(),
        status: statusEnum.optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { id, scheduledAt, ...rest } = input;
      const patch: Record<string, unknown> = { ...rest, updatedAt: new Date() };
      if (scheduledAt !== undefined) patch.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
      await db.update(campaigns).set(patch).where(eq(campaigns.id, id));
      return { ok: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.delete(campaignSends).where(eq(campaignSends.campaignId, input.id));
      await db.delete(campaignRecipients).where(eq(campaignRecipients.campaignId, input.id));
      await db.delete(campaigns).where(eq(campaigns.id, input.id));
      return { ok: true };
    }),

  // ── Recipients ──────────────────────────────────────────────────────────────
  listRecipients: protectedProcedure
    .input(z.object({ campaignId: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      return db
        .select()
        .from(campaignRecipients)
        .where(eq(campaignRecipients.campaignId, input.campaignId))
        .orderBy(campaignRecipients.id);
    }),

  addRecipients: protectedProcedure
    .input(
      z.object({
        campaignId: z.number().int(),
        recipients: z.array(
          z.object({
            customerId: z.string().max(64).optional(),
            email: z.string().email().max(320).optional(),
            phone: z.string().max(32).optional(),
            mergeVars: z.record(z.string(), z.string()).optional(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      if (input.recipients.length === 0) return { added: 0 };
      const rows = input.recipients.map((r) => ({
        campaignId: input.campaignId,
        customerId: r.customerId,
        email: r.email,
        phone: r.phone,
        mergeVars: r.mergeVars ? JSON.stringify(r.mergeVars) : null,
      }));
      await db.insert(campaignRecipients).values(rows);
      // Refresh recipient count on the campaign
      const all = await db
        .select()
        .from(campaignRecipients)
        .where(eq(campaignRecipients.campaignId, input.campaignId));
      await db
        .update(campaigns)
        .set({ recipientCount: all.length, updatedAt: new Date() })
        .where(eq(campaigns.id, input.campaignId));
      return { added: rows.length };
    }),

  removeRecipient: protectedProcedure
    .input(z.object({ recipientId: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [row] = await db
        .select()
        .from(campaignRecipients)
        .where(eq(campaignRecipients.id, input.recipientId))
        .limit(1);
      if (!row) return { ok: true };
      await db.delete(campaignRecipients).where(eq(campaignRecipients.id, input.recipientId));
      const remaining = await db
        .select()
        .from(campaignRecipients)
        .where(eq(campaignRecipients.campaignId, row.campaignId));
      await db
        .update(campaigns)
        .set({ recipientCount: remaining.length, updatedAt: new Date() })
        .where(eq(campaigns.id, row.campaignId));
      return { ok: true };
    }),

  // ── Send history ────────────────────────────────────────────────────────────
  listSends: protectedProcedure
    .input(z.object({ campaignId: z.number().int(), limit: z.number().int().max(500).default(100) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      return db
        .select()
        .from(campaignSends)
        .where(eq(campaignSends.campaignId, input.campaignId))
        .orderBy(desc(campaignSends.id))
        .limit(input.limit);
    }),
});
