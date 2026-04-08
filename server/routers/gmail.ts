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
  getAuthUrl: protectedProcedure.query(() => {
    if (!isGmailConfigured()) {
      throw new Error("Gmail OAuth not configured. Add GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in Settings → Secrets.");
    }
    return { url: getGmailAuthUrl() };
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
