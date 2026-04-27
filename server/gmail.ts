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
  findCustomerByEmail,
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

/**
 * True iff the Gmail OAuth env vars are set. Used to gate the inbound-mail
 * poller — it has nothing to do with whether we can SEND mail. Outbound is
 * Resend; check `isEmailSenderReady()` instead.
 */
export function isGmailConfigured() {
  return !!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET);
}

/**
 * True iff the outbound email transport (Resend) is configured. Use this at
 * any send-gating call site — booking auto-acks, draft sends, automation
 * emails, etc.
 */
export function isEmailSenderReady(): boolean {
  return !!process.env.RESEND_API_KEY;
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

/**
 * Outbound mail goes through Resend (2026-04-27 — Marcin verified the
 * handypioneers.com domain there). This function used to spool through the
 * Gmail API; it now delegates to the canonical Resend wrapper but keeps the
 * same `{ messageId, threadId }` return shape so the 27 existing call sites
 * compile without touching them. `threadId` becomes empty — Resend has no
 * thread concept; the few callers that record it tolerate "" already.
 *
 * Inbound mail (pollInboundEmails) still uses Gmail OAuth; this is outbound-only.
 */
export async function sendEmail(params: {
  fromEmail?: string;
  to: string;
  subject: string;
  body?: string;
  html?: string;
  /** Legacy Gmail thread id — ignored; kept for signature compatibility. */
  threadId?: string;
  /** Legacy Gmail In-Reply-To — ignored; kept for signature compatibility. */
  inReplyTo?: string;
}): Promise<{ messageId: string; threadId: string }> {
  const { sendEmailViaResend } = await import("./lib/email/resend");
  // If a caller specified a fromEmail explicitly, honour it. Otherwise let the
  // Resend wrapper apply the default (`Handy Pioneers <noreply@handypioneers.com>`).
  const from = params.fromEmail
    ? `Handy Pioneers <${params.fromEmail}>`
    : undefined;

  const result = await sendEmailViaResend({
    to: params.to,
    subject: params.subject,
    html: params.html,
    body: params.body,
    from,
  });

  return { messageId: result.id, threadId: "" };
}

// ─── Poll Inbound Emails ──────────────────────────────────────────────────────
// Called on a schedule (e.g. every 2 minutes) to check for new emails.

// Track whether we've already logged the "not connected" state — repeating it
// every poll tick floods Railway logs (and at warn level it shows as an error).
let gmailNotConnectedLogged = false;

export async function pollInboundEmails(fromEmail: string, afterHistoryId?: string): Promise<void> {
  let gmail: ReturnType<typeof google.gmail>;
  try {
    gmail = await getGmailClient(fromEmail);
    gmailNotConnectedLogged = false;
  } catch {
    if (!gmailNotConnectedLogged) {
      console.log("[Gmail] Not connected, skipping poll (further notices suppressed until reconnected)");
      gmailNotConnectedLogged = true;
    }
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

      // Only process emails from known customers — skip newsletters, vendors, etc.
      const customer = await findCustomerByEmail(senderEmail);
      if (!customer) {
        console.log(`[Gmail] Skipping non-customer email from ${senderEmail}: ${subject}`);
        // Still mark as read so we don't re-process on next poll
        await gmail.users.messages.modify({
          userId: "me",
          id: msgRef.id,
          requestBody: { removeLabelIds: ["UNREAD"] },
        });
        continue;
      }

      // Find or create conversation linked to this customer
      const conv = await findOrCreateConversation(null, senderEmail, senderName || null, customer.id);

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

      console.log(`[Gmail] Processed inbound email from ${senderEmail} (customer: ${customer.id}): ${subject}`);
    }
  } catch (err) {
    console.error("[Gmail] Poll error:", err);
  }
}

// ─── Overdue Invoice Reminder Email ──────────────────────────────────────────

/**
 * Sends an HP-branded overdue reminder email to a portal customer.
 * @param to          Customer email address
 * @param customerName Customer's display name
 * @param invoiceNumber e.g. "INV-2026-001"
 * @param amountDueCents Amount still owed in cents
 * @param dueDate     The original due date
 * @param portalInvoiceId  DB id of the portalInvoice row (used to build the Pay Now link)
 * @param origin      Frontend origin, e.g. "https://client.handypioneers.com"
 */
export async function sendOverdueReminderEmail({
  to,
  customerName,
  invoiceNumber,
  amountDueCents,
  dueDate,
  portalInvoiceId,
  origin,
}: {
  to: string;
  customerName: string;
  invoiceNumber: string;
  amountDueCents: number;
  dueDate: Date | null;
  portalInvoiceId: number;
  origin: string;
}): Promise<void> {
  const amountStr = `$${(amountDueCents / 100).toFixed(2)}`;
  const dueDateStr = dueDate
    ? dueDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "a past date";
  const payUrl = `${origin}/portal/invoices/${portalInvoiceId}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#f5f5f0;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f0;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#2D5016;padding:28px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">Handy Pioneers</span><br/>
                  <span style="color:#a8c47a;font-size:12px;">Field Estimator &amp; Customer Portal</span>
                </td>
                <td align="right">
                  <span style="background:#c8922a;color:#fff;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:700;">PAYMENT OVERDUE</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Hi ${customerName},</p>
            <p style="margin:0 0 24px;font-size:15px;color:#444;line-height:1.6;">
              This is a friendly reminder that invoice <strong>${invoiceNumber}</strong> for
              <strong>${amountStr}</strong> was due on <strong>${dueDateStr}</strong> and
              remains unpaid. Please take a moment to settle the balance at your earliest convenience.
            </p>
            <!-- Invoice summary box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f2;border:1px solid #e8e0d0;border-radius:8px;margin-bottom:28px;">
              <tr>
                <td style="padding:20px 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="font-size:13px;color:#666;padding-bottom:8px;">Invoice</td>
                      <td align="right" style="font-size:13px;color:#1a1a1a;font-weight:600;padding-bottom:8px;">${invoiceNumber}</td>
                    </tr>
                    <tr>
                      <td style="font-size:13px;color:#666;padding-bottom:8px;">Amount Due</td>
                      <td align="right" style="font-size:15px;color:#c8922a;font-weight:700;padding-bottom:8px;">${amountStr}</td>
                    </tr>
                    <tr>
                      <td style="font-size:13px;color:#666;">Due Date</td>
                      <td align="right" style="font-size:13px;color:#e53e3e;font-weight:600;">${dueDateStr}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
            <!-- CTA -->
            <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                <td style="background:#2D5016;border-radius:8px;padding:14px 32px;">
                  <a href="${payUrl}" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">
                    Pay Now — ${amountStr}
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:13px;color:#888;line-height:1.6;">
              If you've already sent payment or have questions, please reply to this email or
              call us at <strong>(360) 544-9858</strong>. We're happy to help.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9f7f2;border-top:1px solid #e8e0d0;padding:20px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#aaa;">
              Handy Pioneers · 808 SE Chkalov Dr 3-433, Vancouver, WA 98683<br/>
              <a href="${origin}/portal" style="color:#2D5016;text-decoration:none;">View your portal</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await sendEmail({
    to,
    subject: `[Overdue] Invoice ${invoiceNumber} — ${amountStr} past due`,
    html,
  });
}
