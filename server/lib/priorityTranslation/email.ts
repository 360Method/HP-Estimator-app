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
  magicLinkUrl: string;
  pdfBuffer: Uint8Array;
  propertyAddress: string;
  /**
   * Marcin's personal note, appended under his signature. Null/empty means
   * he didn't leave one — the email still sends, just without the note block.
   */
  reviewNote?: string | null;
  fromAddress?: string;
  ccAddresses?: string[];
};

export async function sendPriorityTranslationReady(args: SendArgs): Promise<{ id: string }> {
  // Voice update: signed by Marcin, not "The Handy Pioneers Team". The
  // subject and opening line reference human involvement explicitly, so the
  // customer knows a person reviewed their roadmap before it was sent.
  const body = {
    from: args.fromAddress || "Marcin at Handy Pioneers <marcin@handypioneers.com>",
    to: [args.to],
    cc: args.ccAddresses ?? ["sales@handypioneers.com"],
    subject: "Your 360° Roadmap — personally reviewed",
    html: renderHtml({
      firstName: args.firstName,
      magicLinkUrl: args.magicLinkUrl,
      propertyAddress: args.propertyAddress,
      reviewNote: args.reviewNote ?? null,
    }),
    text: renderText({
      firstName: args.firstName,
      magicLinkUrl: args.magicLinkUrl,
      propertyAddress: args.propertyAddress,
      reviewNote: args.reviewNote ?? null,
    }),
    attachments: [
      {
        filename: "360-priority-roadmap.pdf",
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
// budget/fix/repair/simple/easy/best). Signed "Marcin" (not "The HP Team")
// because this email is meant to feel personal — a human reviewed the
// roadmap before it was sent.
type TemplateArgs = {
  firstName: string;
  magicLinkUrl: string;
  propertyAddress: string;
  reviewNote: string | null;
};

function renderHtml(args: TemplateArgs) {
  const noteBlock = args.reviewNote && args.reviewNote.trim().length > 0
    ? `<div style="margin: 24px 0; padding: 16px 20px; border-left: 3px solid #c8892a; background: #fffaf0; font-size: 15px; line-height: 1.6; color: #1a2d24;">
         <div style="font-size: 10px; letter-spacing: 2px; color: #c8892a; text-transform: uppercase; margin-bottom: 6px;">A note from Marcin</div>
         ${escapeHtml(args.reviewNote).replace(/\n/g, "<br>")}
       </div>`
    : "";

  return `<!doctype html>
<html><body style="font-family: Georgia, serif; color: #1a2d24; background: #faf8f3; padding: 32px; max-width: 560px; margin: 0 auto;">
  <p style="font-size: 10px; letter-spacing: 2px; color: #c8892a; text-transform: uppercase;">Handy Pioneers · 360° Method</p>
  <h1 style="font-size: 28px; line-height: 1.2; margin: 12px 0 20px;">Your 360° Roadmap is ready, ${escapeHtml(args.firstName) || "there"}.</h1>
  <p style="font-size: 15px; line-height: 1.6;">
    I reviewed your inspection report findings myself before sending this over.
    The roadmap for <strong>${escapeHtml(args.propertyAddress)}</strong> now lives in
    your private 360° client portal — a living health record for your property,
    with every finding and every return visit in one place.
  </p>
  ${noteBlock}
  <p style="margin: 28px 0;">
    <a href="${args.magicLinkUrl}"
       style="background: #c8892a; color: #1a2d24; text-decoration: none; padding: 14px 24px; border-radius: 6px; font-weight: bold; letter-spacing: 0.08em; text-transform: uppercase; font-size: 14px;">
      Open Your Portal
    </a>
  </p>
  <p style="font-size: 12px; color: #6a6a62; line-height: 1.5;">
    This link is valid for 7 days and opens your portal without a password.
    For convenience, your roadmap PDF is also attached to this email.
  </p>
  <p style="font-size: 15px; line-height: 1.6; margin-top: 28px;">
    If any of the priorities surprise you — or if you'd like to walk through them
    together — just reply. I read every reply.
  </p>
  <p style="font-size: 15px; line-height: 1.6; margin-top: 8px;">
    — Marcin<br>
    <span style="font-size: 12px; color: #6a6a62;">Owner, Handy Pioneers</span>
  </p>
  <hr style="border: 0; border-top: 1px solid #e0dcc8; margin: 32px 0;">
  <p style="font-size: 11px; color: #6a6a62; line-height: 1.5;">
    The 360° Roadmap summarizes the inspection report you provided. It is not a
    legal home inspection and does not replace a licensed home inspector's
    findings. Questions?
    <a href="mailto:help@handypioneers.com" style="color: #c8892a;">help@handypioneers.com</a>
  </p>
</body></html>`;
}

function renderText(args: TemplateArgs) {
  const noteBlock = args.reviewNote && args.reviewNote.trim().length > 0
    ? [`A note from Marcin:`, args.reviewNote.trim(), ""]
    : [];
  return [
    `Your 360° Roadmap is ready, ${args.firstName || "there"}.`,
    "",
    `I reviewed your inspection report findings myself before sending this over. The roadmap for ${args.propertyAddress} now lives in your private 360° client portal — a living health record for your property, with every finding and every return visit in one place.`,
    "",
    ...noteBlock,
    `Open your portal: ${args.magicLinkUrl}`,
    "",
    `This link is valid for 7 days and opens your portal without a password. Your roadmap PDF is also attached to this email.`,
    "",
    `If any of the priorities surprise you — or if you'd like to walk through them together — just reply. I read every reply.`,
    "",
    `— Marcin`,
    `Owner, Handy Pioneers`,
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
