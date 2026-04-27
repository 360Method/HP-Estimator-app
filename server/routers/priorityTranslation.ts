/**
 * Priority Translation router — lead-magnet intake + processing + portal.
 *
 * Procedures:
 *   submit     (public)    — homeowner posts form + PDF (multipart handled by
 *                            the Express wrapper; the tRPC call receives the
 *                            already-parsed fields and pdfStoragePath).
 *   getStatus  (protected) — portal user checks where their translation is.
 *   process    (internal)  — worker procedure triggered from the queue; runs
 *                            Claude, renders PDF, sends email. Not exposed to
 *                            the client; callers must pass INTERNAL_WORKER_KEY.
 *
 * WIRING (deferred pending broken-git resolution):
 *   - Import path `../_core/trpc` assumes server/_core/trpc.ts is restored.
 *   - Import path `../db` assumes server/db.ts is restored.
 *   - Add to server/routers.ts:
 *       import { priorityTranslationRouter } from "./routers/priorityTranslation";
 *       appRouter: priorityTranslation: priorityTranslationRouter
 *   - Express wrapper needs a multipart endpoint that persists the PDF to the
 *     Railway volume (or R2 if configured), then calls tRPC.submit with the
 *     storage path. See PRIORITY_TRANSLATION_BACKEND.md.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  priorityTranslations,
  homeHealthRecords,
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
  callClaudeForTranslation,
  mergeFindings,
  newTranslationId,
} from "../lib/priorityTranslation/processor";
import { renderPriorityTranslationPdf } from "../lib/priorityTranslation/pdf";
import { sendPriorityTranslationReady } from "../lib/priorityTranslation/email";

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

// ─── Router ─────────────────────────────────────────────────────────────────
export const priorityTranslationRouter = router({
  /**
   * Public. Homeowner submits the form. We create the portal account +
   * property + health record + translation row in submitted state, then
   * enqueue the async worker. Response is the translation id.
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
      status: "submitted",
    });

    // Enqueue async processing. In dev, call directly; in prod, push to a
    // queue. Current stub just flips status to "processing" so the UI has
    // something to poll until the worker lands.
    await db
      .update(priorityTranslations)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(priorityTranslations.id, id));

    // TODO: enqueue Path B nurture Sequence 2 here. Depends on the
    // (currently missing from origin/main) sequence runner module.

    return { id, portalAccountId: account.id, status: "processing" as const };
  }),

  /** Portal user checks a specific translation's state. */
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

      // Portal users may only see their own translations.
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
   * Public status lookup for the post-submit confirmation page. Returns only
   * status + timestamps — no PII, no findings. Anyone holding the (20-char
   * nanoid) submission id can poll this; surface is minimal.
   *
   * Used by /portal/roadmap/submitted/:id to advance the progress bar without
   * requiring the homeowner to log in (their magic-link arrives by email).
   */
  getPublicStatus: publicProcedure
    .input(z.object({ id: z.string().min(8).max(40) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const rows = await db
        .select({
          id: priorityTranslations.id,
          status: priorityTranslations.status,
          createdAt: priorityTranslations.createdAt,
          deliveredAt: priorityTranslations.deliveredAt,
        })
        .from(priorityTranslations)
        .where(eq(priorityTranslations.id, input.id))
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      return {
        id: row.id,
        status: row.status,
        createdAt: row.createdAt,
        deliveredAt: row.deliveredAt,
        // Intentionally omit failureReason — surfacing internal errors to a
        // public endpoint isn't useful and can leak infra details. The portal
        // (logged-in) getStatus still returns it for staff/owner debugging.
      };
    }),

  /**
   * Internal worker. Called from the queue consumer. Pulls the translation
   * row, extracts report text, calls Claude, renders PDF, writes back to
   * home_health_record, issues a magic link, and sends the email.
   *
   * Guarded by a shared secret (INTERNAL_WORKER_KEY env) rather than a user
   * session so the queue runner can trigger it.
   */
  process: publicProcedure
    .input(z.object({ id: z.string(), workerKey: z.string() }))
    .mutation(async ({ input }) => {
      if (input.workerKey !== process.env.INTERNAL_WORKER_KEY) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const rows = await db
        .select()
        .from(priorityTranslations)
        .where(eq(priorityTranslations.id, input.id))
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      try {
        // 1. Load report text.
        // TODO(wire-up): read from Railway volume or R2 via pdfStoragePath,
        // or fetch + extract text from reportUrl. Parsing strategy:
        //   • PDF → pdf-parse or pdfjs-dist
        //   • URL → puppeteer render + text extraction
        const reportText = await loadReportText({
          pdfStoragePath: row.pdfStoragePath,
          reportUrl: row.reportUrl,
        });

        // 2. Claude.
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
        const claudeResponse = await callClaudeForTranslation({
          propertyAddress: await loadPropertyAddress(db, row.propertyId),
          reportText,
          apiKey,
        });

        // 3. Merge into health record.
        if (row.homeHealthRecordId) {
          const existing = await db
            .select()
            .from(homeHealthRecords)
            .where(eq(homeHealthRecords.id, row.homeHealthRecordId))
            .limit(1);
          const merged = mergeFindings(existing[0]?.findings ?? [], claudeResponse.findings, row.id);
          await db
            .update(homeHealthRecords)
            .set({
              findings: merged,
              summary: claudeResponse.summary_1_paragraph,
              updatedAt: new Date(),
            })
            .where(eq(homeHealthRecords.id, row.homeHealthRecordId));
        }

        // 4. Render PDF.
        const firstName = await loadFirstName(db, row.portalAccountId);
        const pdfBuffer = await renderPriorityTranslationPdf({
          firstName,
          propertyAddress: await loadPropertyAddress(db, row.propertyId),
          claudeResponse,
        });

        // TODO: persist pdfBuffer to storage, set outputPdfPath.

        // 5. Magic link + email.
        const portalBaseUrl = process.env.PORTAL_BASE_URL || "https://pro.handypioneers.com";
        const link = await issueMagicLink(db, {
          portalAccountId: row.portalAccountId,
          portalBaseUrl,
        });
        const resendKey = process.env.RESEND_API_KEY;
        if (!resendKey) throw new Error("RESEND_API_KEY not set");
        await sendPriorityTranslationReady({
          apiKey: resendKey,
          to: await loadEmail(db, row.portalAccountId),
          firstName,
          magicLinkUrl: link.url,
          pdfBuffer,
          propertyAddress: await loadPropertyAddress(db, row.propertyId),
        });

        // 6. Mark completed.
        await db
          .update(priorityTranslations)
          .set({
            status: "completed",
            claudeResponse,
            deliveredAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(priorityTranslations.id, row.id));

        return { ok: true };
      } catch (err) {
        await db
          .update(priorityTranslations)
          .set({
            status: "failed",
            failureReason: err instanceof Error ? err.message : String(err),
            updatedAt: new Date(),
          })
          .where(eq(priorityTranslations.id, row.id));
        throw err;
      }
    }),
});

// ─── Local helpers (kept inline for now; extract if reused) ─────────────────
async function loadReportText(_args: {
  pdfStoragePath: string | null;
  reportUrl: string | null;
}): Promise<string> {
  // TODO: implement PDF text extraction + URL fetch. Return inspection body
  // as plain text for Claude. Stub below keeps the module type-checking.
  throw new Error("loadReportText not yet implemented — add pdf-parse or pdfjs-dist");
}

async function loadPropertyAddress(db: any, propertyId: string): Promise<string> {
  const { portalProperties } = await import("../../drizzle/schema.priorityTranslation");
  const rows = await db.select().from(portalProperties).where(eq(portalProperties.id, propertyId)).limit(1);
  const p = rows[0];
  if (!p) return "";
  return [p.street, p.city, p.state, p.zip].filter(Boolean).join(", ");
}

async function loadFirstName(db: any, portalAccountId: string): Promise<string> {
  const { portalAccounts } = await import("../../drizzle/schema.priorityTranslation");
  const rows = await db.select().from(portalAccounts).where(eq(portalAccounts.id, portalAccountId)).limit(1);
  return rows[0]?.firstName ?? "";
}

async function loadEmail(db: any, portalAccountId: string): Promise<string> {
  const { portalAccounts } = await import("../../drizzle/schema.priorityTranslation");
  const rows = await db.select().from(portalAccounts).where(eq(portalAccounts.id, portalAccountId)).limit(1);
  return rows[0]?.email ?? "";
}

export type PriorityTranslationRouter = typeof priorityTranslationRouter;
export type DbPriorityTranslationRow = DbPriorityTranslation;
