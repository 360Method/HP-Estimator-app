/**
 * server/lib/projectEstimator/estimator.ts
 *
 * Orchestrator for the Book Consultation pipeline. Called from the booking
 * router after a /book submit (auto-ack itself is handled at the booking
 * layer via sendBookingInquiryAck — we don't duplicate it here).
 *
 *   1. Provision portal account (find-or-create, mirroring priorityTranslation).
 *   2. Insert projectEstimates row in `submitted` status.
 *   3. Schedule cadence (T+4h..T+10d) into main's agentDrafts table.
 *   4. Run estimator worker (Anthropic call → margin enforce → save).
 *   5. Confidence gate:
 *        high   → flip to delivered, queue concierge_estimate_ready draft.
 *        medium → flip to needs_review, notify Marcin (admin inbox).
 *        low    → flip to needs_info, queue nurturer_missing_info draft.
 *
 * The Lead Nurturer's existing /admin/agents/drafts UI surfaces all queued
 * drafts; the operator approves/sends from there.
 */

import { eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import {
  projectEstimates,
  type DbProjectEstimate,
  type EstimatorClaudeResponse,
  BOOK_CONSULTATION_PLAYBOOK_KEY,
} from "../../../drizzle/schema.bookConsultation";
import { agentDrafts } from "../../../drizzle/schema";
import {
  findOrCreatePortalAccount,
  findOrCreatePortalProperty,
} from "../priorityTranslation/portalAccount";
import { callClaudeForEstimate, newProjectEstimateId } from "./processor";
import {
  buildEstimateReadyEmail,
  buildMissingInfoDraft,
} from "./messaging";
import { scheduleProjectCadence } from "./cadence";

type DbLike = MySql2Database<any>;

export type SubmitInput = {
  customerId: string;
  opportunityId: string;
  onlineRequestId: number | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  smsConsent: boolean;
  serviceType: string;
  description: string;
  timeline: string;
  street: string;
  unit: string;
  city: string;
  state: string;
  zip: string;
  photoUrls: string[];
};

export type SubmitResult = {
  projectEstimateId: string;
  portalAccountId: string;
  redirectUrl: string;
};

const PORTAL_BASE = process.env.PORTAL_BASE_URL || "https://client.handypioneers.com";

/**
 * Stage 1 — synchronous portion. Provisions account + estimate row +
 * cadence. The Claude worker is fired asynchronously; the row populates
 * over the next ~30s.
 */
export async function startProjectEstimate(
  db: DbLike,
  input: SubmitInput,
): Promise<SubmitResult> {
  // 1. Portal account + property.
  const account = await findOrCreatePortalAccount(db, {
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
  });
  await findOrCreatePortalProperty(db, {
    portalAccountId: account.id,
    street: input.street,
    city: input.city,
    state: input.state,
    zip: input.zip,
    unit: input.unit,
  });
  // Ensure portal account links back to HP customer.
  if (!account.customerId || account.customerId !== input.customerId) {
    const { portalAccounts } = await import(
      "../../../drizzle/schema.priorityTranslation"
    );
    await db
      .update(portalAccounts)
      .set({ customerId: input.customerId })
      .where(eq(portalAccounts.id, account.id));
  }

  // 2. Persist project estimate row.
  const id = newProjectEstimateId();
  await db.insert(projectEstimates).values({
    id,
    opportunityId: input.opportunityId,
    customerId: input.customerId,
    onlineRequestId: input.onlineRequestId,
    portalAccountId: account.id,
    status: "submitted",
  });

  // 3. Schedule the cadence as agentDrafts rows (booked through main's
  //    Lead Nurturer infrastructure; operator approves via /admin/agents/drafts).
  await scheduleProjectCadence(db, {
    customerId: input.customerId,
    opportunityId: input.opportunityId,
    projectEstimateId: id,
    firstName: input.firstName,
    serviceType: input.serviceType,
    recipientEmail: input.email,
    recipientPhone: input.smsConsent ? input.phone : null,
  }).catch((err) => {
    console.warn("[projectEstimator] schedule cadence failed:", err);
  });

  // 4. Fire the worker async (don't block the HTTP response).
  runEstimatorWorker(db, id, input).catch((err) => {
    console.error("[projectEstimator] worker failed:", err);
  });

  const redirectUrl = `${PORTAL_BASE}/portal/consultation/submitted/${id}`;

  return { projectEstimateId: id, portalAccountId: account.id, redirectUrl };
}

// ─── Estimator worker ───────────────────────────────────────────────────────
async function runEstimatorWorker(
  db: DbLike,
  id: string,
  input: SubmitInput,
): Promise<void> {
  await db
    .update(projectEstimates)
    .set({ status: "processing", updatedAt: new Date() })
    .where(eq(projectEstimates.id, id));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await db
      .update(projectEstimates)
      .set({
        status: "failed",
        failureReason: "ANTHROPIC_API_KEY not set",
        updatedAt: new Date(),
      })
      .where(eq(projectEstimates.id, id));
    return;
  }

  let claudeResponse: EstimatorClaudeResponse;
  try {
    claudeResponse = await callClaudeForEstimate({
      serviceType: input.serviceType,
      description: input.description,
      timeline: input.timeline,
      address: [
        input.street,
        input.unit,
        input.city,
        input.state,
        input.zip,
      ]
        .filter(Boolean)
        .join(", "),
      photoUrls: input.photoUrls,
      apiKey,
    });
  } catch (err) {
    await db
      .update(projectEstimates)
      .set({
        status: "failed",
        failureReason: err instanceof Error ? err.message : String(err),
        updatedAt: new Date(),
      })
      .where(eq(projectEstimates.id, id));
    return;
  }

  // Confidence gate.
  const newStatus =
    claudeResponse.confidence === "high"
      ? "delivered"
      : claudeResponse.confidence === "medium"
        ? "needs_review"
        : "needs_info";

  const marginAudit = buildMarginAudit(claudeResponse);

  await db
    .update(projectEstimates)
    .set({
      status: newStatus,
      confidence: claudeResponse.confidence,
      claudeResponse,
      customerRangeLowUsd: claudeResponse.customer_range_low_usd,
      customerRangeHighUsd: claudeResponse.customer_range_high_usd,
      scopeSummary: claudeResponse.scope_summary,
      inclusionsMd: buildInclusionsMd(claudeResponse),
      marginAudit,
      deliveredAt: newStatus === "delivered" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(projectEstimates.id, id));

  // Confidence-tier draft + notification.
  if (newStatus === "delivered") {
    await queueEstimateReadyDraft(db, id, input);
  } else if (newStatus === "needs_info") {
    await queueMissingInfoDraft(db, id, input, claudeResponse.missing_info_questions);
  } else {
    await notifyOwnerForReview(db, id, input, claudeResponse);
  }

  // Land a bell notification on the customer so the draft is impossible to
  // miss — links into the profile's Pending Your Review section.
  void fireDraftNeedsApprovalBell({
    customerId: input.customerId,
    opportunityId: input.opportunityId,
    confidence: claudeResponse.confidence,
    rangeLow: claudeResponse.customer_range_low_usd,
    rangeHigh: claudeResponse.customer_range_high_usd,
    firstName: input.firstName,
    lastName: input.lastName,
    status: newStatus,
  }).catch((err) => console.warn("[projectEstimator] bell notification failed:", err));
}

async function fireDraftNeedsApprovalBell(params: {
  customerId: string;
  opportunityId: string;
  confidence: "high" | "medium" | "low";
  rangeLow: number;
  rangeHigh: number;
  firstName: string;
  lastName: string;
  status: "delivered" | "needs_review" | "needs_info";
}): Promise<void> {
  const { createNotification, customerLinkUrl, findDefaultUserForRole } = await import(
    "../../leadRouting"
  );
  const consultantId = await findDefaultUserForRole("consultant").catch(() => null);
  const ownerId =
    consultantId ?? (await findDefaultUserForRole("nurturer").catch(() => null));

  const tierLabel =
    params.status === "delivered"
      ? "Estimate ready to share"
      : params.status === "needs_review"
        ? "Estimate awaiting your review"
        : "Estimate needs more info";

  const range = `$${params.rangeLow.toLocaleString()}–$${params.rangeHigh.toLocaleString()}`;
  const customerName = [params.firstName, params.lastName].filter(Boolean).join(" ").trim() || "this customer";

  await createNotification({
    userId: ownerId ?? null,
    role: "consultant",
    eventType: "draft_needs_approval",
    title: `${tierLabel} — ${customerName}`,
    body: `Project Estimator drafted a ${params.confidence}-confidence estimate. Range: ${range}. Review the scope, edits, and approve from ${customerName}'s profile.`,
    linkUrl:
      customerLinkUrl(params.customerId, params.opportunityId) + "&tab=profile&focus=pending-review",
    opportunityId: params.opportunityId,
    customerId: params.customerId,
    priority: params.status === "needs_review" ? "high" : "normal",
  });
}

function buildMarginAudit(r: EstimatorClaudeResponse): string {
  const lines = [
    `Hard cost: $${r.hard_cost_subtotal_usd.toLocaleString()}`,
    `Customer total: $${r.customer_total_usd.toLocaleString()}`,
    `Realized margin: ${r.gross_margin_pct}%`,
    `Range: $${r.customer_range_low_usd.toLocaleString()}–$${r.customer_range_high_usd.toLocaleString()}`,
    `Confidence: ${r.confidence}`,
    `Margin floor applied: ${r.margin_floor_applied ? "yes" : "no"}`,
    `Voice audit passed: ${r.voice_audit_passed ? "yes" : "no"}`,
    `Recommended next step: ${r.recommended_next_step}`,
  ];
  return lines.join("\n");
}

function buildInclusionsMd(r: EstimatorClaudeResponse): string {
  const lines: string[] = ["## What's included", ""];
  for (const e of r.effort_breakdown) {
    lines.push(`- ${e.trade} — ${e.hours} hr${e.hours === 1 ? "" : "s"}`);
  }
  for (const m of r.materials) {
    if (m.quantity > 0) {
      lines.push(`- ${m.description} (${m.quantity})`);
    }
  }
  lines.push("");
  lines.push("## What's not included");
  lines.push("- Permits or municipal fees (passed through at cost when required)");
  lines.push("- Substantial unforeseen scope discovered during execution (handled via written change order)");
  lines.push("- Furniture moving / final cleaning unless noted above");
  return lines.join("\n");
}

async function queueEstimateReadyDraft(
  db: DbLike,
  id: string,
  input: SubmitInput,
): Promise<void> {
  const row = await loadEstimate(db, id);
  if (!row || !row.scopeSummary) return;
  const portalProjectUrl = `${PORTAL_BASE}/portal/projects/${id}`;
  const email = buildEstimateReadyEmail({
    firstName: input.firstName,
    scopeSummary: row.scopeSummary,
    rangeLow: row.customerRangeLowUsd ?? 0,
    rangeHigh: row.customerRangeHighUsd ?? 0,
    portalProjectUrl,
  });
  await db.insert(agentDrafts).values({
    customerId: input.customerId,
    opportunityId: input.opportunityId,
    playbookKey: BOOK_CONSULTATION_PLAYBOOK_KEY,
    stepKey: "estimate_ready_immediate",
    channel: "email",
    status: "ready",
    scheduledFor: new Date(),
    subject: email.subject,
    body: email.text,
    recipientEmail: input.email,
    recipientPhone: null,
    contextJson: JSON.stringify({ projectEstimateId: id }),
    generatedAt: new Date(),
  });
}

async function queueMissingInfoDraft(
  db: DbLike,
  id: string,
  input: SubmitInput,
  questions: string[],
): Promise<void> {
  const safeQuestions =
    questions.length > 0
      ? questions
      : ["Could you share a few photos of the area we'd be working on?"];
  const draft = buildMissingInfoDraft({
    firstName: input.firstName,
    questions: safeQuestions,
  });
  await db.insert(agentDrafts).values({
    customerId: input.customerId,
    opportunityId: input.opportunityId,
    playbookKey: BOOK_CONSULTATION_PLAYBOOK_KEY,
    stepKey: "missing_info_immediate",
    channel: "email",
    status: "ready",
    scheduledFor: new Date(),
    subject: draft.subject,
    body: draft.body,
    recipientEmail: input.email,
    recipientPhone: null,
    contextJson: JSON.stringify({
      projectEstimateId: id,
      questions: safeQuestions,
    }),
    generatedAt: new Date(),
  });
}

async function notifyOwnerForReview(
  db: DbLike,
  id: string,
  input: SubmitInput,
  resp: EstimatorClaudeResponse,
): Promise<void> {
  const { notifyOwner } = await import("../../_core/notification");
  await notifyOwner({
    title: `Estimate needs review — ${input.firstName} ${input.lastName}`,
    content: [
      `Project: ${input.serviceType}`,
      `Confidence: ${resp.confidence}`,
      `Range: $${resp.customer_range_low_usd.toLocaleString()}–$${resp.customer_range_high_usd.toLocaleString()}`,
      `Realized margin: ${resp.gross_margin_pct}%`,
      `Review at: ${PORTAL_BASE.replace("client.", "")}/admin/agents/drafts (estimate id ${id})`,
    ].join("\n"),
  }).catch((err) => console.warn("[projectEstimator] notifyOwner failed:", err));
}

async function loadEstimate(
  db: DbLike,
  id: string,
): Promise<DbProjectEstimate | null> {
  const rows = await db
    .select()
    .from(projectEstimates)
    .where(eq(projectEstimates.id, id))
    .limit(1);
  return rows[0] ?? null;
}

// ─── Re-run worker (operator-triggered) ─────────────────────────────────────
export async function rerunEstimatorWorker(
  db: DbLike,
  id: string,
): Promise<void> {
  const row = await loadEstimate(db, id);
  if (!row) throw new Error("estimate not found");
  const { customers: c, opportunities: o, onlineRequests } = await import(
    "../../../drizzle/schema"
  );
  const customer = (
    await db.select().from(c).where(eq(c.id, row.customerId)).limit(1)
  )[0];
  const opp = (
    await db.select().from(o).where(eq(o.id, row.opportunityId)).limit(1)
  )[0];
  let onlineRequest: any = null;
  if (row.onlineRequestId) {
    onlineRequest = (
      await db
        .select()
        .from(onlineRequests)
        .where(eq(onlineRequests.id, row.onlineRequestId))
        .limit(1)
    )[0];
  }
  if (!customer || !opp) throw new Error("missing customer or opportunity");

  const photoUrls: string[] = (() => {
    try {
      return JSON.parse(onlineRequest?.photoUrls ?? "[]");
    } catch {
      return [];
    }
  })();

  await runEstimatorWorker(db, id, {
    customerId: customer.id,
    opportunityId: opp.id,
    onlineRequestId: row.onlineRequestId ?? null,
    firstName: customer.firstName ?? "",
    lastName: customer.lastName ?? "",
    email: customer.email ?? "",
    phone: customer.mobilePhone ?? "",
    smsConsent: !!customer.sendMarketingOptIn,
    serviceType: onlineRequest?.serviceType ?? "Project request",
    description: onlineRequest?.description ?? opp.notes ?? "",
    timeline: onlineRequest?.timeline ?? "Flexible",
    street: customer.street ?? "",
    unit: customer.unit ?? "",
    city: customer.city ?? "",
    state: customer.state ?? "",
    zip: customer.zip ?? "",
    photoUrls,
  });
}
