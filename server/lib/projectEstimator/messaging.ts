/**
 * server/lib/projectEstimator/messaging.ts
 *
 * Customer-facing message templates for the Book Consultation pipeline.
 * Stewardship voice. Keep these paste-ready — the auto-ack at T+0 is sent
 * directly; later cadence steps queue as agentDrafts for human approval.
 */

const ESCAPE_HTML: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPE_HTML[c]);
}

const PORTAL_BASE = process.env.PORTAL_BASE_URL || "https://client.handypioneers.com";

// ─── T+0 Concierge auto-ack ─────────────────────────────────────────────────
export function buildAutoAckEmail(args: {
  firstName: string;
  serviceType: string;
  portalUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = "Your project request is in our care";
  const html = `<!doctype html>
<html><body style="font-family: Georgia, serif; color: #1a2d24; background: #faf8f3; padding: 32px; max-width: 560px; margin: 0 auto;">
  <p style="font-size: 10px; letter-spacing: 2px; color: #c8892a; text-transform: uppercase; margin: 0 0 8px;">Handy Pioneers · 360° Method</p>
  <h1 style="font-size: 28px; line-height: 1.25; margin: 12px 0 20px; font-weight: normal;">Your project request is in our care, ${esc(args.firstName) || "there"}.</h1>
  <p style="font-size: 15px; line-height: 1.7;">
    Thank you for thinking of us for <strong>${esc(args.serviceType)}</strong>. We treat every property as if it were our own, so the first step is making sure we understand exactly what you have in mind.
  </p>
  <p style="font-size: 15px; line-height: 1.7;">
    A member of our Concierge team is reviewing your details now. You'll hear from us personally within one business day — by text or email, whichever you prefer.
  </p>
  <p style="font-size: 15px; line-height: 1.7;">
    If your project is straightforward, you'll see an investment range in your portal within forty-eight hours. If we'd benefit from additional context — a photo, a measurement, or a brief walkthrough — your Concierge will let you know what would help.
  </p>
  <p style="margin: 28px 0;">
    <a href="${args.portalUrl}"
       style="background: #c8892a; color: #1a2d24; text-decoration: none; padding: 14px 24px; border-radius: 6px; font-weight: bold; letter-spacing: 0.08em; text-transform: uppercase; font-size: 14px;">
      Open Your Portal
    </a>
  </p>
  <p style="font-size: 13px; line-height: 1.6; color: #6a6a62;">
    Your portal is the living record for this project — every photo, every conversation, every step. While we prepare your range, you're welcome to preview what ongoing 360° Method stewardship looks like.
  </p>
  <hr style="border: 0; border-top: 1px solid #e0dcc8; margin: 32px 0;">
  <p style="font-size: 11px; color: #6a6a62; line-height: 1.6;">
    Questions? Reply directly to this email or reach <a href="mailto:help@handypioneers.com" style="color: #c8892a;">help@handypioneers.com</a>.
  </p>
</body></html>`;
  const text = [
    `Your project request is in our care, ${args.firstName || "there"}.`,
    "",
    `Thank you for thinking of us for ${args.serviceType}. We treat every property as if it were our own, so the first step is making sure we understand exactly what you have in mind.`,
    "",
    `A member of our Concierge team is reviewing your details now. You'll hear from us personally within one business day — by text or email, whichever you prefer.`,
    "",
    `If your project is straightforward, you'll see an investment range in your portal within forty-eight hours. If we'd benefit from additional context — a photo, a measurement, or a brief walkthrough — your Concierge will let you know what would help.`,
    "",
    `Open your portal: ${args.portalUrl}`,
    "",
    `Questions? Reply directly to this email or reach help@handypioneers.com.`,
  ].join("\n");
  return { subject, html, text };
}

export function buildAutoAckSms(args: { firstName: string }): string {
  const name = args.firstName?.trim();
  return `Hi${name ? ` ${name}` : ""}, this is Handy Pioneers — your project request landed and is in our care. Your Concierge will reach out within one business day. Reply STOP to opt out.`;
}

// ─── T+24h Estimate ready (high confidence) ─────────────────────────────────
export function buildEstimateReadyEmail(args: {
  firstName: string;
  scopeSummary: string;
  rangeLow: number;
  rangeHigh: number;
  portalProjectUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = "Your project investment range is ready";
  const fmtRange = `$${args.rangeLow.toLocaleString()} – $${args.rangeHigh.toLocaleString()}`;
  const html = `<!doctype html>
<html><body style="font-family: Georgia, serif; color: #1a2d24; background: #faf8f3; padding: 32px; max-width: 560px; margin: 0 auto;">
  <p style="font-size: 10px; letter-spacing: 2px; color: #c8892a; text-transform: uppercase; margin: 0 0 8px;">Handy Pioneers · 360° Method</p>
  <h1 style="font-size: 28px; line-height: 1.25; margin: 12px 0 20px; font-weight: normal;">Your investment range is ready, ${esc(args.firstName) || "there"}.</h1>
  <p style="font-size: 15px; line-height: 1.7;">
    ${esc(args.scopeSummary)}
  </p>
  <p style="font-size: 22px; line-height: 1.4; margin: 24px 0; color: #1a2d24;">
    <strong>${fmtRange}</strong>
  </p>
  <p style="font-size: 13px; line-height: 1.6; color: #6a6a62;">
    Your private project page in the portal has the full scope, what's included, and two next-step options: proceed when you're ready, or schedule a brief walkthrough first.
  </p>
  <p style="margin: 28px 0;">
    <a href="${args.portalProjectUrl}"
       style="background: #c8892a; color: #1a2d24; text-decoration: none; padding: 14px 24px; border-radius: 6px; font-weight: bold; letter-spacing: 0.08em; text-transform: uppercase; font-size: 14px;">
      Open Your Project
    </a>
  </p>
  <hr style="border: 0; border-top: 1px solid #e0dcc8; margin: 32px 0;">
  <p style="font-size: 11px; color: #6a6a62; line-height: 1.6;">
    Questions? Reply to this email or reach <a href="mailto:help@handypioneers.com" style="color: #c8892a;">help@handypioneers.com</a>.
  </p>
</body></html>`;
  const text = [
    `Your investment range is ready, ${args.firstName || "there"}.`,
    "",
    args.scopeSummary,
    "",
    `Investment range: ${fmtRange}`,
    "",
    `Your private project page has the full scope and your two next-step options:`,
    args.portalProjectUrl,
    "",
    `Questions? Reply to this email or reach help@handypioneers.com.`,
  ].join("\n");
  return { subject, html, text };
}

// ─── Nurturer missing-info draft ────────────────────────────────────────────
export function buildMissingInfoDraft(args: {
  firstName: string;
  questions: string[];
}): { subject: string; body: string } {
  const subject = "A few quick questions before we put your range together";
  const intro = `Hi ${args.firstName || "there"},`;
  const middle = `Before we put together a thoughtful investment range for you, may I ask:`;
  const list = args.questions
    .filter(Boolean)
    .map((q, i) => `${i + 1}. ${q}`)
    .join("\n");
  const close = `Reply when you have a moment — even a quick photo or a short note helps us be precise on your behalf.\n\nWith care,\nYour Handy Pioneers Concierge`;
  const body = [intro, "", middle, "", list, "", close].join("\n");
  return { subject, body };
}

// ─── T+4h Concierge personal follow-up draft ────────────────────────────────
export function buildConciergePersonalFollowupDraft(args: {
  firstName: string;
  serviceType: string;
}): { body: string } {
  const body = `Hi ${args.firstName || "there"} — checking in personally on your ${args.serviceType.toLowerCase()} request. We're putting your project in front of the right person on our team. If anything's changed since you submitted, or if there's a photo or detail that would help us, send it whenever it's convenient. — Your Handy Pioneers Concierge`;
  return { body };
}

// ─── T+48h Estimate-view nudge draft ────────────────────────────────────────
export function buildEstimateViewNudgeDraft(args: {
  firstName: string;
  portalProjectUrl: string;
}): { subject: string; body: string } {
  const subject = "Your project is waiting in your portal whenever you're ready";
  const body = `Hi ${args.firstName || "there"},

Your investment range and full scope are ready in your portal. No rush — when you have a quiet moment to read through, the page also lays out two options: proceed, or schedule a brief walkthrough so we can confirm scope on-site first.

${args.portalProjectUrl}

Either path is welcome. Whatever feels right for you.

With care,
Your Handy Pioneers Concierge`;
  return { subject, body };
}

// ─── T+5d Membership intro draft ────────────────────────────────────────────
export function buildMembershipIntroDraft(args: { firstName: string }): {
  subject: string;
  body: string;
} {
  const subject = "An invitation to ongoing 360° stewardship";
  const body = `Hi ${args.firstName || "there"},

While we wrap up your project, I wanted to share something most of our clients ask about within their first year with us: the 360° Method. It's the way Handy Pioneers becomes the steward of your home year-round — proactive return visits, a living maintenance record, and one trusted point of contact for everything property-related.

It isn't a sales pitch — most of our 360° members started exactly where you are, with a single project, and chose to stay. There's a short overview waiting for you in your portal under "360° Membership" whenever you'd like to read.

With care,
Your Handy Pioneers Concierge`;
  return { subject, body };
}

// ─── T+10d Long-term nurture draft ──────────────────────────────────────────
export function buildLongTermNurtureDraft(args: { firstName: string }): {
  subject: string;
  body: string;
} {
  const subject = "Whenever you're ready, we're here";
  const body = `Hi ${args.firstName || "there"},

Just a brief note — your project remains in your portal whenever the timing is right for you. There's no expiration, and the scope and range we put together for you are still good. If something has changed about the project or you'd like us to revisit any details, a single reply gets us back in motion.

With care,
Your Handy Pioneers Concierge`;
  return { subject, body };
}

// ─── Resend wrapper ─────────────────────────────────────────────────────────

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendEmailViaResend(args: {
  apiKey: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  fromAddress?: string;
}): Promise<{ id: string }> {
  const body = {
    from: args.fromAddress || "Handy Pioneers <noreply@handypioneers.com>",
    to: [args.to],
    subject: args.subject,
    html: args.html,
    text: args.text,
  };
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Resend ${res.status}: ${t}`);
  }
  return (await res.json()) as { id: string };
}

export const PORTAL_BASE_URL = PORTAL_BASE;
