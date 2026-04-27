/**
 * Gmail tRPC Router
 * Handles Gmail OAuth connection, email sending, and Email Manager AI operations.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getGmailToken,
  deleteGmailToken,
  listGmailMessageLinks,
  countPendingEmailDrafts,
  updateGmailMessageLink,
} from "../db";
import { getGmailAuthUrl, isGmailConfigured, sendEmail, getOAuth2Client } from "../gmail";
import { insertMessage, updateConversationLastMessage } from "../db";
import { randomBytes } from "crypto";
import { upsertPortalCustomer, createPortalInvoice, createPortalToken, generateReferralCode } from "../portalDb";
import { google } from "googleapis";

// ─── OAuth helpers ────────────────────────────────────────────────────────────

async function buildGmailClientForEmail(email: string) {
  const tokenRow = await getGmailToken(email);
  if (!tokenRow) throw new Error("Gmail not connected. Please reconnect in Settings.");
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({
    access_token: tokenRow.accessToken ?? undefined,
    refresh_token: tokenRow.refreshToken ?? undefined,
    expiry_date: tokenRow.expiresAt ?? undefined,
  });
  return google.gmail({ version: "v1", auth: oauth2 });
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const gmailRouter = router({
  /** Check if Gmail is configured and connected */
  status: protectedProcedure.query(async () => {
    const configured = isGmailConfigured();
    if (!configured) return { configured: false, connected: false, email: null, lastSyncedAt: null, pendingDrafts: 0 };

    const email = process.env.GMAIL_CONNECTED_EMAIL || "help@handypioneers.com";
    const token = await getGmailToken(email);
    const pendingDrafts = token ? await countPendingEmailDrafts() : 0;
    return {
      configured,
      connected: !!token,
      email: token ? email : null,
      lastSyncedAt: token?.lastSyncedAt ?? null,
      pendingDrafts,
    };
  }),

  /** Get the Google OAuth consent URL to connect Gmail */
  getAuthUrl: protectedProcedure
    .input(z.object({ origin: z.string().optional() }))
    .query(({ input }) => {
      if (!isGmailConfigured()) {
        throw new Error("Gmail OAuth not configured. Add GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in Settings → Secrets.");
      }
      const redirectUri = input.origin
        ? `${input.origin}/api/gmail/callback`
        : undefined;
      return { url: getGmailAuthUrl(undefined, redirectUri) };
    }),

  /** Disconnect Gmail — revokes local tokens */
  disconnect: protectedProcedure.mutation(async () => {
    const email = process.env.GMAIL_CONNECTED_EMAIL || "help@handypioneers.com";
    const tokenRow = await getGmailToken(email);
    if (tokenRow?.refreshToken) {
      try {
        const oauth2 = getOAuth2Client();
        oauth2.setCredentials({ refresh_token: tokenRow.refreshToken });
        await oauth2.revokeToken(tokenRow.refreshToken);
      } catch { /* best effort */ }
    }
    await deleteGmailToken(email);
    process.env.GMAIL_CONNECTED_EMAIL = "";
    return { success: true };
  }),

  /** List inbox messages with AI classification labels */
  listInbox: protectedProcedure
    .input(z.object({
      classification: z.enum(["customer", "urgent", "promo", "spam", "personal", "lead_inquiry", "unclassified"]).optional(),
      hasDraft: z.boolean().optional(),
      limit: z.number().min(1).max(100).optional(),
    }))
    .query(async ({ input }) => {
      return listGmailMessageLinks({
        classification: input.classification,
        hasDraft: input.hasDraft,
        limit: input.limit ?? 50,
      });
    }),

  /** Read a full Gmail thread */
  readThread: protectedProcedure
    .input(z.object({ threadId: z.string() }))
    .query(async ({ input }) => {
      const email = process.env.GMAIL_CONNECTED_EMAIL || "help@handypioneers.com";
      const gmail = await buildGmailClientForEmail(email);
      const thread = await gmail.users.threads.get({
        userId: "me",
        id: input.threadId,
        format: "full",
      });
      const messages = (thread.data.messages ?? []).map(msg => {
        const headers = msg.payload?.headers ?? [];
        const h = (n: string) => headers.find(hd => hd.name?.toLowerCase() === n)?.value ?? "";
        let body = "";
        const parts = msg.payload?.parts ?? [];
        const textPart = parts.find(p => p.mimeType === "text/plain") ?? msg.payload;
        if (textPart?.body?.data) body = Buffer.from(textPart.body.data, "base64").toString("utf-8");
        return {
          id: msg.id,
          threadId: msg.threadId,
          from: h("from"),
          to: h("to"),
          subject: h("subject"),
          date: h("date"),
          body,
          labelIds: msg.labelIds ?? [],
        };
      });
      return { threadId: input.threadId, messages };
    }),

  /** Create a Gmail draft reply (does NOT send) */
  draftReply: protectedProcedure
    .input(z.object({
      threadId: z.string(),
      toEmail: z.string().email(),
      subject: z.string(),
      body: z.string().min(1),
      inReplyToMessageId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const email = process.env.GMAIL_CONNECTED_EMAIL || "help@handypioneers.com";
      const gmail = await buildGmailClientForEmail(email);
      const replySubject = input.subject.startsWith("Re:") ? input.subject : `Re: ${input.subject}`;
      const headers: string[] = [
        `To: ${input.toEmail}`,
        `Subject: ${replySubject}`,
        `Content-Type: text/plain; charset=utf-8`,
      ];
      if (input.inReplyToMessageId) {
        headers.push(`In-Reply-To: ${input.inReplyToMessageId}`);
        headers.push(`References: ${input.inReplyToMessageId}`);
      }
      const rawBody = headers.join("\r\n") + "\r\n\r\n" + input.body;
      const raw = Buffer.from(rawBody).toString("base64url");
      const resp = await gmail.users.drafts.create({
        userId: "me",
        requestBody: { message: { raw, threadId: input.threadId } },
      });
      return { draftId: resp.data.id };
    }),

  /** Send a queued Gmail draft (the human gate) */
  sendDraft: protectedProcedure
    .input(z.object({ draftId: z.string(), gmailMessageId: z.string().optional() }))
    .mutation(async ({ input }) => {
      const email = process.env.GMAIL_CONNECTED_EMAIL || "help@handypioneers.com";
      const gmail = await buildGmailClientForEmail(email);
      const resp = await gmail.users.drafts.send({
        userId: "me",
        requestBody: { id: input.draftId },
      });
      // Mark the link as sent
      if (input.gmailMessageId) {
        await updateGmailMessageLink(input.gmailMessageId, { archived: true });
      }
      return { messageId: resp.data.id, threadId: resp.data.threadId };
    }),

  /** Archive a Gmail thread */
  archiveThread: protectedProcedure
    .input(z.object({ threadId: z.string() }))
    .mutation(async ({ input }) => {
      const email = process.env.GMAIL_CONNECTED_EMAIL || "help@handypioneers.com";
      const gmail = await buildGmailClientForEmail(email);
      await gmail.users.threads.modify({
        userId: "me",
        id: input.threadId,
        requestBody: { removeLabelIds: ["INBOX"] },
      });
      return { success: true };
    }),

  /** Mark a message as read */
  markRead: protectedProcedure
    .input(z.object({ messageId: z.string() }))
    .mutation(async ({ input }) => {
      const email = process.env.GMAIL_CONNECTED_EMAIL || "help@handypioneers.com";
      const gmail = await buildGmailClientForEmail(email);
      await gmail.users.messages.modify({
        userId: "me",
        id: input.messageId,
        requestBody: { removeLabelIds: ["UNREAD"] },
      });
      return { success: true };
    }),

  /** Get the Email Manager AI connection status (alias for status + AI info) */
  getConnectionStatus: protectedProcedure.query(async () => {
    const configured = isGmailConfigured();
    const email = process.env.GMAIL_CONNECTED_EMAIL || "help@handypioneers.com";
    const token = await getGmailToken(email);
    const pendingDrafts = token ? await countPendingEmailDrafts() : 0;
    return {
      configured,
      connected: !!token,
      gmailAddress: token ? email : null,
      lastSyncedAt: token?.lastSyncedAt?.toISOString() ?? null,
      pendingDrafts,
    };
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

      const { messageId } = await sendEmail({ fromEmail, to: input.toEmail, subject, html });
      return { messageId, subject, portalUrl };
    }),

  /**
   * Send an email reply from the operator (now via Resend, sent from
   * help@handypioneers.com so the customer's reply lands in our inbox and is
   * picked up by the inbound poller into the same conversation).
   *
   * Accepts an optional `inReplyTo` Message-ID to thread the reply correctly
   * in the recipient's mail client. The composer typically pulls this from
   * the latest inbound email on the conversation.
   */
  sendEmail: protectedProcedure
    .input(z.object({
      conversationId: z.number(),
      to: z.string().email(),
      subject: z.string().min(1),
      body: z.string().min(1),
      /** Optional RFC 2822 Message-ID of the email we're replying to. */
      inReplyTo: z.string().optional(),
      /** Legacy Gmail thread id — accepted but ignored under Resend. */
      threadId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { messageId } = await sendEmail({
        to: input.to,
        subject: input.subject,
        body: input.body,
        inReplyTo: input.inReplyTo,
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
      // gmailThreadId is no longer set under Resend (no thread concept). The
      // shape stays for any caller still destructuring it — value is null.
      return { ...msg, gmailThreadId: null };
    }),
});
