/**
 * server/lib/payments/depositPaid.ts
 *
 * The one place a paid invoice is completed, regardless of how the money
 * arrived (Stripe Checkout, Payment Element, or a check recorded on-site):
 *
 *   1. One branded receipt email, gated by portalInvoices.receiptSentAt so
 *      webhook retries and double-fired events can never send two.
 *   2. For a deposit invoice: create the Job opportunity (mirrors the
 *      client's CONVERT_ESTIMATE_TO_JOB semantics) at "Deposit Collected",
 *      stamp convertedToJobAt on the estimate, and drop a scheduling task
 *      on the calendar so the river actually ends in scheduled work.
 *
 * Callers should treat this as best-effort: payment state is already
 * persisted before this runs, so failures log loudly and never bubble into
 * a webhook 500.
 */
import { sql, eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  getDb,
  getOpportunityById,
  createOpportunity,
  updateOpportunity,
  createScheduleEvent,
} from "../../db";
import { opportunities, portalInvoices } from "../../../drizzle/schema";
import {
  getPortalInvoiceById,
  getPortalEstimateById,
  findPortalCustomerById,
} from "../../portalDb";
import { emailWrapper, ctaButton } from "../email/hpEmailTheme";
import { sendEmail } from "../../gmail";
import { notifyOwner } from "../../_core/notification";

export type PaymentMethodKind = "card" | "check";

export function buildPaymentReceiptEmail(opts: {
  firstName: string;
  amountCents: number;
  invoiceNumber: string;
  method: PaymentMethodKind;
  invoiceUrl: string;
}): { subject: string; html: string } {
  const amountStr = `$${(opts.amountCents / 100).toFixed(2)}`;
  const methodLine = opts.method === "check" ? "by check" : "by card";
  const content = `
    <p>Hi ${opts.firstName},</p>
    <p>We received your payment of <strong>${amountStr}</strong> ${methodLine} for invoice <strong>${opts.invoiceNumber}</strong>. Thank you!</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      <tr><td style="background:#f8f9fa;border:1px solid #e8e8e8;border-radius:6px;padding:16px 24px;text-align:center;">
        <p style="margin:0;font-size:13px;color:#888;text-transform:uppercase;">Amount Paid</p>
        <p style="margin:4px 0 0;font-size:28px;font-weight:700;color:#2D5016;">${amountStr}</p>
      </td></tr>
    </table>
    ${ctaButton("View Invoice", opts.invoiceUrl)}
    <p style="font-size:13px;color:#888;text-align:center;">This receipt is for your records. Your portal keeps a copy of every document.</p>`;
  return {
    subject: "Payment received, thank you!",
    html: emailWrapper(content),
  };
}

/** Next weekday at the given Pacific-ish local hour, as an ISO string. */
function nextBusinessDayIso(hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/**
 * Complete a paid invoice: receipt + (for deposits) job + scheduling task.
 * Idempotent on portalInvoices.receiptSentAt — safe under webhook retries.
 */
export async function onInvoicePaid(opts: {
  invoiceId: number;
  amountCents: number;
  method: PaymentMethodKind;
  reference?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const inv = await getPortalInvoiceById(opts.invoiceId);
  if (!inv) {
    console.warn(`[depositPaid] invoice ${opts.invoiceId} not found`);
    return;
  }

  // ── 1. Claim the receipt slot atomically. Zero rows updated means another
  // path (or a webhook retry) already completed this invoice — stop here.
  const claim = await db
    .update(portalInvoices)
    .set({ receiptSentAt: new Date() })
    .where(and(eq(portalInvoices.id, opts.invoiceId), sql`"receiptSentAt" IS NULL`))
    .returning({ id: portalInvoices.id });
  if (claim.length === 0) {
    console.log(`[depositPaid] invoice ${opts.invoiceId} already completed — skipping`);
    return;
  }

  const customer = await findPortalCustomerById(inv.customerId).catch(() => null);

  // ── 2. The receipt email.
  if (customer?.email) {
    try {
      const baseUrl = process.env.PORTAL_BASE_URL ?? "https://client.handypioneers.com";
      const receipt = buildPaymentReceiptEmail({
        firstName: customer.name.split(" ")[0] || "there",
        amountCents: opts.amountCents,
        invoiceNumber: inv.invoiceNumber,
        method: opts.method,
        invoiceUrl: `${baseUrl}/portal/invoices/${inv.id}`,
      });
      await sendEmail({ to: customer.email, subject: receipt.subject, html: receipt.html });
    } catch (err) {
      console.error(`[depositPaid] receipt email failed for invoice ${opts.invoiceId}:`, err);
    }
  }
  notifyOwner({
    title: `Invoice paid: ${inv.invoiceNumber}`,
    content: `${customer?.name ?? "Customer"} paid $${(opts.amountCents / 100).toFixed(2)} ${opts.method === "check" ? "by check" : "by card"}${opts.reference ? ` (${opts.reference})` : ""} for invoice ${inv.invoiceNumber}.`,
  }).catch(() => null);

  // ── 3. Deposit invoices push the river forward: estimate → Job → schedule task.
  if (inv.type !== "deposit" || !inv.estimateId) return;
  try {
    const portalEstimate = await getPortalEstimateById(inv.estimateId);
    const estimateOppId = portalEstimate?.hpOpportunityId ?? null;
    if (!estimateOppId) {
      console.warn(`[depositPaid] deposit invoice ${inv.id} has no linked internal estimate — no job created`);
      return;
    }
    const estimateOpp = await getOpportunityById(estimateOppId);
    if (!estimateOpp) {
      console.warn(`[depositPaid] internal estimate ${estimateOppId} not found — no job created`);
      return;
    }

    // Guard: one job per estimate, ever.
    const [existingJob] = await db
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(and(eq(opportunities.sourceEstimateId, estimateOppId), eq(opportunities.area, "job")))
      .limit(1);
    if (existingJob) {
      console.log(`[depositPaid] job ${existingJob.id} already exists for estimate ${estimateOppId}`);
      return;
    }

    const jobYear = new Date().getFullYear();
    const [{ count: jobCount }] = (await db
      .select({ count: sql<number>`count(*)::int` })
      .from(opportunities)
      .where(eq(opportunities.area, "job"))) as Array<{ count: number }>;

    const jobId = nanoid(8);
    const nowIso = new Date().toISOString();
    await createOpportunity({
      id: jobId,
      customerId: estimateOpp.customerId,
      area: "job",
      stage: "Deposit Collected",
      title: estimateOpp.title,
      value: estimateOpp.value,
      jobNumber: `JOB-${jobYear}-${String(jobCount + 1).padStart(3, "0")}`,
      notes: estimateOpp.notes,
      sourceEstimateId: estimateOpp.id,
      sourceLeadId: estimateOpp.sourceLeadId,
      clientSnapshot: estimateOpp.clientSnapshot,
      propertyId: estimateOpp.propertyId,
      propertyIdSource: estimateOpp.propertyIdSource,
      membershipId: estimateOpp.membershipId,
      archived: false,
    });
    await updateOpportunity(estimateOpp.id, { convertedToJobAt: nowIso });

    // Scheduling task on the next weekday so the call to set dates is a
    // calendar item, not a memory. (Crew work never lands on weekends.)
    const start = nextBusinessDayIso(9, 0);
    const end = nextBusinessDayIso(9, 30);
    await createScheduleEvent({
      id: nanoid(),
      type: "task",
      title: `Schedule the work: ${estimateOpp.title}`,
      start,
      end,
      allDay: false,
      opportunityId: jobId,
      customerId: estimateOpp.customerId,
      propertyId: estimateOpp.propertyId ?? undefined,
      notes: `Deposit received on invoice ${inv.invoiceNumber}. Call ${customer?.name ?? "the customer"} to set the work dates.`,
      completed: false,
    });

    notifyOwner({
      title: `Job created: ${estimateOpp.title}`,
      content: `Deposit received — job ${jobId} is at Deposit Collected with a scheduling task on the calendar.`,
    }).catch(() => null);
    console.log(`[depositPaid] invoice ${inv.id} → job ${jobId} + scheduling task`);
  } catch (err) {
    console.error(`[depositPaid] job creation failed for invoice ${opts.invoiceId}:`, err);
  }
}
