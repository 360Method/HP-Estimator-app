/**
 * server/lib/email/resend.ts
 *
 * Canonical Resend transport for ALL outbound mail. Replaced the Gmail API
 * send path (2026-04-27) — Marcin verified handypioneers.com on Resend and
 * standardised the sender addresses below.
 *
 * From-address conventions:
 *   - transactional   noreply@handypioneers.com   (default)
 *   - concierge       concierge@handypioneers.com (set voice="concierge"
 *                                                  for human-tone customer mail)
 *
 * CC convention:
 *   - ccHelp=true     adds help@handypioneers.com so the team has a record
 *                     of customer-facing sends without watching a queue.
 *
 * The legacy `server/gmail.ts:sendEmail` and `server/leadRouting.ts:
 * sendResendEmail` are thin shims around `sendEmailViaResend` to keep the
 * existing call-site signatures intact.
 *
 * Inbound mail still flows through Gmail OAuth (see pollInboundEmails) — this
 * file is outbound-only.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

const FROM_TRANSACTIONAL = "Handy Pioneers <noreply@handypioneers.com>";
const FROM_CONCIERGE = "Handy Pioneers Concierge <concierge@handypioneers.com>";
const HELP_INBOX = "help@handypioneers.com";

export type ResendVoice = "transactional" | "concierge";

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  /** HTML body. If omitted but `body` is provided, the text is auto-wrapped. */
  html?: string;
  /** Plain-text body. Used as the text alternative; auto-derived from html if omitted. */
  body?: string;
  /** Custom from address. Overrides `voice`. */
  from?: string;
  /** Sender style — picks a default from address if `from` is omitted. */
  voice?: ResendVoice;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  /** Convenience: CC help@handypioneers.com so the team has a record. */
  ccHelp?: boolean;
  attachments?: Array<{ filename: string; content: string }>;
}

export interface SendEmailResult {
  /** Resend's UUID for the message. */
  id: string;
}

/**
 * True iff the Resend API key is present in the environment. Send gates use
 * this; the actual domain verification status is checked by Resend at send
 * time and surfaces as an error if mis-configured.
 */
export function isResendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

/**
 * Send an email through Resend. Throws with a clear, actionable message when
 * the API key is missing or Resend rejects the request.
 */
export async function sendEmailViaResend(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "resend_not_configured: RESEND_API_KEY is not set. Action: in Railway → " +
        "Variables, add RESEND_API_KEY (https://resend.com/api-keys) and verify " +
        "handypioneers.com at https://resend.com/domains.",
    );
  }

  const from =
    params.from ??
    (params.voice === "concierge" ? FROM_CONCIERGE : FROM_TRANSACTIONAL);
  const to = Array.isArray(params.to) ? params.to : [params.to];

  const cc: string[] = [];
  if (params.cc) {
    const list = Array.isArray(params.cc) ? params.cc : [params.cc];
    cc.push(...list);
  }
  if (params.ccHelp && !cc.includes(HELP_INBOX)) {
    cc.push(HELP_INBOX);
  }

  const html = params.html ?? (params.body ? plainToHtml(params.body) : "");
  const text = params.body ?? (params.html ? params.html.replace(/<[^>]+>/g, "") : "");

  const payload: Record<string, unknown> = {
    from,
    to,
    subject: params.subject,
    html,
    text,
  };
  if (cc.length > 0) payload.cc = cc;
  if (params.bcc) payload.bcc = Array.isArray(params.bcc) ? params.bcc : [params.bcc];
  if (params.replyTo) payload.reply_to = params.replyTo;
  if (params.attachments && params.attachments.length > 0) {
    payload.attachments = params.attachments;
  }

  let res: Response;
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[Resend] sendEmail to ${to.join(",")} NETWORK error: ${reason}`);
    throw new Error(`resend_network_error: ${reason}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(
      `[Resend] sendEmail to ${to.join(",")} REJECTED ${res.status}: ${body.slice(0, 400)}`,
    );
    throw new Error(`resend_rejected_${res.status}: ${body.slice(0, 200)}`);
  }

  const out = (await res.json()) as { id: string };
  console.log(
    `[Resend] sent OK to=${to.join(",")} subject="${params.subject}" id=${out.id}`,
  );
  return out;
}

function plainToHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");
}
