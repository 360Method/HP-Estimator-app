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
  upsertPortalCustomer,
  createPortalToken,
  findValidPortalToken,
  markPortalTokenUsed,
  createPortalSession,
  findValidPortalSession,
  deletePortalSession,
  createPortalEstimate,
  getPortalEstimatesByCustomer,
  getPortalEstimateById,
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
} from "../portalDb";
import { sendEmail } from "../gmail";
import { notifyOwner } from "../_core/notification";
import Stripe from "stripe";
import { ENV } from "../_core/env";

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

      await updatePortalEstimateStatus(input.id, "approved", {
        approvedAt: new Date(),
        signerName: input.signerName,
        signatureDataUrl: input.signatureDataUrl,
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

      // Notify HP team
      await notifyOwner({
        title: `Estimate Approved: ${est.estimateNumber}`,
        content: `${ctx.portalCustomer.name} approved estimate ${est.estimateNumber} (${est.title}) and signed electronically.`,
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
      z.object({
        customerEmail: z.string().email(),
        body: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const customer = await findPortalCustomerByEmail(input.customerEmail);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND" });

      await createPortalMessage({
        customerId: customer.id,
        senderRole: "hp_team",
        senderName: ctx.user.name ?? "Handy Pioneers",
        body: input.body,
      });
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
});

// ─── EMAIL TEMPLATES ──────────────────────────────────────────────────────────

const HP_LOGO = "https://cdn.manus.im/hp-logo.png";
const HP_FOOTER = `
  <p style="text-align:center;color:#666;font-size:12px;margin-top:32px;">
    (360) 544-9858 | <a href="mailto:help@handypioneers.com">help@handypioneers.com</a><br/>
    808 SE Chkalov Dr 3-433, Vancouver, WA 98683<br/>
    <a href="https://handypioneers.com">handypioneers.com</a>
  </p>`;

function emailWrapper(content: string) {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <img src="https://cdn.manus.im/uploads/webdev/hp-logo-email.png" alt="Handy Pioneers" style="height:80px;" />
    </div>
    ${content}
    ${HP_FOOTER}
  </body></html>`;
}

function buildMagicLinkEmail(name: string, url: string) {
  return emailWrapper(`
    <p>Hello ${name},</p>
    <p>At Handy Pioneers, we provide our customers with a portal to access their appointments, estimates, and invoices.</p>
    <p>Click the button below to log in to your account. This magic link will expire in 7 days.</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${url}" style="background:#1a56db;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">LOGIN TO CUSTOMER PORTAL</a>
    </div>
    <p style="font-size:13px;color:#666;">A magic link is a type of authentication method that involves sending a unique, time-sensitive URL to your registered email address. By clicking on this link, you are granted access to a secure account without the need for a traditional password.</p>
  `);
}

function buildEstimateEmail(name: string, estimateNumber: string, title: string, url: string, baseUrl: string) {
  return emailWrapper(`
    <h2 style="text-align:center;">Approve Estimate ${estimateNumber} from Handy Pioneers</h2>
    <p>Hi ${name},</p>
    <p>Thank you for choosing Handy Pioneers. Please review your estimate for <strong>${title}</strong>.</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${url}" style="background:#1a56db;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold;">View Estimate</a>
    </div>
    <p style="text-align:center;"><a href="${baseUrl}/portal/estimates" style="color:#1a56db;">View all estimates in your Customer Portal</a></p>
  `);
}

function buildInvoiceEmail(name: string, invoiceNumber: string, amountCents: number, url: string, baseUrl: string) {
  const amount = `$${(amountCents / 100).toFixed(2)}`;
  return emailWrapper(`
    <h2 style="text-align:center;">Invoice ${invoiceNumber} from Handy Pioneers</h2>
    <p>Hi ${name},</p>
    <p>You have a new invoice for <strong>${amount}</strong> from Handy Pioneers.</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${url}" style="background:#1a56db;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold;">Review & Pay Invoice</a>
    </div>
    <p style="text-align:center;"><a href="${baseUrl}/portal/invoices" style="color:#1a56db;">View all invoices in your Customer Portal</a></p>
  `);
}

function buildReferralEmail(referrerName: string, referralLink: string) {
  return emailWrapper(`
    <h2 style="text-align:center;">You've been invited to Handy Pioneers!</h2>
    <p>${referrerName} thinks you'd love Handy Pioneers for your home improvement needs.</p>
    <p>Sign up through the link below and both you and ${referrerName} will receive a reward when your first job is completed.</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${referralLink}" style="background:#1a56db;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold;">Get Started</a>
    </div>
  `);
}
