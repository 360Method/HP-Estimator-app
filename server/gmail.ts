/**
 * Gmail Integration
 * - OAuth2 flow to connect help@handypioneers.com
 * - Send emails via Gmail API (preserves thread)
 * - Poll for new inbound emails and store them as messages
 *
 * Required env vars (set via Settings → Secrets):
 *   GMAIL_CLIENT_ID       — Google Cloud OAuth2 Client ID
 *   GMAIL_CLIENT_SECRET   — Google Cloud OAuth2 Client Secret
 *   GMAIL_REDIRECT_URI    — e.g. https://yourdomain.com/api/gmail/callback
 *
 * Setup steps for the user:
 * 1. Go to console.cloud.google.com → APIs & Services → Credentials
 * 2. Create OAuth 2.0 Client ID (Web application)
 * 3. Add redirect URI: https://pro.handypioneers.com/api/gmail/callback
 * 4. Enable Gmail API in the project
 * 5. Add GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET to Settings → Secrets
 */

import { google } from "googleapis";
import nodemailer from "nodemailer";
import {
  findOrCreateConversation,
  getGmailToken,
  incrementUnread,
  insertMessage,
  updateConversationLastMessage,
  upsertGmailToken,
} from "./db";

// ─── OAuth2 Client ────────────────────────────────────────────────────────────

export function getOAuth2Client() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_REDIRECT_URI || "https://pro.handypioneers.com/api/gmail/callback";

  if (!clientId || !clientSecret) {
    throw new Error("Gmail OAuth not configured. Add GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in Settings → Secrets.");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function isGmailConfigured() {
  return !!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET);
}

/** Generate the Google OAuth consent URL */
export function getGmailAuthUrl(state?: string, redirectUri?: string): string {
  const clientId = process.env.GMAIL_CLIENT_ID!;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET!;
  const finalRedirectUri = redirectUri || process.env.GMAIL_REDIRECT_URI || "https://pro.handypioneers.com/api/gmail/callback";
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, finalRedirectUri);
  return oauth2.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
    ],
    prompt: "consent",
    // Encode redirectUri in state so callback knows which URI to use
    state: JSON.stringify({ state: state || "", redirectUri: finalRedirectUri }),
  });
}

/** Exchange auth code for tokens and persist them */
export async function exchangeGmailCode(code: string, redirectUri?: string): Promise<string> {
  const clientId = process.env.GMAIL_CLIENT_ID!;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET!;
  const finalRedirectUri = redirectUri || process.env.GMAIL_REDIRECT_URI || "https://pro.handypioneers.com/api/gmail/callback";
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, finalRedirectUri);
  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);

  // Get the email address for this token
  const gmail = google.gmail({ version: "v1", auth: oauth2 });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const email = profile.data.emailAddress!;

  await upsertGmailToken(
    email,
    tokens.access_token!,
    tokens.refresh_token ?? null,
    tokens.expiry_date ?? Date.now() + 3600000,
  );

  return email;
}

/** Get an authenticated Gmail client for the stored account */
async function getGmailClient(email: string) {
  const tokenRow = await getGmailToken(email);
  if (!tokenRow) throw new Error(`No Gmail token found for ${email}. Please reconnect in Settings.`);

  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({
    access_token: tokenRow.accessToken ?? undefined,
    refresh_token: tokenRow.refreshToken ?? undefined,
    expiry_date: tokenRow.expiresAt ?? undefined,
  });

  // Auto-refresh if expired
  oauth2.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await upsertGmailToken(
        email,
        tokens.access_token,
        tokens.refresh_token ?? tokenRow.refreshToken ?? null,
        tokens.expiry_date ?? Date.now() + 3600000,
      );
    }
  });

  return google.gmail({ version: "v1", auth: oauth2 });
}

// ─── Send Email ───────────────────────────────────────────────────────────────

/** RFC 2047 encode a subject so non-ASCII chars (em dash, etc.) survive all mail clients */
function encodeSubject(subject: string): string {
  if (!/[^\x00-\x7F]/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`;
}

export async function sendEmail(params: {
  fromEmail?: string;
  to: string;
  subject: string;
  body?: string;
  html?: string;
  threadId?: string;
  inReplyTo?: string;
}): Promise<{ messageId: string; threadId: string }> {
  // Use help@ as default sender if no fromEmail provided
  const fromEmail = params.fromEmail || "help@handypioneers.com";
  let gmail: ReturnType<typeof google.gmail>;
  try {
    gmail = await getGmailClient(fromEmail);
  } catch {
    // Gmail not connected — log and skip silently
    console.warn("[Gmail] sendEmail: not connected, skipping");
    return { messageId: "", threadId: "" };
  }

  const boundary = `boundary_${Date.now()}`;
  const plainText = params.body ?? (params.html ? params.html.replace(/<[^>]+>/g, "") : "");

  let rawBody: string;
  if (params.html) {
    // Multipart/alternative: plain + HTML
    const headers = [
      `From: Handy Pioneers <${fromEmail}>`,
      `To: ${params.to}`,
      `Subject: ${encodeSubject(params.subject)}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ];
    if (params.inReplyTo) {
      headers.push(`In-Reply-To: ${params.inReplyTo}`);
      headers.push(`References: ${params.inReplyTo}`);
    }
    rawBody = [
      headers.join("\r\n"),
      "",
      `--${boundary}`,
      `Content-Type: text/plain; charset=utf-8`,
      "",
      plainText,
      `--${boundary}`,
      `Content-Type: text/html; charset=utf-8`,
      "",
      params.html,
      `--${boundary}--`,
    ].join("\r\n");
  } else {
    const headers = [
      `From: Handy Pioneers <${fromEmail}>`,
      `To: ${params.to}`,
      `Subject: ${encodeSubject(params.subject)}`,
      `Content-Type: text/plain; charset=utf-8`,
    ];
    if (params.inReplyTo) {
      headers.push(`In-Reply-To: ${params.inReplyTo}`);
      headers.push(`References: ${params.inReplyTo}`);
    }
    rawBody = headers.join("\r\n") + "\r\n\r\n" + plainText;
  }

  const raw = Buffer.from(rawBody).toString("base64url");

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
      threadId: params.threadId,
    },
  });

  return {
    messageId: response.data.id!,
    threadId: response.data.threadId!,
  };
}

// ─── Poll Inbound Emails ──────────────────────────────────────────────────────
// Called on a schedule (e.g. every 2 minutes) to check for new emails.

export async function pollInboundEmails(fromEmail: string, afterHistoryId?: string): Promise<void> {
  let gmail: ReturnType<typeof google.gmail>;
  try {
    gmail = await getGmailClient(fromEmail);
  } catch {
    console.warn("[Gmail] Not connected, skipping poll");
    return;
  }

  try {
    // List unread messages in INBOX from the last 24h
    const listRes = await gmail.users.messages.list({
      userId: "me",
      q: "in:inbox is:unread newer_than:1d",
      maxResults: 20,
    });

    const msgs = listRes.data.messages ?? [];
    for (const msgRef of msgs) {
      if (!msgRef.id) continue;

      // Fetch full message
      const fullMsg = await gmail.users.messages.get({
        userId: "me",
        id: msgRef.id,
        format: "full",
      });

      const headers = fullMsg.data.payload?.headers ?? [];
      const getHeader = (name: string) =>
        headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

      const from = getHeader("From");
      const subject = getHeader("Subject");
      const date = getHeader("Date");
      const messageId = getHeader("Message-ID");
      const threadId = fullMsg.data.threadId ?? "";

      // Extract sender email
      const emailMatch = from.match(/<(.+?)>/) || from.match(/([^\s]+@[^\s]+)/);
      const senderEmail = emailMatch?.[1] ?? from;
      const senderName = from.replace(/<.+>/, "").trim().replace(/^"|"$/g, "");

      // Get plain text body
      let body = "";
      const parts = fullMsg.data.payload?.parts ?? [];
      const textPart = parts.find(p => p.mimeType === "text/plain") ?? fullMsg.data.payload;
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, "base64").toString("utf-8");
      }

      // Find or create conversation
      const conv = await findOrCreateConversation(null, senderEmail, senderName || null);

      // Insert message (skip if already exists by gmailMessageId)
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

      // Mark as read in Gmail so we don't re-process
      await gmail.users.messages.modify({
        userId: "me",
        id: msgRef.id,
        requestBody: { removeLabelIds: ["UNREAD"] },
      });

      console.log(`[Gmail] Processed inbound email from ${senderEmail}: ${subject}`);
    }
  } catch (err) {
    console.error("[Gmail] Poll error:", err);
  }
}
