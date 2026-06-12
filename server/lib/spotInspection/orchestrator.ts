/**
 * server/lib/spotInspection/orchestrator.ts
 *
 * Spot inspection lifecycle (360 Method Step 2, the doctor-style visit).
 * For any client, member or not: a member's spot visit builds on their
 * baseline; for a non-member it doubles as a first taste of the method.
 * Reuses the Roadmap Generator pipeline:
 * rows live in priorityTranslations with source='spot_inspection', the PDF
 * renderer and health record merge are shared, and the portal surfaces the
 * finished mini roadmap through the existing roadmap page plus a portal
 * document.
 *
 * The hard gate: the AI draft stays on the consultant's device
 * (awaiting_review) until a human approves it. The PDF renders at approval
 * time so consultant edits are exactly what the customer sees. On approval
 * the customer gets it in the portal AND by email immediately (Marcin,
 * 2026-06-12).
 */
import { eq } from "drizzle-orm";
import { getDb, getCustomerById } from "../../db";
import {
  priorityTranslations,
  homeHealthRecords,
  portalAccounts,
  portalProperties,
  type ClaudePriorityTranslationResponse,
  type SpotInspectionPhoto,
} from "../../../drizzle/schema.priorityTranslation";
import { portalCustomers, threeSixtyMemberships } from "../../../drizzle/schema";
import { TIER_DEFINITIONS, type MemberTier } from "../../../shared/threeSixtyTiers";
import { mergeFindings, newTranslationId } from "../priorityTranslation/processor";
import {
  findOrCreatePortalAccount,
  findOrCreatePortalProperty,
  findOrCreateHealthRecord,
  issueMagicLink,
} from "../priorityTranslation/portalAccount";
import { renderPriorityTranslationPdf } from "../priorityTranslation/pdf";
import { sendPriorityTranslationReady } from "../priorityTranslation/email";
import { callClaudeForSpotInspection } from "./processor";
import { assertTransition, canApprove } from "./status";
import { storagePut } from "../../storage";
import { addPortalDocument } from "../../portalDb";

export type CreateSpotInspectionInput = {
  hpCustomerId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  street: string;
  city?: string;
  state?: string;
  zip?: string;
};

export async function createSpotInspection(input: CreateSpotInspectionInput): Promise<{ id: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  if (!input.email.trim()) throw new Error("The customer needs an email so the roadmap can reach them");

  const account = await findOrCreatePortalAccount(db, {
    email: input.email,
    firstName: input.firstName ?? "",
    lastName: input.lastName ?? "",
    phone: input.phone ?? "",
  });
  if (account.customerId !== input.hpCustomerId) {
    await db
      .update(portalAccounts)
      .set({ customerId: input.hpCustomerId })
      .where(eq(portalAccounts.id, account.id));
  }

  const property = await findOrCreatePortalProperty(db, {
    portalAccountId: account.id,
    street: input.street.trim(),
    city: input.city?.trim() ?? "",
    state: input.state?.trim() ?? "",
    zip: input.zip?.trim() ?? "",
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
    source: "spot_inspection",
    hpCustomerId: input.hpCustomerId,
    capturedPhotosJson: [],
    status: "submitted",
  });
  return { id };
}

async function loadRow(id: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const [row] = await db
    .select()
    .from(priorityTranslations)
    .where(eq(priorityTranslations.id, id))
    .limit(1);
  if (!row) throw new Error("Spot inspection not found");
  if (row.source !== "spot_inspection") throw new Error("Not a spot inspection row");
  return { db, row };
}

async function propertyAddressFor(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, propertyId: string) {
  const [prop] = await db
    .select()
    .from(portalProperties)
    .where(eq(portalProperties.id, propertyId))
    .limit(1);
  return prop
    ? [prop.street, [prop.city, prop.state].filter(Boolean).join(", "), prop.zip].filter(Boolean).join(", ")
    : "the property";
}

/** Run Claude over the captured photos and notes. Lands in awaiting_review. */
export async function generateMiniRoadmap(id: string): Promise<void> {
  const { db, row } = await loadRow(id);
  assertTransition(row.status, "processing");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  await db
    .update(priorityTranslations)
    .set({ status: "processing", failureReason: null, updatedAt: new Date() })
    .where(eq(priorityTranslations.id, id));

  try {
    const photos = (row.capturedPhotosJson ?? []) as SpotInspectionPhoto[];
    const propertyAddress = await propertyAddressFor(db, row.propertyId);
    const customer = row.hpCustomerId ? await getCustomerById(row.hpCustomerId).catch(() => null) : null;

    // Spot inspections serve members and non-members alike. For a member the
    // visit builds on their baseline, so tell the model: it should write as
    // a continuation of an ongoing care relationship, not a first meeting.
    let memberContext: string | null = customer ? `existing customer ${customer.displayName}` : null;
    if (row.hpCustomerId) {
      try {
        const { or } = await import("drizzle-orm");
        const memberships = await db
          .select({ tier: threeSixtyMemberships.tier, status: threeSixtyMemberships.status })
          .from(threeSixtyMemberships)
          .where(
            or(
              eq(threeSixtyMemberships.hpCustomerId, row.hpCustomerId),
              eq(threeSixtyMemberships.customerId, row.hpCustomerId),
            ),
          );
        const active = memberships.find((m) => m.status === "active");
        if (active) {
          const label = TIER_DEFINITIONS[active.tier as MemberTier]?.label ?? "Proactive Path";
          memberContext = `${label} member on the Proactive Path; this spot visit builds on their baseline and ongoing seasonal care.`;
        }
      } catch {
        // membership context is a nicety, never a blocker
      }
    }

    const claudeResponse = await callClaudeForSpotInspection({
      propertyAddress,
      techNotes: row.techNotes ?? "",
      photos: photos.map((p) => ({ url: p.url, caption: p.caption })),
      memberContext,
      apiKey,
    });

    await db
      .update(priorityTranslations)
      .set({ status: "awaiting_review", claudeResponse, updatedAt: new Date() })
      .where(eq(priorityTranslations.id, id));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await db
      .update(priorityTranslations)
      .set({ status: "failed", failureReason: reason, updatedAt: new Date() })
      .where(eq(priorityTranslations.id, id))
      .catch(() => null);
    throw err;
  }
}

/**
 * Approve the (possibly edited) draft: render the PDF, merge findings into
 * the home health record, file it in the customer's portal documents, and
 * email the magic link plus the PDF right away.
 */
export async function approveAndDeliver(id: string, opts: { approvedBy: string }): Promise<{ pdfUrl: string }> {
  const { db, row } = await loadRow(id);
  if (!canApprove(row.status)) {
    throw new Error("Only a draft that is awaiting review can be approved");
  }
  const claudeResponse = row.claudeResponse as ClaudePriorityTranslationResponse | null;
  if (!claudeResponse?.findings?.length) throw new Error("Nothing to deliver: the draft has no findings");

  const [account] = await db
    .select()
    .from(portalAccounts)
    .where(eq(portalAccounts.id, row.portalAccountId))
    .limit(1);
  if (!account) throw new Error("Portal account missing for this inspection");
  const propertyAddress = await propertyAddressFor(db, row.propertyId);

  // 1. Photos by finding for the PDF (fetch the few Cloudinary images).
  const photos = (row.capturedPhotosJson ?? []) as SpotInspectionPhoto[];
  let photosByFinding: Record<number, Uint8Array[]> | undefined;
  if (photos.some((p) => p.findingIndex != null)) {
    photosByFinding = {};
    for (const photo of photos) {
      if (photo.findingIndex == null) continue;
      try {
        const res = await fetch(photo.url);
        if (!res.ok) continue;
        const bytes = new Uint8Array(await res.arrayBuffer());
        (photosByFinding[photo.findingIndex] ??= []).push(bytes);
      } catch {
        // photo problems never block delivery
      }
    }
    if (Object.keys(photosByFinding).length === 0) photosByFinding = undefined;
  }

  // 2. Render and store the PDF (consultant edits included).
  const pdfBytes = await renderPriorityTranslationPdf({
    firstName: account.firstName ?? "",
    propertyAddress,
    claudeResponse,
    photosByFinding,
    photosLabel: "FROM YOUR SPOT INSPECTION",
  });
  const stored = await storagePut(`spot-inspections/${id}.pdf`, pdfBytes, "application/pdf");

  // 3. Merge findings into the living home health record.
  if (row.homeHealthRecordId) {
    const [existing] = await db
      .select()
      .from(homeHealthRecords)
      .where(eq(homeHealthRecords.id, row.homeHealthRecordId))
      .limit(1);
    const merged = mergeFindings(existing?.findings ?? [], claudeResponse.findings, id).map((f) =>
      f.source_id === id ? { ...f, source: "spot_inspection" as const } : f,
    );
    await db
      .update(homeHealthRecords)
      .set({ findings: merged, summary: claudeResponse.summary_1_paragraph, updatedAt: new Date() })
      .where(eq(homeHealthRecords.id, row.homeHealthRecordId));
  }

  // 4. File it in portal documents when the customer has a portal login.
  if (row.hpCustomerId) {
    try {
      const [portalCustomer] = await db
        .select()
        .from(portalCustomers)
        .where(eq(portalCustomers.hpCustomerId, row.hpCustomerId))
        .limit(1);
      if (portalCustomer) {
        await addPortalDocument({
          portalCustomerId: portalCustomer.id,
          name: `Spot inspection mini roadmap, ${new Date().toLocaleDateString("en-US")}`,
          url: stored.url,
          fileKey: stored.key,
          mimeType: "application/pdf",
        });
      }
    } catch (err) {
      console.warn(`[spot-inspection] portal document filing failed for ${id}:`, err);
    }
  }

  // 5. Email the customer right away: magic link to the roadmap page + PDF.
  try {
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) throw new Error("RESEND_API_KEY not set");
    const portalBaseUrl = process.env.PORTAL_BASE_URL || "https://client.handypioneers.com";
    const link = await issueMagicLink(db, { portalAccountId: account.id, portalBaseUrl });
    const redirectPath = `/portal/roadmap/submitted/${id}`;
    await sendPriorityTranslationReady({
      apiKey: resendKey,
      to: account.email,
      firstName: account.firstName ?? "",
      magicLinkUrl: `${link.url}&redirect=${encodeURIComponent(redirectPath)}`,
      pdfBuffer: pdfBytes,
      propertyAddress,
    });
  } catch (err) {
    // The portal copy is already live; a failed email logs loudly but does
    // not roll back the approval.
    console.error(`[spot-inspection] delivery email failed for ${id}:`, err);
  }

  // 6. Mark completed (the portal only ever shows completed spot rows).
  await db
    .update(priorityTranslations)
    .set({
      status: "completed",
      outputPdfPath: stored.url,
      approvedBy: opts.approvedBy,
      approvedAt: new Date(),
      deliveredAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(priorityTranslations.id, id));

  return { pdfUrl: stored.url };
}
