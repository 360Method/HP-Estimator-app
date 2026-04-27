/**
 * server/lib/priorityTranslation/backfill.ts
 *
 * One-shot backfill for Roadmap Generator submissions that landed BEFORE
 * the CRM bridge fix (PR #31). Those submissions created portalAccounts /
 * priorityTranslations rows but no CRM customers row, no opportunities
 * row, and no Nurturer notification — so they were invisible in the admin
 * UI even though the homeowner received their email.
 *
 * For every portalAccount with portalAccountId.customerId IS NULL created
 * in the lookback window, this:
 *   1. Find-or-creates a CRM customers row keyed on lower-cased email
 *   2. Back-links portalAccounts.customerId
 *   3. Creates a single opportunities row tagged 'Roadmap Generator (backfill)'
 *      so it's distinguishable from forward-looking submissions
 *   4. Fires onLeadCreated so the Nurturer notification, pipeline_event,
 *      and lead_created automations all execute exactly as they would have
 *      at submit time
 *
 * Idempotent — re-running skips accounts that already have a customerId.
 * Each step is best-effort; one bad row will not abort the rest.
 *
 * Triggered by POST /api/admin/roadmap-diagnostic with INTERNAL_WORKER_KEY.
 */

import { eq, isNull, gte, and, desc } from "drizzle-orm";
import { randomBytes } from "crypto";
import {
  getDb,
  findCustomerByEmail,
  createCustomer,
  createOpportunity,
} from "../../db";
import {
  portalAccounts,
  portalProperties,
  priorityTranslations,
} from "../../../drizzle/schema.priorityTranslation";
import { onLeadCreated } from "../../leadRouting";
import { sendPriorityTranslationReady } from "./email";
import { renderPriorityTranslationPdf } from "./pdf";
import { issueMagicLink } from "./portalAccount";

export type BackfillResult = {
  scanned: number;
  alreadyLinked: number;
  customersCreated: number;
  customersReused: number;
  opportunitiesCreated: number;
  errors: Array<{ portalAccountId: string; reason: string }>;
  fixedAccounts: Array<{
    portalAccountId: string;
    email: string;
    customerId: string;
    opportunityId: string;
    translationsCount: number;
  }>;
};

export async function backfillRoadmapCrmRows(opts: {
  lookbackDays?: number;
}): Promise<BackfillResult> {
  const lookbackDays = opts.lookbackDays ?? 7;
  const since = new Date(Date.now() - lookbackDays * 24 * 3600 * 1000);

  const result: BackfillResult = {
    scanned: 0,
    alreadyLinked: 0,
    customersCreated: 0,
    customersReused: 0,
    opportunitiesCreated: 0,
    errors: [],
    fixedAccounts: [],
  };

  const db = await getDb();
  if (!db) {
    result.errors.push({ portalAccountId: "*", reason: "DB unavailable" });
    return result;
  }

  // Pull every portalAccount in the window. We re-check customerId per row
  // so a re-run is idempotent even if some rows got linked between scan and
  // process (e.g. concurrent forward-looking submission).
  const rows = await db
    .select()
    .from(portalAccounts)
    .where(gte(portalAccounts.createdAt, since))
    .orderBy(desc(portalAccounts.createdAt));

  result.scanned = rows.length;

  for (const acct of rows) {
    if (acct.customerId) {
      result.alreadyLinked++;
      continue;
    }

    try {
      const emailNorm = (acct.email ?? "").trim().toLowerCase();
      if (!emailNorm) {
        result.errors.push({
          portalAccountId: acct.id,
          reason: "portalAccount has empty email",
        });
        continue;
      }

      // Look up the most recent property for this account so the customer
      // row gets a real address, and so the opportunity notes can include it.
      const props = await db
        .select()
        .from(portalProperties)
        .where(eq(portalProperties.portalAccountId, acct.id))
        .orderBy(desc(portalProperties.createdAt))
        .limit(1);
      const property = props[0];

      // Find-or-create the CRM customer.
      let customerId: string;
      const existing = await findCustomerByEmail(emailNorm);
      if (existing) {
        customerId = existing.id;
        result.customersReused++;
      } else {
        const newCustomerId = randomBytes(8).toString("hex");
        const created = await createCustomer({
          id: newCustomerId,
          firstName: acct.firstName ?? "",
          lastName: acct.lastName ?? "",
          displayName:
            `${acct.firstName ?? ""} ${acct.lastName ?? ""}`.trim() || emailNorm,
          email: emailNorm,
          mobilePhone: acct.phone ?? "",
          homePhone: "",
          workPhone: "",
          company: "",
          role: "",
          customerType: "homeowner",
          doNotService: false,
          street: property?.street ?? "",
          unit: property?.unit ?? "",
          city: property?.city ?? "",
          state: property?.state ?? "",
          zip: property?.zip ?? "",
          billsTo: "",
          leadSource: "Roadmap Generator (backfill)",
          referredBy: "",
          sendNotifications: true,
          sendMarketingOptIn: false,
          lifetimeValue: 0,
          outstandingBalance: 0,
          tags: "[]",
        });
        customerId = created.id;
        result.customersCreated++;
      }

      // Back-link the portal account.
      await db
        .update(portalAccounts)
        .set({ customerId })
        .where(eq(portalAccounts.id, acct.id));

      // Find the most recent priorityTranslation for context in the
      // opportunity notes + a translationsCount in the report.
      const trs = await db
        .select()
        .from(priorityTranslations)
        .where(eq(priorityTranslations.portalAccountId, acct.id))
        .orderBy(desc(priorityTranslations.createdAt));

      const propertyAddressFull = property
        ? [property.street, property.city, property.state, property.zip]
            .filter(Boolean)
            .join(", ")
        : "";

      const opportunityId = randomBytes(8).toString("hex");
      const mostRecent = trs[0];
      await createOpportunity({
        id: opportunityId,
        customerId,
        area: "lead",
        stage: "New Lead",
        title: `Roadmap Generator — ${acct.firstName ?? ""} ${acct.lastName ?? ""}`
          .trim() || `Roadmap Generator — ${emailNorm}`,
        notes:
          `Backfilled from Roadmap Generator submission (PR #31 fix).\n\n` +
          (propertyAddressFull ? `Property: ${propertyAddressFull}\n` : "") +
          (mostRecent
            ? `Most recent translation: ${mostRecent.id} (status=${mostRecent.status})\n`
            : "") +
          `Total translations on this account: ${trs.length}`,
        value: 0,
      });
      result.opportunitiesCreated++;

      // Fire onLeadCreated so the Nurturer sees this in the bell.
      await onLeadCreated({
        opportunityId,
        customerId,
        title: `Roadmap Generator submission — ${acct.firstName ?? ""} ${acct.lastName ?? ""}`
          .trim() || `Roadmap Generator submission — ${emailNorm}`,
        source: "roadmap_generator",
        priority: "high",
      }).catch((e) => {
        // Already inside try/catch — record but don't abort
        result.errors.push({
          portalAccountId: acct.id,
          reason: `onLeadCreated: ${e instanceof Error ? e.message : String(e)}`,
        });
      });

      result.fixedAccounts.push({
        portalAccountId: acct.id,
        email: emailNorm,
        customerId,
        opportunityId,
        translationsCount: trs.length,
      });
    } catch (err) {
      result.errors.push({
        portalAccountId: acct.id,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

/**
 * Diagnostic snapshot — read-only view of recent submissions for
 * troubleshooting without needing direct DB access.
 */
export type DiagnosticSnapshot = {
  recentTranslations: Array<{
    id: string;
    status: string;
    createdAt: Date | string | null;
    deliveredAt: Date | string | null;
    failureReason: string | null;
    portalAccountId: string;
    hasReportUrl: boolean;
    hasPdfStoragePath: boolean;
  }>;
  recentPortalAccounts: Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    customerId: string | null;
    createdAt: Date | string | null;
  }>;
};

export async function snapshotRoadmapPipeline(opts: {
  limit?: number;
}): Promise<DiagnosticSnapshot> {
  const limit = opts.limit ?? 10;
  const db = await getDb();
  if (!db) {
    return { recentTranslations: [], recentPortalAccounts: [] };
  }

  const trs = await db
    .select()
    .from(priorityTranslations)
    .orderBy(desc(priorityTranslations.createdAt))
    .limit(limit);

  const accts = await db
    .select()
    .from(portalAccounts)
    .orderBy(desc(portalAccounts.createdAt))
    .limit(limit);

  return {
    recentTranslations: trs.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
      deliveredAt: r.deliveredAt,
      failureReason: r.failureReason,
      portalAccountId: r.portalAccountId,
      hasReportUrl: !!r.reportUrl,
      hasPdfStoragePath: !!r.pdfStoragePath,
    })),
    recentPortalAccounts: accts.map((a) => ({
      id: a.id,
      email: a.email,
      firstName: a.firstName,
      lastName: a.lastName,
      customerId: a.customerId,
      createdAt: a.createdAt,
    })),
  };
}

/**
 * Send a test Roadmap email — uses the production email + PDF templates so
 * the operator can verify subject line, body copy, attachment filename, and
 * the post-rename branding without submitting a real PDF through the
 * pipeline. Triggered from the diagnostic endpoint with a `to` address.
 */
export async function sendRoadmapTestEmail(opts: {
  to: string;
  firstName?: string;
  propertyAddress?: string;
}): Promise<{ ok: true; resendId: string } | { ok: false; reason: string }> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return { ok: false, reason: "RESEND_API_KEY not set" };

  // Synthetic Claude response so the PDF renderer has something to draw.
  const fakeResponse = {
    summary_1_paragraph:
      "TEST EMAIL — this synthetic roadmap was generated by the operator's diagnostic endpoint to verify branding, subject line, and CTA. The numbers below are illustrative.",
    findings: [
      {
        category: "Roof",
        finding: "Asphalt shingles showing granule loss; ~5 years remaining life.",
        urgency: "SOON" as const,
        investment_range_low_usd: 8500,
        investment_range_high_usd: 14000,
        reasoning: "Granule loss accelerates with each storm; pre-emptive replacement avoids interior water damage.",
      },
      {
        category: "Plumbing",
        finding: "Original galvanized supply lines under master bath.",
        urgency: "WAIT" as const,
        investment_range_low_usd: 2800,
        investment_range_high_usd: 4200,
        reasoning: "Functional today; plan replacement on next bathroom remodel.",
      },
    ],
  };

  const firstName = opts.firstName || "there";
  const propertyAddress = opts.propertyAddress || "1234 Test Avenue, Vancouver, WA 98660";

  let pdfBuffer: Uint8Array;
  try {
    pdfBuffer = await renderPriorityTranslationPdf({
      firstName,
      propertyAddress,
      claudeResponse: fakeResponse,
    });
  } catch (err) {
    return {
      ok: false,
      reason: `PDF render failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const portalBaseUrl = "https://pro.handypioneers.com";
  const roadmapUrl = `${portalBaseUrl}/portal/roadmap/submitted/pt_test_diagnostic`;

  try {
    const result = await sendPriorityTranslationReady({
      apiKey: resendKey,
      to: opts.to,
      firstName,
      magicLinkUrl: roadmapUrl,
      pdfBuffer,
      propertyAddress,
    });
    return { ok: true, resendId: result.id };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Issue a fresh magic link for an existing portalAccount — diagnostic only.
 * Returns the raw token + the full URL the homeowner would click. Used to
 * curl-verify the verifyToken bridge end-to-end without sending a real
 * email or running the Claude pipeline.
 */
export async function issueDiagnosticMagicLink(opts: {
  portalAccountId: string;
}): Promise<
  | { ok: true; token: string; url: string; expiresAt: Date }
  | { ok: false; reason: string }
> {
  const db = await getDb();
  if (!db) return { ok: false, reason: "DB unavailable" };
  const portalBaseUrl =
    process.env.PORTAL_BASE_URL || "https://client.handypioneers.com";
  try {
    const link = await issueMagicLink(db, {
      portalAccountId: opts.portalAccountId,
      portalBaseUrl,
    });
    return {
      ok: true,
      token: link.token,
      url: link.url,
      expiresAt: link.expiresAt,
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
