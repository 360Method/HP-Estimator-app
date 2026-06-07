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
import { createHash, randomBytes } from "crypto";
import {
  getDb,
  findCustomerByEmail,
  createCustomer,
  createOpportunity,
  getCustomerById,
  getOpportunityById,
  updateOpportunity,
} from "../../db";
import { nanoid } from "nanoid";
import {
  priorityTranslations,
  homeHealthRecords,
  portalAccounts,
  portalProperties,
  type ClaudePriorityTranslationResponse,
} from "../../../drizzle/schema.priorityTranslation";
import { properties } from "../../../drizzle/schema";
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
import { extractReportPhotos, photosForFindings } from "./reportPhotos";
import { sendPriorityTranslationReady } from "./email";
import { onLeadCreated } from "../../leadRouting";

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
  /** Optional since the give-first funnel (2026-06-06) — default "" */
  firstName?: string;
  lastName?: string;
  email: string;
  /** Optional since the give-first funnel (2026-06-06) — default "" */
  phone?: string;
  propertyAddress: string;
  notes?: string;
  pdfBuffer?: Buffer;
  pdfOriginalName?: string;
  reportUrl?: string;
  // ── Funnel linkage (step 1 of the 3-step roadmap funnel created these) ──
  /** CRM customers.id from the step-1 popup — reuse instead of email-dedupe */
  hpCustomerId?: string;
  /** Step-1 lead opportunity id — update it instead of creating a duplicate */
  hpLeadId?: string;
  // ── Structured home fields (step 2 form) — skip parseAddress guessing ──
  city?: string;
  state?: string;
  zip?: string;
  sqft?: number;
  yearBuilt?: number;
  /** personal | investment — the step-2 property-type toggle */
  propertyKind?: string;
  /** Unit count for investment properties (1 = SFR, 2 = duplex, …) */
  unitCount?: number;
  /** Realtor/inspector partner attribution (?ref= on the roadmap page) */
  partnerRef?: string;
  /** Submitter IP (X-Forwarded-For aware) — per-IP daily cap guardrail */
  submitIp?: string;
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
    firstName: input.firstName ?? "",
    lastName: input.lastName ?? "",
    phone: input.phone ?? "",
  });

  // Per-email cap: at most 2 roadmap runs per account per 24 h. Each run costs
  // a full Claude pass + an email — a polite ceiling, not a punishment.
  {
    const { gte, and: andOp, eq: eqOp } = await import("drizzle-orm");
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await db
      .select({ id: priorityTranslations.id })
      .from(priorityTranslations)
      .where(
        andOp(
          eqOp(priorityTranslations.portalAccountId, account.id),
          gte(priorityTranslations.createdAt, dayAgo),
        ),
      );
    if (recent.length >= 2) {
      const err = new Error(
        "Your roadmap is already being prepared — please check your email. If something looks off, reach us at help@handypioneers.com.",
      ) as Error & { code?: string };
      err.code = "RATE_LIMITED";
      throw err;
    }
  }

  // Per-IP cap: at most 5 submissions per IP per 24 h. The per-email cap above
  // is trivially dodged with +aliases; this one isn't. Each run is a full
  // Claude pass, so the ceiling protects real spend.
  if (input.submitIp) {
    const { gte, and: andOp, eq: eqOp } = await import("drizzle-orm");
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const fromIp = await db
      .select({ id: priorityTranslations.id })
      .from(priorityTranslations)
      .where(
        andOp(
          eqOp(priorityTranslations.submitIp, input.submitIp),
          gte(priorityTranslations.createdAt, dayAgo),
        ),
      );
    if (fromIp.length >= 5) {
      const err = new Error(
        "We've received several reports from this connection today. Please try again tomorrow, or reach us at help@handypioneers.com.",
      ) as Error & { code?: string };
      err.code = "RATE_LIMITED";
      throw err;
    }
  }

  // Structured address fields from the funnel's step-2 form win over
  // parseAddress guessing on the free-text line (legacy posts keep the parse).
  const parsedGuess = parseAddress(input.propertyAddress);
  const parsed = {
    street: parsedGuess.street || input.propertyAddress.trim(),
    city: input.city?.trim() || parsedGuess.city,
    state: input.state?.trim() || parsedGuess.state,
    zip: input.zip?.trim() || parsedGuess.zip,
  };
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
    pdfSha256: input.pdfBuffer
      ? createHash("sha256").update(input.pdfBuffer).digest("hex")
      : null,
    submitIp: input.submitIp ?? null,
    status: "processing",
  });

  const propertyAddressFull = [parsed.street, parsed.city, parsed.state, parsed.zip]
    .filter(Boolean)
    .join(", ");

  // ── CRM bridge: every Roadmap submission must land on a customer-rooted
  // record so the Nurturer (and every "open the customer profile" link
  // downstream) has something to resolve. We dedupe by email — if a CRM
  // customer already exists with this email, link to it; otherwise create
  // one. Same for the opportunity (one per submission). The portalAccount
  // is then back-linked via portalAccounts.customerId so every future
  // surface (portal login, health record, magic-link visits) resolves to
  // the same customer.
  let customerId: string | null = null;
  let opportunityId: string | null = null;
  /** True when this submission completes a step-1 funnel lead (update, don't create). */
  let linkedToFunnelLead = false;
  /** Lead titles fall back to the email when the give-first funnel sent no name. */
  const displayNameOrEmail =
    `${input.firstName ?? ""} ${input.lastName ?? ""}`.trim() ||
    input.email.trim().toLowerCase();
  try {
    const emailNorm = input.email.trim().toLowerCase();
    // Funnel linkage first: step 1 of the roadmap funnel already created the
    // customer — reuse it so one funnel walk never makes two CRM records.
    const linked = input.hpCustomerId
      ? await getCustomerById(input.hpCustomerId).catch(() => null)
      : null;
    const existing = linked ?? (await findCustomerByEmail(emailNorm));
    if (existing) {
      customerId = existing.id;
    } else {
      const newCustomerId = randomBytes(8).toString("hex");
      const created = await createCustomer({
        id: newCustomerId,
        firstName: input.firstName ?? "",
        lastName: input.lastName ?? "",
        displayName: `${input.firstName ?? ""} ${input.lastName ?? ""}`.trim() || emailNorm,
        email: emailNorm,
        mobilePhone: input.phone ?? "",
        homePhone: "",
        workPhone: "",
        company: "",
        role: "",
        customerType: "homeowner",
        doNotService: false,
        street: parsed.street,
        unit: "",
        city: parsed.city,
        state: parsed.state,
        zip: parsed.zip,
        billsTo: "",
        leadSource: "Roadmap Generator",
        referredBy: "",
        sendNotifications: true,
        sendMarketingOptIn: false,
        lifetimeValue: 0,
        outstandingBalance: 0,
        tags: "[]",
      });
      customerId = created.id;
    }

    // Back-link the portal account to the CRM customer so future portal
    // surfaces (login, magic-link visits) resolve to the same root entity.
    if (customerId && account.customerId !== customerId) {
      await db
        .update(portalAccounts)
        .set({ customerId })
        .where(eq(portalAccounts.id, account.id));
    }

    const isInvestment = input.propertyKind === "investment";
    const unitLabel = isInvestment
      ? input.unitCount && input.unitCount >= 2
        ? `${input.unitCount} units`
        : "single-family rental"
      : null;
    const title = isInvestment
      ? `Roadmap Generator (Investment — ${unitLabel}) — ${displayNameOrEmail}`
      : `Roadmap Generator — ${displayNameOrEmail}`;
    const submissionBlock =
      `Inspection-report submission via Roadmap Generator.\n\n` +
      `Property: ${propertyAddressFull}\n` +
      (isInvestment ? `INVESTMENT PROPERTY — ${unitLabel}\n` : "") +
      (input.sqft ? `Approx. sq ft: ${input.sqft}\n` : "") +
      (input.yearBuilt ? `Year built: ${input.yearBuilt}\n` : "") +
      (input.partnerRef ? `Partner ref: ${input.partnerRef}\n` : "") +
      `Translation id: ${id}\n` +
      (input.notes ? `\nHomeowner notes:\n${input.notes}` : "");

    // Step-1 funnel lead present → UPDATE it (retitle + append) instead of
    // creating a duplicate opportunity for the same walk-through.
    const funnelLead = input.hpLeadId
      ? await getOpportunityById(input.hpLeadId).catch(() => null)
      : null;
    if (funnelLead && funnelLead.customerId === customerId) {
      opportunityId = funnelLead.id;
      linkedToFunnelLead = true;
      await updateOpportunity(funnelLead.id, {
        title,
        notes: funnelLead.notes ? `${funnelLead.notes}\n\n${submissionBlock}` : submissionBlock,
      });
    } else {
      opportunityId = randomBytes(8).toString("hex");
      await createOpportunity({
        id: opportunityId,
        customerId: customerId,
        area: "lead",
        stage: "New Lead",
        title,
        notes: submissionBlock,
        value: 0,
      });
    }

    // Structured CRM property upsert (sqft/yearBuilt/kind/units) — the
    // authoritative server-side home record. The OTO checkout resolves its
    // size band from this row, so it never depends on the browser's
    // sessionStorage surviving the funnel (the membership funnel's lesson).
    try {
      const cleanStreet = parsed.street.trim();
      if (cleanStreet && customerId) {
        const homeFields = {
          street: cleanStreet,
          city: parsed.city,
          state: parsed.state,
          zip: parsed.zip,
          ...(input.sqft && input.sqft > 0 ? { sqft: input.sqft } : {}),
          ...(input.yearBuilt && input.yearBuilt > 0 ? { yearBuilt: input.yearBuilt } : {}),
          ...(input.propertyKind ? { propertyKind: input.propertyKind } : {}),
          ...(input.unitCount && input.unitCount > 0 ? { unitCount: input.unitCount } : {}),
        };
        const existingProps = await db
          .select()
          .from(properties)
          .where(eq(properties.customerId, customerId));
        const match = existingProps.find(
          (p) => (p.street ?? "").toLowerCase().trim() === cleanStreet.toLowerCase(),
        );
        if (match) {
          await db.update(properties).set(homeFields).where(eq(properties.id, match.id));
        } else {
          await db.insert(properties).values({
            id: nanoid(),
            customerId,
            label: "Home",
            isPrimary: existingProps.length === 0,
            source: "roadmap-funnel",
            ...homeFields,
          });
        }
      }
    } catch (propErr) {
      console.error("[roadmap-generator] structured property upsert failed for", id, propErr);
    }

    // The report landed — drain the step-1 dropout drip (scoped; other
    // cadences untouched).
    if (customerId) {
      try {
        const { cancelPendingFollowupsForCustomer } = await import("../leadNurturer/roadmapFollowup");
        const { ROADMAP_DROPOUT_KEY } = await import("../leadNurturer/playbook");
        await cancelPendingFollowupsForCustomer(customerId, "report_submitted", {
          playbookKey: ROADMAP_DROPOUT_KEY,
        });
      } catch (dripErr) {
        console.error("[roadmap-generator] dropout drip cancel failed for", id, dripErr);
      }
    }
  } catch (err) {
    console.error("[roadmap-generator] CRM bridge failed for", id, err);
    // Don't block the homeowner's email — the priorityTranslations row is
    // already persisted, processing will still fire. Operations team can
    // backfill from priority_translations if this branch errored.
  }

  // ── Lead routing: assign Nurturer, drop pipeline_event, send notification.
  // Best-effort — already-committed DB state is the source of truth.
  // A step-1 funnel lead was already routed at the popup; don't route twice —
  // just tell the owner the report arrived.
  if (opportunityId && customerId) {
    if (linkedToFunnelLead) {
      import("../../_core/notification")
        .then(({ notifyOwner }) =>
          notifyOwner({
            title: `Roadmap report received — ${displayNameOrEmail}`,
            content: `The step-1 lead completed their upload. Property: ${propertyAddressFull}. Translation ${id} is processing.`,
          }),
        )
        .catch((err) => console.error("[roadmap-generator] notifyOwner error for", id, err));
    } else {
      onLeadCreated({
        opportunityId,
        customerId,
        title: `Roadmap Generator submission — ${displayNameOrEmail}`,
        source: "roadmap_generator",
        priority: "high",
      }).catch((err) =>
        console.error("[roadmap-generator] onLeadCreated error for", id, err),
      );
    }
  }

  // Kick off async processing. Errors are caught and surfaced via the row's
  // failureReason column + an owner notification email.
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
      customerId,
      opportunityId,
      phone: input.phone,
    }).catch((err) => {
      console.error(`[roadmap-generator] async processing failed for ${id}`, err);
    });
  });

  return { id, portalAccountId: account.id, status: "processing" };
}

/**
 * Re-run processing for an existing roadmap row (manual retry after a HOLD or
 * failure — e.g. an oversized PDF before the text-extraction fallback landed).
 * Rebuilds ProcessArgs from the stored row: the uploaded PDF is reloaded from
 * the volume (pdfStoragePath), the address from the portal property.
 */
export async function reprocessRoadmap(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const rows = await db
    .select()
    .from(priorityTranslations)
    .where(eq(priorityTranslations.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error(`No priorityTranslations row for ${id}`);

  const accounts = await db
    .select()
    .from(portalAccounts)
    .where(eq(portalAccounts.id, row.portalAccountId))
    .limit(1);
  const account = accounts[0];
  if (!account) throw new Error(`No portal account ${row.portalAccountId} for ${id}`);

  const props = await db
    .select()
    .from(portalProperties)
    .where(eq(portalProperties.id, row.propertyId))
    .limit(1);
  const prop = props[0];
  const propertyAddress = prop
    ? [prop.street, [prop.city, prop.state].filter(Boolean).join(", "), prop.zip]
        .filter(Boolean)
        .join(", ")
    : "the property";

  let pdfBuffer: Buffer | undefined;
  if (row.pdfStoragePath && fs.existsSync(row.pdfStoragePath)) {
    pdfBuffer = fs.readFileSync(row.pdfStoragePath);
  }
  if (!pdfBuffer && !row.reportUrl) {
    throw new Error(`${id} has neither a stored PDF nor a reportUrl to retry from`);
  }

  await db
    .update(priorityTranslations)
    .set({ status: "processing", failureReason: null, updatedAt: new Date() })
    .where(eq(priorityTranslations.id, id));

  console.log(`[roadmap-generator] reprocessing ${id} (${pdfBuffer ? "stored PDF" : "reportUrl"})`);
  await processRoadmap({
    id,
    portalAccountId: account.id,
    propertyId: row.propertyId,
    homeHealthRecordId: row.homeHealthRecordId ?? "",
    firstName: account.firstName ?? "",
    email: account.email,
    propertyAddress,
    pdfBuffer,
    reportUrl: row.reportUrl ?? undefined,
    customerId: account.customerId ?? null,
    opportunityId: null,
  });
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
  /** CRM linkage for the post-delivery nurture cadence */
  customerId?: string | null;
  opportunityId?: string | null;
  phone?: string | null;
};

async function processRoadmap(args: ProcessArgs): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable in processRoadmap");

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    // Global daily cap: each run is a full Claude pass, so a runaway day —
    // scripted abuse or a marketing spike we didn't plan for — gets held for
    // a human decision instead of an open-ended bill. Held submissions park
    // as "submitted" (homeowner sees "report received") and release via the
    // existing reprocess path.
    {
      const cap = Number(process.env.ROADMAP_DAILY_CAP || 25);
      const { gte } = await import("drizzle-orm");
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const todays = await db
        .select({ id: priorityTranslations.id })
        .from(priorityTranslations)
        .where(gte(priorityTranslations.createdAt, dayAgo));
      if (todays.length > cap) {
        await db
          .update(priorityTranslations)
          .set({
            status: "submitted", // parked, not failed
            failureReason: "DAILY_CAP_REACHED_HOLD",
            updatedAt: new Date(),
          })
          .where(eq(priorityTranslations.id, args.id));
        await notifyOwnerOfFailure(
          args,
          `Daily roadmap cap reached (${todays.length} submissions in 24h, cap ${cap}). ` +
            `This submission is HELD — no Claude run, customer not emailed. ` +
            `If volume is legitimate, raise ROADMAP_DAILY_CAP and re-run processing.`,
        ).catch(() => null);
        console.warn(`[roadmap-generator] ${args.id} held — daily cap reached (${todays.length}/${cap})`);
        return;
      }
    }

    // 0. URL-only submissions: Claude cannot fetch URLs, so passing the bare
    // link used to generate a roadmap from nothing. Fetch the URL ourselves —
    // a direct PDF link becomes a real PDF buffer; an HTML report becomes
    // extracted text. If neither yields real content, HOLD for manual review
    // instead of shipping a hallucinated roadmap.
    let reportPdfBuffer = args.pdfBuffer;
    let reportText: string | undefined;
    if (!reportPdfBuffer && args.reportUrl) {
      const fetched = await fetchReportFromUrl(args.reportUrl);
      if (fetched?.kind === "pdf") {
        reportPdfBuffer = fetched.buffer;
      } else if (fetched?.kind === "text") {
        reportText = fetched.text;
      } else {
        await db
          .update(priorityTranslations)
          .set({
            status: "submitted", // parked, not failed — homeowner sees "report received"
            failureReason: "URL_NEEDS_MANUAL_REVIEW",
            updatedAt: new Date(),
          })
          .where(eq(priorityTranslations.id, args.id));
        await notifyOwnerOfFailure(
          args,
          `URL-only submission could not be fetched/extracted (${args.reportUrl}). ` +
            `Open the link manually, save the report as PDF, and re-run processing. ` +
            `No roadmap was generated and the customer was NOT emailed.`,
        ).catch(() => null);
        console.warn(`[roadmap-generator] ${args.id} held for manual review (URL not extractable)`);
        return;
      }
    }

    // The inspector's photos come from this buffer regardless of how the
    // report reaches Claude (document block vs extracted text), so hold on to
    // it before the oversized path lets reportPdfBuffer go.
    const photoSourcePdf = reportPdfBuffer;

    // 0b. Oversized PDFs: the Claude API caps requests at 32 MB and document
    // blocks at 100 pages — large Spectora exports (50–80 MB of photos) 413.
    // Extract the text server-side and translate from that instead; if the
    // PDF has no extractable text (pure scan), HOLD for manual review.
    if (reportPdfBuffer) {
      const API_PDF_BYTE_LIMIT = 18 * 1024 * 1024; // base64 inflates ~1.37x; stay clear of the 32 MB cap
      const API_PDF_PAGE_LIMIT = 95;
      let pageCount = 0;
      try {
        const { getDocumentProxy } = await import("unpdf");
        const proxy = await getDocumentProxy(new Uint8Array(reportPdfBuffer));
        pageCount = proxy.numPages;
      } catch {
        /* page count is advisory; the byte limit still guards */
      }
      if (reportPdfBuffer.length > API_PDF_BYTE_LIMIT || pageCount > API_PDF_PAGE_LIMIT) {
        console.log(
          `[roadmap-generator] ${args.id} PDF too large for API ` +
            `(${(reportPdfBuffer.length / 1024 / 1024).toFixed(1)} MB, ${pageCount} pages) — extracting text`,
        );
        let extracted = "";
        try {
          const { extractText, getDocumentProxy } = await import("unpdf");
          const proxy = await getDocumentProxy(new Uint8Array(reportPdfBuffer));
          // Per-page with [Page N] markers (not mergePages) so Claude can
          // still report source_pages and the photo placement keeps working.
          const res = await extractText(proxy);
          const pages: string[] = Array.isArray(res.text) ? res.text : [String(res.text ?? "")];
          extracted = pages
            .map((t, i) => `[Page ${i + 1}]\n${String(t ?? "").replace(/\s+/g, " ").trim()}`)
            .join("\n\n")
            .trim();
        } catch (err) {
          console.warn(`[roadmap-generator] ${args.id} text extraction failed:`, err);
        }
        if (extracted.length >= 1500) {
          reportText = extracted.slice(0, 400_000);
          reportPdfBuffer = undefined;
        } else {
          await db
            .update(priorityTranslations)
            .set({
              status: "submitted", // parked, not failed — homeowner sees "report received"
              failureReason: "PDF_TOO_LARGE_NEEDS_MANUAL_REVIEW",
              updatedAt: new Date(),
            })
            .where(eq(priorityTranslations.id, args.id));
          await notifyOwnerOfFailure(
            args,
            `PDF is too large for automated processing and has no extractable text ` +
              `(likely a scanned report). Compress or split the PDF and re-run processing. ` +
              `No roadmap was generated and the customer was NOT emailed.`,
          ).catch(() => null);
          console.warn(`[roadmap-generator] ${args.id} held for manual review (PDF too large, no text)`);
          return;
        }
      }
    }

    // 0c. Dedupe guardrail: the same report resubmitted (same person retrying,
    // a realtor blasting one PDF through aliases) must not buy a second full
    // Claude pass. Hash whatever we're actually translating and reuse the
    // stored response from a completed run of the same bytes in the last 30
    // days. Rendering, photos, and the email still run fresh for this
    // submitter.
    let reusedResponse: ClaudePriorityTranslationResponse | null = null;
    {
      const hashSource = photoSourcePdf ?? (reportText ? Buffer.from(reportText) : null);
      if (hashSource) {
        const sha = createHash("sha256").update(hashSource).digest("hex");
        const { and: andOp, eq: eqOp, gte, ne, desc, isNotNull } = await import("drizzle-orm");
        await db
          .update(priorityTranslations)
          .set({ pdfSha256: sha, updatedAt: new Date() })
          .where(eq(priorityTranslations.id, args.id));
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const prior = await db
          .select()
          .from(priorityTranslations)
          .where(
            andOp(
              eqOp(priorityTranslations.pdfSha256, sha),
              eqOp(priorityTranslations.status, "completed"),
              ne(priorityTranslations.id, args.id),
              gte(priorityTranslations.createdAt, monthAgo),
              isNotNull(priorityTranslations.claudeResponse),
            ),
          )
          .orderBy(desc(priorityTranslations.createdAt))
          .limit(1);
        if (prior[0]?.claudeResponse) {
          reusedResponse =
            typeof prior[0].claudeResponse === "string"
              ? JSON.parse(prior[0].claudeResponse)
              : prior[0].claudeResponse;
          console.log(
            `[roadmap-generator] ${args.id} dedupe hit — reusing Claude response from ${prior[0].id} (same report sha)`,
          );
        }
      }
    }

    // 1. Claude — pass PDF directly as document block (handles scans via OCR).
    // Skipped entirely on a dedupe hit.
    const claudeResponse =
      reusedResponse ??
      (await callClaudeForTranslation({
        propertyAddress: args.propertyAddress,
        pdfBuffer: reportPdfBuffer,
        reportText,
        apiKey,
      }));

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

    // 3. Render PDF — with the inspector's own photos beside each finding,
    // pulled from the report PDF via the source_pages Claude cited. Photo
    // problems never block delivery; the roadmap just ships photo-less.
    let photosByFinding: Record<number, Uint8Array[]> | undefined;
    if (photoSourcePdf) {
      try {
        const photosByPage = await extractReportPhotos(new Uint8Array(photoSourcePdf));
        if (photosByPage.size > 0) {
          photosByFinding = photosForFindings({
            findings: claudeResponse.findings ?? [],
            photosByPage,
          });
          const attached = Object.values(photosByFinding).reduce((n, p) => n + p.length, 0);
          console.log(
            `[roadmap-generator] ${args.id} photos: ${photosByPage.size} report pages with usable images, ${attached} attached across ${Object.keys(photosByFinding).length} findings`,
          );
        }
      } catch (err) {
        console.warn(`[roadmap-generator] ${args.id} photo extraction skipped:`, err);
      }
    }

    const pdfBuffer = await renderPriorityTranslationPdf({
      firstName: args.firstName,
      propertyAddress: args.propertyAddress,
      claudeResponse,
      photosByFinding,
      photosLabel: "FROM YOUR INSPECTION REPORT",
    });

    // 4. Magic link + email.
    //
    // PORTAL_BASE_URL is the customer-facing portal subdomain
    // (client.handypioneers.com in prod). The magic link goes through the
    // portal's auth route; verifyToken now bridges portalMagicLinks via
    // consumeRoadmapMagicLinkAsPortalCustomer so the homeowner ends up with
    // a real portalSession after clicking. We pass &redirect= so they land
    // on the public roadmap page either way (succeeded auth or already-
    // consumed token).
    const portalBaseUrl =
      process.env.PORTAL_BASE_URL || "https://client.handypioneers.com";
    const link = await issueMagicLink(db, {
      portalAccountId: args.portalAccountId,
      portalBaseUrl,
    });
    const redirectPath = `/portal/roadmap/submitted/${args.id}`;
    const magicLinkUrl = `${link.url}&redirect=${encodeURIComponent(redirectPath)}`;

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) throw new Error("RESEND_API_KEY not set");

    await sendPriorityTranslationReady({
      apiKey: resendKey,
      to: args.email,
      firstName: args.firstName,
      magicLinkUrl,
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

    // 6. Schedule the post-delivery nurture cadence (roadmap_followup). The
    // legacy tRPC path always did this; the Express path previously never did
    // — marketing-site submissions got no follow-up. Best-effort.
    if (args.customerId) {
      try {
        const { scheduleRoadmapFollowup } = await import("../leadNurturer/roadmapFollowup");
        const result = await scheduleRoadmapFollowup({
          customerId: args.customerId,
          opportunityId: args.opportunityId ?? null,
          portalAccountId: args.portalAccountId,
          homeHealthRecordId: args.homeHealthRecordId,
          recipientEmail: args.email,
          recipientPhone: args.phone ?? null,
        });
        console.log(
          `[roadmap-generator] roadmap_followup for ${args.id}: scheduled=${result.scheduled} skipped=${result.skipped ?? "no"}`,
        );
      } catch (nurtureErr) {
        console.error(`[roadmap-generator] followup scheduling failed for ${args.id}`, nurtureErr);
      }
    }
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

/**
 * Fetch a web-hosted inspection report. Direct PDF links (common for
 * HomeGauge/Dropbox-style shares) come back as a buffer; HTML pages come back
 * as stripped text when there's enough of it to be a real report. JS-rendered
 * SPAs (some Spectora links) yield a thin shell — those return null and the
 * submission is held for manual review.
 */
async function fetchReportFromUrl(
  url: string,
): Promise<{ kind: "pdf"; buffer: Buffer } | { kind: "text"; text: string } | null> {
  const MAX_BYTES = 25 * 1024 * 1024;
  const MIN_TEXT_CHARS = 1500;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "HandyPioneers-RoadmapGenerator/1.0" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    const raw = Buffer.from(await res.arrayBuffer());
    if (raw.length > MAX_BYTES) return null;
    if (contentType.includes("application/pdf") || raw.subarray(0, 5).toString() === "%PDF-") {
      return { kind: "pdf", buffer: raw };
    }
    if (contentType.includes("text/html") || contentType.includes("text/plain")) {
      const text = raw
        .toString("utf8")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&[a-z#0-9]+;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (text.length >= MIN_TEXT_CHARS) {
        return { kind: "text", text: text.slice(0, 400_000) };
      }
    }
    return null;
  } catch (err) {
    console.warn(`[roadmap-generator] report URL fetch failed (${url}):`, err);
    return null;
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
