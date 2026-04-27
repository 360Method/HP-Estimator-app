/**
 * Lead Nurturer — post-Roadmap follow-up orchestrator.
 *
 * Flow:
 *   1. `scheduleRoadmapFollowup()` — called when a Roadmap is delivered. Loads
 *      the operator's `roadmap_followup` playbook, computes the scheduledFor
 *      timestamp for each step, and inserts one `agentDrafts` row per step in
 *      `pending` status (no body yet).
 *
 *   2. `runDueDrafts()` — boot-time interval worker. Picks up pending drafts
 *      whose `scheduledFor <= now`, gathers customer + homeHealthRecord
 *      context, asks Claude to render the body, marks them `ready` (NOT sent
 *      — approval is operator-driven from the admin inbox).
 *
 *   3. `cancelPendingFollowupsForCustomer()` — engagement triggers (booking,
 *      subscription, decline, reply) call this to drain the queue when the
 *      customer has chosen a path.
 *
 *   4. `sendDraft()` — operator-approved send path. Routes through Resend or
 *      Twilio depending on channel.
 *
 * Customer.bypassAutoNurture short-circuits step 1; the per-customer escape
 * hatch Marcin asked for.
 */
import { and, asc, eq, lte } from "drizzle-orm";
import { getDb } from "../../db";
import {
  agentDrafts,
  customers,
  type DbAgentDraft,
  type InsertDbAgentDraft,
} from "../../../drizzle/schema";
import {
  homeHealthRecords,
  portalAccounts,
  type HealthRecordFinding,
} from "../../../drizzle/schema.priorityTranslation";
import { findDefaultUserForRole } from "../../leadRouting";
import { sendSms, isTwilioConfigured } from "../../twilio";
import { sendEmail as sendGmail } from "../../gmail";
import {
  loadPlaybook,
  planSchedule,
  ROADMAP_FOLLOWUP_KEY,
  type ResolvedPlaybook,
} from "./playbook";
import { generateDraftBody, detectBannedWords, type DraftContext } from "./draftGenerator";

// ─── Trigger: schedule the cadence ────────────────────────────────────────────

export interface ScheduleRoadmapFollowupArgs {
  customerId: string;
  opportunityId?: string | null;
  /**
   * Optional context — if the caller has it pre-loaded (e.g. the
   * priorityTranslation worker), passing it skips a DB hop.
   */
  portalAccountId?: string | null;
  homeHealthRecordId?: string | null;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  startedAt?: Date;
}

export interface ScheduleResult {
  scheduled: number;
  skipped: "bypass_auto_nurture" | "playbook_disabled" | "no_steps" | null;
  draftIds: number[];
}

/**
 * Insert one pending draft per step. Idempotent on (customerId, playbookKey,
 * stepKey) — re-running the same playbook for the same customer cancels the
 * previous run first so the operator never sees stale drafts.
 */
export async function scheduleRoadmapFollowup(
  args: ScheduleRoadmapFollowupArgs,
): Promise<ScheduleResult> {
  const db = await getDb();
  if (!db) return { scheduled: 0, skipped: "no_steps", draftIds: [] };

  // Per-customer bypass — Marcin's escape hatch.
  const customerRow = (await db
    .select()
    .from(customers)
    .where(eq(customers.id, args.customerId))
    .limit(1))[0];
  if (customerRow?.bypassAutoNurture) {
    return { scheduled: 0, skipped: "bypass_auto_nurture", draftIds: [] };
  }

  const playbook = await loadPlaybook(ROADMAP_FOLLOWUP_KEY);
  if (!playbook || !playbook.enabled) {
    return { scheduled: 0, skipped: "playbook_disabled", draftIds: [] };
  }
  if (playbook.steps.length === 0) {
    return { scheduled: 0, skipped: "no_steps", draftIds: [] };
  }

  // Drain previous run for this customer + playbook (idempotency).
  await db
    .update(agentDrafts)
    .set({ status: "cancelled", cancelReason: "rescheduled" })
    .where(
      and(
        eq(agentDrafts.customerId, args.customerId),
        eq(agentDrafts.playbookKey, ROADMAP_FOLLOWUP_KEY),
        eq(agentDrafts.status, "pending"),
      ),
    );

  // Resolve assignee — the Lead Nurturer.
  const nurturerId = await findDefaultUserForRole("nurturer").catch(() => null);

  const startedAt = args.startedAt ?? new Date();
  const planned = planSchedule(playbook.steps, startedAt);

  const recipientEmail =
    args.recipientEmail ?? customerRow?.email ?? null;
  const recipientPhone =
    args.recipientPhone ?? customerRow?.mobilePhone ?? null;

  const ctxJson = JSON.stringify({
    portalAccountId: args.portalAccountId ?? null,
    homeHealthRecordId: args.homeHealthRecordId ?? null,
  });

  const inserts: InsertDbAgentDraft[] = planned.map((step) => ({
    customerId: args.customerId,
    opportunityId: args.opportunityId ?? null,
    playbookKey: ROADMAP_FOLLOWUP_KEY,
    stepKey: step.key,
    channel: step.channel,
    status: "pending",
    scheduledFor: step.scheduledFor,
    recipientEmail: step.channel === "email" ? recipientEmail : null,
    recipientPhone: step.channel === "sms" ? recipientPhone : null,
    contextJson: ctxJson,
    assigneeUserId: nurturerId ?? null,
  }));

  if (inserts.length === 0) {
    return { scheduled: 0, skipped: "no_steps", draftIds: [] };
  }

  await db.insert(agentDrafts).values(inserts);

  // Read back ids for the caller (synthetic test asserts on these).
  const fresh = await db
    .select()
    .from(agentDrafts)
    .where(
      and(
        eq(agentDrafts.customerId, args.customerId),
        eq(agentDrafts.playbookKey, ROADMAP_FOLLOWUP_KEY),
        eq(agentDrafts.status, "pending"),
      ),
    );

  return {
    scheduled: fresh.length,
    skipped: null,
    draftIds: fresh.map((r) => r.id),
  };
}

// ─── Engagement triggers — drain pending drafts ───────────────────────────────

export type EngagementCancelReason =
  | "appointment_scheduled"
  | "subscription_created"
  | "customer_declined"
  | "customer_replied"
  | "manual";

/**
 * Called by leadRouting.onAppointmentBooked, the 360° Stripe webhook, the
 * inbound SMS handler, etc. Drains every `pending` draft for this customer.
 * Already-`ready` drafts are kept — the operator may still want to send them
 * even if the customer also replied.
 */
export async function cancelPendingFollowupsForCustomer(
  customerId: string,
  reason: EngagementCancelReason,
): Promise<{ cancelled: number }> {
  const db = await getDb();
  if (!db) return { cancelled: 0 };
  const before = await db
    .select()
    .from(agentDrafts)
    .where(
      and(
        eq(agentDrafts.customerId, customerId),
        eq(agentDrafts.status, "pending"),
      ),
    );
  if (before.length === 0) return { cancelled: 0 };
  await db
    .update(agentDrafts)
    .set({ status: "cancelled", cancelReason: reason })
    .where(
      and(
        eq(agentDrafts.customerId, customerId),
        eq(agentDrafts.status, "pending"),
      ),
    );
  return { cancelled: before.length };
}

// ─── Worker — generate due drafts ─────────────────────────────────────────────

/**
 * Pick up to `limit` pending drafts whose scheduledFor has passed and
 * generate a body for each. Marks them `ready` on success, `failed` on a
 * persistent error. Designed to be safe to run on every interval tick — a
 * generated draft never re-enters the pending pool.
 */
export async function runDueDrafts(args: { limit?: number; now?: Date } = {}): Promise<{
  picked: number;
  generated: number;
  failed: number;
}> {
  const db = await getDb();
  if (!db) return { picked: 0, generated: 0, failed: 0 };
  const now = args.now ?? new Date();
  const limit = args.limit ?? 25;

  const due = await db
    .select()
    .from(agentDrafts)
    .where(and(eq(agentDrafts.status, "pending"), lte(agentDrafts.scheduledFor, now)))
    .orderBy(asc(agentDrafts.scheduledFor))
    .limit(limit);

  if (due.length === 0) return { picked: 0, generated: 0, failed: 0 };

  const playbook = await loadPlaybook(ROADMAP_FOLLOWUP_KEY);
  if (!playbook) return { picked: due.length, generated: 0, failed: due.length };

  let generated = 0;
  let failed = 0;
  for (const draft of due) {
    try {
      await generateAndStore(draft, playbook);
      generated++;
    } catch (err) {
      console.warn(`[leadNurturer] draft ${draft.id} generation failed:`, err);
      await db
        .update(agentDrafts)
        .set({
          status: "failed",
          cancelReason:
            err instanceof Error ? err.message.slice(0, 60) : "generation_error",
        })
        .where(eq(agentDrafts.id, draft.id));
      failed++;
    }
  }
  return { picked: due.length, generated, failed };
}

async function generateAndStore(
  draft: DbAgentDraft,
  playbook: ResolvedPlaybook,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Special case: the t_plus_14d_handoff step is a stage flip, not a draft.
  if (draft.stepKey === "t_plus_14d_handoff") {
    await handleLongTermNurtureHandoff(draft);
    return;
  }

  const step = playbook.steps.find((s) => s.key === draft.stepKey);
  if (!step) throw new Error(`step not in playbook: ${draft.stepKey}`);

  const context = await buildDraftContext(draft);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const generated = await generateDraftBody({
    apiKey,
    step,
    context,
    voiceRules: playbook.voiceRules,
  });

  // Advisory voice-rule check — surfaced to the operator, not blocking.
  const banned = detectBannedWords(generated.body, playbook.voiceRules.bannedWords);
  const bodyOut = banned.length === 0
    ? generated.body
    : `${generated.body}\n\n[admin: detected banned terms — ${banned.join(", ")}; please edit before sending]`;

  await db
    .update(agentDrafts)
    .set({
      status: "ready",
      subject: generated.subject,
      body: bodyOut,
      generatedAt: new Date(),
    })
    .where(eq(agentDrafts.id, draft.id));
}

async function handleLongTermNurtureHandoff(draft: DbAgentDraft): Promise<void> {
  // Marks the draft cancelled with a friendly reason — the operator sees
  // "handed to long-term nurture" in the inbox, no message to send. The
  // pipelineEvents log carries the audit trail.
  const db = await getDb();
  if (!db) return;
  await db
    .update(agentDrafts)
    .set({
      status: "cancelled",
      cancelReason: "long_term_nurture_handoff",
      generatedAt: new Date(),
    })
    .where(eq(agentDrafts.id, draft.id));
}

// ─── Context loader ──────────────────────────────────────────────────────────

async function buildDraftContext(draft: DbAgentDraft): Promise<DraftContext> {
  const db = await getDb();
  if (!db) {
    return {
      firstName: "",
      lastName: "",
      propertyAddress: "",
      operatorFirstName: "Marcin",
      homeHealthSummary: null,
      topFinding: null,
      portalMagicLinkUrl: null,
      conciergePhone: process.env.OWNER_PHONE ?? null,
    };
  }

  const customer = (await db
    .select()
    .from(customers)
    .where(eq(customers.id, draft.customerId))
    .limit(1))[0];

  const ctx = parseContext(draft.contextJson);

  let summary: string | null = null;
  let topFinding: DraftContext["topFinding"] = null;
  if (ctx.homeHealthRecordId) {
    const hhr = (await db
      .select()
      .from(homeHealthRecords)
      .where(eq(homeHealthRecords.id, ctx.homeHealthRecordId))
      .limit(1))[0];
    if (hhr) {
      summary = hhr.summary ?? null;
      topFinding = pickTopFinding(hhr.findings ?? []);
    }
  }

  // Magic link — best-effort. The portalAccount is the source of truth.
  let magicLinkUrl: string | null = null;
  if (ctx.portalAccountId) {
    const acct = (await db
      .select()
      .from(portalAccounts)
      .where(eq(portalAccounts.id, ctx.portalAccountId))
      .limit(1))[0];
    if (acct) {
      // The actual issueMagicLink belongs to the priorityTranslation lib —
      // the orchestrator deliberately doesn't issue one per draft (rate
      // limits + token sprawl). The portal home is fine.
      magicLinkUrl = `${process.env.PORTAL_BASE_URL ?? "https://pro.handypioneers.com"}/portal/home`;
    }
  }

  return {
    firstName: customer?.firstName ?? "",
    lastName: customer?.lastName ?? "",
    propertyAddress: customer
      ? [customer.street, customer.city, customer.state, customer.zip]
          .filter(Boolean)
          .join(", ")
      : "",
    operatorFirstName: "Marcin",
    homeHealthSummary: summary,
    topFinding,
    portalMagicLinkUrl: magicLinkUrl,
    conciergePhone: process.env.OWNER_PHONE ?? null,
  };
}

interface ParsedContext {
  portalAccountId: string | null;
  homeHealthRecordId: string | null;
}

function parseContext(json: string | null): ParsedContext {
  if (!json) return { portalAccountId: null, homeHealthRecordId: null };
  try {
    const parsed = JSON.parse(json);
    return {
      portalAccountId: typeof parsed.portalAccountId === "string" ? parsed.portalAccountId : null,
      homeHealthRecordId:
        typeof parsed.homeHealthRecordId === "string" ? parsed.homeHealthRecordId : null,
    };
  } catch {
    return { portalAccountId: null, homeHealthRecordId: null };
  }
}

function pickTopFinding(findings: HealthRecordFinding[]): DraftContext["topFinding"] {
  if (findings.length === 0) return null;
  const order: Record<HealthRecordFinding["urgency"], number> = { NOW: 0, SOON: 1, WAIT: 2 };
  const open = findings.filter((f) => f.status === "open");
  const pool = open.length > 0 ? open : findings;
  const sorted = [...pool].sort((a, b) => order[a.urgency] - order[b.urgency]);
  const top = sorted[0];
  return {
    category: top.category,
    finding: top.finding,
    urgency: top.urgency,
    reasoning: top.reasoning,
  };
}

// ─── Send path (operator approval) ───────────────────────────────────────────

export async function sendDraft(draftId: number, sentByUserId: number | null): Promise<{
  ok: boolean;
  reason?: string;
}> {
  const db = await getDb();
  if (!db) return { ok: false, reason: "db_unavailable" };
  const draft = (await db
    .select()
    .from(agentDrafts)
    .where(eq(agentDrafts.id, draftId))
    .limit(1))[0];
  if (!draft) return { ok: false, reason: "not_found" };
  if (draft.status !== "ready") return { ok: false, reason: `not_ready (${draft.status})` };
  if (!draft.body) return { ok: false, reason: "empty_body" };

  if (draft.channel === "sms") {
    if (!draft.recipientPhone) return { ok: false, reason: "missing_phone" };
    if (!isTwilioConfigured()) return { ok: false, reason: "twilio_not_configured" };
    await sendSms(draft.recipientPhone, draft.body);
  } else if (draft.channel === "email") {
    if (!draft.recipientEmail) return { ok: false, reason: "missing_email" };
    const subject = draft.subject ?? "A note from Handy Pioneers";
    const html = renderEmailHtml(draft.body, subject);
    await sendGmail({ to: draft.recipientEmail, subject, html });
  } else {
    return { ok: false, reason: "unknown_channel" };
  }

  await db
    .update(agentDrafts)
    .set({
      status: "sent",
      sentAt: new Date(),
      assigneeUserId: sentByUserId ?? draft.assigneeUserId ?? null,
    })
    .where(eq(agentDrafts.id, draftId));

  return { ok: true };
}

function renderEmailHtml(plainBody: string, subject: string): string {
  const escaped = plainBody
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");
  return `<!DOCTYPE html><html><body style="font-family:Helvetica,Arial,sans-serif;background:#f8f6f2;padding:32px 16px;color:#1a1a1a;">
<table width="600" style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#1a2e1a;padding:24px 36px;">
    <p style="color:#fff;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;margin:0;">Handy Pioneers</p>
    <p style="color:rgba(255,255,255,0.85);font-size:18px;margin:8px 0 0;font-weight:600;">${subject}</p>
  </td></tr>
  <tr><td style="padding:32px 36px;font-size:15px;line-height:1.6;color:#222;">${escaped}</td></tr>
  <tr><td style="padding:18px 36px;border-top:1px solid #eee;font-size:12px;color:#888;">
    Handy Pioneers · 808 SE Chkalov Dr 3-433, Vancouver, WA 98683 · (360) 544-9858
  </td></tr>
</table></body></html>`;
}
