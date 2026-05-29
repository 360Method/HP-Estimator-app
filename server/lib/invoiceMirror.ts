/**
 * Invoice mirror (audit Rec 4) — bridges pro-side `invoices` to customer-facing
 * `portalInvoices`. The deposit invoice is already mirrored at estimate-approval
 * time; the gap was the FINAL/balance invoice, which lived only in the pro DB.
 * This mirrors final invoices to the portal (linked by hpInvoiceId) so customers
 * can see and pay them, and keeps status/amounts in sync.
 *
 * Code-complete + additive (new column + new rows). Validate against a DB backup
 * before relying on it in production — there is no integration test here.
 */
import type { DbInvoice } from "../../drizzle/schema";
import {
  findPortalCustomerByHpId,
  getPortalInvoiceByHpInvoiceId,
  createPortalInvoice,
  updatePortalInvoiceById,
} from "../portalDb";
import { getInvoiceById } from "../db";

/** Portal invoice statuses (subset of pro statuses). */
const PORTAL_STATUSES = new Set(["draft", "sent", "due", "paid", "void", "partial"]);

/** Map a pro invoice status to the nearest portal status. */
export function mapInvoiceStatus(proStatus: string): string {
  if (proStatus === "pending_signoff") return "sent";
  return PORTAL_STATUSES.has(proStatus) ? proStatus : "sent";
}

/** Pure: build the portalInvoices insert payload from a pro invoice. */
export function buildMirroredPortalInvoice(
  pro: Pick<DbInvoice, "id" | "type" | "status" | "invoiceNumber" | "total" | "amountPaid" | "dueDate" | "paidAt">,
  portalCustomerId: number,
  jobTitle?: string | null,
) {
  return {
    customerId: portalCustomerId,
    hpInvoiceId: pro.id,
    invoiceNumber: pro.invoiceNumber,
    type: pro.type === "deposit" ? "deposit" : "final",
    status: mapInvoiceStatus(pro.status),
    amountDue: pro.total,
    amountPaid: pro.amountPaid,
    dueDate: pro.dueDate ? new Date(pro.dueDate) : undefined,
    paidAt: pro.paidAt ? new Date(pro.paidAt) : undefined,
    jobTitle: jobTitle ?? undefined,
  };
}

/**
 * Mirror a pro FINAL invoice to the portal (upsert by hpInvoiceId). No-op for
 * deposit invoices (already mirrored elsewhere) and when the customer has no
 * portal account. Safe to call on create and on payment changes.
 */
export async function mirrorProInvoiceToPortal(proInvoiceId: string): Promise<void> {
  const pro = await getInvoiceById(proInvoiceId);
  if (!pro || pro.type !== "final") return; // only final/balance invoices
  const portalCustomer = await findPortalCustomerByHpId(pro.customerId);
  if (!portalCustomer) return; // customer not on the portal — nothing to mirror to

  const existing = await getPortalInvoiceByHpInvoiceId(pro.id);
  if (existing) {
    await updatePortalInvoiceById(existing.id, {
      status: mapInvoiceStatus(pro.status),
      amountDue: pro.total,
      amountPaid: pro.amountPaid,
      paidAt: pro.paidAt ? new Date(pro.paidAt) : undefined,
    });
  } else {
    await createPortalInvoice(buildMirroredPortalInvoice(pro, portalCustomer.id));
  }
}
