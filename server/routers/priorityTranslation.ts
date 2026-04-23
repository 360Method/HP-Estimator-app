/**
 * Priority Translation router — Roadmap Generator intake + human checkpoint
 * + ship-to-customer pipeline.
 *
 * ────────────────────────────────────────────────────────────────────────
 * Lifecycle (see migration 0051 and schema.priorityTranslation.ts):
 *
 *   [submit]
 *       → status = draft_awaiting_claude
 *         (worker polls; calls Claude; writes claudeResponse)
 *       → status = draft_awaiting_review
 *         (Marcin opens admin → edits findings → writes review note)
 *       → [markReadyToSend] → status = ready_to_send
 *       → [sendToCustomer]  → status = sent
 *           (generates final PDF, issues magic link, emails customer,
 *            enqueues Path B nurture)
 *
 * Marcin is the human in the middle. Nothing ships to a customer without
 * his explicit `sendToCustomer` click — that is the whole point of the
 * human checkpoint: Claude drafts, Marcin approves.
 * ────────────────────────────────────────────────────────────────────────
 *
 * Procedures:
 *   submit              (public)     homeowner posts form + PDF
 *   getStatus           (protected)  portal user checks their roadmap
 *   listPendingReviews  (admin)      all rows in draft_awaiting_review
 *   getRoadmapDraft     (admin)      one row with findings JSON + meta
 *   updateFinding       (admin)      mutate a single finding in-place
 *   addFinding          (admin)      append a finding Claude missed
 *   removeFinding       (admin)      drop a Claude-suggested finding
 *   setReviewNote       (admin)      Marcin's personal note on the output
 *   markReadyToSend     (admin)      flip status → ready_to_send
 *   sendToCustomer      (admin)      render PDF + email + nurture → sent
 *   process             (internal)   worker entry: pulls draft_awaiting_claude
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  priorityTranslations,
  homeHealthRecords,
  portalAccounts,
  portalProperties,
  type DbPriorityTranslation,
  type ClaudePriorityTranslationResponse,
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

const urgencyEnum = z.enum(["NOW", "SOON", "WAIT"]);

const findingInputSchema = z.object({
  category: z.string().trim().min(1).max(120),
  finding: z.string().trim().min(1).max(2000),
  urgency: urgencyEnum,
  investment_range_low_usd: z.number().int().nonnegative(),
  investment_range_high_usd: z.number().int().nonnegative(),
  reasoning: z.string().trim().max(4000).default(""),
});

// ─── Router ─────────────────────────────────────────────────────────────────
export const priorityTranslationRouter = router({
  /**
   * Public. Homeowner submits the form. Creates portal account + property +
   * health record + translation row with status draft_awaiting_claude. The
   * background worker picks it up and calls Claude.
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

    const account = await findOrCreatePortalAccount(db as any, {
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
    });

    const parsed = parseAddress(input.propertyAddress);
    const property = await findOrCreatePortalProperty(db as any, {
      portalAccountId: account.id,
      street: parsed.street,
      city: parsed.city,
      state: parsed.state,
      zip: parsed.zip,
    });

    const healthRecord = await findOrCreateHealthRecord(db as any, {
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
      status: "draft_awaiting_claude",
    });

    return { id, portalAccountId: account.id, status: "draft_awaiting_claude" as const };
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

      const portalAccountId = (ctx as any)?.session?.portalAccountId;
      if (portalAccountId && row.portalAccountId !== portalAccountId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return {
        id: row.id,
        status: row.status,
        deliveredAt: row.deliveredAt,
        sentAt: row.sentAt,
        failureReason: row.failureReason,
      };
    }),

  // ─── Admin: human checkpoint surface ────────────────────────────────────
  /**
   * Admin inbox: every roadmap Claude has drafted that Marcin has not yet
   * sent. Returns customer name, address, created_at, and age in hours so
   * the UI can surface anything overdue for review.
   */
  listPendingReviews: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const rows = await db
      .select({
        id: priorityTranslations.id,
        status: priorityTranslations.status,
        createdAt: priorityTranslations.createdAt,
        updatedAt: priorityTranslations.updatedAt,
        notes: priorityTranslations.notes,
        firstName: portalAccounts.firstName,
        lastName: portalAccounts.lastName,
        email: portalAccounts.email,
        street: portalProperties.street,
        city: portalProperties.city,
        state: portalProperties.state,
        zip: portalProperties.zip,
      })
      .from(priorityTranslations)
      .leftJoin(portalAccounts, eq(portalAccounts.id, priorityTranslations.portalAccountId))
      .leftJoin(portalProperties, eq(portalProperties.id, priorityTranslations.propertyId))
      .where(eq(priorityTranslations.status, "draft_awaiting_review"));

    const now = Date.now();
    return rows.map((r) => ({
      ...r,
      customerName: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim(),
      propertyAddress: [r.street, r.city, r.state, r.zip].filter(Boolean).join(", "),
      ageHours: r.createdAt ? Math.floor((now - new Date(r.createdAt).getTime()) / 3_600_000) : 0,
    }));
  }),

  /** Full record for the roadmap editor. */
  getRoadmapDraft: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const rows = await db
        .select({
          t: priorityTranslations,
          a: portalAccounts,
          p: portalProperties,
        })
        .from(priorityTranslations)
        .leftJoin(portalAccounts, eq(portalAccounts.id, priorityTranslations.portalAccountId))
        .leftJoin(portalProperties, eq(portalProperties.id, priorityTranslations.propertyId))
        .where(eq(priorityTranslations.id, input.id))
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      return {
        id: row.t.id,
        status: row.t.status,
        createdAt: row.t.createdAt,
        reviewNotes: row.t.reviewNotes ?? "",
        claudeResponse: row.t.claudeResponse ?? { summary_1_paragraph: "", findings: [] },
        failureReason: row.t.failureReason,
        customer: row.a
          ? {
              firstName: row.a.firstName,
              lastName: row.a.lastName,
              email: row.a.email,
              phone: row.a.phone,
            }
          : null,
        property: row.p
          ? {
              street: row.p.street,
              city: row.p.city,
              state: row.p.state,
              zip: row.p.zip,
            }
          : null,
        propertyAddress: row.p ? [row.p.street, row.p.city, row.p.state, row.p.zip].filter(Boolean).join(", ") : "",
      };
    }),

  updateFinding: adminProcedure
    .input(z.object({ id: z.string(), index: z.number().int().nonnegative(), patch: findingInputSchema.partial() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const next = await mutateFindings(db, input.id, (findings) => {
        if (input.index >= findings.length) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Finding index out of range" });
        }
        findings[input.index] = { ...findings[input.index], ...input.patch };
        return findings;
      });
      return { ok: true, findings: next };
    }),

  addFinding: adminProcedure
    .input(z.object({ id: z.string(), finding: findingInputSchema }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const next = await mutateFindings(db, input.id, (findings) => {
        findings.push(input.finding);
        return findings;
      });
      return { ok: true, findings: next };
    }),

  removeFinding: adminProcedure
    .input(z.object({ id: z.string(), index: z.number().int().nonnegative() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const next = await mutateFindings(db, input.id, (findings) => {
        if (input.index >= findings.length) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Finding index out of range" });
        }
        findings.splice(input.index, 1);
        return findings;
      });
      return { ok: true, findings: next };
    }),

  setReviewNote: adminProcedure
    .input(z.object({ id: z.string(), note: z.string().max(4000) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(priorityTranslations)
        .set({ reviewNotes: input.note, updatedAt: new Date() })
        .where(eq(priorityTranslations.id, input.id));
      return { ok: true };
    }),

  markReadyToSend: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(priorityTranslations)
        .set({
          status: "ready_to_send",
          reviewedByUserId: (ctx.user as any)?.id ?? null,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(priorityTranslations.id, input.id));
      return { ok: true };
    }),

  /**
   * The human-triggered send. Renders the final PDF from the (human-approved)
   * findings, issues a magic link, emails the customer (with Marcin's voice
   * and the personal note), and marks the row sent. Path B nurture triggers
   * are fired as a fire-and-forget hook.
   */
  sendToCustomer: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const rows = await db
        .select()
        .from(priorityTranslations)
        .where(eq(priorityTranslations.id, input.id))
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      if (row.status === "sent") {
        return { ok: true, alreadySent: true };
      }
      if (!row.claudeResponse) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No Claude draft yet — cannot send" });
      }

      try {
        // Merge the (possibly edited) findings into the home health record so
        // the portal sees the approved version, not the raw Claude draft.
        if (row.homeHealthRecordId) {
          const existing = await db
            .select()
            .from(homeHealthRecords)
            .where(eq(homeHealthRecords.id, row.homeHealthRecordId))
            .limit(1);
          const merged = mergeFindings(existing[0]?.findings ?? [], row.claudeResponse.findings, row.id);
          await db
            .update(homeHealthRecords)
            .set({
              findings: merged,
              summary: row.claudeResponse.summary_1_paragraph,
              updatedAt: new Date(),
            })
            .where(eq(homeHealthRecords.id, row.homeHealthRecordId));
        }

        const firstName = await loadFirstName(db, row.portalAccountId);
        const email = await loadEmail(db, row.portalAccountId);
        const address = await loadPropertyAddress(db, row.propertyId);

        const pdfBuffer = await renderPriorityTranslationPdf({
          firstName,
          propertyAddress: address,
          claudeResponse: row.claudeResponse,
        });

        const portalBaseUrl = process.env.PORTAL_BASE_URL || "https://pro.handypioneers.com";
        const link = await issueMagicLink(db as any, {
          portalAccountId: row.portalAccountId,
          portalBaseUrl,
        });

        const resendKey = process.env.RESEND_API_KEY;
        if (!resendKey) throw new Error("RESEND_API_KEY not set");
        await sendPriorityTranslationReady({
          apiKey: resendKey,
          to: email,
          firstName,
          magicLinkUrl: link.url,
          pdfBuffer,
          propertyAddress: address,
          reviewNote: row.reviewNotes ?? null,
        });

        const now = new Date();
        await db
          .update(priorityTranslations)
          .set({
            status: "sent",
            sentAt: now,
            deliveredAt: now,
            reviewedByUserId: row.reviewedByUserId ?? (ctx.user as any)?.id ?? null,
            reviewedAt: row.reviewedAt ?? now,
            updatedAt: now,
          })
          .where(eq(priorityTranslations.id, row.id));

        // TODO: enqueue Path B nurture Sequence 2 once automationEngine wiring
        // for that sequence lands on main. Intentionally fire-and-forget so a
        // missing nurture does not block the customer send.

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

  /**
   * Internal worker entrypoint. Called by the background worker loop
   * (server/workers/priorityTranslationWorker.ts) — NOT by the client.
   * Guarded by INTERNAL_WORKER_KEY so the queue runner can call it via tRPC
   * if that deployment topology is chosen later. For the current in-process
   * worker this is invoked directly.
   */
  process: publicProcedure
    .input(z.object({ id: z.string(), workerKey: z.string() }))
    .mutation(async ({ input }) => {
      if (input.workerKey !== process.env.INTERNAL_WORKER_KEY) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await runClaudeDraftForRow(db, input.id);
      return { ok: true };
    }),
});

// ─── Shared helpers exposed to the background worker ──────────────────────
/**
 * Pull one row, run Claude on it, persist the draft claudeResponse, flip the
 * status to draft_awaiting_review. This is the AUTO step that runs before the
 * human checkpoint. Extracted so the in-process worker can call it directly
 * without a tRPC round-trip.
 */
export async function runClaudeDraftForRow(db: any, id: string): Promise<void> {
  const rows = await db
    .select()
    .from(priorityTranslations)
    .where(eq(priorityTranslations.id, id))
    .limit(1);
  const row: DbPriorityTranslation | undefined = rows[0];
  if (!row) throw new Error(`priority_translation ${id} not found`);
  if (row.status !== "draft_awaiting_claude") return; // idempotent — already past this step

  try {
    const reportText = await loadReportText({
      pdfStoragePath: row.pdfStoragePath,
      reportUrl: row.reportUrl,
    });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
    const address = await loadPropertyAddress(db, row.propertyId);

    const claudeResponse: ClaudePriorityTranslationResponse = await callClaudeForTranslation({
      propertyAddress: address,
      reportText,
      apiKey,
    });

    await db
      .update(priorityTranslations)
      .set({
        status: "draft_awaiting_review",
        claudeResponse,
        updatedAt: new Date(),
      })
      .where(eq(priorityTranslations.id, row.id));
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
}

// ─── Local helpers ──────────────────────────────────────────────────────────
async function mutateFindings(
  db: any,
  id: string,
  fn: (findings: ClaudePriorityTranslationResponse["findings"]) => ClaudePriorityTranslationResponse["findings"]
): Promise<ClaudePriorityTranslationResponse["findings"]> {
  const rows = await db
    .select()
    .from(priorityTranslations)
    .where(eq(priorityTranslations.id, id))
    .limit(1);
  const row: DbPriorityTranslation | undefined = rows[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND" });
  const existing: ClaudePriorityTranslationResponse = row.claudeResponse ?? {
    summary_1_paragraph: "",
    findings: [],
  };
  // Clone so we never mutate the cached jsonb in place.
  const nextFindings = fn([...existing.findings]);
  const nextResponse: ClaudePriorityTranslationResponse = {
    summary_1_paragraph: existing.summary_1_paragraph,
    findings: nextFindings,
  };
  await db
    .update(priorityTranslations)
    .set({ claudeResponse: nextResponse, updatedAt: new Date() })
    .where(eq(priorityTranslations.id, id));
  return nextFindings;
}

async function loadReportText(args: {
  pdfStoragePath: string | null;
  reportUrl: string | null;
}): Promise<string> {
  // PDF text extraction is still a wire-up TODO (see PRIORITY_TRANSLATION_BACKEND.md
  // §5: pdf-parse / pdfjs-dist not yet added). Until then, surface the URL or
  // storage path as-is so Claude has at least the raw pointer to reason about,
  // and fail loudly rather than producing silent junk when neither is set.
  if (args.reportUrl) return `Inspection report URL: ${args.reportUrl}`;
  if (args.pdfStoragePath) return `Inspection report stored at: ${args.pdfStoragePath}`;
  throw new Error("loadReportText: no pdfStoragePath or reportUrl present");
}

async function loadPropertyAddress(db: any, propertyId: string): Promise<string> {
  const rows = await db.select().from(portalProperties).where(eq(portalProperties.id, propertyId)).limit(1);
  const p = rows[0];
  if (!p) return "";
  return [p.street, p.city, p.state, p.zip].filter(Boolean).join(", ");
}

async function loadFirstName(db: any, portalAccountId: string): Promise<string> {
  const rows = await db.select().from(portalAccounts).where(eq(portalAccounts.id, portalAccountId)).limit(1);
  return rows[0]?.firstName ?? "";
}

async function loadEmail(db: any, portalAccountId: string): Promise<string> {
  const rows = await db.select().from(portalAccounts).where(eq(portalAccounts.id, portalAccountId)).limit(1);
  return rows[0]?.email ?? "";
}

export type PriorityTranslationRouter = typeof priorityTranslationRouter;
export type DbPriorityTranslationRow = DbPriorityTranslation;
