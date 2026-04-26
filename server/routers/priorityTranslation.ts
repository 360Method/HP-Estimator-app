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
  homeHealthRecords,
  portalProperties,
  portalAccounts,
  type DbPriorityTranslation,
} from "../../drizzle/schema.priorityTranslation";
import {
  findOrCreatePortalAccount,
  findOrCreatePortalProperty,
  findOrCreateHealthRecord,
  issueMagicLink,
} from "../lib/priorityTranslation/portalAccount";
import {
  parseAddress,
  callClaudeWithPdfBuffer,
  mergeFindings,
  newTranslationId,
} from "../lib/priorityTranslation/processor";
import { renderPriorityTranslationPdf } from "../lib/priorityTranslation/pdf";
import { sendPriorityTranslationReady } from "../lib/priorityTranslation/email";
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

async function resolveFirstName(db: any, portalAccountId: string): Promise<string> {
  const rows = await db
    .select()
    .from(portalAccounts)
    .where(eq(portalAccounts.id, portalAccountId))
    .limit(1);
  return rows[0]?.firstName ?? "";
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
 * Runs the full 6-step processing pipeline for one translation row.
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
    const claudeResponse = await callClaudeWithPdfBuffer({ propertyAddress, pdfBuffer, apiKey });

    // 3. Merge findings into home health record.
    if (row.homeHealthRecordId) {
      const existing = await db
        .select()
        .from(homeHealthRecords)
        .where(eq(homeHealthRecords.id, row.homeHealthRecordId))
        .limit(1);
      const merged = mergeFindings(existing[0]?.findings ?? [], claudeResponse.findings, row.id);
      await db
        .update(homeHealthRecords)
        .set({ findings: merged, summary: claudeResponse.summary_1_paragraph, updatedAt: new Date() })
        .where(eq(homeHealthRecords.id, row.homeHealthRecordId));
    }

    // 4. Render branded output PDF.
    const firstName = await resolveFirstName(db, row.portalAccountId);
    const pdfOut = await renderPriorityTranslationPdf({ firstName, propertyAddress, claudeResponse });

    // 5. Issue magic link and send email with PDF attached.
    const portalBaseUrl = process.env.PORTAL_BASE_URL ?? "https://pro.handypioneers.com";
    const link = await issueMagicLink(db, { portalAccountId: row.portalAccountId, portalBaseUrl });
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) throw new Error("RESEND_API_KEY not configured");
    const toEmail = await resolveEmail(db, row.portalAccountId);
    await sendPriorityTranslationReady({
      apiKey: resendKey,
      to: toEmail,
      firstName,
      magicLinkUrl: link.url,
      pdfBuffer: pdfOut,
      propertyAddress,
    });

    // 6. Mark completed.
    await db
      .update(priorityTranslations)
      .set({ status: "completed", claudeResponse, deliveredAt: new Date(), updatedAt: new Date() })
      .where(eq(priorityTranslations.id, row.id));
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
      content: `${input.email} submitted an inspection report for ${input.propertyAddress}. Processing now — they'll receive the PDF within a few minutes.`,
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
   * Internal worker trigger. Guarded by INTERNAL_WORKER_KEY.
   * Useful for a queue runner or manual retry from an admin panel.
   */
  process: publicProcedure
    .input(z.object({ id: z.string(), workerKey: z.string() }))
    .mutation(async ({ input }) => {
      if (input.workerKey !== process.env.INTERNAL_WORKER_KEY) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await runPriorityTranslation(db, input.id);
      return { ok: true };
    }),
});

export type PriorityTranslationRouter = typeof priorityTranslationRouter;
export type DbPriorityTranslationRow = DbPriorityTranslation;
