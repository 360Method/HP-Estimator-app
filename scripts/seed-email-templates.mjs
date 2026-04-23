/**
 * Seed the first 4 transactional email templates into emailTemplates.
 * Idempotent — safe to re-run; uses ON CONFLICT to update existing rows.
 *
 * Keys:
 *   magic_link          — portal login magic link
 *   estimate_sent       — estimate delivered to customer (awaiting approval)
 *   invoice_sent        — invoice issued (awaiting payment)
 *   job_sign_off        — job completion + final invoice notice
 *
 * Run: node scripts/seed-email-templates.mjs
 */
import "dotenv/config";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { prepare: false });

const TEMPLATES = [
  {
    key: "magic_link",
    name: "Portal Magic Link",
    subject: "Your Handy Pioneers Customer Portal Login",
    preheader: "One-click login — expires in 15 minutes",
    html: `<p>Hi {{customerFirstName}},</p>
<p>Here is your one-click login link for the Handy Pioneers customer portal:</p>
<p><a href="{{magicLink}}" style="background:#1E3A5F;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Open My Portal →</a></p>
<p>This link expires in 15 minutes and can only be used once. If you did not request this, you can safely ignore this email.</p>
<p>Best,<br>The Handy Pioneers Team<br><a href="{{portalUrl}}">{{portalUrl}}</a></p>`,
    text: `Hi {{customerFirstName}},

Here is your one-click login link for the Handy Pioneers customer portal:

{{magicLink}}

This link expires in 15 minutes and can only be used once. If you did not request this, you can safely ignore this email.

Best,
The Handy Pioneers Team
{{portalUrl}}`,
    mergeTagSchema: [
      { tag: "customerFirstName", description: "Customer first name" },
      { tag: "magicLink", description: "One-time magic login URL" },
      { tag: "portalUrl", description: "Portal base URL" },
    ],
  },
  {
    key: "estimate_sent",
    name: "Estimate Delivered",
    subject: "Your estimate from Handy Pioneers — {{referenceNumber}}",
    preheader: "Review + approve online in one click",
    html: `<p>Hi {{customerFirstName}},</p>
<p>Thanks for the opportunity to work with you! Your estimate is ready:</p>
<ul>
  <li><strong>Estimate:</strong> {{referenceNumber}}</li>
  <li><strong>Project:</strong> {{description}}</li>
  <li><strong>Total:</strong> {{amount}}</li>
</ul>
<p><a href="{{estimateUrl}}" style="background:#1E3A5F;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Review + Approve →</a></p>
<p>Approvals happen in one click through your portal — no printing, no scanning. Questions? Reply to this email or call us at (360) 241-5718.</p>
<p>Best,<br>The Handy Pioneers Team</p>`,
    text: `Hi {{customerFirstName}},

Thanks for the opportunity to work with you! Your estimate is ready.

- Estimate: {{referenceNumber}}
- Project: {{description}}
- Total: {{amount}}

Review + approve online: {{estimateUrl}}

Questions? Reply to this email or call us at (360) 241-5718.

Best,
The Handy Pioneers Team`,
    mergeTagSchema: [
      { tag: "customerFirstName", description: "Customer first name" },
      { tag: "referenceNumber", description: "Estimate number (e.g. HP-E-0123)" },
      { tag: "description", description: "Project description" },
      { tag: "amount", description: "Formatted total (e.g. $2,450.00)" },
      { tag: "estimateUrl", description: "Portal estimate link" },
    ],
  },
  {
    key: "invoice_sent",
    name: "Invoice Issued",
    subject: "New invoice from Handy Pioneers — {{referenceNumber}}",
    preheader: "Pay online securely",
    html: `<p>Hi {{customerFirstName}},</p>
<p>Your invoice is ready:</p>
<ul>
  <li><strong>Invoice:</strong> {{referenceNumber}}</li>
  <li><strong>Amount due:</strong> {{amount}}</li>
  <li><strong>Due date:</strong> {{dueDate}}</li>
</ul>
<p><a href="{{invoiceUrl}}" style="background:#1E3A5F;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">View + Pay Online →</a></p>
<p>Pay by card or ACH directly through your portal — no account needed. If you'd prefer to pay by check, reply to this email and we'll send mailing instructions.</p>
<p>Best,<br>The Handy Pioneers Team<br>(360) 241-5718 · help@handypioneers.com</p>`,
    text: `Hi {{customerFirstName}},

Your invoice is ready.

- Invoice: {{referenceNumber}}
- Amount due: {{amount}}
- Due date: {{dueDate}}

Pay online: {{invoiceUrl}}

Best,
The Handy Pioneers Team
(360) 241-5718 · help@handypioneers.com`,
    mergeTagSchema: [
      { tag: "customerFirstName", description: "Customer first name" },
      { tag: "referenceNumber", description: "Invoice number (e.g. HP-I-0042)" },
      { tag: "amount", description: "Formatted total due" },
      { tag: "dueDate", description: "Formatted due date" },
      { tag: "invoiceUrl", description: "Portal invoice link" },
    ],
  },
  {
    key: "job_sign_off",
    name: "Job Complete + Final Invoice",
    subject: "Job complete — your final invoice is ready",
    preheader: "Thanks for trusting Handy Pioneers",
    html: `<p>Hi {{customerFirstName}},</p>
<p>Thank you for signing off on your project — it was a pleasure working with you!</p>
<p>Your final invoice is now available in your customer portal:</p>
<p><a href="{{invoiceUrl}}" style="background:#1E3A5F;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">View Final Invoice →</a></p>
<p>If you have any questions about the invoice or the work completed, don't hesitate to reach out.</p>
<p>We'd also love to hear how we did — a quick Google review means the world to our small team: <a href="{{reviewLink}}">Leave a review</a></p>
<p>Best,<br>The Handy Pioneers Team<br>(360) 241-5718 · help@handypioneers.com</p>`,
    text: `Hi {{customerFirstName}},

Thank you for signing off on your project — it was a pleasure working with you!

Your final invoice: {{invoiceUrl}}

We'd also love a quick Google review if you have a moment: {{reviewLink}}

Best,
The Handy Pioneers Team
(360) 241-5718 · help@handypioneers.com`,
    mergeTagSchema: [
      { tag: "customerFirstName", description: "Customer first name" },
      { tag: "invoiceUrl", description: "Portal final invoice link" },
      { tag: "reviewLink", description: "Google review URL" },
    ],
  },
];

for (const t of TEMPLATES) {
  await sql`
    INSERT INTO "emailTemplates"
      ("tenantId", "key", "name", "subject", "preheader", "html", "text", "mergeTagSchema", "updatedAt")
    VALUES
      (1, ${t.key}, ${t.name}, ${t.subject}, ${t.preheader}, ${t.html}, ${t.text},
       ${JSON.stringify(t.mergeTagSchema)}, now())
    ON CONFLICT ("tenantId", "key") DO UPDATE SET
      "name" = EXCLUDED."name",
      "subject" = EXCLUDED."subject",
      "preheader" = EXCLUDED."preheader",
      "html" = EXCLUDED."html",
      "text" = EXCLUDED."text",
      "mergeTagSchema" = EXCLUDED."mergeTagSchema",
      "updatedAt" = now();
  `;
  console.log(`  ✓ seeded ${t.key}`);
}

await sql.end();
console.log(`\nSeeded ${TEMPLATES.length} email templates.`);
