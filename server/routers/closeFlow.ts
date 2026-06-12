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
  findPortalCustomerByHpId,
  getPortalEstimatesByCustomer,
  getPortalInvoicesByCustomer,
  getPortalInvoiceById,
  updatePortalInvoicePaid,
  updatePortalInvoiceCheckoutSessionId,
} from "../portalDb";
import { approvePortalEstimate } from "../lib/estimateApproval";
import { notifyOwner } from "../_core/notification";
import { runAutomationsForTrigger } from "../automationEngine";
import { getDb, getCustomerById } from "../db";
import {
  properties,
  threeSixtyMemberships,
  threeSixtyScans,
} from "../../drizzle/schema";
import { priorityTranslations } from "../../drizzle/schema.priorityTranslation";
import { eq, and, desc } from "drizzle-orm";
import { buildPropertyScope, recordInScope } from "../lib/propertyScope";
import { TIER_DEFINITIONS, type MemberTier } from "../../shared/threeSixtyTiers";
import { ENV } from "../_core/env";
import Stripe from "stripe";

function getStripe() {
  const key = ENV.stripeSecretKey || process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2025-03-31.basil" });
}

const closeProcedure = protectedProcedure.use(portalLeakGuard);

export const closeFlowRouter = router({
  /**
   * One customer-safe bundle for the guided close: who the client is, the
   * property being presented, the roadmap deliverables, the latest
   * presentable estimate with its deposit invoice, and readiness flags for
   * the pre-flight checklist. Every field is serialized via an explicit
   * allowlist; the leak guard backstops it mechanically.
   */
  getContext: closeProcedure
    .input(z.object({ customerId: z.string(), propertyId: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const customer = await getCustomerById(input.customerId);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });

      // ── Property + membership state ──────────────────────────────────────
      const propertyRows = await db
        .select()
        .from(properties)
        .where(eq(properties.customerId, input.customerId));
      const property =
        (input.propertyId ? propertyRows.find((p) => p.id === input.propertyId) : undefined) ??
        propertyRows.find((p) => p.isPrimary) ??
        propertyRows[0] ??
        null;

      let membershipTierLabel: string | null = null;
      if (property?.membershipId) {
        const [m] = await db
          .select({ tier: threeSixtyMemberships.tier, status: threeSixtyMemberships.status })
          .from(threeSixtyMemberships)
          .where(eq(threeSixtyMemberships.id, property.membershipId))
          .limit(1);
        if (m?.status === "active") {
          membershipTierLabel = TIER_DEFINITIONS[m.tier as MemberTier]?.label ?? null;
        }
      }

      // ── Roadmap deliverables (same shape family as journey stepDetail
      //    'prioritize'): spot mini-roadmap PDFs + 360 scan report PDFs,
      //    scoped to the presented property. ─────────────────────────────────
      const scope = property ? buildPropertyScope(property, propertyRows.length) : null;
      const spots = await db
        .select({
          id: priorityTranslations.id,
          status: priorityTranslations.status,
          createdAt: priorityTranslations.createdAt,
          outputPdfPath: priorityTranslations.outputPdfPath,
          crmPropertyId: priorityTranslations.crmPropertyId,
        })
        .from(priorityTranslations)
        .where(and(
          eq(priorityTranslations.hpCustomerId, input.customerId),
          eq(priorityTranslations.source, "spot_inspection"),
        ))
        .orderBy(desc(priorityTranslations.createdAt));
      const scans = property?.membershipId
        ? await db
            .select({
              id: threeSixtyScans.id,
              scanDate: threeSixtyScans.scanDate,
              reportUrl: threeSixtyScans.reportUrl,
            })
            .from(threeSixtyScans)
            .where(eq(threeSixtyScans.membershipId, property.membershipId))
        : [];
      const roadmaps = [
        ...scans
          .filter((s) => !!s.reportUrl)
          .map((s) => ({
            id: `scan-${s.id}`,
            title: "360 scan roadmap",
            dateMs: (s.scanDate as number | null) ?? null,
            pdfUrl: s.reportUrl as string,
          })),
        ...spots
          .filter((s) => !!s.outputPdfPath && (!scope || recordInScope(s.crmPropertyId, scope)))
          .map((s) => ({
            id: `spot-${s.id}`,
            title: "Spot inspection mini roadmap",
            dateMs: s.createdAt ? new Date(s.createdAt as unknown as string | Date).getTime() : null,
            pdfUrl: s.outputPdfPath as string,
          })),
      ].sort((a, b) => (b.dateMs ?? 0) - (a.dateMs ?? 0));

      // ── Latest presentable estimate + deposit invoice ────────────────────
      const portalCustomer = await findPortalCustomerByHpId(input.customerId);
      let estimate: {
        id: number;
        estimateNumber: string;
        title: string | null;
        status: string;
        hpOpportunityId: string | null;
        totalAmount: number;
        depositAmount: number;
        depositPercent: number;
        lineItemsJson: string | null;
        scopeOfWork: string | null;
        taxEnabled: number;
        taxRateCode: string;
        customTaxPct: number;
        taxAmount: number;
        sentAt: Date | null;
        expiresAt: Date | null;
        approvedAt: Date | null;
        signerName: string | null;
      } | null = null;
      let depositInvoice: {
        id: number;
        invoiceNumber: string;
        status: string;
        amountDue: number;
        amountPaid: number;
      } | null = null;

      if (portalCustomer) {
        const ests = await getPortalEstimatesByCustomer(portalCustomer.id);
        // Newest presentable first; fall back to the newest approved one so a
        // re-entered flow can collapse the sign step to a banner.
        const chosen =
          ests.find((e) => e.status === "sent" || e.status === "viewed") ??
          ests.find((e) => e.status === "approved") ??
          null;
        if (chosen) {
          estimate = {
            id: chosen.id,
            estimateNumber: chosen.estimateNumber,
            title: chosen.title,
            status: chosen.status,
            hpOpportunityId: chosen.hpOpportunityId,
            totalAmount: chosen.totalAmount,
            depositAmount: chosen.depositAmount,
            depositPercent: chosen.depositPercent,
            lineItemsJson: chosen.lineItemsJson,
            scopeOfWork: chosen.scopeOfWork,
            taxEnabled: chosen.taxEnabled,
            taxRateCode: chosen.taxRateCode,
            customTaxPct: chosen.customTaxPct,
            taxAmount: chosen.taxAmount,
            sentAt: chosen.sentAt,
            expiresAt: chosen.expiresAt,
            approvedAt: chosen.approvedAt,
            signerName: chosen.signerName,
          };
          const invoices = await getPortalInvoicesByCustomer(portalCustomer.id);
          const dep = invoices.find((i) => i.estimateId === chosen.id && i.type === "deposit") ?? null;
          if (dep) {
            depositInvoice = {
              id: dep.id,
              invoiceNumber: dep.invoiceNumber,
              status: dep.status,
              amountDue: dep.amountDue,
              amountPaid: dep.amountPaid,
            };
          }
        }
      }

      return {
        customer: {
          id: customer.id,
          name: customer.displayName || `${customer.firstName} ${customer.lastName}`.trim(),
          email: customer.email || null,
          phone: customer.mobilePhone || null,
        },
        property: property
          ? {
              id: property.id,
              label: property.label,
              street: property.street,
              city: property.city,
              state: property.state,
              zip: property.zip,
              membershipTierLabel,
            }
          : null,
        roadmaps,
        estimate,
        depositInvoice,
        readiness: {
          hasRoadmap: roadmaps.length > 0,
          estimateSynced: !!estimate,
          customerEmailPresent: !!customer.email,
          alreadyMember: !!membershipTierLabel,
          portalAccountPresent: !!portalCustomer,
          depositInvoiceStatus: depositInvoice?.status ?? null,
        },
      };
    }),

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
