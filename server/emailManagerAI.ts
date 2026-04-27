/**
 * Email Manager AI — classification + drafting pipeline
 *
 * Called every 15 min from server/_core/index.ts.
 * For each connected Gmail account:
 *   1. Fetch messages since lastMessageIdSeen (or last 24h on first run)
 *   2. Classify each message via Claude
 *   3. spam      → archive in Gmail
 *   4. promo     → skip
 *   5. customer / urgent / lead_inquiry
 *                → match customer, draft reply, create Gmail draft,
 *                  queue notification in admin inbox
 *
 * HARD CONSTRAINT: this service NEVER sends email.
 * "Send" is always a deliberate human action in the admin inbox.
 */

import Anthropic from "@anthropic-ai/sdk";
import { google } from "googleapis";
import {
  getDb,
  getFirstGmailToken,
  getGmailMessageLink,
  insertGmailMessageLink,
  updateGmailTokenSyncState,
  findCustomerByEmail,
  findOrCreateConversation,
  insertMessage,
  updateConversationLastMessage,
  incrementUnread,
} from "./db";
import { getOAuth2Client } from "./gmail";
import { upsertGmailToken } from "./db";
import type { GmailMessageLink } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { notifications } from "../drizzle/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmailClassification =
  | "customer"
  | "urgent"
  | "promo"
  | "spam"
  | "personal"
  | "lead_inquiry"
  | "unclassified";

// ─── Anthropic client ─────────────────────────────────────────────────────────

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  return new Anthropic({ apiKey });
}

// ─── Classification prompt ────────────────────────────────────────────────────

const CLASSIFIER_SYSTEM = `You are the Email Manager AI for Handy Pioneers, a licensed handyman and home-maintenance company in Vancouver, WA.

Your job: classify each inbound email into exactly ONE category.

Categories:
- customer       : from an existing or past client about their project, invoice, scheduling, or service
- urgent         : any message requiring same-day human response (complaint, safety issue, emergency repair)
- lead_inquiry   : a new prospective customer asking about pricing or availability
- promo          : marketing, newsletters, deal emails, automated notifications
- spam           : junk, phishing, unsolicited offers
- personal       : personal messages, internal notes, non-business communications

Respond ONLY with a JSON object:
{"category": "<one of the above>", "confidence": <0-100>, "reason": "<one sentence>"}

Never include anything outside the JSON object.`;

async function classifyEmail(opts: {
  from: string;
  subject: string;
  body: string;
}): Promise<{ category: EmailClassification; confidence: number; reason: string }> {
  const client = getAnthropicClient();
  const userMsg = `From: ${opts.from}\nSubject: ${opts.subject}\n\nBody:\n${opts.body.slice(0, 1500)}`;

  const resp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    system: [{ type: "text", text: CLASSIFIER_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMsg }],
  });

  const text = resp.content.find(b => b.type === "text")?.text ?? "{}";
  try {
    const parsed = JSON.parse(text);
    const category = (parsed.category ?? "unclassified") as EmailClassification;
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 70;
    const reason = typeof parsed.reason === "string" ? parsed.reason : "";
    return { category, confidence, reason };
  } catch {
    return { category: "unclassified", confidence: 0, reason: "parse error" };
  }
}

// ─── Draft-reply prompt ───────────────────────────────────────────────────────

const DRAFT_SYSTEM = `You are the Email Manager AI for Handy Pioneers, a licensed handyman company in Vancouver, WA.
Your role: draft a warm, professional reply on behalf of Marcin (the owner).

Brand voice rules:
- Confident and friendly — not salesy
- Short sentences, plain language
- Acknowledge the customer's message specifically
- Offer a clear next step (schedule a call, confirm an appointment, clarify a detail)
- Sign off as "Marcin & the Handy Pioneers team"

YOU NEVER AUTO-SEND. This is a DRAFT for Marcin's review.
Keep replies to 3-5 short paragraphs max.

If you lack enough context to reply meaningfully, produce a placeholder draft with [FILL IN] markers.`;

async function draftReply(opts: {
  from: string;
  subject: string;
  body: string;
  customerContext?: string;
  classification: EmailClassification;
}): Promise<string> {
  const client = getAnthropicClient();
  const ctxBlock = opts.customerContext
    ? `\n\nCustomer context from CRM:\n${opts.customerContext}`
    : "";
  const userMsg = `Classification: ${opts.classification}

Original email:
From: ${opts.from}
Subject: ${opts.subject}

${opts.body.slice(0, 2000)}${ctxBlock}

Draft a reply.`;

  const resp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: [{ type: "text", text: DRAFT_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMsg }],
  });

  return resp.content.find(b => b.type === "text")?.text ?? "[Draft generation failed — please write manually]";
}

// ─── Gmail client helper ──────────────────────────────────────────────────────

async function buildGmailClient(tokenRow: { accessToken: string | null; refreshToken: string | null; expiresAt: number | null; email: string }) {
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({
    access_token: tokenRow.accessToken ?? undefined,
    refresh_token: tokenRow.refreshToken ?? undefined,
    expiry_date: tokenRow.expiresAt ?? undefined,
  });
  oauth2.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await upsertGmailToken(
        tokenRow.email,
        tokens.access_token,
        tokens.refresh_token ?? tokenRow.refreshToken ?? null,
        tokens.expiry_date ?? Date.now() + 3600000,
      );
    }
  });
  return google.gmail({ version: "v1", auth: oauth2 });
}

// ─── Create Gmail draft ───────────────────────────────────────────────────────

async function createGmailDraftForThread(opts: {
  gmail: ReturnType<typeof google.gmail>;
  toEmail: string;
  subject: string;
  body: string;
  threadId: string;
  inReplyToMessageId?: string;
}): Promise<string | null> {
  try {
    const replySubject = opts.subject.startsWith("Re:") ? opts.subject : `Re: ${opts.subject}`;
    const headers: string[] = [
      `To: ${opts.toEmail}`,
      `Subject: ${replySubject}`,
      `Content-Type: text/plain; charset=utf-8`,
    ];
    if (opts.inReplyToMessageId) {
      headers.push(`In-Reply-To: ${opts.inReplyToMessageId}`);
      headers.push(`References: ${opts.inReplyToMessageId}`);
    }
    const rawBody = headers.join("\r\n") + "\r\n\r\n" + opts.body;
    const raw = Buffer.from(rawBody).toString("base64url");

    const draftResp = await opts.gmail.users.drafts.create({
      userId: "me",
      requestBody: {
        message: { raw, threadId: opts.threadId },
      },
    });
    return draftResp.data.id ?? null;
  } catch (err) {
    console.warn("[EmailManagerAI] createGmailDraft failed:", err);
    return null;
  }
}

// ─── Queue admin notification ─────────────────────────────────────────────────

async function queueAdminNotification(opts: {
  subject: string;
  fromName: string;
  classification: EmailClassification;
  customerId: string | null;
  conversationId: number;
}) {
  try {
    const db = await getDb();
    if (!db) return;
    // Notify admin user (id=1 fallback — real admin id resolved at runtime)
    const adminId = 1;
    await db.insert(notifications).values({
      userId: adminId,
      role: "admin",
      eventType: "email_ai_draft",
      title: `AI Draft: ${opts.subject.slice(0, 80)}`,
      body: `${opts.classification === "urgent" ? "🚨 URGENT — " : ""}From ${opts.fromName}. AI draft ready for review in inbox.`,
      linkUrl: `/inbox?conversationId=${opts.conversationId}`,
      customerId: opts.customerId ?? undefined,
      priority: opts.classification === "urgent" ? "high" : "normal",
    });
  } catch (err) {
    console.warn("[EmailManagerAI] queueAdminNotification failed (non-fatal):", err);
  }
}

// ─── Main pipeline (one Gmail account) ───────────────────────────────────────

export async function runEmailManagerPipeline(gmailEmail: string): Promise<void> {
  let tokenRow: Awaited<ReturnType<typeof getFirstGmailToken>>;
  try {
    const { getGmailToken } = await import("./db");
    tokenRow = await getGmailToken(gmailEmail);
  } catch {
    return;
  }
  if (!tokenRow) return;

  let gmail: ReturnType<typeof google.gmail>;
  try {
    gmail = await buildGmailClient(tokenRow);
  } catch (err) {
    console.warn("[EmailManagerAI] Could not build Gmail client:", err);
    return;
  }

  try {
    // Fetch unread inbox messages from the last 24h
    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: "in:inbox is:unread newer_than:1d",
      maxResults: 50,
    });

    const msgs = listRes.data.messages ?? [];
    if (msgs.length === 0) return;

    let lastSeenId: string | null = tokenRow.lastMessageIdSeen ?? null;

    for (const msgRef of msgs) {
      if (!msgRef.id) continue;

      // Skip if already processed
      const existing = await getGmailMessageLink(msgRef.id);
      if (existing) continue;

      // Fetch full message
      const fullMsg = await gmail.users.messages.get({
        userId: "me",
        id: msgRef.id,
        format: "full",
      });

      const headers = fullMsg.data.payload?.headers ?? [];
      const h = (name: string) => headers.find(hd => hd.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

      const from = h("From");
      const subject = h("Subject") || "(no subject)";
      const date = h("Date");
      const messageId = h("Message-ID");
      const threadId = fullMsg.data.threadId ?? "";

      const emailMatch = from.match(/<(.+?)>/) || from.match(/([^\s]+@[^\s]+)/);
      const senderEmail = (emailMatch?.[1] ?? from).toLowerCase().trim();
      const senderName = from.replace(/<.+>/, "").trim().replace(/^"|"$/g, "");

      // Extract plain text body
      let body = "";
      const parts = fullMsg.data.payload?.parts ?? [];
      const textPart = parts.find(p => p.mimeType === "text/plain") ?? fullMsg.data.payload;
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, "base64").toString("utf-8");
      }

      // Classify
      let classification: EmailClassification = "unclassified";
      let confidence = 0;
      try {
        const result = await classifyEmail({ from, subject, body });
        classification = result.category;
        confidence = result.confidence;
        console.log(`[EmailManagerAI] ${senderEmail} → ${classification} (${confidence}%): ${subject}`);
      } catch (err) {
        console.warn("[EmailManagerAI] Classification failed:", err);
      }

      // Insert message link row
      await insertGmailMessageLink({
        gmailMessageId: msgRef.id,
        gmailThreadId: threadId || null,
        staffGmailEmail: gmailEmail,
        customerId: null,
        classification,
        classificationScore: confidence,
        fromEmail: senderEmail,
        fromName: senderName,
        subject: subject.slice(0, 512),
        bodyPreview: body.slice(0, 500),
        archived: false,
      });

      lastSeenId = msgRef.id;

      // ── Handle by category ────────────────────────────────────────────────

      if (classification === "spam") {
        // Archive in Gmail
        try {
          await gmail.users.messages.modify({
            userId: "me",
            id: msgRef.id,
            requestBody: { addLabelIds: [], removeLabelIds: ["INBOX"] },
          });
          console.log(`[EmailManagerAI] Auto-archived spam from ${senderEmail}`);
        } catch (archiveErr) {
          console.warn("[EmailManagerAI] Archive spam failed:", archiveErr);
        }
        continue;
      }

      if (classification === "promo") {
        // Leave alone, no draft, no notification
        continue;
      }

      if (classification === "customer" || classification === "urgent" || classification === "lead_inquiry") {
        // Try to match existing customer
        const customer = await findCustomerByEmail(senderEmail);
        if (customer) {
          const { updateGmailMessageLink } = await import("./db");
          await updateGmailMessageLink(msgRef.id, { customerId: customer.id });
        }

        // Build customer context for draft
        let customerContext: string | undefined;
        if (customer) {
          customerContext = `Name: ${customer.displayName || `${customer.firstName} ${customer.lastName}`}\nEmail: ${customer.email}\nPhone: ${customer.mobilePhone}`;
          if (customer.customerNotes) customerContext += `\nNotes: ${customer.customerNotes.slice(0, 300)}`;
        }

        // Draft reply via AI
        let draftBody: string | null = null;
        let gmailDraftId: string | null = null;
        try {
          draftBody = await draftReply({
            from,
            subject,
            body,
            customerContext,
            classification,
          });

          // Create Gmail draft
          gmailDraftId = await createGmailDraftForThread({
            gmail,
            toEmail: senderEmail,
            subject,
            body: draftBody,
            threadId,
            inReplyToMessageId: messageId || undefined,
          });
        } catch (draftErr) {
          console.warn("[EmailManagerAI] Draft generation failed:", draftErr);
        }

        // Store in conversation / messages so it surfaces in admin inbox
        let conversationId = 0;
        try {
          const conv = await findOrCreateConversation(null, senderEmail, senderName || null, customer?.id);
          conversationId = conv.id;

          // Store the inbound message
          await insertMessage({
            conversationId: conv.id,
            channel: "email",
            direction: "inbound",
            body: body.slice(0, 10000),
            subject,
            status: "delivered",
            gmailMessageId: msgRef.id,
            isInternal: false,
            sentAt: date ? new Date(date) : new Date(),
          });

          await updateConversationLastMessage(conv.id, body.slice(0, 255) || subject, "email");
          await incrementUnread(conv.id);

          // Store the AI draft as an outbound draft message
          if (draftBody) {
            const draftMsg = await insertMessage({
              conversationId: conv.id,
              channel: "email",
              direction: "outbound",
              body: draftBody,
              subject: subject.startsWith("Re:") ? subject : `Re: ${subject}`,
              status: "draft",
              gmailMessageId: gmailDraftId !== null ? gmailDraftId : undefined,
              isInternal: false,
              sentAt: new Date(),
            });

            if (draftMsg?.id) {
              const { updateGmailMessageLink } = await import("./db");
              await updateGmailMessageLink(msgRef.id, {
                aiDraftReplyId: draftMsg.id,
                gmailDraftId: gmailDraftId ?? undefined,
              });
            }
          }
        } catch (inboxErr) {
          console.warn("[EmailManagerAI] Inbox persist failed:", inboxErr);
        }

        // Queue admin notification
        await queueAdminNotification({
          subject,
          fromName: senderName || senderEmail,
          classification,
          customerId: customer?.id ?? null,
          conversationId,
        });

        // Mark as read in Gmail so standard poll doesn't re-process
        try {
          await gmail.users.messages.modify({
            userId: "me",
            id: msgRef.id,
            requestBody: { removeLabelIds: ["UNREAD"] },
          });
        } catch { /* non-fatal */ }
      }
    }

    // Update sync state
    await updateGmailTokenSyncState(gmailEmail, new Date(), lastSeenId);

  } catch (err) {
    console.error("[EmailManagerAI] Pipeline error:", err);
  }
}

// ─── Exported helpers for tRPC router ────────────────────────────────────────

export { draftReply, classifyEmail };
