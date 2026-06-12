/**
 * server/lib/email/hpEmailTheme.ts
 *
 * The HP-branded transactional email shell (header, footer, CTA button),
 * extracted verbatim from routers/portal.ts so non-router code (the shared
 * estimate-approval lib) can build the same emails without importing the
 * portal router. Brand palette: forest green #1a2e1a / #2d4a2d, warm gold
 * #c8922a.
 */

export const HP_LOGO_EMAIL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg";

export function emailWrapper(content: string, accentColor = "#c8922a") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Handy Pioneers</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- HEADER -->
        <tr>
          <td style="background:linear-gradient(135deg,#1a2e1a 0%,#2d4a2d 100%);padding:28px 40px;text-align:center;">
            <img src="${HP_LOGO_EMAIL}" alt="Handy Pioneers" height="64" style="display:block;margin:0 auto 12px;border-radius:4px;" />
            <p style="margin:0;color:rgba(255,255,255,0.65);font-size:11px;letter-spacing:0.12em;text-transform:uppercase;">Reliable Renovations, Trusted Results</p>
          </td>
        </tr>
        <!-- BODY -->
        <tr>
          <td style="padding:36px 40px 28px;color:#1a1a1a;font-size:15px;line-height:1.6;">
            ${content}
          </td>
        </tr>
        <!-- DIVIDER -->
        <tr>
          <td style="padding:0 40px;"><hr style="border:none;border-top:1px solid #e8e8e8;margin:0;" /></td>
        </tr>
        <!-- FOOTER -->
        <tr>
          <td style="padding:20px 40px 28px;text-align:center;">
            <p style="margin:0 0 4px;font-size:12px;color:#888;">Handy Pioneers &bull; Vancouver, WA 98683</p>
            <p style="margin:0 0 4px;font-size:12px;color:#888;">
              <a href="tel:3608386731" style="color:#888;text-decoration:none;">(360) 838-6731</a>
              &nbsp;&bull;&nbsp;
              <a href="mailto:help@handypioneers.com" style="color:#888;text-decoration:none;">help@handypioneers.com</a>
            </p>
            <p style="margin:0;font-size:12px;">
              <a href="https://handypioneers.com" style="color:${accentColor};text-decoration:none;">handypioneers.com</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function ctaButton(label: string, url: string, color = "#c8922a") {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
    <tr><td align="center">
      <a href="${url}" style="display:inline-block;background:${color};color:#ffffff;font-size:15px;font-weight:700;letter-spacing:0.04em;padding:14px 36px;border-radius:6px;text-decoration:none;">${label}</a>
    </td></tr>
  </table>`;
}
