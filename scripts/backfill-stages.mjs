import 'dotenv/config';
import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const updates = [
  ['lead',     'New Booking — Welcome SMS'],
  ['lead',     'New Booking — Welcome Email'],
  ['lead',     'New Lead — Internal Alert'],
  ['lead',     'Missed Call — Auto-Reply SMS'],
  ['lead',     'Inbound SMS — Auto-Acknowledgment'],
  ['estimate', 'Estimate Sent — Confirmation SMS'],
  ['estimate', 'Estimate Sent — Follow-Up SMS'],
  ['estimate', 'Estimate Viewed — Nudge SMS'],
  ['estimate', 'Estimate Approved — Congratulations SMS'],
  ['job',      'Job Created — Kickoff SMS'],
  ['job',      'Job Completed — Thank You SMS'],
  ['job',      'Job Completed — Review Request SMS'],
  ['job',      'Job Completed — Review Request Email'],
  ['invoice',  'Invoice Sent — Confirmation SMS'],
  ['invoice',  'Invoice Overdue — Reminder SMS'],
  ['invoice',  'Invoice Overdue — Reminder Email'],
  ['review',   'Google Review \u2014 7-Day Follow-Up SMS'],
];

for (const [stage, name] of updates) {
  const [r] = await conn.execute('UPDATE automationRules SET stage=? WHERE name=?', [stage, name]);
  console.log(stage.padEnd(10), r.affectedRows ? 'OK  ' : 'MISS', name);
}

await conn.end();
console.log('\nDone.');
