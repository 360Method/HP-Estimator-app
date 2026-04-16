/**
 * Portal router — all tRPC procedures for the customer portal.
 * Uses portal session cookies (hp_portal_session) for auth, NOT Manus OAuth.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "crypto";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import {
  findPortalCustomerByEmail,
  findPortalCustomerById,
  findPortalCustomerByHpId,
  upsertPortalCustomer,
  createPortalToken,
  findValidPortalToken,
  markPortalTokenUsed,
  createPortalSession,
  findValidPortalSession,
  deletePortalSession,
  getPortalEstimateById,
  getPortalEstimatesByCustomer,
  getPortalEstimateByOpportunityId,
  updatePortalEstimateStatus,
  markPortalEstimateViewed,
  createPortalInvoice,
  getPortalInvoicesByCustomer,
  getPortalInvoiceById,
  updatePortalInvoicePaid,
  markPortalInvoiceViewed,
  createPortalAppointment,
  getPortalAppointmentsByCustomer,
  createPortalMessage,
  getPortalMessagesByCustomer,
  getUnreadPortalMessageCount,
  addPortalGalleryItem,
  getPortalGalleryByCustomer,
  createPortalReferral,
  getPortalReferralsByReferrer,
  generateReferralCode,
  updatePortalCustomerStripeId,
  updatePortalCustomerProfile,
  createPortalServiceRequest,
  getPortalServiceRequestsByCustomer,
  getAllPendingPortalServiceRequests,
  updatePortalServiceRequestStatus,
  getAllPortalMessages,
  getPortalInvoiceByCheckoutSessionId,
  updatePortalInvoiceCheckoutSessionId,
  getPortalInvoicePaymentStatusByNumbers,
  getPortalRevenueStats,
  getMilestonesByJob,
  upsertMilestone,
  deleteMilestone,
  getUpdatesByJob,
  createJobUpdate,
  deleteJobUpdate,
  getJobSignOff,
  createJobSignOff,
  getPortalChangeOrderById,
  getPortalChangeOrdersByJob,
  getPortalChangeOrdersByCustomer,
  createPortalChangeOrder,
  updatePortalChangeOrderStatus,
  setSkipReviewRequest,
  getPortalInvoicesByHpOpportunityId,
  getGlobalUnreadPortalMessageCount,
  getPendingChangeOrderCountsByJob,
  addPortalDocument,
  getPortalDocumentsByCustomer,
  markAllPortalMessagesRead,
  createPortalEstimate,
} from "../portalDb";
import { sendEmail } from "../gmail";
import { updateOpportunity } from "../db";
import { notifyOwner } from "../_core/notification";
import { storagePut } from "../storage";
import { broadcastOpportunityUpdate, broadcastPortalMessage } from "../sse";
import Stripe from "stripe";
import { ENV } from "../_core/env";

// ─── SIGNATURE STORAGE HELPER ───────────────────────────────────────────────
/**
 * Converts a base64 PNG data URL to a Buffer and uploads it to S3.
 * Returns the CDN URL. Falls back to the original dataUrl if upload fails.
 */
async function uploadSignatureToS3(dataUrl: string, prefix: string): Promise<string> {
  try {
    // Strip the data:image/png;base64, prefix
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    const key = `signatures/${prefix}-${Date.now()}.png`;
    const { url } = await storagePut(key, buffer, 'image/png');
    return url;
  } catch (err) {
    console.warn('[portal] Signature S3 upload failed, storing as dataUrl:', err);
    return dataUrl; // graceful fallback
  }
}

function getStripe() {
  const key = ENV.stripeSecretKey || process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2025-03-31.basil" });
}

// ─── PORTAL SESSION MIDDLEWARE ────────────────────────────────────────────────

async function getPortalCustomerFromRequest(req: any) {
  const cookieHeader = req.headers?.cookie ?? "";
  const match = cookieHeader.match(/hp_portal_session=([^;]+)/);
  if (!match) return null;
  const session = await findValidPortalSession(match[1]);
  if (!session) return null;
  return findPortalCustomerById(session.customerId);
}

// Public procedure that also resolves portal customer
const portalPublicProcedure = publicProcedure;

// Portal-authenticated procedure
const portalProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const customer = await getPortalCustomerFromRequest(ctx.req);
  if (!customer) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Portal session required" });
  }
  return next({ ctx: { ...ctx, portalCustomer: customer } });
});

// HP staff procedure (requires Manus auth)
const hpProcedure = protectedProcedure;

// ─── ROUTER ───────────────────────────────────────────────────────────────────

export const portalRouter = router({
  // ── AUTH ──────────────────────────────────────────────────────────────────

  /** Send magic link to customer email */
  sendMagicLink: portalPublicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      const customer = await findPortalCustomerByEmail(input.email);
      if (!customer) {
        // Don't reveal whether email exists
        return { sent: true };
      }

      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      await createPortalToken({
        customerId: customer.id,
        token,
        expiresAt,
      });

      const portalUrl = `${process.env.PORTAL_BASE_URL ?? "https://client.handypioneers.com"}/portal/auth?token=${token}`;

      await sendEmail({
        to: customer.email,
        subject: "Your Handy Pioneers Customer Portal Login",
        html: buildMagicLinkEmail(customer.name, portalUrl),
      }).catch(() => null);

      return { sent: true };
    }),

  /** Verify magic link token and create session */
  verifyToken: portalPublicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const tokenRow = await findValidPortalToken(input.token);
      if (!tokenRow || tokenRow.usedAt) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired link" });
      }

      await markPortalTokenUsed(tokenRow.id);

      const sessionToken = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      await createPortalSession({
        customerId: tokenRow.customerId,
        sessionToken,
        expiresAt,
      });

      // Set session cookie
      const res = ctx.res as any;
      if (res?.cookie) {
        res.cookie("hp_portal_session", sessionToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          expires: expiresAt,
          path: "/",
        });
      }

      const customer = await findPortalCustomerById(tokenRow.customerId);
      return { customer };
    }),

  /** Get current portal session customer */
  me: portalPublicProcedure.query(async ({ ctx }) => {
    const customer = await getPortalCustomerFromRequest(ctx.req);
    return { customer };
  }),

  /** Logout — clear session */
  logout: portalProcedure.mutation(async ({ ctx }) => {
    const cookieHeader = (ctx.req as any).headers?.cookie ?? "";
    const match = cookieHeader.match(/hp_portal_session=([^;]+)/);
    if (match) {
      await deletePortalSession(match[1]);
      (ctx.res as any)?.clearCookie?.("hp_portal_session", { path: "/" });
    }
    return { ok: true };
  }),

  // ── ESTIMATES ─────────────────────────────────────────────────────────────

  /** List all estimates for the logged-in customer */
  getEstimates: portalProcedure.query(async ({ ctx }) => {
    return getPortalEstimatesByCustomer(ctx.portalCustomer.id);
  }),

  /** Get a single estimate (marks as viewed) */
  getEstimate: portalProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const est = await getPortalEstimateById(input.id);
      if (!est || est.customerId !== ctx.portalCustomer.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await markPortalEstimateViewed(input.id);
      return {
        ...est,
        customerName: ctx.portalCustomer.name,
        customerAddress: ctx.portalCustomer.address,
        customerEmail: ctx.portalCustomer.email,
      };
    }),

  /** Customer approves estimate with signature */
  approveEstimate: portalProcedure
    .input(
      z.object({
        id: z.number(),
        signerName: z.string().min(1),
        signatureDataUrl: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const est = await getPortalEstimateById(input.id);
      if (!est || est.customerId !== ctx.portalCustomer.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (est.status === "approved") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already approved" });
      }

      // Upload signature to S3 and store CDN URL instead of raw base64
      const sigUrl = await uploadSignatureToS3(
        input.signatureDataUrl,
        `est-${input.id}-${ctx.portalCustomer.id}`
      );

      await updatePortalEstimateStatus(input.id, "approved", {
        approvedAt: new Date(),
        signerName: input.signerName,
        signatureDataUrl: sigUrl,
      });

      // Auto-create deposit invoice if deposit > 0
      let depositInvoice = null;
      if (est.depositAmount > 0) {
        depositInvoice = await createPortalInvoice({
          customerId: est.customerId,
          estimateId: est.id,
          invoiceNumber: `DEP-${est.estimateNumber}`,
          type: "deposit",
          status: "due",
          amountDue: est.depositAmount,
          amountPaid: 0,
          tipAmount: 0,
          dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          jobTitle: est.title,
          lineItemsJson: est.lineItemsJson,
          sentAt: new Date(),
        });
      }

      // Mark pro-side opportunity as won (if linked) and broadcast SSE update
      if (est.hpOpportunityId) {
        const now = new Date().toISOString();
        await updateOpportunity(est.hpOpportunityId, {
          stage: 'Won',
          wonAt: now,
          portalApprovedAt: now,
        }).catch((e: unknown) => {
          console.warn('[portal.approveEstimate] Could not mark opportunity won:', e);
        });
        broadcastOpportunityUpdate(est.hpOpportunityId, {
          stage: 'Won',
          wonAt: now,
          portalApprovedAt: now,
          updatedAt: now,
        });
      }

      // Send approval confirmation email to customer
      const baseUrl = process.env.PORTAL_BASE_URL ?? 'https://client.handypioneers.com';
      const depositFmt = est.depositAmount > 0
        ? `$${(est.depositAmount / 100).toFixed(2)}`
        : null;
      const invoiceUrl = depositInvoice
        ? `${baseUrl}/portal/invoices/${depositInvoice.id}`
        : `${baseUrl}/portal/invoices`;
      await sendEmail({
        to: ctx.portalCustomer.email,
        subject: `Estimate ${est.estimateNumber} Approved — Thank You!`,
        html: buildApprovalConfirmationEmail(
          ctx.portalCustomer.name,
          est.estimateNumber,
          est.title ?? 'Your Project',
          depositFmt,
          invoiceUrl,
          baseUrl,
        ),
      }).catch(() => null);

      // Notify HP team
      await notifyOwner({
        title: `\u2705 Estimate Approved: ${est.estimateNumber}`,
        content: `${ctx.portalCustomer.name} approved estimate ${est.estimateNumber} (${est.title}) and signed electronically.${est.hpOpportunityId ? ` Opportunity ${est.hpOpportunityId} marked Won.` : ''}`,
      }).catch(() => null);

      return { estimate: await getPortalEstimateById(input.id), depositInvoice };
    }),

  /** Customer declines estimate */
  declineEstimate: portalProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const est = await getPortalEstimateById(input.id);
      if (!est || est.customerId !== ctx.portalCustomer.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await updatePortalEstimateStatus(input.id, "declined", {
        declinedAt: new Date(),
        declineReason: input.reason ?? "",
      });
      await notifyOwner({
        title: `Estimate Declined: ${est.estimateNumber}`,
        content: `${ctx.portalCustomer.name} declined estimate ${est.estimateNumber}. Reason: ${input.reason ?? "none"}`,
      }).catch(() => null);
      return { ok: true };
    }),

  // ── INVOICES ──────────────────────────────────────────────────────────────

  /** List all invoices for the logged-in customer */
  getInvoices: portalProcedure.query(async ({ ctx }) => {
    return getPortalInvoicesByCustomer(ctx.portalCustomer.id);
  }),

  /** Get a single invoice (marks as viewed) */
  getInvoice: portalProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const inv = await getPortalInvoiceById(input.id);
      if (!inv || inv.customerId !== ctx.portalCustomer.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await markPortalInvoiceViewed(input.id);
      return {
        ...inv,
        customerName: ctx.portalCustomer.name,
        customerAddress: ctx.portalCustomer.address,
        customerEmail: ctx.portalCustomer.email,
      };
    }),

  /** Create Stripe PaymentIntent for invoice payment */
  createInvoicePaymentIntent: portalProcedure
    .input(z.object({ invoiceId: z.number(), tipCents: z.number().default(0) }))
    .mutation(async ({ input, ctx }) => {
      const inv = await getPortalInvoiceById(input.invoiceId);
      if (!inv || inv.customerId !== ctx.portalCustomer.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (inv.status === "paid") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice already paid" });
      }

      const customer = ctx.portalCustomer;
      let stripeCustomerId = customer.stripeCustomerId;

      if (!stripeCustomerId) {
         const sc = await getStripe().customers.create({
          email: customer.email,
          name: customer.name,
          metadata: { hpCustomerId: customer.hpCustomerId ?? "" },
        });
        stripeCustomerId = sc.id;
        await updatePortalCustomerStripeId(customer.id, stripeCustomerId);
      }
      const totalCents = inv.amountDue + input.tipCents;
      const intent = await getStripe().paymentIntents.create({
        amount: totalCents,
        currency: "usd",
        customer: stripeCustomerId,
        metadata: {
          portalInvoiceId: String(inv.id),
          portalCustomerId: String(customer.id),
          invoiceNumber: inv.invoiceNumber,
        },
        setup_future_usage: "off_session",
      });

      return { clientSecret: intent.client_secret, intentId: intent.id };
    }),

  /** Mark invoice paid (called after Stripe confirms) */
  markInvoicePaid: portalProcedure
    .input(
      z.object({
        invoiceId: z.number(),
        amountPaid: z.number(),
        stripePaymentIntentId: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const inv = await getPortalInvoiceById(input.invoiceId);
      if (!inv || inv.customerId !== ctx.portalCustomer.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await updatePortalInvoicePaid(
        input.invoiceId,
        input.amountPaid,
        input.stripePaymentIntentId
      );
      await notifyOwner({
        title: `Invoice Paid: ${inv.invoiceNumber}`,
        content: `${ctx.portalCustomer.name} paid invoice ${inv.invoiceNumber} — $${(input.amountPaid / 100).toFixed(2)}`,
      }).catch(() => null);
      return { ok: true };
    }),

  // ── APPOINTMENTS ──────────────────────────────────────────────────────────

  getAppointments: portalProcedure.query(async ({ ctx }) => {
    return getPortalAppointmentsByCustomer(ctx.portalCustomer.id);
  }),

  // ── MESSAGES ──────────────────────────────────────────────────────────────

  getMessages: portalProcedure.query(async ({ ctx }) => {
    return getPortalMessagesByCustomer(ctx.portalCustomer.id);
  }),

  sendMessage: portalProcedure
    .input(z.object({ body: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await createPortalMessage({
        customerId: ctx.portalCustomer.id,
        senderRole: "customer",
        senderName: ctx.portalCustomer.name,
        body: input.body,
      });
      // Broadcast to pro-side SSE so InboxPage unread badge updates immediately
      broadcastPortalMessage(ctx.portalCustomer.id, {
        senderRole: 'customer',
        senderName: ctx.portalCustomer.name,
        body: input.body,
        createdAt: new Date().toISOString(),
      });
      await notifyOwner({
        title: `New Portal Message from ${ctx.portalCustomer.name}`,
        content: input.body,
      }).catch(() => null);
      return { ok: true };
    }),

  // ── GALLERY ───────────────────────────────────────────────────────────────

  getGallery: portalProcedure.query(async ({ ctx }) => {
    return getPortalGalleryByCustomer(ctx.portalCustomer.id);
  }),

  // ── REFERRALS ─────────────────────────────────────────────────────────────

  getReferrals: portalProcedure.query(async ({ ctx }) => {
    const referrals = await getPortalReferralsByReferrer(ctx.portalCustomer.id);
    const customer = ctx.portalCustomer;
    return { referrals, referralCode: customer.referralCode };
  }),

  sendReferral: portalProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input, ctx }) => {
      const customer = ctx.portalCustomer;
      await createPortalReferral({
        referrerId: customer.id,
        referredEmail: input.email,
        status: "pending",
        rewardAmount: 5000, // $50 reward
      });

      const referralLink = `${process.env.PORTAL_BASE_URL ?? "https://client.handypioneers.com"}/portal/login?ref=${customer.referralCode}`;
      await sendEmail({
        to: input.email,
        subject: `${customer.name} invited you to try Handy Pioneers`,
        html: buildReferralEmail(customer.name, referralLink),
      }).catch(() => null);

      return { ok: true };
    }),

  // ── WALLET ────────────────────────────────────────────────────────────────

  /** Get Stripe SetupIntent client secret for saving a card */
  createSetupIntent: portalProcedure.mutation(async ({ ctx }) => {
    const customer = ctx.portalCustomer;
    let stripeCustomerId = customer.stripeCustomerId;

    if (!stripeCustomerId) {
      const sc = await getStripe().customers.create({
        email: customer.email,
        name: customer.name,
      });
      stripeCustomerId = sc.id;
      await updatePortalCustomerStripeId(customer.id, stripeCustomerId);
    }
    const setupIntent = await getStripe().setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
    });

    return { clientSecret: setupIntent.client_secret };
  }),

  /** List saved payment methods */
  getSavedCards: portalProcedure.query(async ({ ctx }) => {
    const customer = ctx.portalCustomer;
    if (!customer.stripeCustomerId) return { cards: [] };

    const methods = await getStripe().paymentMethods.list({
      customer: customer.stripeCustomerId,
      type: "card",
    });

    return {
      cards: methods.data.map((m) => ({
        id: m.id,
        brand: m.card?.brand,
        last4: m.card?.last4,
        expMonth: m.card?.exp_month,
        expYear: m.card?.exp_year,
      })),
    };
  }),

  /** Remove a saved card */
  removeCard: portalProcedure
    .input(z.object({ paymentMethodId: z.string() }))
    .mutation(async ({ input }) => {
      await getStripe().paymentMethods.detach(input.paymentMethodId);
      return { ok: true };
    }),

  // ── HP STAFF PROCEDURES ───────────────────────────────────────────────────

  /** HP staff: send estimate to customer portal */
  sendEstimateToPortal: hpProcedure
    .input(
      z.object({
        customerEmail: z.string().email(),
        customerName: z.string(),
        customerPhone: z.string().optional(),
        customerAddress: z.string().optional(),
        hpCustomerId: z.string().optional(),
        hpOpportunityId: z.string().optional(), // link back to pro-side opportunity for auto-sync
        estimateNumber: z.string(),
        title: z.string(),
        totalAmount: z.number(), // cents
        depositPercent: z.number().default(50),
        lineItemsJson: z.string().optional(),
        scopeOfWork: z.string().optional(),
        expiresAt: z.date().optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Upsert customer
      let customer = await upsertPortalCustomer({
        email: input.customerEmail.toLowerCase().trim(),
        name: input.customerName,
        phone: input.customerPhone,
        address: input.customerAddress,
        hpCustomerId: input.hpCustomerId,
        referralCode: await generateReferralCode(input.customerName),
      });

      if (!customer) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const depositAmount = Math.round(
        (input.totalAmount * input.depositPercent) / 100
      );

      const estimate = await createPortalEstimate({
        customerId: customer.id,
        estimateNumber: input.estimateNumber,
        title: input.title,
        status: "sent",
        totalAmount: input.totalAmount,
        depositAmount,
        depositPercent: input.depositPercent,
        lineItemsJson: input.lineItemsJson,
        scopeOfWork: input.scopeOfWork,
        expiresAt: input.expiresAt,
        sentAt: new Date(),
        hpOpportunityId: input.hpOpportunityId,
      });

      // Send magic link email
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await createPortalToken({ customerId: customer.id, token, expiresAt });

      const baseUrl = process.env.PORTAL_BASE_URL ?? "https://client.handypioneers.com";
      const estimateUrl = `${baseUrl}/portal/auth?token=${token}&redirect=/portal/estimates/${estimate?.id}`;

      await sendEmail({
        to: customer.email,
        subject: `Approve Estimate ${input.estimateNumber} from Handy Pioneers`,
        html: buildEstimateEmail(customer.name, input.estimateNumber, input.title, estimateUrl, baseUrl),
      }).catch(() => null);

      return { customer, estimate };
    }),

  /** HP staff: send invoice to customer portal */
  sendInvoiceToPortal: hpProcedure
    .input(
      z.object({
        customerEmail: z.string().email(),
        customerName: z.string(),
        hpCustomerId: z.string().optional(),
        invoiceNumber: z.string(),
        type: z.enum(["deposit", "final", "balance"]).default("final"),
        amountDue: z.number(), // cents
        dueDate: z.date().optional(),
        jobTitle: z.string().optional(),
        lineItemsJson: z.string().optional(),
        estimateId: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      let customer = await findPortalCustomerByEmail(input.customerEmail);
      if (!customer) {
        const result = await upsertPortalCustomer({
          email: input.customerEmail.toLowerCase().trim(),
          name: input.customerName,
          hpCustomerId: input.hpCustomerId,
          referralCode: await generateReferralCode(input.customerName),
        });
        customer = result;
      }

      if (!customer) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const invoice = await createPortalInvoice({
        customerId: customer.id,
        estimateId: input.estimateId,
        invoiceNumber: input.invoiceNumber,
        type: input.type,
        status: "due",
        amountDue: input.amountDue,
        amountPaid: 0,
        tipAmount: 0,
        dueDate: input.dueDate,
        jobTitle: input.jobTitle,
        lineItemsJson: input.lineItemsJson,
        sentAt: new Date(),
      });

      // Send magic link email
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await createPortalToken({ customerId: customer.id, token, expiresAt });

      const baseUrl = process.env.PORTAL_BASE_URL ?? "https://client.handypioneers.com";
      const invoiceUrl = `${baseUrl}/portal/auth?token=${token}&redirect=/portal/invoices/${invoice?.id}`;

      await sendEmail({
        to: customer.email,
        subject: `Invoice ${input.invoiceNumber} from Handy Pioneers`,
        html: buildInvoiceEmail(customer.name, input.invoiceNumber, input.amountDue, invoiceUrl, baseUrl),
      }).catch(() => null);

      return { customer, invoice };
    }),

  /** HP staff: add gallery photo for customer */
  addGalleryPhoto: hpProcedure
    .input(
      z.object({
        customerEmail: z.string().email(),
        imageUrl: z.string().url(),
        caption: z.string().optional(),
        jobId: z.string().optional(),
        jobTitle: z.string().optional(),
        phase: z.enum(["before", "during", "after"]).default("after"),
      })
    )
    .mutation(async ({ input }) => {
      const customer = await findPortalCustomerByEmail(input.customerEmail);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not in portal" });

      await addPortalGalleryItem({
        customerId: customer.id,
        imageUrl: input.imageUrl,
        caption: input.caption,
        jobId: input.jobId,
        jobTitle: input.jobTitle,
        phase: input.phase,
      });
      return { ok: true };
    }),

  /** HP staff: reply to customer portal message */
  replyToPortalMessage: hpProcedure
    .input(
      z.union([
        z.object({ customerEmail: z.string().email(), customerId: z.undefined().optional(), body: z.string().min(1) }),
        z.object({ customerId: z.number(), customerEmail: z.undefined().optional(), body: z.string().min(1) }),
      ])
    )
    .mutation(async ({ input, ctx }) => {
      let customer;
      if ('customerId' in input && input.customerId) {
        customer = await findPortalCustomerById(input.customerId);
      } else if ('customerEmail' in input && input.customerEmail) {
        customer = await findPortalCustomerByEmail(input.customerEmail);
      }
      if (!customer) throw new TRPCError({ code: "NOT_FOUND" });
      await createPortalMessage({
        customerId: customer.id,
        senderRole: "hp_team",
        senderName: ctx.user.name ?? "Handy Pioneers",
        body: input.body,
      });
      try { broadcastPortalMessage(customer.id, { type: 'new_message' }); } catch {}
      return { ok: true };
    }),

  /** HP staff: add appointment for customer */
  addAppointment: hpProcedure
    .input(
      z.object({
        customerEmail: z.string().email(),
        title: z.string(),
        type: z.string().default("job"),
        scheduledAt: z.date(),
        scheduledEndAt: z.date().optional(),
        address: z.string().optional(),
        techName: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const customer = await findPortalCustomerByEmail(input.customerEmail);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not in portal" });

      const appt = await createPortalAppointment({
        customerId: customer.id,
        title: input.title,
        type: input.type,
        scheduledAt: input.scheduledAt,
        scheduledEndAt: input.scheduledEndAt,
        address: input.address,
        techName: input.techName,
        notes: input.notes,
        status: "scheduled",
      });
      return { appointment: appt };
    }),

  /** Standalone portal invite — upsert customer, generate magic link, send email */
  inviteCustomerToPortal: hpProcedure
    .input(
      z.object({
        customerEmail: z.string().email(),
        customerName: z.string(),
        customerPhone: z.string().optional(),
        hpCustomerId: z.string().optional(),
        origin: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const customer = await upsertPortalCustomer({
        email: input.customerEmail.toLowerCase().trim(),
        name: input.customerName,
        phone: input.customerPhone,
        hpCustomerId: input.hpCustomerId,
        referralCode: await generateReferralCode(input.customerName),
      });
      if (!customer) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });

      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await createPortalToken({ customerId: customer.id, token, expiresAt });

      const baseUrl = process.env.PORTAL_BASE_URL ?? 'https://client.handypioneers.com';
      const portalUrl = `${baseUrl}/portal/auth?token=${token}`;

      try {
        await sendEmail({
          to: customer.email,
          subject: 'Your Handy Pioneers Customer Portal Invitation',
          html: buildMagicLinkEmail(customer.name, portalUrl),
        });
      } catch (err: any) {
        const msg = err?.message ?? 'Email failed';
        console.error('[Portal] Failed to send invite email:', msg);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Portal invite created but email failed: ${msg}. Go to Settings → Integrations to connect Gmail.`,
        });
      }

      return { sent: true, portalCustomerId: customer.id };
    }),

  /** Customer-facing: unified document list (estimates + invoices) */
  // ── DASHBOARD ─────────────────────────────────────────────────────────────
  /** Single call to get all data needed for the portal home dashboard */
  getDashboard: portalProcedure.query(async ({ ctx }) => {
    const customerId = ctx.portalCustomer.id;
    const [estimates, invoices, appointments, messages] = await Promise.all([
      getPortalEstimatesByCustomer(customerId),
      getPortalInvoicesByCustomer(customerId),
      getPortalAppointmentsByCustomer(customerId),
      getPortalMessagesByCustomer(customerId),
    ]);
    return {
      customer: ctx.portalCustomer,
      estimates,
      invoices,
      appointments,
      unreadMessages: messages.filter((m) => m.senderRole === 'hp_team' && !m.readAt).length,
    };
  }),
  /** Customer updates their own profile info */
  updateProfile: portalProcedure
    .input(z.object({
      name: z.string().min(1).optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const updated = await updatePortalCustomerProfile(ctx.portalCustomer.id, input);
      return { customer: updated };
    }),
  getDocuments: portalProcedure.query(async ({ ctx }) => {
    const [estimates, invoices] = await Promise.all([
      getPortalEstimatesByCustomer(ctx.portalCustomer.id),
      getPortalInvoicesByCustomer(ctx.portalCustomer.id),
    ]);
    return { estimates, invoices };
  }),

  /** HP staff: resend estimate magic-link email */
  resendEstimate: hpProcedure
    .input(z.object({ estimateId: z.number() }))
    .mutation(async ({ input }) => {
      const est = await getPortalEstimateById(input.estimateId);
      if (!est) throw new TRPCError({ code: 'NOT_FOUND' });
      const customer = await findPortalCustomerById(est.customerId);
      if (!customer) throw new TRPCError({ code: 'NOT_FOUND' });
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await createPortalToken({ customerId: customer.id, token, expiresAt });
      const baseUrl = process.env.PORTAL_BASE_URL ?? 'https://client.handypioneers.com';
      const estimateUrl = `${baseUrl}/portal/auth?token=${token}&redirect=/portal/estimates/${est.id}`;
      await sendEmail({
        to: customer.email,
        subject: `Approve Estimate ${est.estimateNumber} from Handy Pioneers`,
        html: buildEstimateEmail(customer.name, est.estimateNumber, est.title, estimateUrl, baseUrl),
      });
      return { sent: true };
    }),

  /** HP staff: resend invoice magic-link email */
  resendInvoice: hpProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ input }) => {
      const inv = await getPortalInvoiceById(input.invoiceId);
      if (!inv) throw new TRPCError({ code: 'NOT_FOUND' });
      const customer = await findPortalCustomerById(inv.customerId);
      if (!customer) throw new TRPCError({ code: 'NOT_FOUND' });
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await createPortalToken({ customerId: customer.id, token, expiresAt });
      const baseUrl = process.env.PORTAL_BASE_URL ?? 'https://client.handypioneers.com';
      const invoiceUrl = `${baseUrl}/portal/auth?token=${token}&redirect=/portal/invoices/${inv.id}`;
      await sendEmail({
        to: customer.email,
        subject: `Invoice ${inv.invoiceNumber} from Handy Pioneers`,
        html: buildInvoiceEmail(customer.name, inv.invoiceNumber, inv.amountDue, invoiceUrl, baseUrl),
      });
      return { sent: true };
    }),

  /** HP-side: get all portal data for a customer by HP customer ID */
  getCustomerPortalData: hpProcedure
    .input(z.object({ hpCustomerId: z.string() }))
    .query(async ({ input }) => {
      const portalCustomer = await findPortalCustomerByHpId(input.hpCustomerId);
      if (!portalCustomer) return { customer: null, estimates: [], invoices: [], appointments: [] };
      const [estimates, invoices, appointments] = await Promise.all([
        getPortalEstimatesByCustomer(portalCustomer.id),
        getPortalInvoicesByCustomer(portalCustomer.id),
        getPortalAppointmentsByCustomer(portalCustomer.id),
      ]);
       return { customer: portalCustomer, estimates, invoices, appointments };
    }),

  /**
   * HP-side: given a list of invoice numbers, return their portal payment status.
   * Used by the pro-side estimator to show "Paid via Portal" badges on InvoiceCards.
   */
  getPortalPaymentStatus: hpProcedure
    .input(z.object({ invoiceNumbers: z.array(z.string()) }))
    .query(async ({ input }) => {
      return getPortalInvoicePaymentStatusByNumbers(input.invoiceNumbers);
    }),

  /**
   * HP-side: returns total collected and total outstanding from portal invoices.
   * Used by the pro-side dashboard Revenue Collected KPI card.
   */
  getRevenueStats: hpProcedure.query(async () => {
    return getPortalRevenueStats();
  }),

  /** HP staff: list all portal messages across all customers */
  getAllPortalMessages: hpProcedure.query(async () => {
    return getAllPortalMessages();
  }),

  /** Returns count of unread portal messages (customer → HP) for the Inbox badge */
  getPortalUnreadCount: hpProcedure.query(async () => {
    const count = await getGlobalUnreadPortalMessageCount();
    return { count };
  }),

  /** Mark all unread customer-sent portal messages as read (called when HP opens the Inbox) */
  markAllPortalRead: hpProcedure.mutation(async () => {
    await markAllPortalMessagesRead();
    return { ok: true };
  }),

  // ── SERVICE REQUESTS (Booking) ──────────────────────────────────────────────────────
  /** Customer submits a new service/booking request */
  submitServiceRequest: portalProcedure
    .input(z.object({
      description: z.string().min(10),
      timeline: z.enum(['asap', 'within_week', 'flexible']).default('flexible'),
      address: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const req = await createPortalServiceRequest({
        customerId: ctx.portalCustomer.id,
        description: input.description,
        timeline: input.timeline,
        address: input.address ?? ctx.portalCustomer.address ?? undefined,
      });
      // Notify HP team
      await notifyOwner({
        title: `New Booking Request from ${ctx.portalCustomer.name}`,
        content: `${ctx.portalCustomer.name} (${ctx.portalCustomer.email}) submitted a service request:\n\n${input.description}\n\nTimeline: ${input.timeline}`,
      });
      return { ok: true, id: req?.id };
    }),
  /** Customer views their own service requests */
  getServiceRequests: portalProcedure.query(async ({ ctx }) => {
    return getPortalServiceRequestsByCustomer(ctx.portalCustomer.id);
  }),
  /** Create Stripe Checkout Session for invoice payment */
  createCheckoutSession: portalProcedure
    .input(z.object({ invoiceId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const inv = await getPortalInvoiceById(input.invoiceId);
      if (!inv || inv.customerId !== ctx.portalCustomer.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (inv.status === "paid") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invoice already paid" });
      }

      const baseUrl = process.env.PORTAL_BASE_URL ?? "https://client.handypioneers.com";
      const successUrl = `${baseUrl}/portal/invoices/${inv.id}?paid=1`;
      const cancelUrl = `${baseUrl}/portal/invoices/${inv.id}`;

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
        customer_email: ctx.portalCustomer.email,
        metadata: {
          portalInvoiceId: String(inv.id),
          portalCustomerId: String(ctx.portalCustomer.id),
          invoiceNumber: inv.invoiceNumber,
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });

      await updatePortalInvoiceCheckoutSessionId(inv.id, session.id);

      return { url: session.url! };
    }),

  /** HP staff: get portal approval status for a pro-side opportunity */
  getPortalApprovalStatus: hpProcedure
    .input(z.object({ hpOpportunityId: z.string() }))
    .query(async ({ input }) => {
      const est = await getPortalEstimateByOpportunityId(input.hpOpportunityId);
      if (!est) return null;
      return {
        status: est.status,
        approvedAt: est.approvedAt,
        signerName: est.signerName,
        estimateNumber: est.estimateNumber,
        portalEstimateId: est.id,
      };
    }),

  /** HP staff: list all pending service requests */
  getAllServiceRequests: hpProcedure.query(async () => {
    return getAllPendingPortalServiceRequests();
  }),
  /** HP staff: mark a service request as reviewed */
  reviewServiceRequest: hpProcedure
    .input(z.object({ id: z.number(), status: z.string(), leadId: z.string().optional() }))
    .mutation(async ({ input }) => {
      await updatePortalServiceRequestStatus(input.id, input.status, input.leadId);
      return { ok: true };
    }),

  // ─── JOB PROGRESS: HP PROCEDURES ─────────────────────────────────────────

  /** HP staff: get milestones and updates for a job */
  getJobProgress: hpProcedure
    .input(z.object({ hpOpportunityId: z.string() }))
    .query(async ({ input }) => {
      const [milestones, updates, estimate] = await Promise.all([
        getMilestonesByJob(input.hpOpportunityId),
        getUpdatesByJob(input.hpOpportunityId),
        getPortalEstimateByOpportunityId(input.hpOpportunityId),
      ]);
      const customer = estimate?.customerId ? await findPortalCustomerById(estimate.customerId) : null;
      return { milestones, updates, customer };
    }),

  /** HP staff: create or update a milestone */
  upsertMilestone: hpProcedure
    .input(z.object({
      id: z.number().optional(),
      hpOpportunityId: z.string(),
      title: z.string().min(1),
      description: z.string().optional(),
      status: z.enum(["pending", "in_progress", "complete"]).default("pending"),
      scheduledDate: z.string().optional(),
      sortOrder: z.number().default(0),
    }))
    .mutation(async ({ input }) => {
      const id = await upsertMilestone(input);
      return { id };
    }),

  /** HP staff: delete a milestone */
  deleteMilestone: hpProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteMilestone(input.id);
      return { ok: true };
    }),

  /** HP staff: post a progress update visible to the customer */
  postJobUpdate: hpProcedure
    .input(z.object({
      hpOpportunityId: z.string(),
      message: z.string().min(1),
      photoUrl: z.string().optional(),
      postedBy: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await createJobUpdate({
        hpOpportunityId: input.hpOpportunityId,
        message: input.message,
        photoUrl: input.photoUrl,
        postedBy: input.postedBy ?? ctx.user?.name ?? "Handy Pioneers",
      });
      return { id };
    }),

  /** HP staff: delete a job update */
  deleteJobUpdate: hpProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await deleteJobUpdate(input.id);
      return { ok: true };
    }),

  // ─── JOB PROGRESS: CUSTOMER PROCEDURES ───────────────────────────────────

  /** Customer: get job progress (milestones + updates) for their job */
  getCustomerJobProgress: portalProcedure
    .input(z.object({ hpOpportunityId: z.string() }))
    .query(async ({ input }) => {
      const [milestones, updates] = await Promise.all([
        getMilestonesByJob(input.hpOpportunityId),
        getUpdatesByJob(input.hpOpportunityId),
      ]);
      return { milestones, updates };
    }),

  // ─── JOB SIGN-OFF: CUSTOMER PROCEDURES ───────────────────────────────────

  /** Customer: get sign-off record for a job (if it exists) */
  getJobSignOff: portalProcedure
    .input(z.object({ hpOpportunityId: z.string() }))
    .query(async ({ input }) => {
      return getJobSignOff(input.hpOpportunityId);
    }),

  /**
   * Customer: submit job sign-off with e-signature.
   * Marks the final/balance invoice as 'due' so the customer can pay.
   * Sends a confirmation email and notifies the HP team.
   */
  submitJobSignOff: portalProcedure
    .input(
      z.object({
        hpOpportunityId: z.string().min(1),
        signerName: z.string().min(1),
        signatureDataUrl: z.string().min(1),
        workSummary: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const signedAt = new Date().toISOString();

      // Find the final/balance invoice linked to this job via the estimate
      const estimate = await getPortalEstimateByOpportunityId(input.hpOpportunityId);
      let finalInvoice = null;
      if (estimate) {
        const invoices = await getPortalInvoicesByCustomer(ctx.portalCustomer.id);
        // Prefer balance or final type; pick the most recent unpaid one
        finalInvoice = invoices.find(
          (inv) =>
            inv.estimateId === estimate.id &&
            (inv.type === 'balance' || inv.type === 'final') &&
            inv.status !== 'paid' &&
            inv.status !== 'void'
        ) ?? invoices.find(
          (inv) =>
            inv.estimateId === estimate.id &&
            inv.status !== 'paid' &&
            inv.status !== 'void'
        ) ?? null;
      }

      // If a final invoice exists and is still draft/sent, mark it 'due'
      if (finalInvoice && (finalInvoice.status === 'draft' || finalInvoice.status === 'sent')) {
        const db = await import('../db').then((m) => m.getDb());
        if (db) {
          const { portalInvoices } = await import('../../drizzle/schema');
          const { eq } = await import('drizzle-orm');
          await db
            .update(portalInvoices)
            .set({ status: 'due' })
            .where(eq(portalInvoices.id, finalInvoice.id));
        }
      }

      // Upload signature to S3 and store CDN URL instead of raw base64
      const sigUrl = await uploadSignatureToS3(
        input.signatureDataUrl,
        `signoff-${input.hpOpportunityId}-${ctx.portalCustomer.id}`
      );

      const signOff = await createJobSignOff({
        hpOpportunityId: input.hpOpportunityId,
        customerId: ctx.portalCustomer.id,
        signatureDataUrl: sigUrl,
        signerName: input.signerName,
        signedAt,
        workSummary: input.workSummary ?? null,
        finalInvoiceId: finalInvoice?.id ?? null,
      });

      // Send confirmation email to customer
      const baseUrl = process.env.PORTAL_BASE_URL ?? 'https://client.handypioneers.com';
      const invoiceUrl = finalInvoice
        ? `${baseUrl}/portal/invoices/${finalInvoice.id}`
        : `${baseUrl}/portal/invoices`;
      await sendEmail({
        to: ctx.portalCustomer.email,
        subject: 'Job Completion Confirmed — Thank You!',
        html: buildSignOffConfirmationEmail(
          ctx.portalCustomer.name,
          estimate?.title ?? 'Your Project',
          signedAt,
          finalInvoice ? finalInvoice.amountDue : null,
          invoiceUrl,
          baseUrl,
        ),
      }).catch(() => null);

      // Notify HP team
      await notifyOwner({
        title: `✅ Job Sign-Off: ${estimate?.estimateNumber ?? input.hpOpportunityId}`,
        content: `${ctx.portalCustomer.name} signed off on job completion for ${estimate?.title ?? input.hpOpportunityId}.${
          finalInvoice ? ` Final invoice $${(finalInvoice.amountDue / 100).toFixed(2)} is now due.` : ''
        }`,
      }).catch(() => null);

      return { signOff, finalInvoiceId: finalInvoice?.id ?? null };
    }),

  // ─── JOB SIGN-OFF: HP PROCEDURES ─────────────────────────────────────────

  /** HP: get sign-off status for a job */
  getJobSignOffStatus: hpProcedure
    .input(z.object({ hpOpportunityId: z.string() }))
    .query(async ({ input }) => {
      return getJobSignOff(input.hpOpportunityId);
    }),

  // ─── CHANGE ORDERS: HP PROCEDURES ───────────────────────────────────────────────────

  /** HP: send a change order to the customer portal */
  sendChangeOrder: hpProcedure
    .input(z.object({
      hpOpportunityId: z.string(),
      customerId: z.number(),
      coNumber: z.string(),
      title: z.string().min(1),
      scopeOfWork: z.string().optional(),
      lineItemsJson: z.string().optional(),
      totalAmount: z.number().int().min(0), // cents
    }))
    .mutation(async ({ input }) => {
      const co = await createPortalChangeOrder({
        customerId: input.customerId,
        hpOpportunityId: input.hpOpportunityId,
        coNumber: input.coNumber,
        title: input.title,
        scopeOfWork: input.scopeOfWork ?? null,
        lineItemsJson: input.lineItemsJson ?? null,
        totalAmount: input.totalAmount,
        status: 'sent',
        sentAt: new Date(),
      });

      // Notify HP team
      await notifyOwner({
        title: `📋 Change Order Sent: ${input.coNumber}`,
        content: `Change order "${input.title}" ($${(input.totalAmount / 100).toFixed(2)}) sent to customer portal.`,
      }).catch(() => null);

      return co;
    }),

  /** HP: get all change orders for a job */
  getChangeOrdersByJob: hpProcedure
    .input(z.object({ hpOpportunityId: z.string() }))
    .query(async ({ input }) => {
      return getPortalChangeOrdersByJob(input.hpOpportunityId);
    }),

  /** HP: set skip review request flag */
  skipReviewRequest: hpProcedure
    .input(z.object({ hpOpportunityId: z.string(), skip: z.boolean() }))
    .mutation(async ({ input }) => {
      await setSkipReviewRequest(input.hpOpportunityId, input.skip);
      return { ok: true };
    }),

  // ─── CHANGE ORDERS: CUSTOMER PROCEDURES ───────────────────────────────────────────────

  /** Customer: get a change order by ID (gated by portal session) */
  getChangeOrder: portalProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const co = await getPortalChangeOrderById(input.id);
      if (!co || co.customerId !== ctx.portalCustomer.id) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      // Mark viewed
      if (!co.viewedAt) {
        await updatePortalChangeOrderStatus(co.id, co.status, { viewedAt: new Date() });
      }
      return co;
    }),

  /** Customer: get all change orders for the logged-in customer */
  getMyChangeOrders: portalProcedure
    .query(async ({ ctx }) => {
      return getPortalChangeOrdersByCustomer(ctx.portalCustomer.id);
    }),

  /** Customer: approve a change order with e-signature */
  approveChangeOrder: portalProcedure
    .input(z.object({
      id: z.number(),
      signerName: z.string().min(1),
      signatureDataUrl: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const co = await getPortalChangeOrderById(input.id);
      if (!co || co.customerId !== ctx.portalCustomer.id) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      if (co.status === 'approved') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Already approved' });
      }

      // Upload signature to S3
      const sigUrl = await uploadSignatureToS3(
        input.signatureDataUrl,
        `co-${input.id}-${ctx.portalCustomer.id}`
      );

      // Auto-create a CO invoice
      let coInvoice = null;
      if (co.totalAmount > 0) {
        coInvoice = await createPortalInvoice({
          customerId: co.customerId,
          invoiceNumber: `CO-INV-${co.coNumber}`,
          type: 'final',
          status: 'due',
          amountDue: co.totalAmount,
          amountPaid: 0,
          tipAmount: 0,
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          jobTitle: co.title,
          lineItemsJson: co.lineItemsJson,
          sentAt: new Date(),
        });
      }

      await updatePortalChangeOrderStatus(co.id, 'approved', {
        approvedAt: new Date(),
        signerName: input.signerName,
        signatureDataUrl: sigUrl,
        invoiceId: coInvoice?.id ?? undefined,
      });

      // Send confirmation email
      const baseUrl = process.env.PORTAL_BASE_URL ?? 'https://client.handypioneers.com';
      const invoiceUrl = coInvoice ? `${baseUrl}/portal/invoices/${coInvoice.id}` : null;
      await sendEmail({
        to: ctx.portalCustomer.email,
        subject: `Change Order Approved — ${co.coNumber}`,
        html: buildChangeOrderApprovalEmail(
          ctx.portalCustomer.name,
          co.title,
          co.coNumber,
          co.totalAmount,
          invoiceUrl,
          baseUrl,
        ),
      }).catch(() => null);

      // Notify HP team
      await notifyOwner({
        title: `✅ Change Order Approved: ${co.coNumber}`,
        content: `${ctx.portalCustomer.name} approved change order "${co.title}" ($${(co.totalAmount / 100).toFixed(2)}).`,
      }).catch(() => null);

      return { co: await getPortalChangeOrderById(co.id), invoiceId: coInvoice?.id ?? null };
    }),

  /** Customer: decline a change order */
  declineChangeOrder: portalProcedure
    .input(z.object({
      id: z.number(),
      declineReason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const co = await getPortalChangeOrderById(input.id);
      if (!co || co.customerId !== ctx.portalCustomer.id) {
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      if (co.status === 'approved' || co.status === 'declined') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Cannot decline a ${co.status} change order` });
      }

      await updatePortalChangeOrderStatus(co.id, 'declined', {
        declinedAt: new Date(),
        declineReason: input.declineReason ?? null,
      });

      // Notify HP team
      await notifyOwner({
        title: `❌ Change Order Declined: ${co.coNumber}`,
        content: `${ctx.portalCustomer.name} declined change order "${co.title}".${input.declineReason ? ` Reason: ${input.declineReason}` : ''}`,
      }).catch(() => null);

      return { ok: true };
    }),

  // ── INVOICE BRIDGE (HP-side) ──────────────────────────────────────────────

  /** Returns portal invoices for a given hpOpportunityId (HP staff only) */
  getPortalInvoicesByJob: hpProcedure
    .input(z.object({ hpOpportunityId: z.string() }))
    .query(async ({ input }) => {
      return getPortalInvoicesByHpOpportunityId(input.hpOpportunityId);
    }),

  /**
   * Returns a map of hpOpportunityId → pending CO count.
   * Used by PipelineBoard to show a yellow badge on job cards with pending COs.
   */
  getPendingCOCounts: hpProcedure.query(async () => {
    return getPendingChangeOrderCountsByJob();
  }),

  /** HP staff: share a document with a portal customer */
  addDocument: hpProcedure
    .input(
      z.object({
        customerEmail: z.string().email().optional(),
        customerId: z.number().optional(),
        name: z.string().min(1),
        url: z.string().url(),
        fileKey: z.string().min(1),
        mimeType: z.string().default('application/octet-stream'),
        jobId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      let customer;
      if (input.customerId) {
        customer = await findPortalCustomerById(input.customerId);
      } else if (input.customerEmail) {
        customer = await findPortalCustomerByEmail(input.customerEmail);
      }
      if (!customer) throw new TRPCError({ code: 'NOT_FOUND', message: 'Customer not in portal' });
      const doc = await addPortalDocument({
        portalCustomerId: customer.id,
        name: input.name,
        url: input.url,
        fileKey: input.fileKey,
        mimeType: input.mimeType,
        jobId: input.jobId,
      });
      return { document: doc };
    }),

  /** HP staff: list documents shared with a portal customer */
  getDocumentsHP: hpProcedure
    .input(
      z.object({
        customerEmail: z.string().email().optional(),
        customerId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      let customer;
      if (input.customerId) {
        customer = await findPortalCustomerById(input.customerId);
      } else if (input.customerEmail) {
        customer = await findPortalCustomerByEmail(input.customerEmail);
      }
      if (!customer) return [];
      return getPortalDocumentsByCustomer(customer.id);
    }),

  /** Customer-facing: list documents shared by HP */
  getDocumentsPortal: portalProcedure.query(async ({ ctx }) => {
    return getPortalDocumentsByCustomer(ctx.portalCustomer.id);
  }),

  // ── 360° INSPECTION REPORTS ────────────────────────────────────────────────
  /** List all 360° inspection reports sent to this customer */
  getReports: portalProcedure.query(async ({ ctx }) => {
    const { getDb } = await import('../db');
    const { portalReports } = await import('../../drizzle/schema');
    const { eq, desc } = await import('drizzle-orm');
    const db = await getDb();
    if (!db) return [];
    const reports = await db
      .select()
      .from(portalReports)
      .where(eq(portalReports.portalCustomerId, ctx.portalCustomer.id))
      .orderBy(desc(portalReports.sentAt));
    return reports.map(r => ({
      ...r,
      reportData: r.reportJson ? JSON.parse(r.reportJson) : null,
    }));
  }),

  /** Get a single 360° inspection report */
  getReport: portalProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const { getDb } = await import('../db');
      const { portalReports } = await import('../../drizzle/schema');
      const { and, eq } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
      const [report] = await db
        .select()
        .from(portalReports)
        .where(
          and(
            eq(portalReports.id, input.id),
            eq(portalReports.portalCustomerId, ctx.portalCustomer.id)
          )
        );
      if (!report) throw new TRPCError({ code: 'NOT_FOUND' });
      return {
        ...report,
        reportData: report.reportJson ? JSON.parse(report.reportJson) : null,
      };
    }),

  /**
   * Auto-login from Stripe Checkout session_id.
   * Called on /portal/home?session_id=xxx after 360° enrollment.
   * Looks up the portalCustomer by the Stripe customer on the session,
   * creates a portal session cookie, and returns the customer.
   */
  autoLoginFromStripeSession: portalPublicProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-03-31.basil" });
      let stripeSession: Stripe.Checkout.Session;
      try {
        stripeSession = await stripe.checkout.sessions.retrieve(input.sessionId, {
          expand: ["customer"],
        });
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid session ID" });
      }

      if (stripeSession.status !== "complete") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Session not completed" });
      }

      const customerEmail =
        stripeSession.customer_email ??
        (stripeSession.customer as Stripe.Customer | null)?.email ??
        stripeSession.metadata?.customerEmail ??
        null;

      if (!customerEmail) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No email on Stripe session" });
      }

      // Find or create portal customer by email
      let portalCustomer = await findPortalCustomerByEmail(customerEmail);
      if (!portalCustomer) {
        // Create a minimal portal customer — the webhook may not have run yet
        const customerName =
          stripeSession.metadata?.customerName ??
          (stripeSession.customer as Stripe.Customer | null)?.name ??
          customerEmail.split("@")[0];
        portalCustomer = await upsertPortalCustomer({
          name: customerName,
          email: customerEmail,
          phone: stripeSession.metadata?.customerPhone ?? undefined,
          stripeCustomerId: typeof stripeSession.customer === "string"
            ? stripeSession.customer
            : (stripeSession.customer as Stripe.Customer | null)?.id ?? undefined,
        });
      }

      // Create portal session cookie
      const sessionToken = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await createPortalSession({
        customerId: portalCustomer.id,
        sessionToken,
        expiresAt,
      });
      const res = ctx.res as any;
      if (res?.cookie) {
        res.cookie("hp_portal_session", sessionToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          expires: expiresAt,
          path: "/",
        });
      }

      return { customer: portalCustomer };
    }),
  // ── 360° MEMBERSHIP DASHBOARD ─────────────────────────────────────────────
  /** Returns the 360° membership for the logged-in portal customer, with labor bank and upcoming work orders */
  getMembership360: portalProcedure.query(async ({ ctx }) => {
    const { getDb } = await import('../db');
    const {
      threeSixtyMemberships,
      threeSixtyLaborBankTransactions,
      threeSixtyWorkOrders,
      portalReports,
    } = await import('../../drizzle/schema');
    const { eq, desc, and } = await import('drizzle-orm');
    const db = await getDb();
    if (!db) return null;
    // Find membership by stripeCustomerId
    const stripeCustomerId = ctx.portalCustomer.stripeCustomerId;
    if (!stripeCustomerId) return null;
    const [membership] = await db
      .select()
      .from(threeSixtyMemberships)
      .where(eq(threeSixtyMemberships.stripeCustomerId, stripeCustomerId))
      .limit(1);
    if (!membership) return null;
    // Fetch labor bank ledger (last 10 transactions)
    const ledger = await db
      .select()
      .from(threeSixtyLaborBankTransactions)
      .where(eq(threeSixtyLaborBankTransactions.membershipId, membership.id))
      .orderBy(desc(threeSixtyLaborBankTransactions.createdAt))
      .limit(10);
    // Fetch work orders (all, ordered by scheduledDate desc)
    const workOrders = await db
      .select()
      .from(threeSixtyWorkOrders)
      .where(eq(threeSixtyWorkOrders.membershipId, membership.id))
      .orderBy(desc(threeSixtyWorkOrders.createdAt));
    // Fetch reports (last 5)
    const reports = await db
      .select()
      .from(portalReports)
      .where(eq(portalReports.portalCustomerId, ctx.portalCustomer.id))
      .orderBy(desc(portalReports.sentAt))
      .limit(5);
    return {
      membership,
      laborBankBalance: membership.laborBankBalance ?? 0,
      ledger,
      workOrders,
      reports: reports.map(r => ({
        ...r,
        reportData: r.reportJson ? JSON.parse(r.reportJson) : null,
      })),
    };
  }),
});
// ─── EMAIL TEMPLATES ──────────────────────────────────────────────────────────
// HP brand palette: forest green #1a2e1a / #2d4a2d, warm gold #c8922a
const HP_LOGO_EMAIL = "https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg";

function emailWrapper(content: string, accentColor = "#c8922a") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Handy Pioneers</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- HEADER -->
        <tr>
          <td style="background:linear-gradient(135deg,#1a2e1a 0%,#2d4a2d 100%);padding:28px 40px;text-align:center;">
            <img src="${HP_LOGO_EMAIL}" alt="Handy Pioneers" height="64" style="display:block;margin:0 auto 12px;border-radius:4px;" />
            <p style="margin:0;color:rgba(255,255,255,0.65);font-size:11px;letter-spacing:0.12em;text-transform:uppercase;">Reliable Renovations, Trusted Results</p>
          </td>
        </tr>
        <!-- BODY -->
        <tr>
          <td style="padding:36px 40px 28px;color:#1a1a1a;font-size:15px;line-height:1.6;">
            ${content}
          </td>
        </tr>
        <!-- DIVIDER -->
        <tr>
          <td style="padding:0 40px;"><hr style="border:none;border-top:1px solid #e8e8e8;margin:0;" /></td>
        </tr>
        <!-- FOOTER -->
        <tr>
          <td style="padding:20px 40px 28px;text-align:center;">
            <p style="margin:0 0 4px;font-size:12px;color:#888;">Handy Pioneers &bull; Vancouver, WA 98683</p>
            <p style="margin:0 0 4px;font-size:12px;color:#888;">
              <a href="tel:3605449858" style="color:#888;text-decoration:none;">(360) 544-9858</a>
              &nbsp;&bull;&nbsp;
              <a href="mailto:help@handypioneers.com" style="color:#888;text-decoration:none;">help@handypioneers.com</a>
            </p>
            <p style="margin:0;font-size:12px;">
              <a href="https://handypioneers.com" style="color:${accentColor};text-decoration:none;">handypioneers.com</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function ctaButton(label: string, url: string, color = "#c8922a") {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
    <tr><td align="center">
      <a href="${url}" style="display:inline-block;background:${color};color:#ffffff;font-size:15px;font-weight:700;letter-spacing:0.04em;padding:14px 36px;border-radius:6px;text-decoration:none;">${label}</a>
    </td></tr>
  </table>`;
}

function buildMagicLinkEmail(name: string, url: string) {
  const firstName = name.split(' ')[0];
  return emailWrapper(`
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a2e1a;">Your Portal Access Link</h2>
    <p style="margin:0 0 12px;">Hi ${firstName},</p>
    <p style="margin:0 0 20px;">Your secure link to the <strong>Handy Pioneers Customer Portal</strong> is ready. Use it to view your estimates, invoices, and upcoming appointments — all in one place.</p>
    ${ctaButton('Access My Portal', url)}
    <p style="margin:0 0 8px;font-size:13px;color:#666;">This link expires in <strong>7 days</strong> and can only be used once. If you didn't request this, you can safely ignore this email.</p>
    <p style="margin:0;font-size:13px;color:#aaa;">Or copy this URL into your browser:<br/><span style="word-break:break-all;color:#888;">${url}</span></p>
  `);
}

function buildEstimateEmail(name: string, estimateNumber: string, title: string, url: string, baseUrl: string) {
  const firstName = name.split(' ')[0];
  return emailWrapper(`
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a2e1a;">Your Estimate is Ready</h2>
    <p style="margin:0 0 12px;">Hi ${firstName},</p>
    <p style="margin:0 0 8px;">Thank you for choosing Handy Pioneers. We've prepared estimate <strong>${estimateNumber}</strong> for:</p>
    <p style="margin:0 0 20px;padding:12px 16px;background:#f8f9fa;border-left:3px solid #c8922a;border-radius:0 4px 4px 0;font-weight:600;color:#1a2e1a;">${title}</p>
    <p style="margin:0 0 20px;">Please review the details and approve when you're ready to move forward.</p>
    ${ctaButton('Review & Approve Estimate', url)}
    <p style="margin:0;font-size:13px;color:#888;text-align:center;">Questions? <a href="mailto:help@handypioneers.com" style="color:#c8922a;">Reply to this email</a> or call us at (360) 544-9858.</p>
  `);
}

function buildInvoiceEmail(name: string, invoiceNumber: string, amountCents: number, url: string, _baseUrl: string) {
  const firstName = name.split(' ')[0];
  const amount = `$${(amountCents / 100).toFixed(2)}`;
  return emailWrapper(`
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a2e1a;">Invoice ${invoiceNumber}</h2>
    <p style="margin:0 0 12px;">Hi ${firstName},</p>
    <p style="margin:0 0 20px;">Your invoice from Handy Pioneers is ready. The amount due is:</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr><td style="background:#f8f9fa;border:1px solid #e8e8e8;border-radius:6px;padding:16px 24px;text-align:center;">
        <p style="margin:0;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:0.08em;">Amount Due</p>
        <p style="margin:4px 0 0;font-size:32px;font-weight:700;color:#1a2e1a;">${amount}</p>
      </td></tr>
    </table>
    ${ctaButton('Review & Pay Invoice', url)}
    <p style="margin:0;font-size:13px;color:#888;text-align:center;">Questions about this invoice? <a href="mailto:help@handypioneers.com" style="color:#c8922a;">Contact us</a> and we'll be happy to help.</p>
  `);
}

function buildApprovalConfirmationEmail(
  name: string,
  estimateNumber: string,
  title: string,
  depositFmt: string | null,
  invoiceUrl: string,
  _baseUrl: string,
) {
  const firstName = name.split(' ')[0];
  const depositSection = depositFmt
    ? `<p style="margin:0 0 20px;">To get your project scheduled, please pay the <strong>${depositFmt} deposit</strong> using the button below.</p>
       ${ctaButton('Pay Deposit Now', invoiceUrl, '#1a2e1a')}`
    : `<p style="margin:0 0 20px;">Our team will be in touch shortly to schedule your project.</p>`;
  return emailWrapper(`
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a2e1a;">Estimate Approved — Thank You!</h2>
    <p style="margin:0 0 12px;">Hi ${firstName},</p>
    <p style="margin:0 0 8px;">We've received your approval for estimate <strong>${estimateNumber}</strong>:</p>
    <p style="margin:0 0 20px;padding:12px 16px;background:#f8f9fa;border-left:3px solid #1a2e1a;border-radius:0 4px 4px 0;font-weight:600;color:#1a2e1a;">${title}</p>
    ${depositSection}
    <p style="margin:0;font-size:13px;color:#888;text-align:center;">Questions? <a href="mailto:help@handypioneers.com" style="color:#c8922a;">Reply to this email</a> or call us at (360) 544-9858.</p>
  `);
}

function buildReferralEmail(referrerName: string, referralLink: string) {
  return emailWrapper(`
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a2e1a;">You've Been Referred to Handy Pioneers</h2>
    <p style="margin:0 0 12px;">Hi there,</p>
    <p style="margin:0 0 20px;"><strong>${referrerName}</strong> thinks you'd love Handy Pioneers for your home improvement needs in the Vancouver, WA area. Sign up through the link below — both you and ${referrerName} will receive a reward when your first job is completed.</p>
    ${ctaButton('Claim Your Referral Reward', referralLink)}
    <p style="margin:0;font-size:13px;color:#888;text-align:center;">Handy Pioneers &bull; Reliable Renovations, Trusted Results</p>
  `);
}

function buildSignOffConfirmationEmail(
  name: string,
  jobTitle: string,
  signedAt: string,
  balanceCents: number | null,
  invoiceUrl: string,
  _baseUrl: string,
) {
  const firstName = name.split(' ')[0];
  const signedDate = new Date(signedAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
  const balanceSection = balanceCents && balanceCents > 0
    ? `<p style="margin:0 0 20px;">Your remaining balance of <strong>$${(balanceCents / 100).toFixed(2)}</strong> is now due. Please use the button below to pay at your convenience.</p>
       ${ctaButton('Pay Final Invoice', invoiceUrl, '#1a2e1a')}`
    : `<p style="margin:0 0 20px;">Our team will send your final invoice shortly.</p>`;
  return emailWrapper(`
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a2e1a;">Job Completion Confirmed — Thank You!</h2>
    <p style="margin:0 0 12px;">Hi ${firstName},</p>
    <p style="margin:0 0 8px;">Thank you for signing off on the completion of:</p>
    <p style="margin:0 0 20px;padding:12px 16px;background:#f8f9fa;border-left:3px solid #1a2e1a;border-radius:0 4px 4px 0;font-weight:600;color:#1a2e1a;">${jobTitle}</p>
    <p style="margin:0 0 20px;font-size:13px;color:#666;">Signed on ${signedDate}. A copy of your signature has been saved to your project record.</p>
    ${balanceSection}
    <p style="margin:0;font-size:13px;color:#888;text-align:center;">Questions? <a href="mailto:help@handypioneers.com" style="color:#c8922a;">Reply to this email</a> or call us at (360) 544-9858.</p>
  `);
}

function buildChangeOrderApprovalEmail(
  name: string,
  jobTitle: string,
  coNumber: string,
  totalCents: number,
  invoiceUrl: string | null,
  _baseUrl: string,
) {
  const firstName = name.split(' ')[0];
  const totalFmt = `$${(totalCents / 100).toFixed(2)}`;
  const invoiceSection = invoiceUrl
    ? `<p style="margin:0 0 20px;">An invoice for <strong>${totalFmt}</strong> has been created and is now due.</p>
       ${ctaButton('Pay Change Order Invoice', invoiceUrl, '#1a2e1a')}`
    : `<p style="margin:0 0 20px;">Our team will send your invoice for <strong>${totalFmt}</strong> shortly.</p>`;
  return emailWrapper(`
    <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a2e1a;">Change Order Approved</h2>
    <p style="margin:0 0 12px;">Hi ${firstName},</p>
    <p style="margin:0 0 8px;">Thank you for approving change order <strong>${coNumber}</strong> for:</p>
    <p style="margin:0 0 20px;padding:12px 16px;background:#f8f9fa;border-left:3px solid #1a2e1a;border-radius:0 4px 4px 0;font-weight:600;color:#1a2e1a;">${jobTitle}</p>
    ${invoiceSection}
    <p style="margin:0;font-size:13px;color:#888;text-align:center;">Questions? <a href="mailto:help@handypioneers.com" style="color:#c8922a;">Reply to this email</a> or call us at (360) 544-9858.</p>
  `);
}

export function buildReviewRequestEmail(
  name: string,
  jobTitle: string,
  googleReviewUrl: string,
  isReminder = false,
) {
  const firstName = name.split(' ')[0];
  const subject = isReminder
    ? `Reminder: Share your experience with Handy Pioneers`
    : `How did we do? — ${jobTitle}`;
  const headline = isReminder
    ? `A Quick Reminder — We'd Love Your Feedback`
    : `How Did We Do?`;
  const intro = isReminder
    ? `We wanted to follow up on your recently completed project. Your feedback means the world to our small team.`
    : `We just wrapped up <strong>${jobTitle}</strong> and we hope you're thrilled with the results.`;
  return {
    subject,
    html: emailWrapper(`
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#1a2e1a;">${headline}</h2>
      <p style="margin:0 0 12px;">Hi ${firstName},</p>
      <p style="margin:0 0 20px;">${intro}</p>
      <p style="margin:0 0 20px;">If you have a moment, we'd be grateful if you could leave us a quick Google review. It takes less than a minute and helps other homeowners find us.</p>
      ${ctaButton('Leave a Google Review ⭐', googleReviewUrl, '#c8922a')}
      <p style="margin:24px 0 0;font-size:13px;color:#888;text-align:center;">Thank you for choosing Handy Pioneers. We look forward to working with you again!</p>
    `),
  };
}
