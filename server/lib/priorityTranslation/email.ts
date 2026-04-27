/**
 * server/lib/priorityTranslation/email.ts
 *
 * Email delivery for the 360° Priority Translation. Uses Resend REST API
 * directly (no extra SDK dep). Two modes:
 *
 *   • sendPriorityTranslationReady() — to the homeowner, includes magic-link
 *     + PDF attachment.
 *   • sendInternalNotification() — CC to sales@handypioneers.com so the team
 *     has a record without watching a queue.
 *
 * TODO: move to CMS (nucleus) — email subject, body template, from-address,
 * CC list. For now hardcoded and flagged.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

type SendArgs = {
  apiKey: string;
  to: string;
  firstName: string;
  /**
   * Where the email CTA sends the homeowner. Currently points at the public
   * post-submit confirmation page (/portal/roadmap/submitted/:id) — no auth
   * required, page reads live status. Argument is kept as `magicLinkUrl` to
   * avoid a breaking signature change for any other caller; the value is the
   * roadmap-view URL.
   */
  magicLinkUrl: string;
  pdfBuffer: Uint8Array;
  propertyAddress: string;
  fromAddress?: string;
  ccAddresses?: string[];
};

export async function sendPriorityTranslationReady(args: SendArgs): Promise<{ id: string }> {
  const body = {
    from: args.fromAddress || "Handy Pioneers <noreply@handypioneers.com>",
    to: [args.to],
    cc: args.ccAddresses ?? ["sales@handypioneers.com"],
    subject: "Your 360° Roadmap is ready",
    html: renderHtml({
      firstName: args.firstName,
      magicLinkUrl: args.magicLinkUrl,
      propertyAddress: args.propertyAddress,
    }),
    text: renderText({
      firstName: args.firstName,
      magicLinkUrl: args.magicLinkUrl,
      propertyAddress: args.propertyAddress,
    }),
    attachments: [
      {
        filename: "360-roadmap.pdf",
        content: Buffer.from(args.pdfBuffer).toString("base64"),
      },
    ],
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
    const text = await res.text();
    throw new Error(`Resend returned ${res.status}: ${text}`);
  }
  return (await res.json()) as { id: string };
}

// ─── Templates ──────────────────────────────────────────────────────────────
// Voice-scrubbed. No forbidden words (handyman/estimate/free/cheap/affordable/
// budget/fix/repair/simple/easy/best).
function renderHtml(args: { firstName: string; magicLinkUrl: string; propertyAddress: string }) {
  return `<!doctype html>
<html><body style="font-family: Georgia, serif; color: #1a2d24; background: #faf8f3; padding: 32px; max-width: 560px; margin: 0 auto;">
  <p style="font-size: 10px; letter-spacing: 2px; color: #c8892a; text-transform: uppercase;">Handy Pioneers · 360° Method</p>
  <h1 style="font-size: 28px; line-height: 1.2; margin: 12px 0 20px;">Your 360° Roadmap is ready, ${escapeHtml(args.firstName) || "there"}.</h1>
  <p style="font-size: 15px; line-height: 1.6;">
    The roadmap for <strong>${escapeHtml(args.propertyAddress)}</strong> is attached
    to this email. The full status, prioritized findings, and a link to your
    private 360° home health record live on your roadmap page.
  </p>
  <p style="margin: 28px 0;">
    <a href="${args.magicLinkUrl}"
       style="background: #c8892a; color: #1a2d24; text-decoration: none; padding: 14px 24px; border-radius: 6px; font-weight: bold; letter-spacing: 0.08em; text-transform: uppercase; font-size: 14px;">
      View Your Roadmap
    </a>
  </p>
  <p style="font-size: 12px; color: #6a6a62; line-height: 1.5;">
    Your roadmap PDF is attached to this email for your records. A member of
    our Concierge team will reach out within one business day to walk through
    the findings with you.
  </p>
  <hr style="border: 0; border-top: 1px solid #e0dcc8; margin: 32px 0;">
  <p style="font-size: 11px; color: #6a6a62; line-height: 1.5;">
    The 360° Roadmap summarizes the inspection report you provided. It is not
    a legal home inspection and does not replace a licensed home inspector's
    findings. Questions?
    <a href="mailto:help@handypioneers.com" style="color: #c8892a;">help@handypioneers.com</a>
  </p>
</body></html>`;
}

function renderText(args: { firstName: string; magicLinkUrl: string; propertyAddress: string }) {
  return [
    `Your 360° Roadmap is ready, ${args.firstName || "there"}.`,
    "",
    `The roadmap for ${args.propertyAddress} is attached to this email. The full status, prioritized findings, and a link to your private 360° home health record live on your roadmap page.`,
    "",
    `View your roadmap: ${args.magicLinkUrl}`,
    "",
    `Your roadmap PDF is attached to this email for your records. A member of our Concierge team will reach out within one business day to walk through the findings with you.`,
    "",
    `The 360° Roadmap summarizes the inspection report you provided. It is not a legal home inspection and does not replace a licensed home inspector's findings.`,
    "",
    `Questions? help@handypioneers.com`,
  ].join("\n");
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
