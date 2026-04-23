/**
 * Seed the Handy Pioneers SMS template library into the `smsTemplates` table.
 * Idempotent — safe to re-run.
 *
 * Run: node scripts/seed-sms-templates.mjs
 * Staging: DATABASE_URL=$STAGING_DATABASE_URL node scripts/seed-sms-templates.mjs
 *
 * 9 templates total:
 *   3 · Post-Baseline cadence (days 1, 4, 12)
 *   6 · Lead nurture sequences (one SMS per sequence where a text beats an email)
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const CUSTOMER = { tag: 'customerFirstName', description: 'Customer first name' };

const TEMPLATES = [
  // ─── Post-Baseline SMS cadence ─────────────────────────────────────────────
  {
    key: 'pb_sms_day1',
    name: 'Post-Baseline SMS — Day 1',
    body:
      'Hi {{customerFirstName}}, it\'s Handy Pioneers. Your 360° Baseline report is live in your portal — top 3 priorities are at the top: {{baselineLink}}. Reply any time with questions.',
    mergeTagSchema: [CUSTOMER, { tag: 'baselineLink', description: 'Short link to baseline report' }],
  },
  {
    key: 'pb_sms_day4',
    name: 'Post-Baseline SMS — Day 4',
    body:
      'Hey {{customerFirstName}} — did priority #1 ({{priorityOneTitle}}) from your Baseline land clearly? Want us to put together an estimate for it? Reply Y or N.',
    mergeTagSchema: [CUSTOMER, { tag: 'priorityOneTitle', description: 'Name of priority #1' }],
  },
  {
    key: 'pb_sms_day12',
    name: 'Post-Baseline SMS — Day 12',
    body:
      'Hi {{customerFirstName}}, quick last check-in from Handy Pioneers. Ready to bundle the top priorities into one estimate, or hold off for now? Reply BUNDLE or HOLD.',
    mergeTagSchema: [CUSTOMER],
  },

  // ─── Lead nurture SMS (6 — one per selected sequence) ──────────────────────
  {
    key: 'nurt_sms_new_booking',
    name: 'Nurture SMS — New Booking Welcome',
    body:
      'Hi {{customerFirstName}}, thanks for reaching out to Handy Pioneers! We got your request and a team member will follow up within 1 business day. — The HP Team',
    mergeTagSchema: [CUSTOMER],
  },
  {
    key: 'nurt_sms_appt_reminder',
    name: 'Nurture SMS — 24h Appointment Reminder',
    body:
      'Reminder: Handy Pioneers visit tomorrow {{appointmentDate}} at {{appointmentTime}}. Reply C to confirm or R to reschedule.',
    mergeTagSchema: [
      { tag: 'appointmentDate', description: 'Formatted date (e.g. Tue Apr 24)' },
      { tag: 'appointmentTime', description: 'Formatted time' },
    ],
  },
  {
    key: 'nurt_sms_estimate_silent',
    name: 'Nurture SMS — Estimate Silent Follow-Up',
    body:
      'Hi {{customerFirstName}}, any questions on estimate {{referenceNumber}}? Happy to walk through it or revise scope — just reply here.',
    mergeTagSchema: [CUSTOMER, { tag: 'referenceNumber', description: 'Estimate number' }],
  },
  {
    key: 'nurt_sms_review_request',
    name: 'Nurture SMS — Review Request',
    body:
      'Hi {{customerFirstName}}, it was a pleasure working on your place! If you have a minute, a quick Google review means the world to our small team: {{reviewLink}}',
    mergeTagSchema: [CUSTOMER, { tag: 'reviewLink', description: 'Google review short link' }],
  },
  {
    key: 'nurt_sms_seasonal_nudge',
    name: 'Nurture SMS — Seasonal Check-In',
    body:
      'Hey {{customerFirstName}} — season is shifting and it\'s a good time for {{seasonalSuggestion}}. Want us to add it to the next visit?',
    mergeTagSchema: [CUSTOMER, { tag: 'seasonalSuggestion', description: 'Seasonal maintenance suggestion' }],
  },
  {
    key: 'nurt_sms_payment_reminder',
    name: 'Nurture SMS — Payment Reminder',
    body:
      'Hi {{customerFirstName}}, friendly reminder that invoice {{referenceNumber}} ({{amount}}) is due {{dueDate}}. Pay here: {{invoiceLink}}',
    mergeTagSchema: [
      CUSTOMER,
      { tag: 'referenceNumber', description: 'Invoice number' },
      { tag: 'amount', description: 'Formatted amount due' },
      { tag: 'dueDate', description: 'Formatted due date' },
      { tag: 'invoiceLink', description: 'Short pay link' },
    ],
  },
];

const conn = await mysql.createConnection(url);

// Ensure the table exists even if migration 0065 hasn't been applied yet —
// matches the ensurePhoneTables pattern documented in b60ec4c.
await conn.execute(`
  CREATE TABLE IF NOT EXISTS smsTemplates (
    id int AUTO_INCREMENT NOT NULL,
    tenantId int NOT NULL DEFAULT 1,
    \`key\` varchar(80) NOT NULL,
    name varchar(160) NOT NULL DEFAULT '',
    body text NOT NULL,
    mergeTagSchema text,
    createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY smsTemplates_tenant_key_unique (tenantId, \`key\`),
    KEY smsTemplates_key_idx (\`key\`)
  )
`);

let inserted = 0;
let updated = 0;

for (const t of TEMPLATES) {
  const [existing] = await conn.execute(
    'SELECT id FROM smsTemplates WHERE tenantId = 1 AND `key` = ?',
    [t.key]
  );
  const payload = [t.name, t.body, JSON.stringify(t.mergeTagSchema ?? [])];
  if (existing.length > 0) {
    await conn.execute(
      `UPDATE smsTemplates
         SET name = ?, body = ?, mergeTagSchema = ?
       WHERE tenantId = 1 AND \`key\` = ?`,
      [...payload, t.key]
    );
    console.log(`  UPDATE ${t.key}`);
    updated++;
    continue;
  }
  await conn.execute(
    `INSERT INTO smsTemplates (tenantId, \`key\`, name, body, mergeTagSchema)
     VALUES (1, ?, ?, ?, ?)`,
    [t.key, ...payload]
  );
  console.log(`  INSERT ${t.key}`);
  inserted++;
}

await conn.end();
console.log(
  `\nSeeded ${TEMPLATES.length} SMS templates. Inserted: ${inserted}, Updated: ${updated}.`
);
