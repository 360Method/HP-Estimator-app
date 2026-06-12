/**
 * Close Flow router — staff-side procedures for the on-site close
 * (consultant's iPad, client in the room). Everything here renders on a
 * customer-VISIBLE staff surface, so every procedure composes
 * portalLeakGuard: payloads must stay customer-safe (no cost, markup, or
 * margin fields) even though the caller is staff-authenticated.
 *
 * approveEstimateInPerson runs the same shared approval pipeline as the
 * portal (server/lib/estimateApproval.ts) with channel 'in_person' and a
 * recorded attestation, so the downstream Won stage, deposit invoice, and
 * job generation are untouched.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { portalLeakGuard } from "../_core/portalLeakGuard";
import {
  getPortalEstimateById,
  findPortalCustomerById,
  getPortalInvoiceById,
  updatePortalInvoicePaid,
  updatePortalInvoiceCheckoutSessionId,
} from "../portalDb";
import { approvePortalEstimate } from "../lib/estimateApproval";
import { notifyOwner } from "../_core/notification";
import { runAutomationsForTrigger } from "../automationEngine";
import { ENV } from "../_core/env";
import Stripe from "stripe";

function getStripe() {
  const key = ENV.stripeSecretKey || process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2025-03-31.basil" });
}

const closeProcedure = protectedProcedure.use(portalLeakGuard);

export const closeFlowRouter = router({
  approveEstimateInPerson: closeProcedure
    .input(
      z.object({
        portalEstimateId: z.number().int(),
        signerName: z.string().min(1),
        signatureDataUrl: z.string().min(1),
        /** e.g. navigator userAgent summary from the consultant's device */
        deviceInfo: z.string().max(300).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const est = await getPortalEstimateById(input.portalEstimateId);
      if (!est) throw new TRPCError({ code: "NOT_FOUND" });
      const portalCustomer = await findPortalCustomerById(est.customerId);
      if (!portalCustomer) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No portal account is linked to this estimate. Send the estimate to the portal first.",
        });
      }
      const witnessName = ctx.user.name || ctx.user.email || `Staff user ${ctx.user.id}`;
      return approvePortalEstimate({
        estimateId: est.id,
        signerName: input.signerName,
        signatureDataUrl: input.signatureDataUrl,
        channel: "in_person",
        attestation: {
          witnessUserId: ctx.user.id,
          witnessName,
          device: input.deviceInfo ?? "staff device",
          signedAt: new Date().toISOString(),
        },
        portalCustomer: {
          id: portalCustomer.id,
          name: portalCustomer.name,
          email: portalCustomer.email,
          phone: (portalCustomer as any).phone ?? null,
        },
      });
    }),

  /**
   * Stripe Checkout for a deposit invoice, opened on the consultant's
   * device. Staff-auth copy of portal.createCheckoutSession minus the
   * portal-session ownership check; the existing checkout.session.completed
   * webhook marks it paid and syncs the staff invoice, zero new webhook code.
   */
  createDepositCheckoutSession: closeProcedure
    .input(
      z.object({
        invoiceId: z.number().int(),
        /** Staff app origin + relative return path for the new tab */
        origin: z.string().url(),
        successPath: z.string().startsWith("/"),
        cancelPath: z.string().startsWith("/").optional(),
      })
    )
    .mutation(async ({ input }) => {
      const inv = await getPortalInvoiceById(input.invoiceId);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      if (inv.status === "paid") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice already paid" });
      }
      const customer = await findPortalCustomerById(inv.customerId);

      const join = (path: string, qs: string) => `${input.origin}${path}${path.includes("?") ? "&" : "?"}${qs}`;
      const session = await getStripe().checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: inv.amountDue,
              product_data: {
                name: inv.jobTitle ?? `Invoice ${inv.invoiceNumber}`,
                description: `Handy Pioneers — Invoice ${inv.invoiceNumber}`,
              },
            },
            quantity: 1,
          },
        ],
        customer_email: customer?.email || undefined,
        metadata: {
          portalInvoiceId: String(inv.id),
          portalCustomerId: String(inv.customerId),
          invoiceNumber: inv.invoiceNumber,
        },
        success_url: join(input.successPath, "paid=1"),
        cancel_url: join(input.cancelPath ?? input.successPath, "cancelled=1"),
      });

      await updatePortalInvoiceCheckoutSessionId(inv.id, session.id);
      return { url: session.url! };
    }),

  /** Record a deposit paid by check, on the spot. Mirrors portal.markInvoicePaid. */
  recordDepositCheckPayment: closeProcedure
    .input(
      z.object({
        invoiceId: z.number().int(),
        checkNumber: z.string().max(60).optional(),
        checkDate: z.string().optional(),
        amountCents: z.number().int().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const inv = await getPortalInvoiceById(input.invoiceId);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND" });
      if (inv.status === "paid") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice already paid" });
      }
      const customer = await findPortalCustomerById(inv.customerId);

      await updatePortalInvoicePaid(input.invoiceId, input.amountCents, undefined, {
        paymentMethod: "check",
        paymentRef: input.checkNumber ?? null,
      });

      const reference = `check-${input.checkNumber || input.invoiceId}`;
      try {
        const { reflectPortalInvoicePaymentToInternal } = await import("../lib/invoiceSync");
        await reflectPortalInvoicePaymentToInternal(inv, input.amountCents, reference);
      } catch (syncErr) {
        console.warn("[closeFlow.recordDepositCheckPayment] internal invoice reflection failed:", syncErr);
      }

      const witnessName = ctx.user.name || ctx.user.email || `Staff user ${ctx.user.id}`;
      await notifyOwner({
        title: `Invoice Paid by Check: ${inv.invoiceNumber}`,
        content: `${customer?.name ?? "Customer"} paid invoice ${inv.invoiceNumber} by check${input.checkNumber ? ` #${input.checkNumber}` : ""}${input.checkDate ? ` dated ${input.checkDate}` : ""} for $${(input.amountCents / 100).toFixed(2)}. Recorded on-site by ${witnessName}.`,
      }).catch(() => null);

      runAutomationsForTrigger("invoice_paid", {
        customerId: inv.customerId,
        customerName: customer?.name,
        customerFirstName: customer?.name?.split(" ")[0],
        email: customer?.email,
        phone: (customer as any)?.phone ?? undefined,
        referenceNumber: inv.invoiceNumber,
        amount: `$${(input.amountCents / 100).toFixed(2)}`,
        description: inv.jobTitle ?? undefined,
      }).catch(() => null);

      return { ok: true };
    }),
});
