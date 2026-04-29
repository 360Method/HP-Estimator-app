/**
 * emailShell.ts — branded HTML email wrapper.
 *
 * Single source of truth for transactional email chrome. New email
 * paths should compose body HTML and pass it through `wrapEmailHtml`
 * so every send shares the same hospitality typography (serif headline,
 * cream parchment ground, gold accent rule).
 *
 * The legacy inline shells in server/routers/{estimate,gmail,portal}.ts
 * and server/threeSixtyWebhook.ts predate this helper — they are flagged
 * in docs/EXPERIENCE_STANDARDS.md as P1 follow-ups to migrate.
 */

export interface EmailShellOptions {
  /** Customer-facing subject line, used as the <title> + opt-in preheader. */
  subject: string;
  /** Short preheader (Gmail snippet) — keep under 90 chars. */
  preheader?: string;
  /** Eyebrow above the headline (e.g. "Your Proposal", "Receipt", "Welcome"). */
  eyebrow?: string;
  /** Optional serif headline rendered at the top of the card. */
  headline?: string;
  /** Body HTML — already-escaped/templated content. */
  body: string;
  /** Optional primary CTA at the bottom of the body. */
  cta?: { label: string; href: string };
  /** Optional contact line override. Defaults to Handy Pioneers core. */
  contactLine?: string;
  /** Optional footer line (legal / address / unsubscribe). */
  footerLine?: string;
}

const DEFAULTS = {
  brandName: 'Handy Pioneers',
  ink: '#1a2e1a',
  inkSoft: '#2d4a2d',
  gold: '#c8922a',
  goldSoft: '#e2b96a',
  cream: '#faf6ef',
  parchment: '#fdfaf3',
  charcoal: '#1f1d1a',
  slate: '#5b574f',
  hairline: '#e7e1d4',
  serif: 'Cormorant Garamond, "Playfair Display", Georgia, serif',
  sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  contact: 'Vancouver, WA · (360) 544-9858 · help@handypioneers.com',
  footer: 'Handy Pioneers, LLC · Licensed &amp; Insured · HANDYP*761NH',
};

/**
 * Wrap a body HTML fragment in the branded stewardship shell.
 *
 * Returns a complete `<!DOCTYPE html>...</html>` document suitable for
 * passing to nodemailer / Gmail / Resend.
 */
export function wrapEmailHtml(opts: EmailShellOptions): string {
  const {
    subject,
    preheader = '',
    eyebrow,
    headline,
    body,
    cta,
    contactLine = DEFAULTS.contact,
    footerLine = DEFAULTS.footer,
  } = opts;

  const eyebrowBlock = eyebrow
    ? `<p style="margin:0 0 6px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${DEFAULTS.gold};font-weight:700;">${eyebrow}</p>`
    : '';

  const headlineBlock = headline
    ? `<h1 style="margin:0 0 18px;font-family:${DEFAULTS.serif};font-weight:500;font-size:28px;line-height:1.15;color:${DEFAULTS.ink};letter-spacing:-0.01em;">${headline}</h1>`
    : '';

  const ctaBlock = cta
    ? `<div style="margin:28px 0 8px;text-align:center;">
         <a href="${cta.href}"
            style="display:inline-block;background:${DEFAULTS.ink};color:#fff;font-family:${DEFAULTS.sans};font-weight:600;font-size:14px;letter-spacing:0.01em;padding:14px 32px;border-radius:10px;text-decoration:none;">
           ${cta.label}
         </a>
       </div>`
    : '';

  const preheaderBlock = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${DEFAULTS.parchment};opacity:0;">${preheader}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:${DEFAULTS.cream};font-family:${DEFAULTS.sans};color:${DEFAULTS.charcoal};">
${preheaderBlock}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${DEFAULTS.cream};padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 8px rgba(26,46,26,0.06);">

        <!-- Brand header -->
        <tr>
          <td style="background:${DEFAULTS.ink};padding:28px 36px;">
            <p style="margin:0;font-family:${DEFAULTS.serif};font-weight:500;font-size:22px;color:#ffffff;letter-spacing:-0.01em;">
              ${DEFAULTS.brandName}
            </p>
            <p style="margin:4px 0 0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${DEFAULTS.goldSoft};font-weight:700;">
              The 360° Method
            </p>
          </td>
        </tr>

        <!-- Gold hairline -->
        <tr><td style="height:3px;background:${DEFAULTS.gold};line-height:3px;font-size:0;">&nbsp;</td></tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 36px 28px;background:${DEFAULTS.parchment};">
            ${eyebrowBlock}
            ${headlineBlock}
            <div style="font-size:15px;line-height:1.7;color:${DEFAULTS.charcoal};">${body}</div>
            ${ctaBlock}
            <p style="margin:28px 0 0;font-size:13px;color:${DEFAULTS.slate};line-height:1.6;">
              Should anything need attention, simply reply to this note — the desk is always open.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 36px;background:#ffffff;border-top:1px solid ${DEFAULTS.hairline};">
            <p style="margin:0;font-size:12px;color:${DEFAULTS.slate};text-align:center;line-height:1.6;">${contactLine}</p>
            <p style="margin:6px 0 0;font-size:11px;color:${DEFAULTS.slate};text-align:center;letter-spacing:0.04em;opacity:0.8;">${footerLine}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * Tiny helper for plain-text fallback bodies — strips HTML naively and
 * collapses whitespace. Use for the `text/plain` MIME part.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}
