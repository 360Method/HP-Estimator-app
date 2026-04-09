/**
 * Gmail tRPC Router
 * Handles Gmail OAuth connection and email sending.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getGmailToken } from "../db";
import { getGmailAuthUrl, isGmailConfigured, sendEmail } from "../gmail";
import { insertMessage, updateConversationLastMessage } from "../db";

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

  /** Send a formatted invoice email to a customer (no conversation ID required) */
  sendInvoice: protectedProcedure
    .input(z.object({
      toEmail: z.string().email(),
      toName: z.string().optional(),
      invoiceNumber: z.string(),
      invoiceType: z.enum(["deposit", "final"]),
      invoiceTotal: z.number(),
      dueDate: z.string(),
      jobTitle: z.string().optional(),
      paymentLink: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const fromEmail = process.env.GMAIL_CONNECTED_EMAIL || "help@handypioneers.com";
      const token = await getGmailToken(fromEmail);
      if (!token) throw new Error("Gmail not connected. Please connect your Gmail account in Settings → Integrations.");

      const typeLabel = input.invoiceType === "deposit" ? "Deposit Invoice" : "Final Invoice";
      const subject = `${typeLabel} ${input.invoiceNumber} — Handy Pioneers`;
      const greeting = input.toName ? `Hi ${input.toName},` : "Hello,";
      const dueFmt = new Date(input.dueDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      const amtFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(input.invoiceTotal);

      const body = [
        greeting,
        "",
        `Please find your ${typeLabel.toLowerCase()} attached for ${input.jobTitle ? `"${input.jobTitle}"` : "your project"}.`,
        "",
        `  Invoice #: ${input.invoiceNumber}`,
        `  Amount Due: ${amtFmt}`,
        `  Due Date: ${dueFmt}`,
        "",
        input.paymentLink ? `To pay online, visit: ${input.paymentLink}` : "Please contact us to arrange payment.",
        "",
        "Thank you for choosing Handy Pioneers!",
        "",
        "Best regards,",
        "Handy Pioneers",
        "help@handypioneers.com",
        "(360) 910-0555",
      ].join("\n");

      const { messageId } = await sendEmail({
        fromEmail,
        to: input.toEmail,
        subject,
        body,
      });

      return { messageId, subject };
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
