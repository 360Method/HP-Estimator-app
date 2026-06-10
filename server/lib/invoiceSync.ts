/**
 * invoiceSync — reflect portal invoice payments onto internal invoices
 * (Phase F #3, the reverse direction of the portal push).
 *
 * A portal invoice becomes paid in three places (Stripe payment_intent
 * webhook, Stripe checkout webhook, portal.markInvoicePaid); none of them
 * touched the internal invoice, which is what the staff Billing tab and the
 * mirror-status drift flag read. This module records the payment internally
 * using the same recipe as invoices.addPayment.
 *
 * Money safety rails:
 *  - Match resolution goes portal invoice → portal estimate → hpOpportunityId
 *    → internal invoices for that opportunity. If no single unambiguous match
 *    is found, we do nothing (a human reconciles; we never guess).
 *  - Internal invoice amounts are written by the client app and are dollars,
 *    while portal amounts are integer cents. Rather than hardcode that, the
 *    unit is detected by reconciling the two totals; if they don't reconcile
 *    under either unit, we do nothing.
 *  - Idempotent by payment reference (webhooks can retry).
 */
import { nanoid } from "nanoid";
import {
  listInvoices,
  updateInvoice,
  addInvoicePayment,
  listInvoicePayments,
} from "../db";
import { getPortalEstimateById } from "../portalDb";

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export interface PortalInvoiceLike {
  id: number;
  estimateId: number | null;
  invoiceNumber: string;
  type: string;
  amountDue: number; // cents
}

/**
 * Pick the internal invoice a paid portal invoice corresponds to.
 * Returns null when there is no single safe match.
 */
export function matchInternalInvoice<
  T extends { id: string; invoiceNumber: string; type: string; status: string },
>(candidates: T[], portal: { invoiceNumber: string; type: string }): T | null {
  const open = candidates.filter((c) => c.status !== "void" && c.status !== "paid");
  // 1. Mirrored invoices share the invoice number.
  const byNumber = open.filter((c) => norm(c.invoiceNumber) === norm(portal.invoiceNumber));
  if (byNumber.length === 1) return byNumber[0];
  if (byNumber.length > 1) return null;
  // 2. Portal-originated invoices (DEP-EST-…) won't match by number; fall back
  //    to the type when exactly one open internal invoice of that type exists.
  const portalType = portal.type === "balance" ? "final" : portal.type;
  const byType = open.filter((c) => c.type === portalType);
  if (byType.length === 1) return byType[0];
  return null;
}

/**
 * Convert the paid cents to the internal invoice's unit, detected by
 * reconciling the internal total with the portal amountDue (±$1 tolerance).
 * Returns null when the totals don't reconcile under either unit.
 */
export function convertPaidCentsToInternalUnit(
  internalTotal: number,
  portalAmountDueCents: number,
  paidCents: number,
): number | null {
  if (internalTotal <= 0 || portalAmountDueCents <= 0 || paidCents <= 0) return null;
  // Internal stored in dollars → total * 100 ≈ portal cents.
  if (Math.abs(internalTotal * 100 - portalAmountDueCents) <= 100) {
    return Math.round(paidCents) / 100;
  }
  // Internal stored in cents → totals match directly.
  if (Math.abs(internalTotal - portalAmountDueCents) <= 100) {
    return Math.round(paidCents);
  }
  return null;
}

/**
 * Record a paid portal invoice as a payment on its internal counterpart.
 * Never throws; returns what it did (or null when it safely did nothing).
 */
export async function reflectPortalInvoicePaymentToInternal(
  portalInvoice: PortalInvoiceLike,
  paidCents: number,
  reference: string,
): Promise<{ internalInvoiceId: string; status: string } | null> {
  try {
    if (!portalInvoice.estimateId) return null;
    const est = await getPortalEstimateById(portalInvoice.estimateId);
    if (!est?.hpOpportunityId) return null;

    const candidates = await listInvoices({ opportunityId: est.hpOpportunityId, limit: 100 });
    const target = matchInternalInvoice(candidates, portalInvoice);
    if (!target) {
      console.log(
        `[invoiceSync] No safe internal match for portal invoice ${portalInvoice.invoiceNumber} (opp ${est.hpOpportunityId}); leaving for manual reconcile`,
      );
      return null;
    }

    const amount = convertPaidCentsToInternalUnit(target.total, portalInvoice.amountDue, paidCents);
    if (amount == null) {
      console.log(
        `[invoiceSync] Totals don't reconcile for ${portalInvoice.invoiceNumber} (internal ${target.total} vs portal ${portalInvoice.amountDue}c); skipping`,
      );
      return null;
    }

    const ref = reference || `portal-invoice-${portalInvoice.id}`;
    const payments = await listInvoicePayments(target.id);
    if (payments.some((p) => p.reference === ref)) return null; // webhook retry

    const now = new Date().toISOString();
    await addInvoicePayment({
      id: nanoid(12),
      invoiceId: target.id,
      method: "stripe",
      amount,
      paidAt: now,
      reference: ref,
      note: `Auto-recorded from portal invoice ${portalInvoice.invoiceNumber}`,
    });
    // Same recalculation as invoices.addPayment.
    const amountPaid = payments.reduce((s, p) => s + p.amount, 0) + amount;
    const balance = target.total - amountPaid;
    const status = balance <= 0 ? "paid" : "partial";
    await updateInvoice(target.id, {
      amountPaid,
      balance,
      status,
      paidAt: balance <= 0 ? now : undefined,
    });
    console.log(
      `[invoiceSync] Portal payment ${ref} recorded on internal invoice ${target.invoiceNumber} (${status})`,
    );
    return { internalInvoiceId: target.id, status };
  } catch (e) {
    console.warn("[invoiceSync] reflect portal payment failed:", e);
    return null;
  }
}
