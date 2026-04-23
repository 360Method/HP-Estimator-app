/**
 * Gmail tRPC Router
 * Handles Gmail OAuth connection and email sending.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getGmailToken } from "../db";
import { getGmailAuthUrl, isGmailConfigured, sendEmail } from "../gmail";
import { insertMessage, updateConversationLastMessage } from "../db";
import { randomBytes } from "crypto";
import { upsertPortalCustomer, createPortalInvoice, createPortalToken, generateReferralCode } from "../portalDb";

export const gmailRouter = router({
  /** Check if Gmail is configured and connected */
  status: protectedProcedure.query(async () => {
    const configured = isGmailConfigured();
    if (!configured) return { configured: false, connected: false, email: null };

    const email = process.env.GMAIL_CONNECTED_EMAIL || "help@handypioneers.com";
    const token = await getGmailToken(email);
    return {
      configured,
      connected: !!token,
      email: token ? email : null,
    };
  }),

  /** Get the Google OAuth consent URL to connect Gmail */
  getAuthUrl: protectedProcedure
    .input(z.object({ origin: z.string().optional() }))
    .query(({ input }) => {
      if (!isGmailConfigured()) {
        throw new Error("Gmail OAuth not configured. Add GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in Settings \u2192 Secrets.");
      }
      // Build redirect URI from the frontend origin so OAuth works on any domain
      const redirectUri = input.origin
        ? `${input.origin}/api/gmail/callback`
        : undefined;
      return { url: getGmailAuthUrl(undefined, redirectUri) };
    }),

  /** Send a formatted invoice email to a customer with portal magic link */
  sendInvoice: protectedProcedure
    .input(z.object({
      toEmail: z.string().email(),
      toName: z.string().optional(),
      hpCustomerId: z.string().optional(),
      invoiceNumber: z.string(),
      invoiceType: z.enum(["deposit", "final"]),
      invoiceTotal: z.number(),
      dueDate: z.string(),
      jobTitle: z.string().optional(),
      paymentLink: z.string().optional(),
      lineItemsJson: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const fromEmail = process.env.GMAIL_CONNECTED_EMAIL || "help@handypioneers.com";
      const gmailToken = await getGmailToken(fromEmail);
      if (!gmailToken) throw new Error("Gmail not connected. Please connect your Gmail account in Settings → Integrations.");

      // ── Portal: upsert customer + create invoice record + magic link ──────
      let portalUrl: string | undefined;
      try {
        const customerName = input.toName || input.toEmail.split("@")[0];
        const portalCustomer = await upsertPortalCustomer({
          email: input.toEmail.toLowerCase().trim(),
          name: customerName,
          hpCustomerId: input.hpCustomerId,
          referralCode: await generateReferralCode(customerName),
        });
        if (portalCustomer) {
          const portalInvoice = await createPortalInvoice({
            customerId: portalCustomer.id,
            invoiceNumber: input.invoiceNumber,
            type: input.invoiceType === "deposit" ? "deposit" : "final",
            status: "due",
            amountDue: Math.round(input.invoiceTotal * 100),
            amountPaid: 0,
            tipAmount: 0,
            dueDate: new Date(input.dueDate),
            jobTitle: input.jobTitle,
            lineItemsJson: input.lineItemsJson,
            sentAt: new Date(),
          });
          const token = randomBytes(32).toString("hex");
          const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          await createPortalToken({ customerId: portalCustomer.id, token, expiresAt });
          const portalBase = process.env.PORTAL_BASE_URL ?? "https://client.handypioneers.com";
          portalUrl = `${portalBase}/portal/auth?token=${token}&redirect=/portal/invoices/${portalInvoice?.id}`;
        }
      } catch (e) {
        console.warn("[gmail.sendInvoice] Portal upsert failed (non-fatal):", e);
      }

      const typeLabel = input.invoiceType === "deposit" ? "Deposit Invoice" : "Final Invoice";
      const subject = `${typeLabel} ${input.invoiceNumber} — Handy Pioneers`;
      const greeting = input.toName ? `Hi ${input.toName},` : "Hello,";
      const dueFmt = new Date(input.dueDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      const amtFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(input.invoiceTotal);

      const ctaBtn = portalUrl
        ? `<div style="text-align:center;margin:28px 0;"><a href="${portalUrl}" style="background:#1e3a5f;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">View &amp; Pay Invoice</a></div>`
        : input.paymentLink
          ? `<div style="text-align:center;margin:28px 0;"><a href="${input.paymentLink}" style="background:#1e3a5f;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Pay Now</a></div>`
          : "";

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0;background:#f9fafb;"><div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);"><div style="background:#1e3a5f;padding:28px 32px;"><div style="color:#fff;font-size:22px;font-weight:700;">Handy Pioneers</div><div style="color:#93c5fd;font-size:13px;margin-top:4px;">Licensed &amp; Insured · Vancouver, WA · HANDYP*761NH</div></div><div style="padding:32px;"><p style="margin:0 0 16px;font-size:16px;color:#111827;">${greeting}</p><p style="margin:0 0 24px;color:#4b5563;line-height:1.6;">Please find your ${typeLabel.toLowerCase()} for ${input.jobTitle ? `<strong>${input.jobTitle}</strong>` : "your project"} below.</p><div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:20px;margin-bottom:24px;"><div style="font-size:13px;color:#0369a1;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px;">Invoice Summary</div><table style="width:100%;border-collapse:collapse;"><tr><td style="padding:4px 0;color:#6b7280;">Invoice #</td><td style="padding:4px 0;text-align:right;font-weight:600;">${input.invoiceNumber}</td></tr><tr><td style="padding:4px 0;color:#6b7280;">Amount Due</td><td style="padding:4px 0;text-align:right;font-size:18px;font-weight:700;color:#111827;">${amtFmt}</td></tr><tr><td style="padding:4px 0;color:#6b7280;">Due Date</td><td style="padding:4px 0;text-align:right;">${dueFmt}</td></tr></table></div>${ctaBtn}<p style="margin:24px 0 0;color:#6b7280;font-size:13px;">Questions? Call or text us at <a href="tel:+13605449858" style="color:#1e3a5f;">(360) 544-9858</a> or reply to this email.</p></div><div style="background:#f9fafb;padding:20px 32px;border-top:1px solid #e5e7eb;"><p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">Handy Pioneers, LLC · Vancouver, WA · <a href="https://handypioneers.com" style="color:#6b7280;">handypioneers.com</a></p></div></div></body></html>`;

      const { messageId } = await sendEmail({
        fromEmail,
        to: input.toEmail,
        subject,
        html,
      });

      return { messageId, subject, portalUrl };
    }),

  /** Send an email from the connected Gmail account */
  sendEmail: protectedProcedure
    .input(z.object({
      conversationId: z.number(),
      to: z.string().email(),
      subject: z.string().min(1),
      body: z.string().min(1),
      threadId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const fromEmail = process.env.GMAIL_CONNECTED_EMAIL || "help@handypioneers.com";
      const token = await getGmailToken(fromEmail);
      if (!token) throw new Error("Gmail not connected. Please connect your Gmail account in Settings.");

      const { messageId, threadId } = await sendEmail({
        fromEmail,
        to: input.to,
        subject: input.subject,
        body: input.body,
        threadId: input.threadId,
      });

      const msg = await insertMessage({
        conversationId: input.conversationId,
        channel: "email",
        direction: "outbound",
        body: input.body,
        subject: input.subject,
        status: "sent",
        gmailMessageId: messageId,
        isInternal: false,
        sentAt: new Date(),
        sentByUserId: ctx.user?.id,
      });

      await updateConversationLastMessage(input.conversationId, input.body, "email");
      return { ...msg, gmailThreadId: threadId };
    }),
});
