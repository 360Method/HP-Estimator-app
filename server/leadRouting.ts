/**
 * Lead routing + notification engine.
 *
 * Central place where every pipeline event resolves:
 *   1. Who should own this now?  (assigned_user_id + role)
 *   2. Who should be told?       (notification rows + email + optional SMS)
 *   3. What audit entry to drop? (pipeline_events row)
 *
 * Three roles operate the pipeline. Each stage has a distinct owner.
 *   - `nurturer`        — qualifies incoming leads, books the appointment
 *   - `consultant`      — home visit + expert walkthrough (never "sales")
 *   - `project_manager` — owns execution after the sale is signed
 *
 * Side effects (email, SMS) are best-effort. They log and return; they never
 * throw out of the trigger path. The originating event is already committed
 * to the database before we try to deliver.
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "./db";
import {
  notifications,
  pipelineEvents,
  userRoles,
  users,
  opportunities,
  customers,
  type DbNotification,
  type InsertDbNotification,
  type InsertDbPipelineEvent,
} from "../drizzle/schema";
import { sendSms, isTwilioConfigured } from "./twilio";
import { isNotificationEnabled } from "./routers/notificationPreferences";
import {
  cancelPendingFollowupsForCustomer,
  type EngagementCancelReason,
} from "./lib/leadNurturer/roadmapFollowup";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TeamRole = "nurturer" | "consultant" | "project_manager";

export type LeadSource =
  | "inbound_call"
  | "priority_translation"
  | "roadmap_generator"
  | "book_consultation"
  | "membership_intent"
  | "baseline_walkthrough"
  | "manual";

export type PipelineEventType =
  | "lead_created"
  | "appointment_booked"
  | "sale_signed"
  | "stage_changed"
  | "reassigned";

export interface NotifyInput {
  role?: TeamRole | "admin" | null;
  userId?: number | null;
  eventType: string;
  title: string;
  body?: string;
  linkUrl?: string;
  opportunityId?: string;
  customerId?: string;
  priority?: "low" | "normal" | "high";
}

// ─── Role discovery ───────────────────────────────────────────────────────────

/**
 * Resolve the default user for a team role.
 * Preference: the primary role holder; fall back to any user with that role;
 * finally fall back to the first admin in the users table.
 */
export async function findDefaultUserForRole(role: TeamRole): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  const primary = await db
    .select()
    .from(userRoles)
    .where(and(eq(userRoles.role, role), eq(userRoles.isPrimary, true)))
    .limit(1);
  if (primary[0]) return primary[0].userId;

  const any = await db
    .select()
    .from(userRoles)
    .where(eq(userRoles.role, role))
    .limit(1);
  if (any[0]) return any[0].userId;

  const admin = await db
    .select()
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);
  return admin[0]?.id ?? null;
}

/** Check whether this user has the mobileUrgent flag set for any of their roles. */
export async function userWantsUrgentSms(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db
    .select()
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.mobileUrgent, true)))
    .limit(1);
  return rows.length > 0;
}

// ─── Notification creation ────────────────────────────────────────────────────

/**
 * Record a notification row and deliver through configured channels.
 * In-app is always recorded; email + SMS are gated by preferences + priority.
 */
export async function createNotification(input: NotifyInput): Promise<DbNotification | null> {
  const db = await getDb();
  if (!db) return null;

  const row: InsertDbNotification = {
    userId: input.userId ?? null,
    role: input.role ?? null,
    eventType: input.eventType,
    title: input.title,
    body: input.body ?? null,
    linkUrl: input.linkUrl ?? null,
    opportunityId: input.opportunityId ?? null,
    customerId: input.customerId ?? null,
    priority: input.priority ?? "normal",
    emailSent: false,
    smsSent: false,
  };

  await db.insert(notifications).values(row);

  const saved = (await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.eventType, row.eventType),
        eq(notifications.title, row.title),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(1))[0];

  // Deliver side channels (fire and forget)
  deliverChannels(saved, input).catch((err) => {
    console.error("[leadRouting] deliverChannels failed:", err);
  });

  return saved ?? null;
}

async function deliverChannels(row: DbNotification | undefined, input: NotifyInput): Promise<void> {
  if (!row) return;

  const emailOk = await isNotificationEnabled(input.eventType, "email").catch(() => true);
  const smsOk = await isNotificationEnabled(input.eventType, "sms").catch(() => true);

  // Email — Resend (reuses the existing notifyOwner scaffold per-user)
  if (emailOk && input.userId) {
    const email = await resolveUserEmail(input.userId);
    if (email && process.env.RESEND_API_KEY) {
      await sendResendEmail(email, input.title, input.body ?? "", input.linkUrl).catch((e) =>
        console.warn("[leadRouting] email delivery failed:", e),
      );
      await markNotificationChannel(row.id, "email").catch(() => null);
    }
  }

  // SMS — only for high-priority events AND users flagged mobileUrgent
  if (smsOk && input.userId && (input.priority === "high")) {
    const urgent = await userWantsUrgentSms(input.userId);
    if (urgent && isTwilioConfigured()) {
      const phone = process.env.OWNER_MOBILE || process.env.TWILIO_PHONE_NUMBER;
      if (phone) {
        await sendSms(phone, `${input.title}\n${input.body ?? ""}`).catch((e) =>
          console.warn("[leadRouting] sms delivery failed:", e),
        );
        await markNotificationChannel(row.id, "sms").catch(() => null);
      }
    }
  }
}

async function markNotificationChannel(id: number, channel: "email" | "sms") {
  const db = await getDb();
  if (!db) return;
  const patch = channel === "email" ? { emailSent: true } : { smsSent: true };
  await db.update(notifications).set(patch).where(eq(notifications.id, id));
}

async function resolveUserEmail(userId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return rows[0]?.email ?? null;
}

async function sendResendEmail(
  toEmail: string,
  subject: string,
  body: string,
  linkUrl?: string | null,
): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;

  const linkHtml = linkUrl
    ? `<p style="margin-top:16px"><a href="${linkUrl}" style="background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open in HP Estimator</a></p>`
    : "";

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto">
      <p style="font-size:12px;letter-spacing:0.1em;color:#6b7280;text-transform:uppercase;margin:0 0 8px">Handy Pioneers</p>
      <h2 style="margin:0 0 12px;color:#111">${escapeHtml(subject)}</h2>
      <div style="color:#374151;line-height:1.5">${escapeHtml(body).replace(/\n/g, "<br>")}</div>
      ${linkHtml}
      <hr style="margin-top:24px;border:0;border-top:1px solid #e5e7eb" />
      <p style="font-size:11px;color:#9ca3af;margin-top:8px">Lead routing notification — reply to your team lead to adjust frequency.</p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "Handy Pioneers <system@handypioneers.com>",
      to: [toEmail],
      subject,
      html,
    }),
  });
  if (!response.ok) {
    console.warn("[leadRouting] Resend non-OK:", response.status, await response.text().catch(() => ""));
    return false;
  }
  return true;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// ─── Customer context resolution ──────────────────────────────────────────────
// Customer profile is the source of truth. Every notification resolves the
// customer display name and links primarily to the customer profile — the
// opportunity deep-link is appended as a secondary affordance.

export async function resolveCustomerName(customerId?: string | null): Promise<string> {
  if (!customerId) return "(unknown customer)";
  const db = await getDb();
  if (!db) return "(unknown customer)";
  const rows = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  const c = rows[0];
  if (!c) return "(unknown customer)";
  return (
    c.displayName?.trim() ||
    [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
    c.company?.trim() ||
    c.email?.trim() ||
    "(unnamed customer)"
  );
}

/** Build the primary link target for a notification/event — customer profile. */
export function customerLinkUrl(customerId?: string | null, opportunityId?: string | null): string {
  if (!customerId) {
    return opportunityId ? `/?section=pipeline&opportunity=${opportunityId}` : "/?section=customers";
  }
  const base = `/?section=customer&customer=${customerId}`;
  return opportunityId ? `${base}&opportunity=${opportunityId}` : base;
}

// ─── Pipeline event audit log ─────────────────────────────────────────────────

export async function recordPipelineEvent(input: InsertDbPipelineEvent) {
  const db = await getDb();
  if (!db) return;
  await db.insert(pipelineEvents).values(input);
}

// ─── High-level triggers ──────────────────────────────────────────────────────

/**
 * Called whenever a new lead enters the system from any source. Creates the
 * opportunity assignment (to the nurturer), fires a notification, and drops an
 * audit row.
 */
export async function onLeadCreated(params: {
  opportunityId: string;
  customerId: string;
  title: string;
  source: LeadSource;
  priority?: "low" | "normal" | "high";
}) {
  try {
    const nurturerId = await findDefaultUserForRole("nurturer");
    const db = await getDb();
    if (db && nurturerId) {
      await db
        .update(opportunities)
        .set({
          assignedUserId: nurturerId,
          assignedRole: "nurturer",
          assignedAt: new Date().toISOString(),
        })
        .where(eq(opportunities.id, params.opportunityId));
    }

    await recordPipelineEvent({
      opportunityId: params.opportunityId,
      eventType: "lead_created",
      toRole: "nurturer",
      toUserId: nurturerId ?? null,
      triggeredBy: null,
      payloadJson: JSON.stringify({ source: params.source }),
    });

    const customerName = await resolveCustomerName(params.customerId);

    await createNotification({
      userId: nurturerId ?? null,
      role: "nurturer",
      eventType: "new_lead",
      title: `New lead about ${customerName}`,
      body: `${params.title} — from ${humanSource(params.source)}. Review ${customerName}'s profile, qualify, and nurture until they book a Baseline or Consultation appointment.`,
      linkUrl: customerLinkUrl(params.customerId, params.opportunityId),
      opportunityId: params.opportunityId,
      customerId: params.customerId,
      priority: params.priority ?? "high",
    });
  } catch (err) {
    console.error("[leadRouting] onLeadCreated error:", err);
  }
}

/**
 * Called when the nurturer books an appointment — Baseline or Consultation.
 * Reassigns ownership to the Consultant and primes them with an expert brief.
 */
export async function onAppointmentBooked(params: {
  opportunityId: string;
  customerId: string;
  title: string;
  when: string;
  appointmentType: "baseline" | "consultation";
  triggeredByUserId?: number | null;
}) {
  try {
    const db = await getDb();
    const current = db ? (await db.select().from(opportunities).where(eq(opportunities.id, params.opportunityId)).limit(1))[0] : null;

    const consultantId = await findDefaultUserForRole("consultant");

    if (db && consultantId) {
      await db
        .update(opportunities)
        .set({
          assignedUserId: consultantId,
          assignedRole: "consultant",
          assignedAt: new Date().toISOString(),
        })
        .where(eq(opportunities.id, params.opportunityId));
    }

    await recordPipelineEvent({
      opportunityId: params.opportunityId,
      eventType: "appointment_booked",
      fromRole: current?.assignedRole ?? "nurturer",
      toRole: "consultant",
      fromUserId: current?.assignedUserId ?? null,
      toUserId: consultantId ?? null,
      triggeredBy: params.triggeredByUserId ?? null,
      payloadJson: JSON.stringify({ when: params.when, appointmentType: params.appointmentType }),
    });

    const customerName = await resolveCustomerName(params.customerId);
    const kindLabel = params.appointmentType === "baseline" ? "Baseline Walkthrough" : "Consultation";

    await createNotification({
      userId: consultantId ?? null,
      role: "consultant",
      eventType: "appointment_booked",
      title: `${kindLabel} booked with ${customerName}`,
      body: `${params.title} — ${params.when}. Your expert prep sheet is ready on ${customerName}'s profile. Walk the home, share what you see, and answer their questions — this is a conversation between experts, not a pitch.`,
      linkUrl: `${customerLinkUrl(params.customerId, params.opportunityId)}&view=consultant`,
      opportunityId: params.opportunityId,
      customerId: params.customerId,
      priority: "high",
    });

    // Drain any post-Roadmap follow-up drafts queued for this customer —
    // the appointment is now the next concrete touchpoint.
    await onCustomerEngaged(params.customerId, "appointment_scheduled");

    // Customer-facing confirmation — affluent-voice stewardship copy
    // (per Customer Success Charter, 2026-04-25). Best-effort; the
    // appointment is already committed to the DB.
    void sendAppointmentConfirmationToCustomer({
      customerId: params.customerId,
      when: params.when,
      appointmentType: params.appointmentType,
      consultantUserId: consultantId,
      opportunityId: params.opportunityId,
    });
  } catch (err) {
    console.error("[leadRouting] onAppointmentBooked error:", err);
  }
}

/**
 * Generic "customer chose a path" hook. Used by appointment booking,
 * subscription enrollment, explicit decline, and inbound replies. Currently
 * just drains the Lead Nurturer's pending drafts — extend here for any
 * future cadence cancellation needs.
 */
export async function onCustomerEngaged(
  customerId: string,
  reason: EngagementCancelReason,
): Promise<void> {
  try {
    await cancelPendingFollowupsForCustomer(customerId, reason);
  } catch (err) {
    console.error("[leadRouting] onCustomerEngaged error:", err);
  }
}

/**
 * Send the customer-facing appointment confirmation. Pulls customer email +
 * address from `customers`, consultant name from `users`, and renders the
 * `appointment_confirmed` (or type-specific) email template. Falls back to
 * inline HTML if the template seed has not been re-run.
 */
async function sendAppointmentConfirmationToCustomer(params: {
  customerId: string;
  when: string;
  appointmentType: "baseline" | "consultation";
  consultantUserId: number | null;
  opportunityId: string;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const [c] = await db.select().from(customers).where(eq(customers.id, params.customerId)).limit(1);
    if (!c?.email) return;
    const firstName = (c.firstName ?? c.displayName ?? "").trim().split(/\s+/)[0] || "there";

    let consultantName = "your Handy Pioneers consultant";
    if (params.consultantUserId) {
      const [u] = await db.select().from(users).where(eq(users.id, params.consultantUserId)).limit(1);
      if (u?.name) consultantName = u.name;
    }

    const address = [c.street, c.city, c.state].filter(Boolean).join(", ") || "your home";
    const portalUrl = process.env.PORTAL_BASE_URL ?? "https://client.handypioneers.com";

    // Parse the `when` ISO/string the schedule subsystem hands us. If parsing
    // fails (free-text label), fall back to the raw string.
    const dt = new Date(params.when);
    const valid = !Number.isNaN(dt.getTime());
    const appointmentDate = valid
      ? dt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
      : params.when;
    const appointmentTime = valid
      ? dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
      : "";
    const appointmentDuration =
      params.appointmentType === "baseline" ? "90 minutes to two hours" : "45 to 60 minutes";

    const templateKey =
      params.appointmentType === "baseline" ? "appt_baseline_scheduled" : "appt_consultation_scheduled";
    const { renderEmailTemplate } = await import("./emailTemplates");
    const tpl = await renderEmailTemplate(templateKey, {
      customerFirstName: firstName,
      appointmentDate,
      appointmentTime,
      appointmentAddress: address,
      consultantName,
      appointmentDuration,
      portalUrl,
    });

    // Generic fallback if the type-specific template hasn't been seeded yet.
    const generic = !tpl
      ? await renderEmailTemplate("appointment_confirmed", {
          customerFirstName: firstName,
          appointmentDate,
          appointmentTime,
          appointmentAddress: address,
          consultantName,
          appointmentDuration,
          portalUrl,
        })
      : null;

    const subject =
      tpl?.subject ?? generic?.subject ?? `Your visit on ${appointmentDate} is confirmed`;
    const html =
      tpl?.html ??
      generic?.html ??
      `<p>${firstName},</p>
<p>Your visit with Handy Pioneers is confirmed.</p>
<ul>
  <li><strong>When:</strong> ${appointmentDate}${appointmentTime ? ` at ${appointmentTime}` : ""}</li>
  <li><strong>Where:</strong> ${address}</li>
  <li><strong>Visiting:</strong> ${consultantName}</li>
  <li><strong>Length:</strong> approximately ${appointmentDuration}</li>
</ul>
<p>This is a stewardship conversation, not a presentation. We will walk your home with you, listen to what you have in mind, and share what a proper standard of care looks like for the project ahead.</p>
<p>Need to adjust the time? Reply to this email or call (360) 241-5718.</p>
<p>— The Handy Pioneers Team</p>`;

    const { sendEmail, isEmailSenderReady } = await import("./gmail");
    if (isEmailSenderReady()) {
      await sendEmail({ to: c.email, subject, html }).catch((e) =>
        console.warn("[appointment ack] email failed:", e),
      );
    }

    // Optional SMS — only if the customer opted in to notifications.
    if (c.sendNotifications && c.mobilePhone && isTwilioConfigured()) {
      const smsBody = appointmentTime
        ? `${firstName}, your Handy Pioneers visit is confirmed for ${appointmentDate} at ${appointmentTime}. ${consultantName} will see you. (360) 241-5718 if anything changes.`
        : `${firstName}, your Handy Pioneers visit is confirmed for ${appointmentDate}. ${consultantName} will see you. (360) 241-5718 if anything changes.`;
      await sendSms(c.mobilePhone, smsBody).catch((e) =>
        console.warn("[appointment ack] sms failed:", e),
      );
    }
  } catch (err) {
    console.warn("[appointment ack] errored:", err);
  }
}

/**
 * Called when a sale is signed — opportunity area transitions to `job`.
 * Reassigns to the Project Manager and delivers a handoff brief.
 */
export async function onSaleSigned(params: {
  opportunityId: string;
  customerId: string;
  title: string;
  value?: number;
  triggeredByUserId?: number | null;
}) {
  try {
    const db = await getDb();
    const current = db ? (await db.select().from(opportunities).where(eq(opportunities.id, params.opportunityId)).limit(1))[0] : null;

    const pmId = await findDefaultUserForRole("project_manager");

    if (db && pmId) {
      await db
        .update(opportunities)
        .set({
          assignedUserId: pmId,
          assignedRole: "project_manager",
          assignedAt: new Date().toISOString(),
        })
        .where(eq(opportunities.id, params.opportunityId));
    }

    await recordPipelineEvent({
      opportunityId: params.opportunityId,
      eventType: "sale_signed",
      fromRole: current?.assignedRole ?? "consultant",
      toRole: "project_manager",
      fromUserId: current?.assignedUserId ?? null,
      toUserId: pmId ?? null,
      triggeredBy: params.triggeredByUserId ?? null,
      payloadJson: JSON.stringify({ value: params.value }),
    });

    const customerName = await resolveCustomerName(params.customerId);

    await createNotification({
      userId: pmId ?? null,
      role: "project_manager",
      eventType: "job_created",
      title: `Signed job — handoff for ${customerName}`,
      body: `${params.title}. The handoff brief is ready on ${customerName}'s profile — scope, timeline committed, crew required, and consultant notes are all linked. Schedule kickoff this week.`,
      linkUrl: `${customerLinkUrl(params.customerId, params.opportunityId)}&view=handoff`,
      opportunityId: params.opportunityId,
      customerId: params.customerId,
      priority: "high",
    });
  } catch (err) {
    console.error("[leadRouting] onSaleSigned error:", err);
  }
}

/** Manual reassignment helper — used by the admin "Reassign" button. */
export async function onReassign(params: {
  opportunityId: string;
  toRole: TeamRole;
  toUserId: number;
  triggeredByUserId?: number | null;
}) {
  try {
    const db = await getDb();
    const current = db ? (await db.select().from(opportunities).where(eq(opportunities.id, params.opportunityId)).limit(1))[0] : null;

    if (db) {
      await db
        .update(opportunities)
        .set({
          assignedUserId: params.toUserId,
          assignedRole: params.toRole,
          assignedAt: new Date().toISOString(),
        })
        .where(eq(opportunities.id, params.opportunityId));
    }

    await recordPipelineEvent({
      opportunityId: params.opportunityId,
      eventType: "reassigned",
      fromRole: current?.assignedRole ?? null,
      toRole: params.toRole,
      fromUserId: current?.assignedUserId ?? null,
      toUserId: params.toUserId,
      triggeredBy: params.triggeredByUserId ?? null,
    });

    const customerName = await resolveCustomerName(current?.customerId ?? null);

    await createNotification({
      userId: params.toUserId,
      role: params.toRole,
      eventType: "lead_assigned",
      title: `${humanRole(params.toRole)} assignment — ${customerName}`,
      body: `${current?.title ?? "An opportunity"} for ${customerName} was handed to you. Open ${customerName}'s profile to see the full history and context.`,
      linkUrl: customerLinkUrl(current?.customerId ?? null, params.opportunityId),
      opportunityId: params.opportunityId,
      customerId: current?.customerId,
      priority: "normal",
    });
  } catch (err) {
    console.error("[leadRouting] onReassign error:", err);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function humanSource(src: LeadSource): string {
  switch (src) {
    case "inbound_call": return "an inbound phone call";
    case "priority_translation": return "the Priority Translation form";
    case "roadmap_generator": return "the Roadmap Generator";
    case "book_consultation": return "a /book consultation request";
    case "membership_intent": return "a 360° membership enrollment intent";
    case "baseline_walkthrough": return "a direct Baseline Walkthrough booking";
    case "manual": return "a manually created record";
  }
}

function humanRole(role: TeamRole): string {
  return role === "nurturer"
    ? "Lead Nurturer"
    : role === "consultant"
      ? "Consultant"
      : "Project Manager";
}

// ─── Read helpers (used by routers) ───────────────────────────────────────────

/**
 * Enrich notification rows with the owning customer's display name so the
 * UI can always show "about <customer>" and link back to the customer profile.
 */
async function enrichWithCustomer<T extends { customerId: string | null }>(rows: T[]): Promise<Array<T & { customerName: string | null }>> {
  if (rows.length === 0) return [];
  const db = await getDb();
  if (!db) return rows.map((r) => ({ ...r, customerName: null }));
  const ids = Array.from(new Set(rows.map((r) => r.customerId).filter(Boolean))) as string[];
  if (ids.length === 0) return rows.map((r) => ({ ...r, customerName: null }));

  const byId = new Map<string, string>();
  for (const id of ids) {
    const name = await resolveCustomerName(id);
    byId.set(id, name);
  }
  return rows.map((r) => ({
    ...r,
    customerName: r.customerId ? byId.get(r.customerId) ?? null : null,
  }));
}

export async function listNotificationsForUser(userId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return enrichWithCustomer(rows);
}

export async function listNotificationsForRole(role: string, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.role, role))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return enrichWithCustomer(rows);
}

export async function countUnreadForUser(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return rows.length;
}

export async function markNotificationRead(id: number) {
  const db = await getDb();
  if (!db) return;
  // Bug 3 fix (2026-04-27): readAt is a TIMESTAMP column (migration 0061).
  // Passing `new Date().toISOString()` produced an ISO string that strict-mode
  // MySQL rejected, leaving readAt NULL and the unread count stuck. Pass a
  // Date so drizzle serialises it correctly.
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(eq(notifications.id, id));
}

export async function markAllNotificationsReadForUser(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

export async function listPipelineEventsFor(opportunityId: string, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(pipelineEvents)
    .where(eq(pipelineEvents.opportunityId, opportunityId))
    .orderBy(desc(pipelineEvents.createdAt))
    .limit(limit);
}
