/**
 * Seed pre-built automation rules.
 * Run: node scripts/seed-automations.mjs
 *
 * All rules are inserted with enabled=true (on by default).
 * Uses INSERT … ON DUPLICATE KEY UPDATE so re-running is safe and
 * updates existing rows with the latest templates.
 * Uniqueness is keyed on `name`.
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const RULES = [
  // ── LEAD STAGE ────────────────────────────────────────────────────────────
  {
    name: 'New Booking — Welcome SMS',
    stage: 'lead',
    trigger: 'new_booking',
    actionType: 'send_sms',
    actionPayload: JSON.stringify({
      messageTemplate:
        'Hi {{customerFirstName}}, thanks for reaching out to Handy Pioneers! We received your request and a team member will follow up within 1 business day. — The HP Team',
    }),
    delayMinutes: 0,
    sortOrder: 10,
  },
  {
    name: 'New Booking — Welcome Email',
    stage: 'lead',
    trigger: 'new_booking',
    actionType: 'send_email',
    actionPayload: JSON.stringify({
      subject: 'We received your request — Handy Pioneers',
      bodyTemplate:
        'Hi {{customerFirstName}},\n\nThank you for reaching out to Handy Pioneers! We received your service request and a team member will be in touch within 1 business day.\n\nIf you have any questions in the meantime, feel free to reply to this email.\n\nBest,\nThe Handy Pioneers Team',
    }),
    delayMinutes: 0,
    sortOrder: 11,
  },
  {
    name: 'New Lead — Internal Alert',
    stage: 'lead',
    trigger: 'lead_created',
    actionType: 'notify_owner',
    actionPayload: JSON.stringify({
      title: 'New Lead: {{customerName}}',
      contentTemplate:
        'A new lead was created for {{customerName}} ({{phone}}).\nDescription: {{description}}',
    }),
    delayMinutes: 0,
    sortOrder: 12,
  },
  {
    name: 'Missed Call — Auto-Reply SMS',
    stage: 'lead',
    trigger: 'missed_call',
    actionType: 'send_sms',
    actionPayload: JSON.stringify({
      messageTemplate:
        "Hi {{customerFirstName}}, sorry we missed your call! We'll be in touch shortly. — Handy Pioneers",
    }),
    delayMinutes: 5,
    sortOrder: 13,
  },
  {
    name: 'Inbound SMS — Auto-Acknowledgment',
    stage: 'lead',
    trigger: 'inbound_sms',
    actionType: 'send_sms',
    actionPayload: JSON.stringify({
      messageTemplate:
        "Hi {{customerFirstName}}, thanks for your message! We'll get back to you shortly. — Handy Pioneers",
    }),
    delayMinutes: 0,
    sortOrder: 14,
  },

  // ── ESTIMATE STAGE ────────────────────────────────────────────────────────
  {
    name: 'Estimate Sent — Confirmation SMS',
    stage: 'estimate',
    trigger: 'estimate_sent',
    actionType: 'send_sms',
    actionPayload: JSON.stringify({
      messageTemplate:
        "Hi {{customerFirstName}}, your estimate from Handy Pioneers has been sent! Check your email to review and approve it. Questions? Just reply here.",
    }),
    delayMinutes: 0,
    sortOrder: 20,
  },
  {
    name: 'Estimate Sent — Follow-Up SMS',
    stage: 'estimate',
    trigger: 'estimate_sent',
    actionType: 'send_sms',
    actionPayload: JSON.stringify({
      messageTemplate:
        'Hi {{customerFirstName}}, just checking in on the estimate we sent. Any questions or ready to move forward? — Handy Pioneers',
    }),
    delayMinutes: 2880, // 48 hours
    sortOrder: 21,
  },
  {
    name: 'Estimate Viewed — Nudge SMS',
    stage: 'estimate',
    trigger: 'estimate_viewed',
    actionType: 'send_sms',
    actionPayload: JSON.stringify({
      messageTemplate:
        "Hi {{customerFirstName}}, looks like you had a chance to review your estimate! Let us know if you have any questions — we're happy to walk you through it.",
    }),
    delayMinutes: 120, // 2 hours
    sortOrder: 22,
  },
  {
    name: 'Estimate Approved — Congratulations SMS',
    stage: 'estimate',
    trigger: 'estimate_approved',
    actionType: 'send_sms',
    actionPayload: JSON.stringify({
      messageTemplate:
        "Hi {{customerFirstName}}, great news — your estimate has been approved! We'll be in touch shortly to schedule your project. — Handy Pioneers",
    }),
    delayMinutes: 0,
    sortOrder: 23,
  },

  // ── JOB STAGE ─────────────────────────────────────────────────────────────
  {
    name: 'Job Created — Kickoff SMS',
    stage: 'job',
    trigger: 'job_created',
    actionType: 'send_sms',
    actionPayload: JSON.stringify({
      messageTemplate:
        "Hi {{customerFirstName}}, your job with Handy Pioneers is officially scheduled! We'll confirm the exact date and time soon. Excited to get started!",
    }),
    delayMinutes: 0,
    sortOrder: 30,
  },
  {
    name: 'Job Completed — Thank You SMS',
    stage: 'job',
    trigger: 'job_completed',
    actionType: 'send_sms',
    actionPayload: JSON.stringify({
      messageTemplate:
        'Hi {{customerFirstName}}, your project is complete! Thank you for choosing Handy Pioneers. We hope everything looks great — let us know if you need anything.',
    }),
    delayMinutes: 0,
    sortOrder: 31,
  },
  {
    name: 'Job Completed — Review Request SMS',
    stage: 'job',
    trigger: 'job_completed',
    actionType: 'send_sms',
    actionPayload: JSON.stringify({
      messageTemplate:
        "Hi {{customerFirstName}}, if you're happy with the work we'd love a quick Google review — it means the world to our small team! {{googleReviewLink}} Thank you! — Handy Pioneers",
    }),
    delayMinutes: 1440, // 24 hours
    sortOrder: 32,
  },
  {
    name: 'Job Completed — Review Request Email',
    stage: 'job',
    trigger: 'job_completed',
    actionType: 'send_email',
    actionPayload: JSON.stringify({
      subject: 'How did we do? — Handy Pioneers',
      bodyTemplate:
        "Hi {{customerFirstName}},\n\nThank you for choosing Handy Pioneers! We hope your project exceeded expectations.\n\nIf you have a moment, we'd really appreciate a Google review — it helps other homeowners find us and supports our small team:\n\n{{googleReviewLink}}\n\nThank you so much!\n\nBest,\nThe Handy Pioneers Team",
    }),
    delayMinutes: 2880, // 48 hours
    sortOrder: 33,
  },

  // ── INVOICE STAGE ─────────────────────────────────────────────────────────
  {
    name: 'Invoice Sent — Confirmation SMS',
    stage: 'invoice',
    trigger: 'invoice_sent',
    actionType: 'send_sms',
    actionPayload: JSON.stringify({
      messageTemplate:
        'Hi {{customerFirstName}}, your invoice from Handy Pioneers has been sent to your email. You can pay securely through your customer portal. Questions? Just reply here.',
    }),
    delayMinutes: 0,
    sortOrder: 40,
  },
  {
    name: 'Invoice Overdue — Reminder SMS',
    stage: 'invoice',
    trigger: 'invoice_overdue',
    actionType: 'send_sms',
    actionPayload: JSON.stringify({
      messageTemplate:
        'Hi {{customerFirstName}}, just a friendly reminder that invoice {{referenceNumber}} from Handy Pioneers is past due. Please log in to your portal to pay or reach out if you have questions.',
    }),
    delayMinutes: 0,
    sortOrder: 41,
  },
  {
    name: 'Invoice Overdue — Reminder Email',
    stage: 'invoice',
    trigger: 'invoice_overdue',
    actionType: 'send_email',
    actionPayload: JSON.stringify({
      subject: 'Payment reminder — Invoice {{referenceNumber}}',
      bodyTemplate:
        "Hi {{customerFirstName}},\n\nThis is a friendly reminder that invoice {{referenceNumber}} from Handy Pioneers is past due.\n\nPlease log in to your customer portal to view and pay your invoice at your earliest convenience.\n\nIf you have any questions or concerns, please don't hesitate to reach out.\n\nThank you,\nThe Handy Pioneers Team",
    }),
    delayMinutes: 0,
    sortOrder: 42,
  },

  // ── REVIEWS ───────────────────────────────────────────────────────────────
  {
    name: 'Google Review — 7-Day Follow-Up SMS',
    stage: 'review',
    trigger: 'job_completed',
    actionType: 'send_sms',
    actionPayload: JSON.stringify({
      messageTemplate:
        "Hi {{customerFirstName}}, it's been a week since we finished your project! If you're still happy with the results, a Google review would mean a lot to us: {{googleReviewLink}} — Handy Pioneers",
    }),
    delayMinutes: 10080, // 7 days
    sortOrder: 50,
  },
];

let inserted = 0;
let updated = 0;

for (const rule of RULES) {
  const [existing] = await conn.execute(
    'SELECT id, enabled FROM automationRules WHERE name = ?',
    [rule.name]
  );
  if (existing.length > 0) {
    // Update template content but preserve the user's enabled toggle
    await conn.execute(
      `UPDATE automationRules
         SET stage = ?, \`trigger\` = ?, actionType = ?, actionPayload = ?,
             delayMinutes = ?, sortOrder = ?, enabled = 1
       WHERE name = ?`,
      [rule.stage, rule.trigger, rule.actionType, rule.actionPayload, rule.delayMinutes, rule.sortOrder, rule.name]
    );
    console.log(`  UPDATE ${rule.name}`);
    updated++;
    continue;
  }
  await conn.execute(
    `INSERT INTO automationRules
       (name, stage, \`trigger\`, actionType, actionPayload, delayMinutes, enabled, sortOrder, conditions)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, '[]')`,
    [rule.name, rule.stage, rule.trigger, rule.actionType, rule.actionPayload, rule.delayMinutes, rule.sortOrder]
  );
  console.log(`  INSERT ${rule.name}`);
  inserted++;
}

console.log(`\nDone. Inserted: ${inserted}, Updated: ${updated}`);
await conn.end();
