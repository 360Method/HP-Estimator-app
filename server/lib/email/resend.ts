/**
 * server/lib/email/resend.ts
 *
 * Canonical Resend transport for ALL outbound mail. Replaced the Gmail API
 * send path (2026-04-27) — Marcin verified handypioneers.com on Resend.
 *
 * From-address conventions (2026-04-27 update — single mailbox, no Workspace
 * setup needed):
 *   - default      help@handypioneers.com   — used for every customer-facing
 *                                              send. Marcin already monitors
 *                                              this mailbox; replies land in
 *                                              Gmail and the inbound poller
 *                                              picks them up into the
 *                                              customer's Communications
 *                                              timeline.
 *   - transactional noreply@handypioneers.com — RESERVED for sends where a
 *                                              reply makes no sense
 *                                              (magic-link login, password
 *                                              reset, system status). Pass
 *                                              voice="transactional" to opt
 *                                              in.
 *
 * Reply-To is always set to help@handypioneers.com so customer replies route
 * to the operator inbox even when the From is noreply@.
 *
 * CC convention:
 *   - ccHelp=true     adds help@ to the visible CC list when the From is not
 *                     already help@ (no-op when the default sender is used).
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

const HELP_INBOX = "help@handypioneers.com";
const FROM_DEFAULT = "Handy Pioneers <help@handypioneers.com>";
const FROM_TRANSACTIONAL = "Handy Pioneers <noreply@handypioneers.com>";

// ─── Staging email guard ──────────────────────────────────────────────────────
// Staging runs with NODE_ENV=production (Railway env is "production"), so we key
// off the auto-injected RAILWAY_SERVICE_NAME instead (staging service is
// "hp-estimator-staging"). In safe mode no real customer can be emailed from a
// non-prod box, no matter what address is in the prod-copied DB: any recipient
// not already on @handypioneers.com is rewritten to a deliverable sink on our own
// domain, and the subject is prefixed with the intended target. EMAIL_SAFE_MODE
// forces the guard on (=1) or off (=0) for local/manual testing.
const STAGING_EMAIL_SINK = "staging-sink@handypioneers.com";

function isEmailSafeMode(): boolean {
  if (process.env.EMAIL_SAFE_MODE === "1") return true;
  if (process.env.EMAIL_SAFE_MODE === "0") return false;
  return (process.env.RAILWAY_SERVICE_NAME ?? "").toLowerCase().includes("staging");
}

function addrOf(recipient: string): string {
  return (recipient.match(/<(.+?)>/)?.[1] ?? recipient).trim().toLowerCase();
}

function isInternalAddr(recipient: string): boolean {
  return addrOf(recipient).endsWith("@handypioneers.com");
}

/**
 * In safe mode, rewrite recipient lists so only @handypioneers.com addresses pass
 * through; everything else collapses to the sink. Returns the filtered list plus
 * the external addresses that were redirected (for the subject prefix / logging).
 */
function guardRecipients(list: string[]): { out: string[]; redirected: string[] } {
  const kept: string[] = [];
  const redirected: string[] = [];
  for (const r of list) {
    if (isInternalAddr(r)) kept.push(r);
    else redirected.push(addrOf(r));
  }
  if (redirected.length > 0 && !kept.includes(STAGING_EMAIL_SINK)) {
    kept.push(STAGING_EMAIL_SINK);
  }
  return { out: kept, redirected };
}

export type ResendVoice = "transactional" | "concierge" | "default";

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
  /**
   * Raw email headers (e.g. `In-Reply-To`, `References`) — used when sending
   * a reply that should thread inside the customer's mail client and inside
   * Gmail when our inbound poller catches the reply.
   */
  headers?: Record<string, string>;
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
    (params.voice === "transactional" ? FROM_TRANSACTIONAL : FROM_DEFAULT);
  // Reply-To always points at help@ so replies route to the operator inbox
  // even when the From address is noreply@. The Gmail OAuth poller picks the
  // reply up and writes it to the customer's Communications timeline.
  const replyTo = params.replyTo ?? HELP_INBOX;
  const to = Array.isArray(params.to) ? params.to : [params.to];

  const cc: string[] = [];
  if (params.cc) {
    const list = Array.isArray(params.cc) ? params.cc : [params.cc];
    cc.push(...list);
  }
  if (params.ccHelp && !cc.includes(HELP_INBOX) && !from.includes(HELP_INBOX)) {
    cc.push(HELP_INBOX);
  }

  const html = params.html ?? (params.body ? plainToHtml(params.body) : "");
  const text = params.body ?? (params.html ? params.html.replace(/<[^>]+>/g, "") : "");

  // Staging guard: never deliver to a real customer from a non-prod box.
  let subject = params.subject;
  let bcc = params.bcc ? (Array.isArray(params.bcc) ? params.bcc : [params.bcc]) : [];
  let outTo = to;
  let outCc = cc;
  if (isEmailSafeMode()) {
    const guardedTo = guardRecipients(to);
    const guardedCc = guardRecipients(cc);
    const guardedBcc = guardRecipients(bcc);
    outTo = guardedTo.out;
    outCc = guardedCc.out;
    bcc = guardedBcc.out;
    const redirected = [
      ...guardedTo.redirected,
      ...guardedCc.redirected,
      ...guardedBcc.redirected,
    ];
    subject = redirected.length > 0
      ? `[STAGING → ${redirected.join(", ")}] ${subject}`
      : `[STAGING] ${subject}`;
    // A send addressed only to externals must still go somewhere valid.
    if (outTo.length === 0) outTo = [STAGING_EMAIL_SINK];
  }

  const payload: Record<string, unknown> = {
    from,
    to: outTo,
    subject,
    html,
    text,
    reply_to: replyTo,
  };
  if (outCc.length > 0) payload.cc = outCc;
  if (bcc.length > 0) payload.bcc = bcc;
  if (params.attachments && params.attachments.length > 0) {
    payload.attachments = params.attachments;
  }
  if (params.headers) {
    // Resend forwards a `headers` object verbatim — used for In-Reply-To /
    // References when sending a customer reply from the unified comms hub.
    payload.headers = params.headers;
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
    console.error(`[Resend] sendEmail to ${outTo.join(",")} NETWORK error: ${reason}`);
    throw new Error(`resend_network_error: ${reason}`);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(
      `[Resend] sendEmail to ${outTo.join(",")} REJECTED ${res.status}: ${body.slice(0, 400)}`,
    );
    throw new Error(`resend_rejected_${res.status}: ${body.slice(0, 200)}`);
  }

  const out = (await res.json()) as { id: string };
  console.log(
    `[Resend] sent OK to=${outTo.join(",")} subject="${subject}" id=${out.id}`,
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
