/**
 * Priority Translation router — lead-magnet intake + processing + portal.
 *
 * Procedures:
 *   submit     (public)    — homeowner posts form + PDF URL. Creates portal
 *                            account + property + health record + translation
 *                            row, then fires processing inline (no queue needed).
 *   getStatus  (protected) — portal user checks where their translation is.
 *   process    (internal)  — explicit worker trigger (queue-friendly future path).
 *                            Guarded by INTERNAL_WORKER_KEY.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  priorityTranslations,
  portalProperties,
  portalAccounts,
  type DbPriorityTranslation,
} from "../../drizzle/schema.priorityTranslation";
import {
  findOrCreatePortalAccount,
  findOrCreatePortalProperty,
  findOrCreateHealthRecord,
} from "../lib/priorityTranslation/portalAccount";
import {
  parseAddress,
  callClaudeForTranslation,
  newTranslationId,
} from "../lib/priorityTranslation/processor";
import { notifyOwner } from "../_core/notification";
import { findCustomerByEmail, createCustomer, createOpportunity } from "../db";
import { onLeadCreated } from "../leadRouting";
import { nanoid } from "nanoid";

// ─── Input schemas ──────────────────────────────────────────────────────────
const submitInput = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email(),
  phone: z.string().trim().min(7).max(32),
  propertyAddress: z.string().trim().min(5).max(300),
  notes: z.string().trim().max(1000).optional(),
  pdfStoragePath: z.string().trim().optional(),
  reportUrl: z.string().trim().url().optional(),
  source: z.string().default("priority_translation_lead_magnet"),
});

// Fresh object on purpose (zod 4: never .extend() a refined schema) — this is
// the same shape the spot inspection review uses.
const reviewFindingSchema = z.object({
  category: z.string().min(1).max(120),
  finding: z.string().min(1).max(2000),
  interpretation: z.string().max(2000).optional(),
  recommended_approach: z.string().max(2000).optional(),
  urgency: z.enum(["NOW", "SOON", "WAIT"]),
  investment_range_low_usd: z.number().min(0),
  investment_range_high_usd: z.number().min(0),
  reasoning: z.string().max(2000).default(""),
}).refine((f) => f.investment_range_low_usd <= f.investment_range_high_usd, {
  message: "The low end of the range must be at or below the high end",
});

// ─── Core processing logic (called from submit + process endpoint) ───────────

/**
 * Loads the inspection PDF as a Buffer.
 * Supports a Railway-volume file path or any publicly reachable URL.
 */
async function loadPdfBuffer(args: {
  pdfStoragePath: string | null;
  reportUrl: string | null;
}): Promise<Buffer> {
  if (args.pdfStoragePath) {
    const { readFile } = await import("fs/promises");
    return readFile(args.pdfStoragePath);
  }
  if (args.reportUrl) {
    const res = await fetch(args.reportUrl);
    if (!res.ok) {
      throw new Error(`Failed to fetch PDF from ${args.reportUrl}: HTTP ${res.status}`);
    }
    const buf = await res.arrayBuffer();
    return Buffer.from(buf);
  }
  throw new Error("Neither pdfStoragePath nor reportUrl is set on this translation row");
}

async function resolvePropertyAddress(db: any, propertyId: string): Promise<string> {
  const rows = await db
    .select()
    .from(portalProperties)
    .where(eq(portalProperties.id, propertyId))
    .limit(1);
  const p = rows[0];
  if (!p) return "";
  return [p.street, p.city, p.state, p.zip].filter(Boolean).join(", ");
}

async function resolveEmail(db: any, portalAccountId: string): Promise<string> {
  const rows = await db
    .select()
    .from(portalAccounts)
    .where(eq(portalAccounts.id, portalAccountId))
    .limit(1);
  return rows[0]?.email ?? "";
}

/**
 * Runs intake processing for one translation row: load the PDF, run Claude,
 * park the draft as awaiting_review. Delivery happens in
 * deliverFunnelRoadmap once a human approves.
 * Safe to call fire-and-forget (catches and records failures).
 */
export async function runPriorityTranslation(db: any, translationId: string): Promise<void> {
  const rows = await db
    .select()
    .from(priorityTranslations)
    .where(eq(priorityTranslations.id, translationId))
    .limit(1);
  const row: DbPriorityTranslation | undefined = rows[0];
  if (!row) throw new Error(`Translation ${translationId} not found`);

  try {
    // 1. Load PDF buffer.
    const pdfBuffer = await loadPdfBuffer({
      pdfStoragePath: row.pdfStoragePath ?? null,
      reportUrl: row.reportUrl ?? null,
    });

    // 2. Call Claude (PDF passed natively — no text extraction needed).
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
    const propertyAddress = await resolvePropertyAddress(db, row.propertyId);
    const claudeResponse = await callClaudeForTranslation({ propertyAddress, pdfBuffer, apiKey });

    // 3. Park the draft for human review. Nothing auto-sends: every
    // AI-drafted roadmap waits for a person to approve it (Marcin,
    // 2026-06-12). Delivery — render, health-record merge, email, follow-up
    // cadence — happens in deliverFunnelRoadmap on approval.
    await db
      .update(priorityTranslations)
      .set({ status: "awaiting_review", claudeResponse, updatedAt: new Date() })
      .where(eq(priorityTranslations.id, row.id));

    const toEmail = await resolveEmail(db, row.portalAccountId);
    notifyOwner({
      title: `Roadmap draft ready for review — ${toEmail}`,
      content:
        `The AI draft for ${propertyAddress} is waiting in Approvals. ` +
        `Review, edit if needed, and approve to deliver. The homeowner was promised their roadmap within one business day.`,
    }).catch((e) => console.warn("[PT] review notification failed:", e));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await db
      .update(priorityTranslations)
      .set({ status: "failed", failureReason: reason, updatedAt: new Date() })
      .where(eq(priorityTranslations.id, row.id))
      .catch(() => null);
    throw err;
  }
}

// ─── Router ─────────────────────────────────────────────────────────────────
export const priorityTranslationRouter = router({
  /**
   * Public. Homeowner submits the form. We create portal account + property +
   * health record + translation row, then fire processing inline.
   */
  submit: publicProcedure.input(submitInput).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

    if (!input.pdfStoragePath && !input.reportUrl) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Provide either pdfStoragePath or reportUrl",
      });
    }

    const account = await findOrCreatePortalAccount(db, {
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
    });

    const parsed = parseAddress(input.propertyAddress);
    const property = await findOrCreatePortalProperty(db, {
      portalAccountId: account.id,
      street: parsed.street,
      city: parsed.city,
      state: parsed.state,
      zip: parsed.zip,
    });

    const healthRecord = await findOrCreateHealthRecord(db, {
      portalAccountId: account.id,
      propertyId: property.id,
    });

    const id = newTranslationId();
    await db.insert(priorityTranslations).values({
      id,
      portalAccountId: account.id,
      propertyId: property.id,
      homeHealthRecordId: healthRecord.id,
      pdfStoragePath: input.pdfStoragePath ?? null,
      reportUrl: input.reportUrl ?? null,
      notes: input.notes ?? null,
      status: "processing",
    });

    // Create or match a CRM customer so the lead appears in the pipeline.
    let crmCustomer = await findCustomerByEmail(input.email);
    if (!crmCustomer) {
      crmCustomer = await createCustomer({
        id: nanoid(),
        firstName: input.firstName,
        lastName: input.lastName,
        displayName: `${input.firstName} ${input.lastName}`.trim(),
        email: input.email.toLowerCase().trim(),
        mobilePhone: input.phone,
        street: parsed.street,
        city: parsed.city,
        state: parsed.state,
        zip: parsed.zip,
        customerType: "homeowner",
        leadSource: "Priority Translation",
        sendNotifications: true,
        tags: "[]",
      });
    }

    // Create a pipeline lead so the nurturer can follow up.
    const leadId = nanoid();
    await createOpportunity({
      id: leadId,
      customerId: crmCustomer.id,
      area: "lead",
      stage: "New Lead",
      title: `Priority Translation — ${input.propertyAddress}`,
      notes: `Homeowner submitted inspection report via Priority Translation lead magnet.\nEmail: ${input.email} | Phone: ${input.phone}\nPortal account: ${account.id} | Translation: ${id}`,
      archived: false,
    });

    // Assign to nurturer + send internal notification.
    onLeadCreated({
      opportunityId: leadId,
      customerId: crmCustomer.id,
      title: `Priority Translation — ${input.propertyAddress}`,
      source: "priority_translation",
      priority: "high",
    }).catch((e) => console.error("[PT] onLeadCreated error:", e));

    // Also ping owner via notifyOwner (belt-and-suspenders).
    notifyOwner({
      title: `New Priority Translation — ${input.firstName} ${input.lastName}`,
      content: `${input.email} submitted an inspection report for ${input.propertyAddress}. The AI draft will land in Approvals for your review; they were promised their roadmap within one business day.`,
    }).catch((e) => console.warn("[PT] notifyOwner failed:", e));

    // Fire processing in the background — no queue needed at current volume.
    const capturedId = id;
    const capturedDb = db;
    setImmediate(() => {
      runPriorityTranslation(capturedDb, capturedId).catch((err) => {
        console.error(`[PT] Background processing failed for ${capturedId}:`, err);
      });
    });

    return { id, portalAccountId: account.id, status: "processing" as const };
  }),

  /** Portal user polls a specific translation's state. */
  getStatus: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const rows = await db
        .select()
        .from(priorityTranslations)
        .where(eq(priorityTranslations.id, input.id))
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      const portalAccountId = (ctx as any)?.session?.portalAccountId;
      if (portalAccountId && row.portalAccountId !== portalAccountId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return {
        id: row.id,
        status: row.status,
        deliveredAt: row.deliveredAt,
        failureReason: row.failureReason,
      };
    }),

  /**
   * Public status for the post-submit confirmation page.
   * Intentionally returns only non-sensitive processing state.
   */
  getPublicStatus: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const rows = await db
        .select({
          id: priorityTranslations.id,
          status: priorityTranslations.status,
          deliveredAt: priorityTranslations.deliveredAt,
          failureReason: priorityTranslations.failureReason,
        })
        .from(priorityTranslations)
        .where(eq(priorityTranslations.id, input.id))
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      return row;
    }),

  // ── Review gate (staff) ─────────────────────────────────────────────────
  // Every AI-drafted roadmap waits here until a human approves it. Spot
  // inspections review on their own page; funnel rows review at
  // /os/roadmap-review/:id. Both show up in the one queue.

  /** All drafts awaiting review, with who and where, newest first. */
  listAwaitingReview: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    const { desc } = await import("drizzle-orm");
    const rows = await db
      .select()
      .from(priorityTranslations)
      .where(eq(priorityTranslations.status, "awaiting_review"))
      .orderBy(desc(priorityTranslations.createdAt));
    const out = [];
    for (const row of rows) {
      const [account] = await db
        .select()
        .from(portalAccounts)
        .where(eq(portalAccounts.id, row.portalAccountId))
        .limit(1);
      const [prop] = await db
        .select()
        .from(portalProperties)
        .where(eq(portalProperties.id, row.propertyId))
        .limit(1);
      out.push({
        id: row.id,
        source: row.source,
        customerName:
          `${account?.firstName ?? ""} ${account?.lastName ?? ""}`.trim() || account?.email || "",
        email: account?.email ?? "",
        propertyAddress: prop ? [prop.street, prop.city].filter(Boolean).join(", ") : "",
        findingCount: (row.claudeResponse as any)?.findings?.length ?? 0,
        createdAt: row.createdAt,
      });
    }
    return out;
  }),

  /** One funnel draft with everything the review editor needs. */
  getForReview: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db
        .select()
        .from(priorityTranslations)
        .where(eq(priorityTranslations.id, input.id))
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      const [account] = await db
        .select()
        .from(portalAccounts)
        .where(eq(portalAccounts.id, row.portalAccountId))
        .limit(1);
      const [prop] = await db
        .select()
        .from(portalProperties)
        .where(eq(portalProperties.id, row.propertyId))
        .limit(1);
      return {
        id: row.id,
        source: row.source,
        status: row.status,
        customerName:
          `${account?.firstName ?? ""} ${account?.lastName ?? ""}`.trim() || account?.email || "",
        email: account?.email ?? "",
        propertyAddress: prop ? [prop.street, prop.city].filter(Boolean).join(", ") : "",
        homeownerNotes: row.notes,
        draft: row.claudeResponse,
        failureReason: row.failureReason,
        approvedAt: row.approvedAt,
        deliveredAt: row.deliveredAt,
        createdAt: row.createdAt,
      };
    }),

  /** Staff edits to a funnel draft while it is awaiting review. */
  updateDraftResponse: protectedProcedure
    .input(z.object({
      id: z.string().min(1),
      summary: z.string().min(1).max(4000),
      executiveSummary: z.string().max(8000).optional(),
      closing: z.string().max(4000).optional(),
      findings: z.array(reviewFindingSchema).min(1).max(10),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const rows = await db
        .select()
        .from(priorityTranslations)
        .where(eq(priorityTranslations.id, input.id))
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (row.status !== "awaiting_review") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only a draft awaiting review can be edited" });
      }
      const prev = (row.claudeResponse ?? {}) as any;
      const next = {
        ...prev,
        summary_1_paragraph: input.summary,
        executive_summary: input.executiveSummary ?? prev.executive_summary,
        closing: input.closing ?? prev.closing,
        findings: input.findings,
      };
      await db
        .update(priorityTranslations)
        .set({ claudeResponse: next, updatedAt: new Date() })
        .where(eq(priorityTranslations.id, input.id));
      return { ok: true };
    }),

  /** The human gate for funnel roadmaps: approve and deliver. */
  approveAndDeliverFunnel: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const { deliverFunnelRoadmap } = await import("../lib/priorityTranslation/orchestrator");
      try {
        return await deliverFunnelRoadmap(input.id, { approvedBy: String((ctx as any).user?.id ?? "staff") });
      } catch (err) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: (err as Error).message });
      }
    }),

  /**
   * Internal worker trigger. Guarded by INTERNAL_WORKER_KEY.
   * Useful for a queue runner or manual retry from an admin panel.
   */
  process: publicProcedure
    .input(z.object({
      id: z.string(),
      workerKey: z.string(),
      /** "roadmap" retries through the Stewardship orchestrator (the funnel
       *  pipeline); default "legacy" keeps the old behavior for the worker. */
      pipeline: z.enum(["legacy", "roadmap"]).default("legacy"),
    }))
    .mutation(async ({ input }) => {
      if (input.workerKey !== process.env.INTERNAL_WORKER_KEY) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      if (input.pipeline === "roadmap") {
        const { reprocessRoadmap } = await import("../lib/priorityTranslation/orchestrator");
        await reprocessRoadmap(input.id);
        return { ok: true };
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await runPriorityTranslation(db, input.id);
      return { ok: true };
    }),
});

export type PriorityTranslationRouter = typeof priorityTranslationRouter;
export type DbPriorityTranslationRow = DbPriorityTranslation;
