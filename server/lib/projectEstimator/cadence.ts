/**
 * server/lib/projectEstimator/cadence.ts
 *
 * Schedules + pauses the post-intake follow-up cadence for a project request,
 * built on top of the existing Lead Nurturer infrastructure (`agentDrafts`
 * table — see drizzle/schema.ts and PR #44).
 *
 *   T+0   Auto-ack landed (handled in booking router via sendBookingInquiryAck)
 *   T+4h  Concierge personal follow-up (SMS)
 *   T+24h Estimate-ready OR missing-info (email; branches on confidence at
 *         worker time — body pre-rendered when scheduled is fine because
 *         the orchestrator updates the draft when it knows confidence).
 *   T+48h View nudge if estimate not viewed
 *   T+5d  360° Method continuity intro
 *   T+10d Long-term nurture
 *
 * Engagement events (appointment.scheduled, customer.replied, subscription.created,
 * estimate.approved, customer.declined) flip pending+ready drafts to cancelled.
 *
 * We use main's `agentDrafts` table directly:
 *   playbookKey = BOOK_CONSULTATION_PLAYBOOK_KEY
 *   stepKey     = one of BookConsultationStepKey
 *   status      = "ready" (drafts are pre-rendered; operator approves at the
 *                  scheduledFor time via /admin/agents/drafts)
 *
 * No separate dispatcher needed — the existing Lead Nurturer UI already
 * surfaces drafts by scheduledFor and lets the operator send/reschedule/cancel.
 */

import { and, eq, inArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { agentDrafts } from "../../../drizzle/schema";
import {
  BOOK_CONSULTATION_PLAYBOOK_KEY,
  type BookConsultationStepKey,
} from "../../../drizzle/schema.bookConsultation";
import {
  buildConciergePersonalFollowupDraft,
  buildEstimateViewNudgeDraft,
  buildLongTermNurtureDraft,
  buildMembershipIntroDraft,
} from "./messaging";

type DbLike = MySql2Database<any>;

const PORTAL_BASE = process.env.PORTAL_BASE_URL || "https://client.handypioneers.com";

// ─── Schedule the full cadence ──────────────────────────────────────────────
export async function scheduleProjectCadence(
  db: DbLike,
  args: {
    customerId: string;
    opportunityId: string;
    projectEstimateId: string;
    firstName: string;
    serviceType: string;
    recipientEmail: string;
    recipientPhone: string | null;
  },
): Promise<void> {
  const now = Date.now();
  const portalProjectUrl = `${PORTAL_BASE}/portal/projects/${args.projectEstimateId}`;

  type Step = {
    stepKey: BookConsultationStepKey;
    hoursOffset: number;
    channel: "email" | "sms";
    subject: string | null;
    body: string;
  };

  const conciergeFollowup = buildConciergePersonalFollowupDraft({
    firstName: args.firstName,
    serviceType: args.serviceType,
  });
  const viewNudge = buildEstimateViewNudgeDraft({
    firstName: args.firstName,
    portalProjectUrl,
  });
  const membership = buildMembershipIntroDraft({ firstName: args.firstName });
  const longTerm = buildLongTermNurtureDraft({ firstName: args.firstName });

  const steps: Step[] = [
    {
      stepKey: "concierge_personal_followup",
      hoursOffset: 4,
      channel: "sms",
      subject: null,
      body: conciergeFollowup.body,
    },
    {
      stepKey: "estimate_ready_or_questions",
      hoursOffset: 24,
      channel: "email",
      subject: viewNudge.subject,
      body: viewNudge.body,
    },
    {
      stepKey: "estimate_view_nudge",
      hoursOffset: 48,
      channel: "email",
      subject: viewNudge.subject,
      body: viewNudge.body,
    },
    {
      stepKey: "membership_intro",
      hoursOffset: 24 * 5,
      channel: "email",
      subject: membership.subject,
      body: membership.body,
    },
    {
      stepKey: "long_term_nurture",
      hoursOffset: 24 * 10,
      channel: "email",
      subject: longTerm.subject,
      body: longTerm.body,
    },
  ];

  for (const s of steps) {
    await db.insert(agentDrafts).values({
      customerId: args.customerId,
      opportunityId: args.opportunityId,
      playbookKey: BOOK_CONSULTATION_PLAYBOOK_KEY,
      stepKey: s.stepKey,
      channel: s.channel,
      status: "ready",
      scheduledFor: new Date(now + s.hoursOffset * 3600 * 1000),
      subject: s.subject,
      body: s.body,
      recipientEmail: args.recipientEmail,
      recipientPhone: args.recipientPhone,
      contextJson: JSON.stringify({
        projectEstimateId: args.projectEstimateId,
        firstName: args.firstName,
        serviceType: args.serviceType,
      }),
      generatedAt: new Date(),
    });
  }
}

// ─── Pause cadence on engagement ────────────────────────────────────────────
export async function pauseCadenceForCustomer(
  db: DbLike,
  args: { customerId: string; reason: string; opportunityId?: string },
): Promise<void> {
  const conds = [
    eq(agentDrafts.customerId, args.customerId),
    eq(agentDrafts.playbookKey, BOOK_CONSULTATION_PLAYBOOK_KEY),
    inArray(agentDrafts.status, ["pending", "ready"]),
  ];
  if (args.opportunityId) {
    conds.push(eq(agentDrafts.opportunityId, args.opportunityId));
  }
  await db
    .update(agentDrafts)
    .set({ status: "cancelled", cancelReason: args.reason })
    .where(and(...conds));
}
