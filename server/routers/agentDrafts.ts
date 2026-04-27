/**
 * agentDrafts router — admin inbox for the Lead Nurturer.
 *
 * Surfaces:
 *   listScheduled  — pending drafts, soonest first. "Scheduled for tomorrow 9am."
 *   listReady      — generated drafts awaiting operator approval.
 *   listSent       — recent sent drafts (audit).
 *   approve        — send a ready draft via SMS or email.
 *   updateDraft    — edit subject/body before send (or while pending).
 *   reschedule     — move a pending draft to a new time.
 *   cancel         — cancel a pending or ready draft.
 *   generateNow    — force-generate a pending draft early (admin tool).
 *   triggerSyntheticForCustomer — admin-only — re-runs scheduleRoadmapFollowup
 *                    for an existing customer. Used by tests + by Marcin to
 *                    re-fire the cadence after manually clearing it.
 */
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  agentDrafts,
  customers,
  type AgentDraftStatus,
} from "../../drizzle/schema";
import {
  cancelPendingFollowupsForCustomer,
  runDueDrafts,
  scheduleRoadmapFollowup,
  sendDraft,
} from "../lib/leadNurturer/roadmapFollowup";

const STATUS_FILTER = z.enum(["pending", "ready", "sent", "cancelled", "failed"]);

export const agentDraftsRouter = router({
  /** Scheduled (pending) drafts. Default: soonest 50. */
  listScheduled: protectedProcedure
    .input(
      z
        .object({ customerId: z.string().optional(), limit: z.number().min(1).max(200).default(50) })
        .optional(),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const limit = input?.limit ?? 50;
      const where = input?.customerId
        ? and(eq(agentDrafts.status, "pending" as AgentDraftStatus), eq(agentDrafts.customerId, input.customerId))
        : eq(agentDrafts.status, "pending" as AgentDraftStatus);
      const rows = await db
        .select()
        .from(agentDrafts)
        .where(where)
        .orderBy(agentDrafts.scheduledFor)
        .limit(limit);
      return enrichWithCustomer(rows);
    }),

  /** Ready drafts — operator approves these. */
  listReady: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(200).default(50) }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const limit = input?.limit ?? 50;
      const rows = await db
        .select()
        .from(agentDrafts)
        .where(eq(agentDrafts.status, "ready" as AgentDraftStatus))
        .orderBy(desc(agentDrafts.generatedAt))
        .limit(limit);
      return enrichWithCustomer(rows);
    }),

  /** Recently sent or cancelled drafts (audit). */
  listRecent: protectedProcedure
    .input(
      z
        .object({
          status: STATUS_FILTER.default("sent"),
          limit: z.number().min(1).max(200).default(50),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const status = input?.status ?? "sent";
      const limit = input?.limit ?? 50;
      const rows = await db
        .select()
        .from(agentDrafts)
        .where(eq(agentDrafts.status, status as AgentDraftStatus))
        .orderBy(desc(agentDrafts.updatedAt))
        .limit(limit);
      return enrichWithCustomer(rows);
    }),

  /**
   * Drafts (pending + ready) for a single customer — surfaced inside the
   * customer profile's "Pending Your Review" section. Ready drafts come
   * first so the operator sees them without scrolling.
   */
  listForCustomer: protectedProcedure
    .input(z.object({ customerId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(agentDrafts)
        .where(
          and(
            eq(agentDrafts.customerId, input.customerId),
            // Surfacing: ready drafts (operator must approve) first; we also
            // include pending so the operator can see what's coming.
          ),
        )
        .orderBy(desc(agentDrafts.updatedAt))
        .limit(20);
      // Sort: ready first, then pending; cancelled/sent/failed excluded.
      const visible = rows.filter((r) => r.status === "ready" || r.status === "pending");
      visible.sort((a, b) => {
        if (a.status !== b.status) return a.status === "ready" ? -1 : 1;
        const aT = (a.updatedAt instanceof Date ? a.updatedAt : new Date(a.updatedAt as any)).getTime();
        const bT = (b.updatedAt instanceof Date ? b.updatedAt : new Date(b.updatedAt as any)).getTime();
        return bT - aT;
      });
      return visible;
    }),

  /** Counts for the inbox tab badges. */
  counts: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { pending: 0, ready: 0, sent: 0, failed: 0 };
    const counts = { pending: 0, ready: 0, sent: 0, failed: 0 };
    for (const status of Object.keys(counts) as Array<keyof typeof counts>) {
      const rows = await db
        .select()
        .from(agentDrafts)
        .where(eq(agentDrafts.status, status as AgentDraftStatus));
      counts[status] = rows.length;
    }
    return counts;
  }),

  /** Read a single draft (for the preview modal). */
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const rows = await db.select().from(agentDrafts).where(eq(agentDrafts.id, input.id)).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
    return rows[0];
  }),

  /** Edit subject/body before send. Allowed for pending or ready drafts. */
  updateDraft: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        subject: z.string().optional(),
        body: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const patch: Partial<{ subject: string; body: string }> = {};
      if (input.subject !== undefined) patch.subject = input.subject;
      if (input.body !== undefined) patch.body = input.body;
      if (Object.keys(patch).length === 0) return { ok: true };
      await db.update(agentDrafts).set(patch).where(eq(agentDrafts.id, input.id));
      return { ok: true };
    }),

  /** Reschedule a pending draft to a new send time. */
  reschedule: protectedProcedure
    .input(z.object({ id: z.number(), scheduledFor: z.date() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(agentDrafts)
        .set({ scheduledFor: input.scheduledFor })
        .where(and(eq(agentDrafts.id, input.id), eq(agentDrafts.status, "pending" as AgentDraftStatus)));
      return { ok: true };
    }),

  /** Approve a ready draft — sends via Resend or Twilio. */
  approve: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const result = await sendDraft(input.id, ctx.user.id);
      if (!result.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.reason ?? "send_failed" });
      }
      return { ok: true };
    }),

  /** Cancel a single draft. */
  cancel: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(agentDrafts)
        .set({ status: "cancelled", cancelReason: input.reason ?? "manual" })
        .where(eq(agentDrafts.id, input.id));
      return { ok: true };
    }),

  /** Cancel every pending draft for a customer (the explicit-decline path). */
  cancelAllForCustomer: protectedProcedure
    .input(z.object({ customerId: z.string(), reason: z.string().optional() }))
    .mutation(async ({ input }) => {
      const reason =
        (input.reason as
          | "appointment_scheduled"
          | "subscription_created"
          | "customer_declined"
          | "customer_replied"
          | "manual") ?? "customer_declined";
      const result = await cancelPendingFollowupsForCustomer(input.customerId, reason);
      return result;
    }),

  /** Force-generate a pending draft early (admin tool). */
  generateNow: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Pull this single draft into the due-window by setting scheduledFor=now,
      // then run the worker. Cheap and reuses the regular code path.
      await db
        .update(agentDrafts)
        .set({ scheduledFor: new Date() })
        .where(and(eq(agentDrafts.id, input.id), eq(agentDrafts.status, "pending" as AgentDraftStatus)));
      const result = await runDueDrafts({ limit: 1 });
      return result;
    }),

  /**
   * Re-run scheduleRoadmapFollowup for an existing customer. Used by tests
   * and by Marcin's "rebuild cadence" affordance on the customer profile.
   */
  triggerSyntheticForCustomer: protectedProcedure
    .input(
      z.object({
        customerId: z.string(),
        portalAccountId: z.string().optional(),
        homeHealthRecordId: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const result = await scheduleRoadmapFollowup({
        customerId: input.customerId,
        portalAccountId: input.portalAccountId ?? null,
        homeHealthRecordId: input.homeHealthRecordId ?? null,
      });
      return result;
    }),

  /** Toggle the per-customer auto-nurture bypass. */
  setBypass: protectedProcedure
    .input(z.object({ customerId: z.string(), bypass: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(customers)
        .set({ bypassAutoNurture: input.bypass })
        .where(eq(customers.id, input.customerId));
      if (input.bypass) {
        await cancelPendingFollowupsForCustomer(input.customerId, "manual");
      }
      return { ok: true };
    }),
});

async function enrichWithCustomer<T extends { customerId: string }>(
  rows: T[],
): Promise<Array<T & { customerName: string | null; customerEmail: string | null; customerPhone: string | null }>> {
  if (rows.length === 0) return [];
  const db = await getDb();
  if (!db) {
    return rows.map((r) => ({ ...r, customerName: null, customerEmail: null, customerPhone: null }));
  }
  const ids = Array.from(new Set(rows.map((r) => r.customerId).filter(Boolean)));
  const out: Map<string, { name: string; email: string; phone: string }> = new Map();
  for (const id of ids) {
    const c = (await db.select().from(customers).where(eq(customers.id, id)).limit(1))[0];
    if (c) {
      const name =
        c.displayName?.trim() ||
        [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
        c.email?.trim() ||
        "(unnamed)";
      out.set(id, { name, email: c.email ?? "", phone: c.mobilePhone ?? "" });
    }
  }
  return rows.map((r) => ({
    ...r,
    customerName: out.get(r.customerId)?.name ?? null,
    customerEmail: out.get(r.customerId)?.email ?? null,
    customerPhone: out.get(r.customerId)?.phone ?? null,
  }));
}
