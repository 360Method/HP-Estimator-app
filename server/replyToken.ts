/**
 * Reply-token utilities — encode/decode the unique tracking ID embedded in
 * customer-facing email subjects so inbound replies route back to the right
 * opportunity even when the customer replies natively from Gmail (different
 * email address, missing portal session, etc.).
 *
 * Wire format inside the subject:    `[#abc123]`
 * Token payload (base64url):         `${opportunityId}_${customerId}`
 *
 * The token is also persisted on `messages.replyToken` so portal replies can
 * be threaded with their Gmail-side counterparts.
 */

const SUBJECT_RE = /\[#([A-Za-z0-9_-]+)\]/;

export interface ReplyTokenPayload {
  opportunityId: string;
  customerId: string;
}

// nanoid's default alphabet includes `_` and `-`, so we use `|` as the
// separator — it never appears in opportunity/customer IDs or in the
// base64url alphabet, so decoding is unambiguous.
const SEPARATOR = "|";

/** Encode `{opportunityId, customerId}` to a URL-safe base64 token. */
export function encodeReplyToken(p: ReplyTokenPayload): string {
  const raw = `${p.opportunityId}${SEPARATOR}${p.customerId}`;
  return Buffer.from(raw, "utf-8").toString("base64url");
}

/** Decode a token back to `{opportunityId, customerId}`, or null on failure. */
export function decodeReplyToken(token: string): ReplyTokenPayload | null {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf-8");
    const idx = raw.indexOf(SEPARATOR);
    if (idx <= 0 || idx === raw.length - 1) return null;
    const opportunityId = raw.slice(0, idx);
    const customerId = raw.slice(idx + 1);
    if (!opportunityId || !customerId) return null;
    return { opportunityId, customerId };
  } catch {
    return null;
  }
}

/** Pull the `[#token]` out of a subject line; returns the raw token or null. */
export function extractReplyTokenFromSubject(subject: string | null | undefined): string | null {
  if (!subject) return null;
  const m = subject.match(SUBJECT_RE);
  return m?.[1] ?? null;
}

/** Append `[#token]` to a subject (idempotent — won't double-stamp). */
export function injectReplyTokenIntoSubject(subject: string, token: string): string {
  if (extractReplyTokenFromSubject(subject)) return subject;
  return `${subject} [#${token}]`;
}

/** Build the URL the portal CTA points at. The token doubles as the threadId
 *  so the portal page can scope to a single thread without leaking IDs. */
export function buildPortalThreadUrl(token: string, origin?: string): string {
  const base = origin ?? process.env.PORTAL_ORIGIN ?? "https://client.handypioneers.com";
  return `${base.replace(/\/+$/, "")}/portal/communications/${token}`;
}
