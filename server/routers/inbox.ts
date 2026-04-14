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
import { findPortalCustomerByHpId, getPortalMessagesByCustomer } from "../portalDb";

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

  /**
   * Find or create the canonical conversation for a customer and return its ID.
   * Ensures the requested channel is registered on the conversation.
   * Used by the CommunicationTab action bar to deep-link into the inbox.
   */
  findOrCreateByCustomer: protectedProcedure
    .input(z.object({
      customerId: z.string(),
      phone: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      name: z.string().nullable().optional(),
      channel: z.enum(["sms", "email", "note"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const conv = await findOrCreateConversation(
        input.phone ?? null,
        input.email ?? null,
        input.name ?? null,
        input.customerId,
      );
      return { conversationId: conv.id };
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

// ─── UNIFIED FEED ────────────────────────────────────────────────────────────

/**
 * Returns a single chronological feed for a given HP CRM customer,
 * merging conversation messages (SMS/email/notes/calls) with portal messages.
 */
const unifiedFeedRouter = router({
  getByCustomer: protectedProcedure
    .input(z.object({ customerId: z.string() }))
    .query(async ({ input }) => {
      // 1. Get all conversations for this customer
      const convs = await listConversationsByCustomer(input.customerId, 10);

      // 2. Fetch messages from all conversations
      const msgArrays = await Promise.all(
        convs.map(c => listMessages(c.id, 200, 0))
      );
      const convMessages = msgArrays.flat().map(m => ({
        id: `msg-${m.id}`,
        source: "conversation" as const,
        channel: m.channel as "sms" | "email" | "note" | "call",
        direction: m.direction as "inbound" | "outbound",
        body: m.body ?? "",
        subject: m.subject ?? null,
        isInternal: m.isInternal,
        sentAt: m.sentAt,
        readAt: m.readAt ?? null,
        conversationId: m.conversationId,
        twilioSid: m.twilioSid ?? null,
        gmailMessageId: m.gmailMessageId ?? null,
        attachmentUrl: m.attachmentUrl ?? null,
        attachmentMime: m.attachmentMime ?? null,
        senderName: null as string | null,
      }));

      // 3. Get portal messages via hpCustomerId
      const portalCustomer = await findPortalCustomerByHpId(input.customerId);
      const portalMsgs = portalCustomer
        ? await getPortalMessagesByCustomer(portalCustomer.id)
        : [];
      const portalFeedItems = portalMsgs.map(m => ({
        id: `portal-${m.id}`,
        source: "portal" as const,
        channel: "portal" as const,
        direction: (m.senderRole === "hp_team" ? "outbound" : "inbound") as "inbound" | "outbound",
        body: m.body,
        subject: null as string | null,
        isInternal: false,
        sentAt: m.createdAt,
        readAt: m.readAt ?? null,
        conversationId: null as number | null,
        twilioSid: null as string | null,
        gmailMessageId: null as string | null,
        attachmentUrl: null as string | null,
        attachmentMime: null as string | null,
        senderName: m.senderName ?? null,
      }));

      // 4. Merge and sort chronologically (oldest first)
      const feed = [...convMessages, ...portalFeedItems].sort(
        (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
      );

      // 5. Return feed + conversation metadata for compose bar
      const primaryConv = convs[0] ?? null;
      return {
        feed,
        conversationId: primaryConv?.id ?? null,
        contactPhone: primaryConv?.contactPhone ?? null,
        contactEmail: primaryConv?.contactEmail ?? null,
        portalCustomerId: portalCustomer?.id ?? null,
        unreadCount: convs.reduce((s, c) => s + (c.unreadCount ?? 0), 0),
      };
    }),
});

// ─── CUSTOMER INBOX LIST ─────────────────────────────────────────────────────

/**
 * Returns HP CRM customers sorted by most recent communication,
 * with last-message preview and unread count for the inbox left panel.
 */
const customerListRouter = router({
  listWithActivity: protectedProcedure
    .query(async () => {
      const convs = await listConversations(200, 0);
      const customerConvs = convs.filter(c => c.customerId);

      // Build a map: customerId → { lastMessageAt, lastMessagePreview, unreadCount }
      const activityMap = new Map<string, {
        lastMessageAt: Date;
        lastMessagePreview: string | null;
        unreadCount: number;
      }>();

      for (const c of customerConvs) {
        const existing = activityMap.get(c.customerId!);
        const ts = new Date(c.lastMessageAt);
        if (!existing || ts > existing.lastMessageAt) {
          activityMap.set(c.customerId!, {
            lastMessageAt: ts,
            lastMessagePreview: c.lastMessagePreview ?? null,
            unreadCount: (existing?.unreadCount ?? 0) + (c.unreadCount ?? 0),
          });
        } else {
          activityMap.set(c.customerId!, {
            ...existing,
            unreadCount: existing.unreadCount + (c.unreadCount ?? 0),
          });
        }
      }

      return Array.from(activityMap.entries()).map(([customerId, activity]) => ({
        customerId,
        ...activity,
      }));
    }),
});

// ─── COMBINED INBOX ROUTER ───────────────────────────────────────────────────

export const inboxRouter = router({
  conversations: conversationsRouter,
  messages: messagesRouter,
  callLogs: callLogsRouter,
  twilio: twilioRouter,
  unifiedFeed: unifiedFeedRouter,
  customerList: customerListRouter,
});
