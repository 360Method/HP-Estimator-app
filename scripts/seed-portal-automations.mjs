/**
 * Seed pre-built automation rules for the 6 new portal triggers.
 * Run: node scripts/seed-portal-automations.mjs
 *
 * All rules are inserted with enabled=false (off by default).
 * If a rule with the same name already exists it is skipped.
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const RULES = [
  // ── JOB SIGN-OFF ─────────────────────────────────────────────────────────
  {
    name: 'Job Sign-Off — Thank You SMS',
    stage: 'job',
    trigger: 'job_signoff_submitted',
    actionType: 'send_sms',
    actionPayload: JSON.stringify({
      messageTemplate:
        'Hi {{customerFirstName}}, thank you for signing off on your project! Your final invoice has been sent to your portal. — Handy Pioneers',
    }),
    delayMinutes: 0,
    sortOrder: 34,
  },
  {
    name: 'Job Sign-Off — Review Request SMS',
    stage: 'review',
    trigger: 'job_signoff_submitted',
    actionType: 'send_sms',
    actionPayload: JSON.stringify({
      messageTemplate:
        'Hi {{customerFirstName}}, we\'re so glad the project is complete! If you\'re happy with the work, a quick Google review would mean the world to us: {{googleReviewLink}} — Handy Pioneers',
    }),
    delayMinutes: 1440, // 24 hours
    sortOrder: 51,
  },

  // ── CHANGE ORDER ─────────────────────────────────────────────────────────
  {
    name: 'Change Order Approved — Confirmation SMS',
    stage: 'job',
    trigger: 'change_order_approved',
    actionType: 'send_sms',
    actionPayload: JSON.stringify({
      messageTemplate:
        'Hi {{customerFirstName}}, your change order {{referenceNumber}} has been approved! We\'ll proceed with the updated scope. — Handy Pioneers',
    }),
    delayMinutes: 0,
    sortOrder: 35,
  },
  {
    name: 'Change Order Declined — Follow-Up SMS',
    stage: 'job',
    trigger: 'change_order_declined',
    actionType: 'send_sms',
    actionPayload: JSON.stringify({
      messageTemplate:
        'Hi {{customerFirstName}}, we received your decision on change order {{referenceNumber}}. No worries — we\'ll continue with the original scope. Reach out if you have questions. — Handy Pioneers',
    }),
    delayMinutes: 0,
    sortOrder: 36,
  },

  // ── INVOICE PAID ─────────────────────────────────────────────────────────
  {
    name: 'Invoice Paid — Thank You SMS',
    stage: 'invoice',
    trigger: 'invoice_paid',
    actionType: 'send_sms',
    actionPayload: JSON.stringify({
      messageTemplate:
        'Hi {{customerFirstName}}, we received your payment of {{amount}} for invoice {{referenceNumber}}. Thank you! — Handy Pioneers',
    }),
    delayMinutes: 0,
    sortOrder: 43,
  },
  {
    name: 'Invoice Paid — Review Request SMS',
    stage: 'review',
    trigger: 'invoice_paid',
    actionType: 'send_sms',
    actionPayload: JSON.stringify({
      messageTemplate:
        'Hi {{customerFirstName}}, thank you for your payment! If you\'re happy with our service, a Google review would really help us out: {{googleReviewLink}} — Handy Pioneers',
    }),
    delayMinutes: 2880, // 48 hours
    sortOrder: 52,
  },

  // ── PORTAL ONBOARDING ─────────────────────────────────────────────────────
  {
    name: 'Portal Onboarding Complete — Welcome SMS',
    stage: 'lead',
    trigger: 'portal_onboarding_complete',
    actionType: 'send_sms',
    actionPayload: JSON.stringify({
      messageTemplate:
        'Hi {{customerFirstName}}, welcome to your Handy Pioneers customer portal! You can view estimates, invoices, and project updates anytime. — The HP Team',
    }),
    delayMinutes: 0,
    sortOrder: 15,
  },

  // ── OFF-CYCLE VISIT ───────────────────────────────────────────────────────
  {
    name: 'Off-Cycle Visit Requested — Acknowledgment SMS',
    stage: 'lead',
    trigger: 'offcycle_visit_requested',
    actionType: 'send_sms',
    actionPayload: JSON.stringify({
      messageTemplate:
        'Hi {{customerFirstName}}, we received your request for an extra visit! Our team will review it and reach out to schedule. — Handy Pioneers',
    }),
    delayMinutes: 0,
    sortOrder: 16,
  },
];

let inserted = 0;
let skipped = 0;

for (const rule of RULES) {
  const [existing] = await conn.execute(
    'SELECT id FROM automationRules WHERE name = ?',
    [rule.name]
  );
  if (existing.length > 0) {
    console.log(`  SKIP  ${rule.name}`);
    skipped++;
    continue;
  }
  await conn.execute(
    `INSERT INTO automationRules
       (name, stage, \`trigger\`, actionType, actionPayload, delayMinutes, enabled, sortOrder, conditions)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, '[]')`,
    [rule.name, rule.stage, rule.trigger, rule.actionType, rule.actionPayload, rule.delayMinutes, rule.sortOrder]
  );
  console.log(`  INSERT ${rule.name}`);
  inserted++;
}

console.log(`\nDone. Inserted: ${inserted}, Skipped: ${skipped}`);
await conn.end();
