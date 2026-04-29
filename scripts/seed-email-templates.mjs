/**
 * Seed the full Handy Pioneers transactional + nurture email library into
 * the `emailTemplates` table. Idempotent — safe to re-run; uses INSERT …
 * ON DUPLICATE KEY UPDATE so re-running replaces the canonical copy while
 * preserving the auto-increment id.
 *
 * Run: node scripts/seed-email-templates.mjs
 * Staging: DATABASE_URL=$STAGING_DATABASE_URL node scripts/seed-email-templates.mjs
 *
 * Categories (total = 58 templates):
 *   Account & Portal          6
 *   Appointments & Visits    10  (3 affluent-voice acks + 7 schedule lifecycle)
 *   Scope & Estimates         4
 *   Invoicing & Payment       5
 *   Membership                7
 *   Priority Translation      2
 *   Post-Baseline nurture     5
 *   Lead nurture sequences   18
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

// ─── shared snippets ─────────────────────────────────────────────────────────
const SIG_HTML = `<p>— The Handy Pioneers Team<br>
(360) 241-5718 · help@handypioneers.com<br>
<a href="{{portalUrl}}">{{portalUrl}}</a></p>`;

const SIG_TEXT = `— The Handy Pioneers Team
(360) 241-5718 · help@handypioneers.com
{{portalUrl}}`;

const btn = (href, label) =>
  `<p><a href="${href}" style="background:#1E3A5F;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">${label}</a></p>`;

const CUSTOMER = { tag: 'customerFirstName', description: 'Customer first name' };
const PORTAL = { tag: 'portalUrl', description: 'Portal base URL' };
const COMPANY = { tag: 'companyName', description: 'Company display name' };

// ─── ACCOUNT & PORTAL ────────────────────────────────────────────────────────
const ACCOUNT_PORTAL = [
  {
    key: 'account_welcome',
    name: 'Portal Welcome',
    subject: 'Welcome to the Handy Pioneers customer portal',
    preheader: 'Your home-care hub is ready',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Welcome to Handy Pioneers! Your customer portal is where you'll find every estimate, invoice, appointment, and service history we have for your home — all in one place.</p>
${btn('{{portalUrl}}', 'Open My Portal →')}
<p>You can log in any time with the email you signed up with — we'll send a one-click link so you never have to remember another password.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Welcome to Handy Pioneers! Your customer portal is where you'll find every estimate, invoice, appointment, and service history for your home.

Open your portal: {{portalUrl}}

Log in with your email — we'll send a one-click link so you never have to remember another password.

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, PORTAL],
  },
  {
    key: 'account_magic_link',
    name: 'Portal Magic Link',
    subject: 'Your Handy Pioneers portal login link',
    preheader: 'One-click login — expires in 15 minutes',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Here is your one-click login link for the Handy Pioneers customer portal:</p>
${btn('{{magicLink}}', 'Open My Portal →')}
<p>This link expires in 15 minutes and can only be used once. If you did not request this, you can safely ignore this email.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Here is your one-click login link:

{{magicLink}}

This link expires in 15 minutes and can only be used once. If you did not request this, you can safely ignore this email.

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, { tag: 'magicLink', description: 'One-time magic login URL' }, PORTAL],
  },
  {
    key: 'account_magic_expired',
    name: 'Magic Link Expired',
    subject: 'Your login link has expired — grab a new one',
    preheader: 'Links are one-time-use and expire after 15 minutes',
    html: `<p>Hi {{customerFirstName}},</p>
<p>The login link you tried to use has expired — for security, each link is single-use and only valid for 15 minutes after we send it.</p>
<p>Request a fresh one below and you'll be back in your portal in a few seconds:</p>
${btn('{{portalUrl}}/login', 'Send me a new link →')}
<p>If you're running into trouble, reply to this email or call us at (360) 241-5718 and we'll help.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

The login link you tried to use has expired — each link is single-use and only valid for 15 minutes after we send it.

Request a fresh one: {{portalUrl}}/login

If you're running into trouble, reply to this email or call (360) 241-5718.

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, PORTAL],
  },
  {
    key: 'account_password_reset',
    name: 'Password Reset',
    subject: 'Reset your Handy Pioneers portal password',
    preheader: 'One-click reset — expires in 30 minutes',
    html: `<p>Hi {{customerFirstName}},</p>
<p>We received a request to reset the password on your Handy Pioneers portal account. Click below to choose a new password:</p>
${btn('{{resetLink}}', 'Reset my password →')}
<p>This link expires in 30 minutes. If you did not request a reset, you can safely ignore this email — your password won't change unless you click the link.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

We received a request to reset the password on your portal account.

Reset link: {{resetLink}}

This link expires in 30 minutes. If you did not request a reset, ignore this email — your password won't change.

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, { tag: 'resetLink', description: 'Password reset URL' }, PORTAL],
  },
  {
    key: 'account_email_changed',
    name: 'Email Address Changed',
    subject: 'Your Handy Pioneers email address was updated',
    preheader: 'Confirmation of the change on your account',
    html: `<p>Hi {{customerFirstName}},</p>
<p>This is a quick confirmation that the email address on your Handy Pioneers portal account was just changed to <strong>{{newEmail}}</strong>.</p>
<p>All future estimates, invoices, and appointment reminders will go to that address.</p>
<p>If you did not make this change, call us immediately at (360) 241-5718 or reply to this email — we'll reverse it right away and check for any suspicious activity on your account.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

This is a confirmation that the email address on your portal account was just changed to {{newEmail}}.

All future estimates, invoices, and reminders will go to that address.

If you did not make this change, call us immediately at (360) 241-5718.

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, { tag: 'newEmail', description: 'New email address on file' }, PORTAL],
  },
  {
    key: 'account_profile_updated',
    name: 'Profile Updated',
    subject: 'Your Handy Pioneers profile was updated',
    preheader: 'Confirmation of the changes to your account',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Just letting you know your Handy Pioneers profile was updated. Here's what changed:</p>
<p style="background:#f5f5f5;padding:12px;border-radius:6px;font-family:monospace;white-space:pre-wrap;">{{changeSummary}}</p>
<p>If any of these changes don't look right, reply to this email or call (360) 241-5718 and we'll fix it.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Your Handy Pioneers profile was updated.

Changes:
{{changeSummary}}

If any of these changes don't look right, reply to this email or call (360) 241-5718.

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, { tag: 'changeSummary', description: 'Multi-line summary of fields changed' }, PORTAL],
  },
];

// ─── APPOINTMENTS & VISITS ───────────────────────────────────────────────────
const APPT = [
  // ── Customer-facing intake acknowledgments ─────────────────────────────────
  // These three templates establish the affluent stewardship voice for the
  // first three customer-facing touchpoints. They replace earlier transactional
  // copy (per the Customer Success Charter, 2026-04-25). Vocabulary rules:
  // never "estimate / free / cheap / handyman / fix / repair / save / discount".
  {
    key: 'booking_inquiry_received',
    name: 'Booking Inquiry Received',
    subject: 'Your inquiry is in our care, {{customerFirstName}}',
    preheader: 'Your Concierge will be in touch within one business day',
    html: `<p>{{customerFirstName}},</p>
<p>Your inquiry has reached us at Handy Pioneers, and it is in our care.</p>
<p>Here is what happens next: a member of our Concierge team will reach out personally — by text or by email — within one business day to learn more about your home, understand the project you have in mind, and find a window of time that fits your schedule for a walkthrough conversation.</p>
<p>Nothing further is needed from you in the meantime. We come to you.</p>
<p>If anything time-sensitive surfaces, you are always welcome to call us directly at (360) 241-5718.</p>
${SIG_HTML}`,
    text: `{{customerFirstName}},

Your inquiry has reached us at Handy Pioneers, and it is in our care.

Here is what happens next: a member of our Concierge team will reach out personally — by text or by email — within one business day to learn more about your home, understand the project you have in mind, and find a window of time that fits your schedule for a walkthrough conversation.

Nothing further is needed from you in the meantime. We come to you.

If anything time-sensitive surfaces, you are welcome to call us directly at (360) 241-5718.

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, PORTAL],
  },
  {
    key: 'service_request_acknowledged',
    name: 'Portal Service Request Acknowledged',
    subject: 'Your request is in our care, {{customerFirstName}}',
    preheader: 'We are already reviewing it on your behalf',
    html: `<p>{{customerFirstName}},</p>
<p>We have received your request and added it to your home's standard-of-care file.</p>
<p>Here is what happens next: your Concierge will review the details, gather what is needed from our records, and reach out personally to align on next steps and timing. Expect to hear from them within one business day.</p>
<p>Your full home history is always available in your portal:</p>
${btn('{{portalUrl}}', 'Open my portal →')}
<p>For anything time-sensitive, call us directly at (360) 241-5718.</p>
${SIG_HTML}`,
    text: `{{customerFirstName}},

We have received your request and added it to your home's standard-of-care file.

Here is what happens next: your Concierge will review the details, gather what is needed from our records, and reach out personally to align on next steps and timing. Expect to hear from them within one business day.

Open your portal: {{portalUrl}}

For anything time-sensitive, call us directly at (360) 241-5718.

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, PORTAL],
  },
  {
    key: 'appointment_confirmed',
    name: 'Appointment Confirmed (customer-facing)',
    subject: 'Your visit on {{appointmentDate}} is confirmed',
    preheader: 'What we will attend to and how to prepare',
    html: `<p>{{customerFirstName}},</p>
<p>Your visit with Handy Pioneers is confirmed.</p>
<ul>
  <li><strong>When:</strong> {{appointmentDate}} at {{appointmentTime}}</li>
  <li><strong>Where:</strong> {{appointmentAddress}}</li>
  <li><strong>Visiting:</strong> {{consultantName}}</li>
  <li><strong>Length:</strong> approximately {{appointmentDuration}}</li>
</ul>
<p>This is a stewardship conversation, not a presentation. We will walk your home with you, listen to what you have in mind, and share what a proper standard of care looks like for the project ahead.</p>
<p>Nothing to prepare on your end — though if there is anything you have been watching or wondering about, jot it down so we can attend to it together.</p>
${btn('{{portalUrl}}/appointments', 'View in portal →')}
<p>Need to adjust the time? Reply to this email or call (360) 241-5718.</p>
${SIG_HTML}`,
    text: `{{customerFirstName}},

Your visit with Handy Pioneers is confirmed.

- When: {{appointmentDate}} at {{appointmentTime}}
- Where: {{appointmentAddress}}
- Visiting: {{consultantName}}
- Length: approximately {{appointmentDuration}}

This is a stewardship conversation, not a presentation. We will walk your home with you, listen to what you have in mind, and share what a proper standard of care looks like for the project ahead.

Nothing to prepare on your end — though if there is anything you have been watching or wondering about, jot it down so we can attend to it together.

View in portal: {{portalUrl}}/appointments

Need to adjust the time? Reply to this email or call (360) 241-5718.

${SIG_TEXT}`,
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'appointmentDate', description: 'Formatted appointment date' },
      { tag: 'appointmentTime', description: 'Formatted appointment time' },
      { tag: 'appointmentAddress', description: 'Full street address of visit' },
      { tag: 'consultantName', description: 'Name of the consultant/PM visiting' },
      { tag: 'appointmentDuration', description: 'Human-readable duration, e.g. "60 minutes" or "two hours"' },
      PORTAL,
    ],
  },
  // ── Detailed appointment templates (used by the schedule subsystem when
  //    type-specific copy is preferred over the generic appointment_confirmed). ──
  {
    key: 'appt_consultation_scheduled',
    name: 'Consultation Scheduled',
    subject: 'Your consultation on {{appointmentDate}} is confirmed',
    preheader: 'A stewardship conversation, not a presentation',
    html: `<p>{{customerFirstName}},</p>
<p>Your consultation with Handy Pioneers is confirmed.</p>
<ul>
  <li><strong>When:</strong> {{appointmentDate}} at {{appointmentTime}}</li>
  <li><strong>Where:</strong> {{appointmentAddress}}</li>
  <li><strong>Length:</strong> approximately 45 to 60 minutes</li>
</ul>
<p>This is a stewardship conversation, not a presentation. We will walk your home with you, listen to what you have in mind, and share what a proper standard of care looks like for the project ahead. You will leave with clarity on the scope, the sequence, and the considerations that matter for your home specifically.</p>
<p>Nothing to prepare on your end — just be home.</p>
${btn('{{portalUrl}}/appointments', 'View in portal →')}
<p>If anything changes, reply to this email or call (360) 241-5718.</p>
${SIG_HTML}`,
    text: `{{customerFirstName}},

Your consultation with Handy Pioneers is confirmed.

- When: {{appointmentDate}} at {{appointmentTime}}
- Where: {{appointmentAddress}}
- Length: approximately 45 to 60 minutes

This is a stewardship conversation, not a presentation. We will walk your home with you, listen to what you have in mind, and share what a proper standard of care looks like for the project ahead. You will leave with clarity on the scope, the sequence, and the considerations that matter for your home specifically.

Nothing to prepare on your end — just be home.

View in portal: {{portalUrl}}/appointments

If anything changes, reply to this email or call (360) 241-5718.

${SIG_TEXT}`,
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'appointmentDate', description: 'Formatted appointment date' },
      { tag: 'appointmentTime', description: 'Formatted appointment time' },
      { tag: 'appointmentAddress', description: 'Full street address of visit' },
      PORTAL,
    ],
  },
  {
    key: 'appt_baseline_scheduled',
    name: '360° Baseline Walkthrough Scheduled',
    subject: 'Your 360° Baseline Walkthrough on {{appointmentDate}} is confirmed',
    preheader: 'The foundation of your stewardship year',
    html: `<p>{{customerFirstName}},</p>
<p>Your 360° Baseline Walkthrough is confirmed.</p>
<ul>
  <li><strong>When:</strong> {{appointmentDate}} at {{appointmentTime}}</li>
  <li><strong>Where:</strong> {{appointmentAddress}}</li>
  <li><strong>Length:</strong> 90 minutes to two hours</li>
</ul>
<p>This is the foundation of your membership and the most consequential visit of the year. We will walk every system of your home — roof, siding, attic, plumbing, electrical, HVAC, and foundation — and build a prioritized roadmap of stewardship that will guide care, upgrades, and timing for years to come.</p>
<p><strong>Before we arrive,</strong> please clear access to your attic, crawlspace, and electrical panel, and have on hand a short list of any concerns you have been watching so we can attend to them together.</p>
${btn('{{portalUrl}}/appointments', 'View in portal →')}
${SIG_HTML}`,
    text: `{{customerFirstName}},

Your 360° Baseline Walkthrough is confirmed.

- When: {{appointmentDate}} at {{appointmentTime}}
- Where: {{appointmentAddress}}
- Length: 90 minutes to two hours

This is the foundation of your membership and the most consequential visit of the year. We will walk every system of your home — roof, siding, attic, plumbing, electrical, HVAC, and foundation — and build a prioritized roadmap of stewardship that will guide care, upgrades, and timing for years to come.

Before we arrive: please clear access to your attic, crawlspace, and electrical panel, and have on hand a short list of any concerns you have been watching so we can attend to them together.

View in portal: {{portalUrl}}/appointments

${SIG_TEXT}`,
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'appointmentDate', description: 'Formatted appointment date' },
      { tag: 'appointmentTime', description: 'Formatted appointment time' },
      { tag: 'appointmentAddress', description: 'Full street address of visit' },
      PORTAL,
    ],
  },
  {
    key: 'appt_reminder_48h',
    name: '48-Hour Reminder',
    subject: 'Reminder: We\'re visiting in 48 hours',
    preheader: '{{appointmentDate}} at {{appointmentTime}}',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Quick reminder that Handy Pioneers is headed to <strong>{{appointmentAddress}}</strong> on <strong>{{appointmentDate}} at {{appointmentTime}}</strong>.</p>
<p>If anything has changed on your end, reply to this email or call (360) 241-5718 and we'll adjust the schedule.</p>
${btn('{{portalUrl}}/appointments', 'View in portal →')}
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Quick reminder that Handy Pioneers is headed to {{appointmentAddress}} on {{appointmentDate}} at {{appointmentTime}}.

If anything has changed, reply or call (360) 241-5718.

View in portal: {{portalUrl}}/appointments

${SIG_TEXT}`,
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'appointmentDate', description: 'Formatted appointment date' },
      { tag: 'appointmentTime', description: 'Formatted appointment time' },
      { tag: 'appointmentAddress', description: 'Full street address of visit' },
      PORTAL,
    ],
  },
  {
    key: 'appt_reminder_day_of',
    name: 'Day-Of Reminder',
    subject: 'See you today at {{appointmentTime}}',
    preheader: 'We\'re on our way',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Today's the day! We'll see you at <strong>{{appointmentAddress}}</strong> around <strong>{{appointmentTime}}</strong>.</p>
<p>Your tech today is <strong>{{techName}}</strong> — they'll text you on their way over.</p>
<p>Need to push the time? Call (360) 241-5718 — the sooner the better.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Today's the day! We'll see you at {{appointmentAddress}} around {{appointmentTime}}.

Your tech today is {{techName}} — they'll text you on their way over.

Need to push the time? Call (360) 241-5718.

${SIG_TEXT}`,
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'appointmentTime', description: 'Formatted appointment time' },
      { tag: 'appointmentAddress', description: 'Full street address of visit' },
      { tag: 'techName', description: 'Name of assigned technician' },
      PORTAL,
    ],
  },
  {
    key: 'appt_tech_late',
    name: 'Tech Running Late',
    subject: 'Running about {{delayMinutes}} minutes behind',
    preheader: 'Sorry for the wait',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Heads up — <strong>{{techName}}</strong> is running about <strong>{{delayMinutes}} minutes</strong> behind on the way to your home. New ETA is around <strong>{{newEta}}</strong>.</p>
<p>Sorry for the wait. We'll text you the moment they're a few blocks out.</p>
<p>If the new time doesn't work, reply or call (360) 241-5718 and we'll reschedule.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Heads up — {{techName}} is running about {{delayMinutes}} minutes behind. New ETA is around {{newEta}}.

Sorry for the wait. We'll text you when they're a few blocks out.

If the new time doesn't work, reply or call (360) 241-5718.

${SIG_TEXT}`,
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'techName', description: 'Name of assigned technician' },
      { tag: 'delayMinutes', description: 'Delay in minutes' },
      { tag: 'newEta', description: 'Updated ETA' },
      PORTAL,
    ],
  },
  {
    key: 'appt_visit_completed',
    name: 'Visit Completed',
    subject: 'Visit complete — here\'s what we did',
    preheader: 'Full summary + next steps in your portal',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Thanks for having us out today! Here's a quick recap of your visit:</p>
<p style="background:#f5f5f5;padding:12px;border-radius:6px;white-space:pre-wrap;">{{visitSummary}}</p>
<p>The full write-up — photos, recommendations, and any estimates we promised — is waiting in your portal.</p>
${btn('{{portalUrl}}/visits/{{visitId}}', 'View full report →')}
<p>Questions? Reply to this email or call (360) 241-5718.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Thanks for having us out today! Quick recap:

{{visitSummary}}

Full write-up — photos, recommendations, any estimates — is in your portal:
{{portalUrl}}/visits/{{visitId}}

Questions? Reply or call (360) 241-5718.

${SIG_TEXT}`,
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'visitSummary', description: 'Short recap of work performed' },
      { tag: 'visitId', description: 'Portal visit record id' },
      PORTAL,
    ],
  },
  {
    key: 'appt_visit_cancelled',
    name: 'Visit Cancelled',
    subject: 'Your appointment has been cancelled',
    preheader: 'Confirmation and how to reschedule',
    html: `<p>Hi {{customerFirstName}},</p>
<p>This is a confirmation that your appointment on <strong>{{appointmentDate}} at {{appointmentTime}}</strong> has been cancelled.</p>
<p>Ready to reschedule? Grab a new time in your portal in under a minute:</p>
${btn('{{portalUrl}}/schedule', 'Pick a new time →')}
<p>Or reply to this email and we'll find something that works — evenings and Saturdays are available for most visit types.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

This is a confirmation that your appointment on {{appointmentDate}} at {{appointmentTime}} has been cancelled.

Reschedule: {{portalUrl}}/schedule

Or reply to this email and we'll find something that works — evenings and Saturdays are available for most visit types.

${SIG_TEXT}`,
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'appointmentDate', description: 'Formatted appointment date' },
      { tag: 'appointmentTime', description: 'Formatted appointment time' },
      PORTAL,
    ],
  },
];

// ─── SCOPE & ESTIMATES ───────────────────────────────────────────────────────
const SCOPE = [
  {
    key: 'scope_delivered',
    name: 'Scope / Estimate Delivered',
    subject: 'Your estimate from Handy Pioneers — {{referenceNumber}}',
    preheader: 'Review + approve online in one click',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Thanks for the opportunity to work with you! Your estimate is ready:</p>
<ul>
  <li><strong>Estimate:</strong> {{referenceNumber}}</li>
  <li><strong>Project:</strong> {{description}}</li>
  <li><strong>Total:</strong> {{amount}}</li>
</ul>
${btn('{{estimateUrl}}', 'Review + Approve →')}
<p>Approvals happen in one click through your portal — no printing, no scanning. Questions? Reply to this email or call us at (360) 241-5718.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Thanks for the opportunity to work with you! Your estimate is ready.

- Estimate: {{referenceNumber}}
- Project: {{description}}
- Total: {{amount}}

Review + approve online: {{estimateUrl}}

Questions? Reply or call (360) 241-5718.

${SIG_TEXT}`,
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'referenceNumber', description: 'Estimate number (e.g. HP-E-0123)' },
      { tag: 'description', description: 'Project description' },
      { tag: 'amount', description: 'Formatted total' },
      { tag: 'estimateUrl', description: 'Portal estimate link' },
      PORTAL,
    ],
  },
  {
    key: 'scope_accepted',
    name: 'Scope / Estimate Accepted',
    subject: 'We\'re on — thanks for approving {{referenceNumber}}',
    preheader: 'What happens next',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Thanks for approving estimate <strong>{{referenceNumber}}</strong>! We're excited to get started.</p>
<p><strong>What happens next:</strong></p>
<ol>
  <li>Your project manager will reach out within 1 business day to schedule the start date.</li>
  <li>We'll send the deposit invoice (if applicable) through your portal.</li>
  <li>Once materials are ordered and the date is locked, you'll get a kickoff email with the full timeline.</li>
</ol>
${btn('{{estimateUrl}}', 'View signed estimate →')}
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Thanks for approving estimate {{referenceNumber}}! We're excited to get started.

What happens next:
1. Your project manager will reach out within 1 business day to schedule the start date.
2. We'll send the deposit invoice (if applicable) through your portal.
3. Once materials are ordered and the date is locked, you'll get a kickoff email with the full timeline.

View signed estimate: {{estimateUrl}}

${SIG_TEXT}`,
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'referenceNumber', description: 'Estimate number' },
      { tag: 'estimateUrl', description: 'Portal estimate link' },
      PORTAL,
    ],
  },
  {
    key: 'scope_declined',
    name: 'Scope / Estimate Declined',
    subject: 'Thanks for considering Handy Pioneers',
    preheader: 'We\'re here whenever you\'re ready',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Thanks for letting us know estimate <strong>{{referenceNumber}}</strong> isn't moving forward. We appreciate you taking the time to look it over.</p>
<p>If it came down to scope, price, or timing and you'd like to chat through options, we're happy to — just reply to this email or call (360) 241-5718. And if the project resurfaces down the road, your estimate stays in your portal so we can reopen it in a click.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Thanks for letting us know estimate {{referenceNumber}} isn't moving forward. We appreciate you taking the time to look it over.

If it came down to scope, price, or timing and you'd like to chat through options, reply or call (360) 241-5718. Your estimate stays in your portal if the project resurfaces later.

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, { tag: 'referenceNumber', description: 'Estimate number' }, PORTAL],
  },
  {
    key: 'scope_revised',
    name: 'Scope / Estimate Revised',
    subject: 'Updated estimate — {{referenceNumber}}',
    preheader: 'New version ready for review',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Based on our conversation, we've updated your estimate. Here's the latest version:</p>
<ul>
  <li><strong>Estimate:</strong> {{referenceNumber}} (rev. {{revisionNumber}})</li>
  <li><strong>Project:</strong> {{description}}</li>
  <li><strong>New total:</strong> {{amount}}</li>
</ul>
<p><strong>What changed:</strong></p>
<p style="background:#f5f5f5;padding:12px;border-radius:6px;white-space:pre-wrap;">{{revisionNotes}}</p>
${btn('{{estimateUrl}}', 'Review + Approve →')}
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Based on our conversation, we've updated your estimate.

- Estimate: {{referenceNumber}} (rev. {{revisionNumber}})
- Project: {{description}}
- New total: {{amount}}

What changed:
{{revisionNotes}}

Review + approve: {{estimateUrl}}

${SIG_TEXT}`,
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'referenceNumber', description: 'Estimate number' },
      { tag: 'revisionNumber', description: 'Revision version (e.g. 2)' },
      { tag: 'description', description: 'Project description' },
      { tag: 'amount', description: 'Formatted total' },
      { tag: 'revisionNotes', description: 'What changed between revisions' },
      { tag: 'estimateUrl', description: 'Portal estimate link' },
      PORTAL,
    ],
  },
];

// ─── INVOICING & PAYMENT ─────────────────────────────────────────────────────
const INVOICING = [
  {
    key: 'invoice_delivered',
    name: 'Invoice Issued',
    subject: 'New invoice from Handy Pioneers — {{referenceNumber}}',
    preheader: 'Pay online securely',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Your invoice is ready:</p>
<ul>
  <li><strong>Invoice:</strong> {{referenceNumber}}</li>
  <li><strong>Amount due:</strong> {{amount}}</li>
  <li><strong>Due date:</strong> {{dueDate}}</li>
</ul>
${btn('{{invoiceUrl}}', 'View + Pay Online →')}
<p>Pay by card or ACH directly through your portal — no account needed. Prefer to pay by check? Reply and we'll send mailing instructions.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Your invoice is ready.

- Invoice: {{referenceNumber}}
- Amount due: {{amount}}
- Due date: {{dueDate}}

Pay online: {{invoiceUrl}}

${SIG_TEXT}`,
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'referenceNumber', description: 'Invoice number' },
      { tag: 'amount', description: 'Formatted total due' },
      { tag: 'dueDate', description: 'Formatted due date' },
      { tag: 'invoiceUrl', description: 'Portal invoice link' },
      PORTAL,
    ],
  },
  {
    key: 'payment_received',
    name: 'Payment Received',
    subject: 'Payment received — thanks!',
    preheader: 'Receipt for invoice {{referenceNumber}}',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Thanks! We received your payment of <strong>{{amount}}</strong> for invoice <strong>{{referenceNumber}}</strong> on <strong>{{paymentDate}}</strong>.</p>
${btn('{{invoiceUrl}}', 'View receipt →')}
<p>Your payment is posted and the invoice is marked paid. No further action needed on your end.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Thanks! We received your payment of {{amount}} for invoice {{referenceNumber}} on {{paymentDate}}.

Receipt: {{invoiceUrl}}

${SIG_TEXT}`,
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'referenceNumber', description: 'Invoice number' },
      { tag: 'amount', description: 'Formatted payment amount' },
      { tag: 'paymentDate', description: 'Formatted payment date' },
      { tag: 'invoiceUrl', description: 'Portal invoice / receipt link' },
      PORTAL,
    ],
  },
  {
    key: 'payment_failed',
    name: 'Payment Failed',
    subject: 'Your payment didn\'t go through',
    preheader: 'Quick fix in your portal',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Heads up — the payment of <strong>{{amount}}</strong> you tried on invoice <strong>{{referenceNumber}}</strong> didn't go through. The bank returned: <em>"{{failureReason}}"</em></p>
<p>This usually means an expired card, mistyped number, or a temporary bank hold. You can try again in your portal:</p>
${btn('{{invoiceUrl}}', 'Try again →')}
<p>Still stuck? Reply or call (360) 241-5718 and we'll sort it out.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

The payment of {{amount}} on invoice {{referenceNumber}} didn't go through. The bank returned: "{{failureReason}}"

This usually means an expired card, mistyped number, or temporary hold. Try again: {{invoiceUrl}}

Still stuck? Reply or call (360) 241-5718.

${SIG_TEXT}`,
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'referenceNumber', description: 'Invoice number' },
      { tag: 'amount', description: 'Formatted payment amount' },
      { tag: 'failureReason', description: 'Bank / processor failure reason' },
      { tag: 'invoiceUrl', description: 'Portal invoice link' },
      PORTAL,
    ],
  },
  {
    key: 'payment_reminder_14',
    name: 'Payment Reminder — 14 days',
    subject: 'Friendly reminder: invoice {{referenceNumber}} is due soon',
    preheader: 'Due in 14 days',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Quick reminder that invoice <strong>{{referenceNumber}}</strong> for <strong>{{amount}}</strong> is due on <strong>{{dueDate}}</strong> — about two weeks out.</p>
${btn('{{invoiceUrl}}', 'Pay now →')}
<p>If you need a different payment plan or have questions about the invoice, reply or call (360) 241-5718 and we'll work it out.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Quick reminder — invoice {{referenceNumber}} for {{amount}} is due on {{dueDate}}.

Pay online: {{invoiceUrl}}

Need a different payment plan? Reply or call (360) 241-5718.

${SIG_TEXT}`,
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'referenceNumber', description: 'Invoice number' },
      { tag: 'amount', description: 'Formatted amount due' },
      { tag: 'dueDate', description: 'Formatted due date' },
      { tag: 'invoiceUrl', description: 'Portal invoice link' },
      PORTAL,
    ],
  },
  {
    key: 'payment_reminder_30',
    name: 'Payment Reminder — 30 days past due',
    subject: 'Invoice {{referenceNumber}} is past due',
    preheader: 'Let\'s get this sorted',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Invoice <strong>{{referenceNumber}}</strong> for <strong>{{amount}}</strong> was due on <strong>{{dueDate}}</strong> and is now about 30 days past. We wanted to reach out directly before anything escalates.</p>
${btn('{{invoiceUrl}}', 'Pay now →')}
<p>If there's something going on — payment trouble, a dispute about the work, or you'd just like to set up a payment plan — please reply or call us at (360) 241-5718. We're a small team and we'd rather talk it through than anything else.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Invoice {{referenceNumber}} for {{amount}} was due on {{dueDate}} and is now about 30 days past.

Pay online: {{invoiceUrl}}

If there's something going on — payment trouble, a dispute, or wanting a payment plan — please reply or call (360) 241-5718. We'd rather talk it through.

${SIG_TEXT}`,
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'referenceNumber', description: 'Invoice number' },
      { tag: 'amount', description: 'Formatted amount due' },
      { tag: 'dueDate', description: 'Formatted due date' },
      { tag: 'invoiceUrl', description: 'Portal invoice link' },
      PORTAL,
    ],
  },
];

// ─── MEMBERSHIP (360° Method) ────────────────────────────────────────────────
const MEMBERSHIP = [
  {
    key: 'mem_welcome',
    name: '360° Membership Welcome',
    subject: 'Welcome to the 360° Method — {{tierName}} tier',
    preheader: 'What\'s included and what happens next',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Welcome to the 360° Method! Your <strong>{{tierName}}</strong> membership is active, and we're thrilled to be the long-term home-care team you can count on.</p>
<p><strong>Your first step:</strong> we'll schedule your 360° Baseline Walkthrough — a comprehensive 90-minute inspection of every system in your home that becomes your prioritized maintenance roadmap.</p>
${btn('{{portalUrl}}/schedule/baseline', 'Book my Baseline →')}
<p>You can see everything included in your tier, update your account, and track your home's health record any time in your portal.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Welcome to the 360° Method! Your {{tierName}} membership is active.

Your first step: book your 360° Baseline Walkthrough — a comprehensive 90-minute inspection that becomes your prioritized maintenance roadmap.

Book it: {{portalUrl}}/schedule/baseline

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, { tag: 'tierName', description: '360° tier name (Bronze/Silver/Gold/Platinum)' }, PORTAL],
  },
  {
    key: 'mem_seasonal_scheduled',
    name: 'Seasonal Visit Scheduled',
    subject: 'Your seasonal check-in is scheduled — {{appointmentDate}}',
    preheader: '{{visitName}} visit, included in your membership',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Your <strong>{{visitName}}</strong> seasonal check-in is on the books:</p>
<ul>
  <li><strong>When:</strong> {{appointmentDate}} at {{appointmentTime}}</li>
  <li><strong>Focus:</strong> {{visitFocus}}</li>
</ul>
<p>This visit is included in your {{tierName}} membership — no additional charge.</p>
${btn('{{portalUrl}}/appointments', 'View in portal →')}
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Your {{visitName}} seasonal check-in is on the books:

- When: {{appointmentDate}} at {{appointmentTime}}
- Focus: {{visitFocus}}

Included in your {{tierName}} membership.

View in portal: {{portalUrl}}/appointments

${SIG_TEXT}`,
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'visitName', description: 'Visit name (e.g. Spring Tune-Up)' },
      { tag: 'visitFocus', description: 'What this visit covers' },
      { tag: 'appointmentDate', description: 'Formatted date' },
      { tag: 'appointmentTime', description: 'Formatted time' },
      { tag: 'tierName', description: '360° tier name' },
      PORTAL,
    ],
  },
  {
    key: 'mem_tier_upgraded',
    name: 'Membership Tier Upgraded',
    subject: 'Welcome to the {{newTier}} tier',
    preheader: 'Here\'s what just unlocked',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Your 360° membership is now on the <strong>{{newTier}}</strong> tier — thanks for trusting us with more of your home!</p>
<p><strong>What just unlocked:</strong></p>
<p style="background:#f5f5f5;padding:12px;border-radius:6px;white-space:pre-wrap;">{{newBenefits}}</p>
<p>Your next charge will reflect the new tier pricing on <strong>{{nextBillingDate}}</strong>.</p>
${btn('{{portalUrl}}/membership', 'See my tier →')}
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Your 360° membership is now on the {{newTier}} tier.

What just unlocked:
{{newBenefits}}

Next charge reflects new tier pricing on {{nextBillingDate}}.

See my tier: {{portalUrl}}/membership

${SIG_TEXT}`,
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'newTier', description: 'New tier name' },
      { tag: 'newBenefits', description: 'List of newly unlocked benefits' },
      { tag: 'nextBillingDate', description: 'Next billing date' },
      PORTAL,
    ],
  },
  {
    key: 'mem_tier_downgraded',
    name: 'Membership Tier Downgraded',
    subject: 'Your 360° membership is moving to {{newTier}}',
    preheader: 'Confirmation and what changes',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Thanks for letting us know. Your 360° membership will move from <strong>{{oldTier}}</strong> to <strong>{{newTier}}</strong> starting <strong>{{effectiveDate}}</strong>.</p>
<p><strong>What changes on that date:</strong></p>
<p style="background:#f5f5f5;padding:12px;border-radius:6px;white-space:pre-wrap;">{{changeSummary}}</p>
<p>Anything already scheduled at your old tier stays as-is. If you want to revisit the decision, reply to this email or call (360) 241-5718 any time.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Your 360° membership will move from {{oldTier}} to {{newTier}} starting {{effectiveDate}}.

What changes:
{{changeSummary}}

Anything already scheduled at your old tier stays as-is. Reply or call (360) 241-5718 any time.

${SIG_TEXT}`,
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'oldTier', description: 'Current tier' },
      { tag: 'newTier', description: 'New (lower) tier' },
      { tag: 'effectiveDate', description: 'Date change takes effect' },
      { tag: 'changeSummary', description: 'What benefits change' },
      PORTAL,
    ],
  },
  {
    key: 'mem_paused',
    name: 'Membership Paused',
    subject: 'Your 360° membership is paused',
    preheader: 'We\'ll keep your spot',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Your 360° Method membership is paused as of <strong>{{effectiveDate}}</strong>. Billing stops today and we'll hold your spot and your home's health record until you're ready to come back.</p>
<p>While paused: any visits that haven't happened yet are moved to on-hold, and you can still log in to review past reports and estimates.</p>
${btn('{{portalUrl}}/membership', 'Resume when ready →')}
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Your 360° membership is paused as of {{effectiveDate}}. Billing stops today. We'll hold your spot and your home's health record until you're ready.

Resume when ready: {{portalUrl}}/membership

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, { tag: 'effectiveDate', description: 'Date pause takes effect' }, PORTAL],
  },
  {
    key: 'mem_cancelled',
    name: 'Membership Cancelled',
    subject: 'Your 360° membership has been cancelled',
    preheader: 'Thanks for being part of the 360° community',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Your 360° Method membership has been cancelled as of <strong>{{effectiveDate}}</strong>. Thank you for trusting us with your home — it's been our privilege.</p>
<p>Your home's health record stays in your portal indefinitely. If you ever want to reactivate the membership, just log in — we'll pick up right where we left off.</p>
<p>If there's something we could have done better, we'd genuinely love to hear it. Reply to this email and you'll reach the owner directly.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Your 360° Method membership has been cancelled as of {{effectiveDate}}. Thank you for trusting us with your home.

Your home's health record stays in your portal indefinitely. Reactivate any time.

If there's something we could have done better, reply — you'll reach the owner directly.

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, { tag: 'effectiveDate', description: 'Cancellation effective date' }, PORTAL],
  },
  {
    key: 'mem_annual_valuation',
    name: 'Annual Home Valuation Report',
    subject: 'Your {{year}} Home Valuation Report is ready',
    preheader: 'See how your membership has protected your home value',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Your annual 360° Home Valuation Report for <strong>{{year}}</strong> is ready. Inside you'll find:</p>
<ul>
  <li>Current estimated home value, with comparable sales in your area</li>
  <li>Upgrades and maintenance completed through Handy Pioneers this year</li>
  <li>Estimated lift those investments added to your home's value</li>
  <li>Prioritized roadmap for the coming year</li>
</ul>
${btn('{{portalUrl}}/reports/valuation/{{year}}', 'Open my report →')}
<p>This report is included with your membership — we build one for every 360° home every year. Questions or want to talk through the roadmap? Just reply.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Your annual 360° Home Valuation Report for {{year}} is ready. Inside:

- Current estimated home value
- Maintenance & upgrades completed this year
- Estimated value lift
- Prioritized roadmap for next year

Open: {{portalUrl}}/reports/valuation/{{year}}

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, { tag: 'year', description: 'Report year (e.g. 2026)' }, PORTAL],
  },
];

// ─── PRIORITY TRANSLATION ────────────────────────────────────────────────────
const PT = [
  {
    key: 'pt_received',
    name: 'Priority Translation — Received',
    subject: 'We got your inspection report — translation started',
    preheader: 'Plain-English version ready in ~24 hours',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Thanks for uploading your inspection report — we've got it and translation is in progress. You'll hear from us within about 24 hours with the plain-English version and prioritized action list.</p>
<p>What you'll get:</p>
<ul>
  <li>Every finding translated into simple language with photos</li>
  <li>A priority score for each item (safety-first, then wallet-saving, then cosmetic)</li>
  <li>Ballpark cost ranges and which items can wait vs. which shouldn't</li>
</ul>
${btn('{{portalUrl}}/priority-translation', 'Track my report →')}
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Thanks for uploading your inspection report — translation is in progress. You'll hear from us within about 24 hours.

You'll get:
- Every finding translated with photos
- A priority score for each item
- Ballpark cost ranges and which items can wait

Track: {{portalUrl}}/priority-translation

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, PORTAL],
  },
  {
    key: 'pt_ready',
    name: 'Priority Translation — Ready',
    subject: 'Your priority translation is ready',
    preheader: 'Plain-English version of your inspection report',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Your priority translation is ready! We've turned every finding in your inspection report into plain English with a priority score and ballpark cost.</p>
${btn('{{translationUrl}}', 'Open my translation →')}
<p>If anything's unclear or you want to talk through the top priorities, reply to this email or book a free 15-minute call from your portal — most people find the conversation really useful once they see it in writing.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Your priority translation is ready. Every finding in plain English with a priority score and ballpark cost.

Open: {{translationUrl}}

If anything's unclear, reply or book a free 15-minute call from your portal.

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, { tag: 'translationUrl', description: 'Portal translation report link' }, PORTAL],
  },
];

// ─── POST-BASELINE NURTURE (5-touch cadence) ────────────────────────────────
const POST_BASELINE = [
  {
    key: 'pb_day0',
    name: 'Post-Baseline — Day 0 (same day)',
    subject: 'Your Baseline findings are live in your portal',
    preheader: 'Top 3 priorities + full roadmap inside',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Thanks again for having us out today! Your 360° Baseline report is live in your portal — every system we inspected, prioritized from urgent to long-term.</p>
<p><strong>Top 3 priorities we'd tackle first:</strong></p>
<p style="background:#f5f5f5;padding:12px;border-radius:6px;white-space:pre-wrap;">{{topThree}}</p>
${btn('{{portalUrl}}/baseline/{{baselineId}}', 'Open full report →')}
<p>Tomorrow and over the next couple weeks you'll hear from us once or twice more with a bit more context on each priority. Reply any time with questions.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Thanks again for having us out today! Your 360° Baseline report is live in your portal.

Top 3 priorities we'd tackle first:
{{topThree}}

Full report: {{portalUrl}}/baseline/{{baselineId}}

You'll hear from us once or twice more over the next couple weeks. Reply any time.

${SIG_TEXT}`,
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'topThree', description: 'Bulleted top 3 priorities' },
      { tag: 'baselineId', description: 'Portal baseline record id' },
      PORTAL,
    ],
  },
  {
    key: 'pb_day2',
    name: 'Post-Baseline — Day 2',
    subject: 'A closer look at priority #1',
    preheader: 'Why we flagged it and what happens if you wait',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Now that the dust has settled on your Baseline, we wanted to zoom in on priority #1: <strong>{{priorityOneTitle}}</strong>.</p>
<p>{{priorityOneContext}}</p>
<p><strong>If you wait:</strong> {{priorityOneRiskIfWaited}}</p>
<p><strong>Rough cost to address:</strong> {{priorityOneCost}}</p>
${btn('{{portalUrl}}/baseline/{{baselineId}}#p1', 'See in roadmap →')}
<p>Want us to put together a firm estimate or schedule the work? Reply and we'll get it on the books.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Zooming in on priority #1: {{priorityOneTitle}}.

{{priorityOneContext}}

If you wait: {{priorityOneRiskIfWaited}}
Rough cost: {{priorityOneCost}}

See in roadmap: {{portalUrl}}/baseline/{{baselineId}}#p1

Want a firm estimate or to schedule the work? Reply.

${SIG_TEXT}`,
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'priorityOneTitle', description: 'Name of the #1 priority' },
      { tag: 'priorityOneContext', description: 'Plain-English context' },
      { tag: 'priorityOneRiskIfWaited', description: 'Risk if deferred' },
      { tag: 'priorityOneCost', description: 'Rough cost range' },
      { tag: 'baselineId', description: 'Portal baseline record id' },
      PORTAL,
    ],
  },
  {
    key: 'pb_day5',
    name: 'Post-Baseline — Day 5',
    subject: 'Priorities 2 & 3 — what to know',
    preheader: 'Two more to consider this season',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Continuing the walk through your roadmap — here are priorities #2 and #3 from your Baseline:</p>
<p><strong>#2 — {{priorityTwoTitle}}:</strong> {{priorityTwoContext}}</p>
<p><strong>#3 — {{priorityThreeTitle}}:</strong> {{priorityThreeContext}}</p>
<p>These two can typically be sequenced with #1 if it makes sense for you, saving trip charges and scheduling friction.</p>
${btn('{{portalUrl}}/baseline/{{baselineId}}', 'See full roadmap →')}
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Priorities #2 and #3 from your Baseline:

#2 — {{priorityTwoTitle}}: {{priorityTwoContext}}
#3 — {{priorityThreeTitle}}: {{priorityThreeContext}}

These can often be sequenced with #1 — saves trip charges and scheduling friction.

Full roadmap: {{portalUrl}}/baseline/{{baselineId}}

${SIG_TEXT}`,
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'priorityTwoTitle', description: 'Name of priority #2' },
      { tag: 'priorityTwoContext', description: 'Plain-English context' },
      { tag: 'priorityThreeTitle', description: 'Name of priority #3' },
      { tag: 'priorityThreeContext', description: 'Plain-English context' },
      { tag: 'baselineId', description: 'Portal baseline record id' },
      PORTAL,
    ],
  },
  {
    key: 'pb_day9',
    name: 'Post-Baseline — Day 9',
    subject: 'Ready to bundle the first round?',
    preheader: 'We\'ll package the top priorities into a single estimate',
    html: `<p>Hi {{customerFirstName}},</p>
<p>If the roadmap is resonating, the next step is easy: let us bundle your top priorities into a single estimate. Most members find it makes the decision simpler and keeps costs lower (one trip, one crew, one timeline).</p>
${btn('{{portalUrl}}/baseline/{{baselineId}}/request-estimate', 'Request bundled estimate →')}
<p>If you'd rather cherry-pick or hold off for now, that's totally fine — nothing is time-pressured. Reply with what's on your mind and we'll go from there.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

If the roadmap is resonating, next step is easy: let us bundle your top priorities into a single estimate. One trip, one crew, one timeline.

Request bundled estimate: {{portalUrl}}/baseline/{{baselineId}}/request-estimate

Want to cherry-pick or hold off? Reply — nothing is time-pressured.

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, { tag: 'baselineId', description: 'Portal baseline record id' }, PORTAL],
  },
  {
    key: 'pb_day14',
    name: 'Post-Baseline — Day 14',
    subject: 'Any questions on your roadmap?',
    preheader: 'Last check-in before we let it rest',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Just checking in — it's been two weeks since your Baseline and we wanted to offer one more chance to talk through anything on your roadmap before we let it rest in your portal.</p>
<p>No pressure either way. If you're still noodling on it, that's great — your roadmap stays current forever and we'll revisit it with you every year. And if you're ready to take a swing at something, reply and we'll line up an estimate.</p>
${btn('{{portalUrl}}/baseline/{{baselineId}}', 'Review roadmap →')}
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

It's been two weeks since your Baseline — one more chance to talk through anything on your roadmap before we let it rest.

No pressure. Your roadmap stays current forever, and we revisit it every year.

Review: {{portalUrl}}/baseline/{{baselineId}}

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, { tag: 'baselineId', description: 'Portal baseline record id' }, PORTAL],
  },
];

// ─── LEAD NURTURE SEQUENCES (8 sequences · 18 emails) ────────────────────────
const NURTURE = [
  // Sequence 1: Cold Lead (3 emails)
  {
    key: 'nurt_cold_1',
    name: 'Cold Lead — Intro',
    subject: 'Thanks for reaching out to Handy Pioneers',
    preheader: 'Here\'s what working with us looks like',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Thanks for getting in touch! A team member will follow up within 1 business day to talk through your project. In the meantime, here's a quick picture of how we work:</p>
<ol>
  <li><strong>Free on-site consultation</strong> — we walk the project, ask questions, and leave you with a clear sense of scope and ballpark cost.</li>
  <li><strong>Detailed estimate in your portal</strong> — reviewable on your phone, approvable in one click, no printing or scanning.</li>
  <li><strong>Transparent schedule + progress photos</strong> throughout the job.</li>
</ol>
${btn('{{portalUrl}}/about', 'Learn more about us →')}
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Thanks for getting in touch! A team member will follow up within 1 business day.

How we work:
1. Free on-site consultation
2. Detailed estimate in your portal — one-click approval
3. Transparent schedule + progress photos

Learn more: {{portalUrl}}/about

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, PORTAL],
  },
  {
    key: 'nurt_cold_2',
    name: 'Cold Lead — Social Proof (Day 3)',
    subject: 'A couple of recent projects you might like',
    preheader: 'Real homes, real outcomes',
    html: `<p>Hi {{customerFirstName}},</p>
<p>We thought you might enjoy a peek at a couple of recent projects while you're weighing options:</p>
<ul>
  <li><a href="{{caseStudyOneUrl}}">{{caseStudyOneTitle}}</a></li>
  <li><a href="{{caseStudyTwoUrl}}">{{caseStudyTwoTitle}}</a></li>
</ul>
<p>Both homeowners let us share before/after photos and the decision-making that got them there. Hopefully gives you a better sense of the kind of work we do and how we communicate along the way.</p>
<p>Ready to chat about your project? Just reply or book a free consult:</p>
${btn('{{portalUrl}}/book', 'Book free consult →')}
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Thought you might enjoy a peek at a couple recent projects:

- {{caseStudyOneTitle}}: {{caseStudyOneUrl}}
- {{caseStudyTwoTitle}}: {{caseStudyTwoUrl}}

Ready to chat? {{portalUrl}}/book

${SIG_TEXT}`,
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'caseStudyOneTitle', description: 'First case study title' },
      { tag: 'caseStudyOneUrl', description: 'First case study URL' },
      { tag: 'caseStudyTwoTitle', description: 'Second case study title' },
      { tag: 'caseStudyTwoUrl', description: 'Second case study URL' },
      PORTAL,
    ],
  },
  {
    key: 'nurt_cold_3',
    name: 'Cold Lead — Last Touch (Day 10)',
    subject: 'Still here whenever you\'re ready',
    preheader: 'No pressure, just an open door',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Last quick touch — we haven't heard back and that's completely fine. Home projects take the time they take.</p>
<p>If timing or budget shifted or you just want to ask a question, reply and you'll reach a real human. We'll leave your file open on our end for the next time it makes sense.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Last quick touch — we haven't heard back and that's completely fine. Home projects take the time they take.

Reply any time. We'll leave your file open.

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, PORTAL],
  },

  // Sequence 2: Consultation No-Show (2 emails)
  {
    key: 'nurt_noshow_1',
    name: 'No-Show — Reschedule Offer',
    subject: 'Missed you today — want to pick a new time?',
    preheader: 'It happens, no sweat',
    html: `<p>Hi {{customerFirstName}},</p>
<p>We swung by for your consultation today but weren't able to connect — life happens, no sweat.</p>
<p>If you'd still like us to take a look at the project, grab a new time that works better:</p>
${btn('{{portalUrl}}/schedule', 'Pick a new time →')}
<p>Or reply to this email and we'll work around your schedule — evenings and Saturdays are open for most consults.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

We swung by for your consultation today but weren't able to connect — no sweat.

Reschedule: {{portalUrl}}/schedule

Or reply — evenings and Saturdays are open.

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, PORTAL],
  },
  {
    key: 'nurt_noshow_2',
    name: 'No-Show — Final Follow-Up',
    subject: 'Closing your consult request — let us know if you want to revisit',
    preheader: 'Door stays open',
    html: `<p>Hi {{customerFirstName}},</p>
<p>We're going to close out your open consult request for now — but the door stays open. Reply any time and we'll pick it back up.</p>
<p>If there's anything we could have done differently to make booking easier, we'd love to hear it.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

We're closing your open consult request for now — door stays open. Reply any time.

If we could have made booking easier, we'd love to hear it.

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, PORTAL],
  },

  // Sequence 3: Estimate Sent — No Response (3 emails)
  {
    key: 'nurt_est_silent_1',
    name: 'Estimate Silent — Day 3',
    subject: 'Any questions on estimate {{referenceNumber}}?',
    preheader: 'Happy to walk through line items',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Just a quick check-in on estimate <strong>{{referenceNumber}}</strong> — happy to walk through any line item, adjust scope, or talk about sequencing the work if any of that would help.</p>
${btn('{{estimateUrl}}', 'Reopen estimate →')}
<p>Easiest is just replying to this email with whatever's on your mind.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Quick check-in on estimate {{referenceNumber}} — happy to walk through any line item, adjust scope, or talk sequencing.

Reopen: {{estimateUrl}}

Reply with anything on your mind.

${SIG_TEXT}`,
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'referenceNumber', description: 'Estimate number' },
      { tag: 'estimateUrl', description: 'Portal estimate link' },
      PORTAL,
    ],
  },
  {
    key: 'nurt_est_silent_2',
    name: 'Estimate Silent — Day 7 (Options)',
    subject: 'A few ways we could adjust the estimate',
    preheader: 'Scope, sequencing, or phasing',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Haven't heard back on <strong>{{referenceNumber}}</strong> — figured I'd surface a few common ways we tweak estimates when something's not quite landing:</p>
<ul>
  <li><strong>Phase it</strong> — do the must-haves now, put the nice-to-haves on a second visit later</li>
  <li><strong>Swap materials</strong> — sometimes 70% of the feel at 50% of the cost</li>
  <li><strong>Time the work</strong> — off-season slots are usually 10–15% less</li>
</ul>
<p>Reply with what's on your mind and we'll put together a revised version.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Haven't heard back on {{referenceNumber}}. A few ways we often tweak estimates:

- Phase it — must-haves now, nice-to-haves later
- Swap materials — sometimes 70% of the feel at 50% of the cost
- Time the work — off-season slots are usually 10–15% less

Reply and we'll revise.

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, { tag: 'referenceNumber', description: 'Estimate number' }, PORTAL],
  },
  {
    key: 'nurt_est_silent_3',
    name: 'Estimate Silent — Day 14 (Close)',
    subject: 'Closing {{referenceNumber}} for now',
    preheader: 'Estimate stays in your portal',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Haven't heard back, so I'll close <strong>{{referenceNumber}}</strong> for now. The estimate stays in your portal — if you come back to it in a week or a year, we can reopen and refresh pricing in a click.</p>
<p>If anything changed or we missed the mark, reply and let us know. Always useful to hear.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Closing {{referenceNumber}} for now. Estimate stays in your portal — we can reopen and refresh pricing any time.

If anything changed or we missed the mark, reply. Useful to hear.

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, { tag: 'referenceNumber', description: 'Estimate number' }, PORTAL],
  },

  // Sequence 4: Estimate Declined (2 emails)
  {
    key: 'nurt_declined_1',
    name: 'Declined — Learn-More Follow-Up',
    subject: 'Two-minute question about {{referenceNumber}}',
    preheader: 'Helps us do better next time',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Thanks again for considering us on <strong>{{referenceNumber}}</strong>. Would you be up for a two-minute reply letting me know what drove the decision?</p>
<p>Was it price, timing, scope fit, comfort with the team, or something else? Totally fine if you don't want to — no follow-up pitch. Just genuinely useful for us.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Thanks again for considering us on {{referenceNumber}}. Up for a two-minute reply on what drove the decision — price, timing, scope, fit, something else?

Genuinely useful for us. No follow-up pitch.

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, { tag: 'referenceNumber', description: 'Estimate number' }, PORTAL],
  },
  {
    key: 'nurt_declined_2',
    name: 'Declined — Stay-In-Touch (Month 3)',
    subject: 'Hope the project went well',
    preheader: 'Door stays open',
    html: `<p>Hi {{customerFirstName}},</p>
<p>It's been a few months since your estimate — hope the project went well, whichever route you took.</p>
<p>If anything new comes up and you want a second opinion or a fresh quote, we're here. Door stays open.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

It's been a few months since your estimate — hope the project went well.

If anything new comes up and you want a second opinion or fresh quote, we're here.

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, PORTAL],
  },

  // Sequence 5: Past Customer — 6 months (2 emails)
  {
    key: 'nurt_past_6mo_1',
    name: 'Past Customer — 6-Month Check-In',
    subject: 'How\'s the {{projectName}} holding up?',
    preheader: 'A quick check-in from the team',
    html: `<p>Hi {{customerFirstName}},</p>
<p>It's been about six months since we wrapped your <strong>{{projectName}}</strong> — how's it holding up? Anything you've noticed we should take a second look at?</p>
<p>Also: if it's useful, a short Google review means the world to our small team. No pressure either way.</p>
${btn('{{reviewLink}}', 'Leave a quick review')}
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Six months since we wrapped your {{projectName}} — how's it holding up? Anything we should take a second look at?

If it's useful, a short Google review means the world: {{reviewLink}}

${SIG_TEXT}`,
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'projectName', description: 'Name of completed project' },
      { tag: 'reviewLink', description: 'Google review URL' },
      PORTAL,
    ],
  },
  {
    key: 'nurt_past_6mo_2',
    name: 'Past Customer — Seasonal Suggestion',
    subject: 'One thing worth doing this season',
    preheader: 'Based on what we know about your home',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Based on the scope of work we did and the time of year, here's one thing worth putting on your list this season: <strong>{{seasonalSuggestion}}</strong>.</p>
<p>Quick, low-cost, and helps protect the investment you already made.</p>
${btn('{{portalUrl}}/book', 'Add it to our next visit →')}
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Based on the work we did and time of year, one thing worth adding this season: {{seasonalSuggestion}}.

Quick, low-cost, protects the investment.

Add it: {{portalUrl}}/book

${SIG_TEXT}`,
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'seasonalSuggestion', description: 'Seasonal maintenance suggestion' },
      PORTAL,
    ],
  },

  // Sequence 6: Past Customer — Anniversary (2 emails)
  {
    key: 'nurt_anniv_1',
    name: 'Past Customer — 1-Year Anniversary',
    subject: 'One year of your {{projectName}}',
    preheader: 'A thank-you from the team',
    html: `<p>Hi {{customerFirstName}},</p>
<p>It's been one year since we finished your <strong>{{projectName}}</strong>! Thanks for trusting us with it. We hope it's still making your home feel a little better every day.</p>
<p>If anything has come up or you've been thinking about the next project, we'd love to hear. Loyal customers get the first slots on our schedule.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

One year since we finished your {{projectName}}! Thanks for trusting us with it.

If anything's come up or you're thinking about a next project, we'd love to hear. Loyal customers get the first slots.

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, { tag: 'projectName', description: 'Project name' }, PORTAL],
  },
  {
    key: 'nurt_anniv_2',
    name: 'Past Customer — 360° Membership Nudge',
    subject: 'Have you seen the 360° Method?',
    preheader: 'Home care without the surprises',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Since we've worked together, we launched a membership program called the 360° Method — it's for homeowners who want ongoing care without the chasing-contractors cycle.</p>
<p>Highlights:</p>
<ul>
  <li>Comprehensive Baseline inspection that becomes your prioritized roadmap</li>
  <li>Seasonal tune-ups included in the membership</li>
  <li>Priority scheduling + member pricing on bigger projects</li>
  <li>Annual Home Valuation Report showing how upkeep protects your home value</li>
</ul>
${btn('{{portalUrl}}/360', 'See the 360° Method →')}
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Since we worked together, we launched the 360° Method — for homeowners who want ongoing care without chasing contractors.

- Baseline inspection + prioritized roadmap
- Seasonal tune-ups included
- Priority scheduling + member pricing
- Annual Home Valuation Report

See it: {{portalUrl}}/360

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, PORTAL],
  },

  // Sequence 7: Priority Translation — no Baseline booked (2 emails)
  {
    key: 'nurt_pt_to_baseline_1',
    name: 'Post-Translation — Baseline Intro',
    subject: 'The next step after your translation',
    preheader: 'Turn the list into a plan',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Now that you've seen your priority translation, the natural next step is a <strong>360° Baseline Walkthrough</strong> — we come on-site, verify findings in person, and build out the prioritized roadmap for your home.</p>
<p>A translation tells you what's on the list. The Baseline tells you what to do in what order and over how long.</p>
${btn('{{portalUrl}}/schedule/baseline', 'Book my Baseline →')}
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Now that you've seen your priority translation, the natural next step is a 360° Baseline Walkthrough — on-site verification + prioritized roadmap.

Translation = what's on the list. Baseline = what to do, in what order, over how long.

Book: {{portalUrl}}/schedule/baseline

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, PORTAL],
  },
  {
    key: 'nurt_pt_to_baseline_2',
    name: 'Post-Translation — Second Nudge',
    subject: 'Still here if you want help prioritizing',
    preheader: 'Quick call or a full walk — your call',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Quick note: if a full Baseline feels like a lot right now, we also do free 15-minute calls where we walk through your translation line-by-line and just help you sort what can wait vs. what shouldn't.</p>
${btn('{{portalUrl}}/book/consult-call', 'Book a 15-min call →')}
<p>Or reply and ask anything directly — no commitment.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

If a Baseline feels like a lot, we also do free 15-minute calls — walk through your translation, help sort what can wait.

Book: {{portalUrl}}/book/consult-call

Or reply with any question.

${SIG_TEXT}`,
    mergeTagSchema: [CUSTOMER, PORTAL],
  },

  // Sequence 8: Referred Lead — warm intro (2 emails)
  {
    key: 'nurt_referral_1',
    name: 'Referral — Warm Welcome',
    subject: '{{referrerName}} sent you our way',
    preheader: 'Happy to meet you',
    html: `<p>Hi {{customerFirstName}},</p>
<p><strong>{{referrerName}}</strong> mentioned you might be thinking about a project — always our favorite kind of hello.</p>
<p>No pressure. When you're ready, we'd love to come out for a free consult and walk the project with you. Easiest from here:</p>
${btn('{{portalUrl}}/book', 'Book free consult →')}
<p>Or reply with what's on your mind and we can start there.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

{{referrerName}} mentioned you might be thinking about a project — always our favorite kind of hello.

No pressure. When ready, happy to come out for a free consult.

Book: {{portalUrl}}/book

Or reply with what's on your mind.

${SIG_TEXT}`,
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'referrerName', description: 'Name of the referring customer' },
      PORTAL,
    ],
  },
  {
    key: 'nurt_referral_2',
    name: 'Referral — Gentle Follow-Up',
    subject: 'Circling back — did you want us to swing by?',
    preheader: 'No rush, just keeping the thread alive',
    html: `<p>Hi {{customerFirstName}},</p>
<p>Quick circle back from the intro <strong>{{referrerName}}</strong> made — did you want us to set up a consult, or is now not the right time?</p>
<p>Totally fine either way. If the answer's "not right now," just say so and we'll get out of your inbox until you ping us.</p>
${SIG_HTML}`,
    text: `Hi {{customerFirstName}},

Quick circle back from the intro {{referrerName}} made — did you want us to set up a consult?

Fine either way. Say the word if it's not the right time and we'll get out of your inbox.

${SIG_TEXT}`,
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'referrerName', description: 'Name of the referring customer' },
      PORTAL,
    ],
  },
];

// ─── COMBINE + INSERT ────────────────────────────────────────────────────────
const ALL_TEMPLATES = [
  ...ACCOUNT_PORTAL,
  ...APPT,
  ...SCOPE,
  ...INVOICING,
  ...MEMBERSHIP,
  ...PT,
  ...POST_BASELINE,
  ...NURTURE,
];

const conn = await mysql.createConnection(url);

// Ensure the table exists even if migration 0052 wasn't applied — the
// drizzle tracker has diverged from prod state during the MySQL port
// (see CLAUDE.md). Mirrors the ensurePhoneTables / smsTemplates seed
// guard pattern documented in b60ec4c.
await conn.execute(`
  CREATE TABLE IF NOT EXISTS emailTemplates (
    id int AUTO_INCREMENT NOT NULL,
    tenantId int NOT NULL DEFAULT 1,
    \`key\` varchar(80) NOT NULL,
    name varchar(160) NOT NULL DEFAULT '',
    subject varchar(300) NOT NULL DEFAULT '',
    preheader varchar(300) DEFAULT '',
    html text NOT NULL,
    \`text\` text,
    mergeTagSchema text,
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY emailTemplates_tenant_key_unique (tenantId, \`key\`),
    KEY emailTemplates_key_idx (\`key\`)
  )
`);

let inserted = 0;
let updated = 0;

for (const t of ALL_TEMPLATES) {
  const [existing] = await conn.execute(
    'SELECT id FROM emailTemplates WHERE tenantId = 1 AND `key` = ?',
    [t.key]
  );
  const payload = [
    t.name,
    t.subject,
    t.preheader ?? '',
    t.html,
    t.text ?? null,
    JSON.stringify(t.mergeTagSchema ?? []),
  ];
  if (existing.length > 0) {
    await conn.execute(
      `UPDATE emailTemplates
         SET name = ?, subject = ?, preheader = ?, html = ?, \`text\` = ?, mergeTagSchema = ?
       WHERE tenantId = 1 AND \`key\` = ?`,
      [...payload, t.key]
    );
    console.log(`  UPDATE ${t.key}`);
    updated++;
    continue;
  }
  await conn.execute(
    `INSERT INTO emailTemplates
       (tenantId, \`key\`, name, subject, preheader, html, \`text\`, mergeTagSchema)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
    [t.key, ...payload]
  );
  console.log(`  INSERT ${t.key}`);
  inserted++;
}

await conn.end();
console.log(
  `\nSeeded ${ALL_TEMPLATES.length} email templates. Inserted: ${inserted}, Updated: ${updated}.`
);
console.log(
  `Breakdown — Account/Portal: ${ACCOUNT_PORTAL.length} · Appointments: ${APPT.length} · Scope: ${SCOPE.length} · Invoicing: ${INVOICING.length} · Membership: ${MEMBERSHIP.length} · PriorityTranslation: ${PT.length} · PostBaseline: ${POST_BASELINE.length} · Nurture: ${NURTURE.length}`
);
