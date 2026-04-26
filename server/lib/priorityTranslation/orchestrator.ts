/**
 * server/lib/priorityTranslation/orchestrator.ts
 *
 * End-to-end orchestrator for a Roadmap Generator submission. Called inline
 * from the Express multipart route on /api/roadmap-generator/submit.
 *
 * Two-phase: the synchronous portion creates the portal account/property/health
 * record + DB row and returns a translation id immediately. The async portion
 * (kicked off via setImmediate) runs Claude, renders the PDF, and emails the
 * homeowner — too long to block the HTTP response on.
 *
 * No queue infrastructure is wired yet; this collapses what would have been a
 * worker job into in-process work. Acceptable while volume is low.
 */

import { eq } from "drizzle-orm";
import path from "path";
import fs from "fs";
import { getDb } from "../../db";
import {
  priorityTranslations,
  homeHealthRecords,
} from "../../../drizzle/schema.priorityTranslation";
import {
  parseAddress,
  callClaudeForTranslation,
  mergeFindings,
  newTranslationId,
} from "./processor";
import {
  findOrCreatePortalAccount,
  findOrCreatePortalProperty,
  findOrCreateHealthRecord,
  issueMagicLink,
} from "./portalAccount";
import { renderPriorityTranslationPdf } from "./pdf";
import { sendPriorityTranslationReady } from "./email";

const UPLOAD_BASE = process.env.UPLOAD_VOLUME_PATH || "/tmp";
const UPLOAD_DIR = path.join(UPLOAD_BASE, "roadmap-generator");

function ensureUploadDir() {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  } catch (err) {
    console.warn("[roadmap-generator] failed to create upload dir", err);
  }
}

export type RoadmapSubmissionInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  propertyAddress: string;
  notes?: string;
  pdfBuffer?: Buffer;
  pdfOriginalName?: string;
  reportUrl?: string;
};

export type RoadmapSubmissionResult = {
  id: string;
  portalAccountId: string;
  status: "submitted" | "processing";
};

/**
 * Synchronously creates the DB row, then kicks off async processing.
 * Returns the translation id immediately. Email lands ~30–60s later.
 */
export async function submitRoadmap(
  input: RoadmapSubmissionInput,
): Promise<RoadmapSubmissionResult> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  if (!input.pdfBuffer && !input.reportUrl) {
    throw new Error("Provide a PDF upload or reportUrl");
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

  // Persist PDF buffer to volume so it can be re-processed if processing
  // fails and we need to retry manually. Skip if reportUrl-only.
  let pdfStoragePath: string | null = null;
  if (input.pdfBuffer) {
    ensureUploadDir();
    pdfStoragePath = path.join(UPLOAD_DIR, `${id}.pdf`);
    try {
      fs.writeFileSync(pdfStoragePath, input.pdfBuffer);
    } catch (err) {
      console.warn(`[roadmap-generator] failed to persist pdf for ${id}`, err);
      pdfStoragePath = null;
    }
  }

  await db.insert(priorityTranslations).values({
    id,
    portalAccountId: account.id,
    propertyId: property.id,
    homeHealthRecordId: healthRecord.id,
    pdfStoragePath,
    reportUrl: input.reportUrl ?? null,
    notes: input.notes ?? null,
    status: "processing",
  });

  // Kick off async processing. Errors are caught and surfaced via the row's
  // failureReason column + an owner notification email.
  const propertyAddressFull = [parsed.street, parsed.city, parsed.state, parsed.zip]
    .filter(Boolean)
    .join(", ");
  setImmediate(() => {
    processRoadmap({
      id,
      portalAccountId: account.id,
      propertyId: property.id,
      homeHealthRecordId: healthRecord.id,
      firstName: account.firstName,
      email: account.email,
      propertyAddress: propertyAddressFull,
      pdfBuffer: input.pdfBuffer,
      reportUrl: input.reportUrl,
    }).catch((err) => {
      console.error(`[roadmap-generator] async processing failed for ${id}`, err);
    });
  });

  return { id, portalAccountId: account.id, status: "processing" };
}

type ProcessArgs = {
  id: string;
  portalAccountId: string;
  propertyId: string;
  homeHealthRecordId: string;
  firstName: string;
  email: string;
  propertyAddress: string;
  pdfBuffer?: Buffer;
  reportUrl?: string;
};

async function processRoadmap(args: ProcessArgs): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable in processRoadmap");

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    // 1. Claude — pass PDF directly as document block (handles scans via OCR).
    const claudeResponse = await callClaudeForTranslation({
      propertyAddress: args.propertyAddress,
      pdfBuffer: args.pdfBuffer,
      reportText: args.reportUrl ? `Inspection report URL: ${args.reportUrl}` : undefined,
      apiKey,
    });

    // 2. Merge into health record.
    const existing = await db
      .select()
      .from(homeHealthRecords)
      .where(eq(homeHealthRecords.id, args.homeHealthRecordId))
      .limit(1);
    const merged = mergeFindings(
      existing[0]?.findings ?? [],
      claudeResponse.findings,
      args.id,
    );
    await db
      .update(homeHealthRecords)
      .set({
        findings: merged,
        summary: claudeResponse.summary_1_paragraph,
        updatedAt: new Date(),
      })
      .where(eq(homeHealthRecords.id, args.homeHealthRecordId));

    // 3. Render PDF.
    const pdfBuffer = await renderPriorityTranslationPdf({
      firstName: args.firstName,
      propertyAddress: args.propertyAddress,
      claudeResponse,
    });

    // 4. Magic link + email.
    const portalBaseUrl = process.env.PORTAL_BASE_URL || "https://pro.handypioneers.com";
    const link = await issueMagicLink(db, {
      portalAccountId: args.portalAccountId,
      portalBaseUrl,
    });
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) throw new Error("RESEND_API_KEY not set");

    await sendPriorityTranslationReady({
      apiKey: resendKey,
      to: args.email,
      firstName: args.firstName,
      magicLinkUrl: link.url,
      pdfBuffer,
      propertyAddress: args.propertyAddress,
    });

    // 5. Mark completed.
    await db
      .update(priorityTranslations)
      .set({
        status: "completed",
        claudeResponse,
        deliveredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(priorityTranslations.id, args.id));

    console.log(
      `[roadmap-generator] delivered ${args.id} to ${args.email} (${claudeResponse.findings.length} findings)`,
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await db
      .update(priorityTranslations)
      .set({
        status: "failed",
        failureReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(priorityTranslations.id, args.id))
      .catch(() => null);

    // Owner notification — don't await on the import so this stays fire-and-forget.
    notifyOwnerOfFailure(args, reason).catch(() => null);
    throw err;
  }
}

async function notifyOwnerOfFailure(args: ProcessArgs, reason: string) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Handy Pioneers <noreply@handypioneers.com>",
        to: ["help@handypioneers.com"],
        subject: `[Roadmap Generator] FAILED — ${args.email}`,
        text:
          `Roadmap Generator submission failed.\n\n` +
          `ID: ${args.id}\n` +
          `Email: ${args.email}\n` +
          `Property: ${args.propertyAddress}\n` +
          `Reason: ${reason}\n\n` +
          `The customer was NOT emailed. Follow up manually or retry processing.`,
      }),
    });
  } catch {
    /* swallow — owner notification is best-effort */
  }
}
