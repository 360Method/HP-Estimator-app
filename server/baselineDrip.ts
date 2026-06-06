/**
 * Baseline funnel Step-1 drop-off drip.
 *
 * The membership funnel's Step 1 popup (BaselineInquiryForm on
 * handypioneers.com) creates a CRM customer + a "New Lead" opportunity with
 * `Source: baseline-funnel-step1` in its notes. People who stall after that
 * (never finish Step 2 details / Step 3 checkout) used to sit silently at
 * "New Lead" forever. This module sends them a 3-email recovery sequence at
 * 24h / 72h / 7d, mirroring the 360 cart-abandonment drip in _core/index.ts.
 *
 * Stop conditions (any of these ends the drip for a lead):
 *  - the lead's stage moves past "New Lead" (a human took over)
 *  - the lead is archived
 *  - a 360 membership exists for the lead's email (they bought)
 *  - an open "Cart Abandoned" lead exists for the same customer/email
 *    (the checkout-capture drip already owns that conversation)
 *  - the email is internal (@handypioneers.com — test identities)
 *
 * Sent-state is tracked with `[Baseline-Drip-N sent]` markers appended to the
 * lead's notes, same pattern as the cart drip.
 */
import { eq } from "drizzle-orm";
import { customers, threeSixtyMemberships } from "../drizzle/schema";
import { getCustomerById, getDb, listOpportunities, updateOpportunity } from "./db";
import { isEmailSenderReady, sendEmail } from "./gmail";

export const BASELINE_SOURCE_MARKER = "Source: baseline-funnel-step1";
const MEMBERSHIP_URL = "https://www.handypioneers.com/membership";
const HP_PHONE = "(360) 334-4428";

const H24 = 24 * 60 * 60 * 1000;
const H72 = 72 * 60 * 60 * 1000;
const D7 = 7 * 24 * 60 * 60 * 1000;

/** The opportunity fields the drip logic needs (subset of DbOpportunity). */
export interface BaselineDripLead {
  id: string;
  stage: string;
  archived?: boolean | null;
  notes?: string | null;
  createdAt?: unknown;
  customerId?: string | null;
}

/** A lead is in the drip pool only while it is an open, untouched Step-1 funnel lead. */
export function isBaselineStepOneLead(lead: BaselineDripLead): boolean {
  if (lead.archived) return false;
  if (lead.stage !== "New Lead") return false;
  return (lead.notes ?? "").includes(BASELINE_SOURCE_MARKER);
}

/**
 * Which drip email (1–3) is due for this lead right now, or null.
 * Buckets: 24h–72h → 1, 72h–7d → 2, 7d+ → 3. A lead that ages past a bucket
 * without being sent skips ahead (same behavior as the cart drip).
 */
export function pickDripStep(lead: BaselineDripLead, nowMs: number): 1 | 2 | 3 | null {
  const createdAt = new Date((lead.createdAt as any) ?? 0).getTime();
  if (!createdAt) return null;
  const age = nowMs - createdAt;
  const sent = lead.notes ?? "";
  if (age >= H24 && age < H72 && !sent.includes("[Baseline-Drip-1 sent]")) return 1;
  if (age >= H72 && age < D7 && !sent.includes("[Baseline-Drip-2 sent]")) return 2;
  if (age >= D7 && !sent.includes("[Baseline-Drip-3 sent]")) return 3;
  return null;
}

/** Internal/test identities never get the drip. */
export function isSuppressedEmail(email: string): boolean {
  const norm = (email ?? "").toLowerCase().trim();
  if (!norm || !norm.includes("@")) return true;
  return norm.endsWith("@handypioneers.com");
}

const ctaButton = (label: string) =>
  `<p><a href="${MEMBERSHIP_URL}" style="display:inline-block;background:#1a2e1a;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-family:sans-serif;font-weight:bold;">${label}</a></p>`;

/** Render the subject + html for a given drip step. Copy approved 2026-06-05. */
export function buildBaselineDripEmail(step: 1 | 2 | 3, firstName: string): { subject: string; html: string } {
  const name = firstName.trim() || "there";
  if (step === 1) {
    return {
      subject: `Pick up where you left off, ${name}?`,
      html: `<p>Hi ${name},</p>
<p>You started telling us about your home but didn't get to finish. No problem, your information is saved and the rest takes about two minutes.</p>
<p>The next step is a few quick details about your home, then we schedule your Baseline Walkthrough. That first visit is where we learn your home top to bottom and build your maintenance plan around it.</p>
${ctaButton("Finish My Enrollment")}
<p>If you'd rather talk it through first, reply to this email or call us at <a href="tel:+13603344428">${HP_PHONE}</a>.</p>
<p>The Handy Pioneers Team</p>`,
    };
  }
  if (step === 2) {
    return {
      subject: `Small fixes stay small when someone is watching`,
      html: `<p>Hi ${name},</p>
<p>Most expensive home repairs start as something small that nobody caught. A slow drip, a clogged gutter, a furnace filter past its date.</p>
<p>That's what the Proactive Path is for: a Baseline Walkthrough of your whole home, seasonal check-ins through the year, and member pricing whenever work does come up. You handle life, we watch the house.</p>
${ctaButton("Continue My Enrollment")}
<p>Questions first? Reply here or call <a href="tel:+13603344428">${HP_PHONE}</a>.</p>
<p>The Handy Pioneers Team</p>`,
    };
  }
  return {
    subject: `We'll leave the door open, ${name}`,
    html: `<p>Hi ${name},</p>
<p>We won't keep filling your inbox. If now isn't the right time to set up your home's maintenance plan, that's completely fine. We'll be here when you're ready.</p>
<p>If you do want to finish what you started, it takes about two minutes:</p>
${ctaButton("Finish My Enrollment")}
<p>Either way, thanks for considering us for your home.</p>
<p>The Handy Pioneers Team</p>`,
  };
}

/** True if any 360 membership row exists for a CRM customer with this email. */
async function emailHasMembership(email: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return true; // no db → fail safe, don't email
  const rows = await db
    .select({ id: threeSixtyMemberships.id })
    .from(threeSixtyMemberships)
    .innerJoin(customers, eq(threeSixtyMemberships.customerId, customers.id))
    .where(eq(customers.email, email))
    .limit(1);
  return rows.length > 0;
}

/**
 * One pass of the drip: find due Step-1 drop-off leads, send the due email,
 * mark the lead. Called hourly from _core/index.ts. Best-effort + idempotent.
 */
export async function runBaselineDripEmails(): Promise<void> {
  try {
    if (!isEmailSenderReady()) return;
    const leads = await listOpportunities("lead", undefined, false, 500);
    const baselineLeads = (leads as BaselineDripLead[]).filter(isBaselineStepOneLead);
    if (baselineLeads.length === 0) return;

    // Suppression set: customers already in the cart-abandonment drip.
    const cartLeads = (leads as BaselineDripLead[]).filter((o) => o.stage === "Cart Abandoned");
    const cartCustomerIds = new Set(cartLeads.map((o) => o.customerId).filter(Boolean));
    const cartEmails = new Set(
      cartLeads
        .map((o) => (o.notes ?? "").match(/<([^>]+@[^>]+)>/)?.[1]?.toLowerCase().trim())
        .filter(Boolean),
    );

    const now = Date.now();
    for (const lead of baselineLeads) {
      const step = pickDripStep(lead, now);
      if (!step || !lead.customerId) continue;
      const customer = await getCustomerById(lead.customerId).catch(() => null);
      const email = (customer?.email ?? "").toLowerCase().trim();
      if (isSuppressedEmail(email)) continue;
      if (cartCustomerIds.has(lead.customerId) || cartEmails.has(email)) continue;
      const hasMembership = await emailHasMembership(email).catch(() => true);
      if (hasMembership) continue;

      const message = buildBaselineDripEmail(step, customer?.firstName ?? "");
      await sendEmail({ to: email, subject: message.subject, html: message.html }).catch(() => null);
      await updateOpportunity(lead.id, {
        notes: (lead.notes ?? "") + `\n[Baseline-Drip-${step} sent]`,
      }).catch(() => null);
      console.log(`[Baseline Drip] Email ${step} sent to ${email} (lead ${lead.id})`);
    }
  } catch (err) {
    console.error("[Baseline Drip] job error:", err);
  }
}
