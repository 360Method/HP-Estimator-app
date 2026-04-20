/**
 * Retention Automation Engine — Handy Pioneers
 *
 * Fires event-driven retention triggers for every customer:
 *
 *  1. review_request       — 24h after a job is archived
 *  2. enrollment_offer     — 3 days after job archived, if no 360° membership
 *  3. estimate_followup_d3 — 3 days after estimate sent with no response
 *  4. estimate_followup_d7 — 7 days after estimate sent with no response
 *  5. winback              — customer inactive 90+ days (at_risk/churned), no membership
 *  6. labor_bank_low       — 360° member labor bank balance < 1 hour ($150)
 *
 * The engine is idempotent: automationAlreadyFired() guards every trigger.
 * Run on server startup + every 60 minutes via setInterval.
 */

import { getDb } from "./db";
import {
  automationAlreadyFired,
  logAutomation,
  recomputeLifecycleStage,
} from "./db";
import { sendSms, isTwilioConfigured } from "./twilio";
import { sendEmail } from "./gmail";
import {
  customers,
  opportunities,
  threeSixtyMemberships,
  threeSixtyLaborBankTransactions,
} from "../drizzle/schema";
import { and, eq, isNull, lt, not, desc, sql } from "drizzle-orm";

// ─── Config ───────────────────────────────────────────────────────────────────

const FUNNEL_URL = process.env.FUNNEL_URL ?? "https://360.handypioneers.com";
const PRO_URL    = process.env.VITE_APP_URL ?? "https://pro.handypioneers.com";
const HP_NAME    = "Handy Pioneers";
const HP_PHONE   = "(360) 544-9858";
const REVIEW_URL = "https://g.page/r/ChandypioneersREVIEW"; // replace with real Google Review shortlink

/** Build a personalized 360° enrollment deep-link for a customer */
function enrollmentLink(c: {
  firstName: string;
  lastName: string;
  email: string;
  mobilePhone: string;
  street: string;
  city: string;
  state: string;
  zip: string;
}): string {
  const params = new URLSearchParams({
    firstName: c.firstName,
    lastName:  c.lastName,
    email:     c.email,
    phone:     c.mobilePhone,
    address:   c.street,
    city:      c.city,
    state:     c.state || "WA",
    zip:       c.zip,
  });
  return `${FUNNEL_URL}/checkout/bronze/annual?${params.toString()}`;
}

// ─── Individual trigger handlers ─────────────────────────────────────────────

async function fireReviewRequest(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  customerId: string,
  oppId: string,
  phone: string,
  email: string,
  firstName: string,
): Promise<void> {
  if (await automationAlreadyFired(customerId, 'review_request', oppId)) return;

  const body = `Hi ${firstName}, thanks for choosing ${HP_NAME}! If you have a moment, a quick Google review means the world to us: ${REVIEW_URL} — Questions? Call ${HP_PHONE}.`;

  let status: 'sent' | 'failed' = 'sent';
  let error: string | undefined;
  let channel: 'sms' | 'email' = 'sms';

  try {
    if (isTwilioConfigured() && phone) {
      await sendSms(phone, body);
      channel = 'sms';
    } else if (email) {
      await sendEmail({
        to: email,
        subject: `How did we do? – ${HP_NAME}`,
        body,
        html: `<p>${body}</p>`,
      });
      channel = 'email';
    } else {
      status = 'failed';
      error = 'No phone or email';
    }
  } catch (e: any) {
    status = 'failed';
    error = e?.message ?? String(e);
  }

  await logAutomation({ customerId, trigger: 'review_request', referenceId: oppId, channel, status, error });
  console.log(`[automation] review_request → ${customerId} (${status})`);
}

async function fireEnrollmentOffer(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  customer: {
    id: string; firstName: string; lastName: string; email: string;
    mobilePhone: string; street: string; city: string; state: string; zip: string;
  },
  oppId: string,
): Promise<void> {
  if (await automationAlreadyFired(customer.id, 'enrollment_offer', oppId)) return;

  // Skip if already a member
  const [existing] = await db
    .select({ id: threeSixtyMemberships.id })
    .from(threeSixtyMemberships)
    .where(and(
      eq(threeSixtyMemberships.hpCustomerId, customer.id),
      eq(threeSixtyMemberships.status, 'active'),
    ))
    .limit(1);
  if (existing) return;

  const link = enrollmentLink(customer);
  const body = `Hi ${customer.firstName}! Protect your home year-round with the ${HP_NAME} 360° Method — proactive maintenance starting at $49/mo. Lock in your rate here: ${link}  Questions? Reply or call ${HP_PHONE}.`;

  let status: 'sent' | 'failed' = 'sent';
  let error: string | undefined;
  let channel: 'sms' | 'email' = 'sms';

  try {
    if (isTwilioConfigured() && customer.mobilePhone) {
      await sendSms(customer.mobilePhone, body);
      channel = 'sms';
    } else if (customer.email) {
      await sendEmail({
        to: customer.email,
        subject: `Protect your home with the 360° Method – ${HP_NAME}`,
        body,
        html: `<p>${body}</p>`,
      });
      channel = 'email';
    } else {
      status = 'failed';
      error = 'No phone or email';
    }
  } catch (e: any) {
    status = 'failed';
    error = e?.message ?? String(e);
  }

  await logAutomation({ customerId: customer.id, trigger: 'enrollment_offer', referenceId: oppId, channel, status, error });
  console.log(`[automation] enrollment_offer → ${customer.id} (${status})`);
}

async function fireEstimateFollowUp(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  customerId: string,
  oppId: string,
  day: 3 | 7,
  firstName: string,
  phone: string,
  email: string,
  jobTitle: string,
): Promise<void> {
  const trigger = day === 3 ? 'estimate_followup_d3' : 'estimate_followup_d7';
  if (await automationAlreadyFired(customerId, trigger, oppId)) return;

  const body = day === 3
    ? `Hi ${firstName}, just checking in on your estimate for "${jobTitle}". Happy to answer any questions — reply here or call ${HP_PHONE}.`
    : `Hi ${firstName}, wanted to follow up one more time on the "${jobTitle}" estimate. If the timing isn't right, no worries at all — just let us know. ${HP_PHONE}`;

  let status: 'sent' | 'failed' = 'sent';
  let error: string | undefined;
  let channel: 'sms' | 'email' = 'sms';

  try {
    if (isTwilioConfigured() && phone) {
      await sendSms(phone, body);
      channel = 'sms';
    } else if (email) {
      await sendEmail({ to: email, subject: `Your estimate from ${HP_NAME}`, body, html: `<p>${body}</p>` });
      channel = 'email';
    } else {
      status = 'failed';
      error = 'No phone or email';
    }
  } catch (e: any) {
    status = 'failed';
    error = e?.message ?? String(e);
  }

  await logAutomation({ customerId, trigger, referenceId: oppId, channel, status, error });
  console.log(`[automation] ${trigger} → ${customerId} (${status})`);
}

async function fireWinBack(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  customer: {
    id: string; firstName: string; email: string; mobilePhone: string;
    street: string; lastName: string; city: string; state: string; zip: string;
  },
): Promise<void> {
  // One winback per customer per 180 days — use customerId as referenceId with date suffix
  const refId = `winback-${new Date().toISOString().slice(0, 7)}`; // monthly dedup
  if (await automationAlreadyFired(customer.id, 'winback', refId)) return;

  const link = enrollmentLink(customer);
  const body = `Hi ${customer.firstName}, it's been a while! ${HP_NAME} is here whenever your home needs attention. Book a service: ${PRO_URL}/book  Or protect your home proactively with the 360° Method: ${link}  ${HP_PHONE}`;

  let status: 'sent' | 'failed' = 'sent';
  let error: string | undefined;
  let channel: 'sms' | 'email' = 'sms';

  try {
    if (isTwilioConfigured() && customer.mobilePhone) {
      await sendSms(customer.mobilePhone, body);
      channel = 'sms';
    } else if (customer.email) {
      await sendEmail({ to: customer.email, subject: `We miss you – ${HP_NAME}`, body, html: `<p>${body}</p>` });
      channel = 'email';
    } else {
      status = 'failed';
      error = 'No phone or email';
    }
  } catch (e: any) {
    status = 'failed';
    error = e?.message ?? String(e);
  }

  await logAutomation({ customerId: customer.id, trigger: 'winback', referenceId: refId, channel, status, error });
  console.log(`[automation] winback → ${customer.id} (${status})`);
}

async function fireLaborBankLow(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  customerId: string,
  membershipId: number,
  phone: string,
  email: string,
  firstName: string,
): Promise<void> {
  const refId = `laborbank-${membershipId}-${new Date().toISOString().slice(0, 7)}`;
  if (await automationAlreadyFired(customerId, 'labor_bank_low', refId)) return;

  const body = `Hi ${firstName}, your 360° Method labor bank is running low. Schedule a service before it empties — we'll make the most of what's left: ${PRO_URL}/portal  Questions? ${HP_PHONE}`;

  let status: 'sent' | 'failed' = 'sent';
  let error: string | undefined;
  let channel: 'sms' | 'email' = 'sms';

  try {
    if (isTwilioConfigured() && phone) {
      await sendSms(phone, body);
      channel = 'sms';
    } else if (email) {
      await sendEmail({ to: email, subject: `Your labor bank is running low – ${HP_NAME}`, body, html: `<p>${body}</p>` });
      channel = 'email';
    } else {
      status = 'failed';
      error = 'No phone or email';
    }
  } catch (e: any) {
    status = 'failed';
    error = e?.message ?? String(e);
  }

  await logAutomation({ customerId, trigger: 'labor_bank_low', referenceId: refId, channel, status, error });
  console.log(`[automation] labor_bank_low → ${customerId} (${status})`);
}

// ─── Main engine tick ─────────────────────────────────────────────────────────

export async function runAutomations(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const now = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;

  console.log("[automation] tick", now.toISOString());

  try {
    // ── 1 & 2: Post-job triggers (review request + enrollment offer) ───────────
    const archivedJobs = await db
      .select({
        id: opportunities.id,
        customerId: opportunities.customerId,
        archivedAt: opportunities.archivedAt,
        title: opportunities.title,
      })
      .from(opportunities)
      .where(and(
        eq(opportunities.area, 'job'),
        eq(opportunities.archived, true),
        not(isNull(opportunities.archivedAt)),
      ));

    for (const job of archivedJobs) {
      if (!job.archivedAt) continue;
      const archivedDate = new Date(job.archivedAt);
      const daysSince = (now.getTime() - archivedDate.getTime()) / msPerDay;

      const [cust] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, job.customerId))
        .limit(1);
      if (!cust || cust.doNotService) continue;

      // Review request: 1–3 days after archive
      if (daysSince >= 1 && daysSince < 3) {
        await fireReviewRequest(db, cust.id, job.id, cust.mobilePhone, cust.email, cust.firstName);
      }

      // Enrollment offer: 3–5 days after archive
      if (daysSince >= 3 && daysSince < 5) {
        await fireEnrollmentOffer(db, cust, job.id);
      }
    }

    // ── 3 & 4: Estimate follow-ups ───────────────────────────────────────────
    const sentEstimates = await db
      .select({
        id: opportunities.id,
        customerId: opportunities.customerId,
        sentAt: opportunities.sentAt,
        title: opportunities.title,
        wonAt: opportunities.wonAt,
        archived: opportunities.archived,
      })
      .from(opportunities)
      .where(and(
        eq(opportunities.area, 'estimate'),
        eq(opportunities.archived, false),
        not(isNull(opportunities.sentAt)),
        isNull(opportunities.wonAt),
      ));

    for (const est of sentEstimates) {
      if (!est.sentAt) continue;
      const sentDate = new Date(est.sentAt);
      const daysSince = (now.getTime() - sentDate.getTime()) / msPerDay;

      const [cust] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, est.customerId))
        .limit(1);
      if (!cust || cust.doNotService) continue;

      if (daysSince >= 3 && daysSince < 4) {
        await fireEstimateFollowUp(db, cust.id, est.id, 3, cust.firstName, cust.mobilePhone, cust.email, est.title);
      }
      if (daysSince >= 7 && daysSince < 8) {
        await fireEstimateFollowUp(db, cust.id, est.id, 7, cust.firstName, cust.mobilePhone, cust.email, est.title);
      }
    }

    // ── 5: Win-back (at_risk / churned, no membership) ───────────────────────
    const atRiskCustomers = await db
      .select()
      .from(customers)
      .where(and(
        sql`"lifeCycleStage" IN ('at_risk', 'churned')`,
        eq(customers.doNotService, false),
      ));

    for (const cust of atRiskCustomers) {
      await fireWinBack(db, cust);
    }

    // ── 6: Labor bank low (< $150 = 1hr @ $150/hr) ───────────────────────────
    const activeMembers = await db
      .select({
        id: threeSixtyMemberships.id,
        hpCustomerId: threeSixtyMemberships.hpCustomerId,
        laborBankBalance: threeSixtyMemberships.laborBankBalance,
      })
      .from(threeSixtyMemberships)
      .where(eq(threeSixtyMemberships.status, 'active'));

    for (const m of activeMembers) {
      if (!m.hpCustomerId) continue;
      const balance = m.laborBankBalance ?? 0;
      if (balance >= 15000) continue; // >= $150 in cents, skip

      const [cust] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, m.hpCustomerId))
        .limit(1);
      if (!cust) continue;

      await fireLaborBankLow(db, cust.id, m.id, cust.mobilePhone, cust.email, cust.firstName);
    }

    // ── Recompute lifecycle stages for all customers (lightweight pass) ───────
    const allCustomers = await db
      .select({ id: customers.id })
      .from(customers)
      .where(isNull(customers.mergedIntoId));

    for (const c of allCustomers) {
      await recomputeLifecycleStage(c.id).catch(() => {});
    }

  } catch (err) {
    console.error("[automation] error during tick:", err);
  }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

const INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export function startAutomationEngine(): void {
  console.log("[automation] engine starting");
  // First run after 5 min delay to let DB connect
  setTimeout(() => {
    runAutomations().catch(console.error);
    setInterval(() => runAutomations().catch(console.error), INTERVAL_MS);
  }, 5 * 60 * 1000);
}
