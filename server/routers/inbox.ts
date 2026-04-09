/**
 * Inbox tRPC Router
 * Handles conversations, messages, and call logs for the unified inbox.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  findOrCreateConversation,
  getConversationById,
  incrementUnread,
  insertCallLog,
  insertMessage,
  listCallLogs,
  listConversations,
  listConversationsByCustomer,
  listMessages,
  markConversationRead,
  updateConversationLastMessage,
} from "../db";
import { sendSms, generateVoiceToken, isTwilioConfigured } from "../twilio";

// ─── CONVERSATIONS ────────────────────────────────────────────────────────────

const conversationsRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50), offset: z.number().default(0) }).optional())
    .query(async ({ input }) => {
      const { limit = 50, offset = 0 } = input ?? {};
      return listConversations(limit, offset);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return getConversationById(input.id);
    }),

  findOrCreate: protectedProcedure
    .input(z.object({
      contactPhone: z.string().nullable().optional(),
      contactEmail: z.string().nullable().optional(),
      contactName: z.string().nullable().optional(),
      customerId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return findOrCreateConversation(
        input.contactPhone ?? null,
        input.contactEmail ?? null,
        input.contactName ?? null,
        input.customerId,
      );
    }),

  markRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await markConversationRead(input.id);
      return { success: true };
    }),

  listByCustomer: protectedProcedure
    .input(z.object({ customerId: z.string() }))
    .query(async ({ input }) => {
      return listConversationsByCustomer(input.customerId);
    }),
});

// ─── MESSAGES ────────────────────────────────────────────────────────────────

const messagesRouter = router({
  list: protectedProcedure
    .input(z.object({
      conversationId: z.number(),
      limit: z.number().min(1).max(200).default(100),
      offset: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const msgs = await listMessages(input.conversationId, input.limit, input.offset);
      // Return in chronological order (oldest first)
      return [...msgs].reverse();
    }),

  send: protectedProcedure
    .input(z.object({
      conversationId: z.number(),
      channel: z.enum(["sms", "email", "note"]),
      body: z.string().min(1),
      subject: z.string().optional(),
      isInternal: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const msg = await insertMessage({
        conversationId: input.conversationId,
        channel: input.channel,
        direction: "outbound",
        body: input.body,
        subject: input.subject,
        status: "sent",
        isInternal: input.isInternal,
        sentAt: new Date(),
        sentByUserId: ctx.user?.id,
      });

      await updateConversationLastMessage(
        input.conversationId,
        input.isInternal ? `[Note] ${input.body}` : input.body,
        input.channel,
      );

      return msg;
    }),
});

// ─── CALL LOGS ───────────────────────────────────────────────────────────────

const callLogsRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(100),
      offset: z.number().default(0),
    }).optional())
    .query(async ({ input }) => {
      const { limit = 100, offset = 0 } = input ?? {};
      return listCallLogs(limit, offset);
    }),
});

// ─── TWILIO ───────────────────────────────────────────────────────────────────

const twilioRouter = router({
  /** Check if Twilio is configured */
  status: protectedProcedure.query(() => ({
    configured: isTwilioConfigured(),
    phoneNumber: isTwilioConfigured() ? process.env.TWILIO_PHONE_NUMBER : null,
  })),

  /** Send an SMS outbound */
  sendSms: protectedProcedure
    .input(z.object({
      conversationId: z.number(),
      to: z.string(),
      body: z.string().min(1).max(1600),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!isTwilioConfigured()) throw new Error("Twilio not configured. Add credentials in Settings → Secrets.");
      const { sid, status } = await sendSms(input.to, input.body);
      const msg = await insertMessage({
        conversationId: input.conversationId,
        channel: "sms",
        direction: "outbound",
        body: input.body,
        status,
        twilioSid: sid,
        isInternal: false,
        sentAt: new Date(),
        sentByUserId: ctx.user?.id,
      });
      await updateConversationLastMessage(input.conversationId, input.body, "sms");
      return msg;
    }),

  /** Get a Twilio Voice access token for in-browser calling */
  voiceToken: protectedProcedure.query(({ ctx }) => {
    if (!isTwilioConfigured()) throw new Error("Twilio not configured.");
    const identity = `hp-user-${ctx.user?.id ?? "guest"}`;
    const token = generateVoiceToken(identity);
    return { token, identity };
  }),
});

// ─── COMBINED INBOX ROUTER ───────────────────────────────────────────────────

export const inboxRouter = router({
  conversations: conversationsRouter,
  messages: messagesRouter,
  callLogs: callLogsRouter,
  twilio: twilioRouter,
});
