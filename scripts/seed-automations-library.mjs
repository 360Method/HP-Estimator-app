/**
 * Seed the 25-rule automation library into automationRules.
 *
 * 5 categories (matches automationRules.category column):
 *   lead_intake        — new booking, missed call, inbound SMS acks
 *   estimate_followup  — estimate sent, viewed, approval nudges
 *   job_lifecycle      — job kickoff, in-progress updates, completion
 *   invoice_payment    — invoice send, overdue reminders, payment receipts
 *   review_retention   — review requests, rebook nudges, winback
 *
 * Idempotent — uses ON CONFLICT (name) DO UPDATE so re-runs refresh templates
 * without clobbering the user's `enabled` toggle.
 *
 * Run: node scripts/seed-automations-library.mjs
 */
import "dotenv/config";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const sql = postgres(url, { prepare: false });

// Shorthand helpers
const SMS = (messageTemplate) => JSON.stringify({ messageTemplate });
const EMAIL = (subject, bodyTemplate) => JSON.stringify({ subject, bodyTemplate });
const NOTIFY = (title, contentTemplate) => JSON.stringify({ title, contentTemplate });

const RULES = [
  // ── lead_intake ─────────────────────────────────────────────────────────
  {
    name: "Lead — New Booking Welcome SMS",
    category: "lead_intake", stage: "lead", trigger: "new_booking",
    actionType: "send_sms", delayMinutes: 0,
    actionPayload: SMS("Hi {{customerFirstName}}, thanks for reaching out to Handy Pioneers! We got your request and a team member will follow up within 1 business day. — The HP Team"),
  },
  {
    name: "Lead — New Booking Welcome Email",
    category: "lead_intake", stage: "lead", trigger: "new_booking",
    actionType: "send_email", delayMinutes: 0,
    actionPayload: EMAIL(
      "We received your request — Handy Pioneers",
      "Hi {{customerFirstName}},\n\nThank you for reaching out to Handy Pioneers! We received your service request and a team member will be in touch within 1 business day.\n\nBest,\nThe Handy Pioneers Team",
    ),
  },
  {
    name: "Lead — Internal Alert on New Lead",
    category: "lead_intake", stage: "lead", trigger: "lead_created",
    actionType: "notify_owner", delayMinutes: 0,
    actionPayload: NOTIFY("New Lead: {{customerName}}", "Contact: {{customerName}} ({{phone}})\nDescription: {{description}}"),
  },
  {
    name: "Lead — Missed Call Auto-SMS",
    category: "lead_intake", stage: "lead", trigger: "missed_call",
    actionType: "send_sms", delayMinutes: 1,
    actionPayload: SMS("Hi! You reached Handy Pioneers. We missed your call — we'll call you back soon. Or text us here anytime. 📞"),
  },
  {
    name: "Lead — Inbound SMS Ack",
    category: "lead_intake", stage: "lead", trigger: "inbound_sms",
    actionType: "send_sms", delayMinutes: 0,
    actionPayload: SMS("Hi {{customerFirstName}}, thanks for your message! We'll get back to you shortly. — Handy Pioneers"),
  },
  {
    name: "Lead — 24hr No-Response Nudge",
    category: "lead_intake", stage: "lead", trigger: "lead_created",
    actionType: "send_sms", delayMinutes: 1440,
    actionPayload: SMS("Hi {{customerFirstName}}, just checking in — did you still want us to take a look at your project? Happy to answer any questions. — Handy Pioneers"),
  },

  // ── estimate_followup ───────────────────────────────────────────────────
  {
    name: "Estimate — Sent Confirmation SMS",
    category: "estimate_followup", stage: "estimate", trigger: "estimate_sent",
    actionType: "send_sms", delayMinutes: 0,
    actionPayload: SMS("Hi {{customerFirstName}}, your estimate from Handy Pioneers has been sent. Check your email to review and approve. Questions? Just reply here."),
  },
  {
    name: "Estimate — 48hr Follow-Up SMS",
    category: "estimate_followup", stage: "estimate", trigger: "estimate_sent",
    actionType: "send_sms", delayMinutes: 2880,
    actionPayload: SMS("Hi {{customerFirstName}}, checking in on the estimate we sent. Any questions or ready to move forward? — Handy Pioneers"),
  },
  {
    name: "Estimate — 7 Day Follow-Up Email",
    category: "estimate_followup", stage: "estimate", trigger: "estimate_sent",
    actionType: "send_email", delayMinutes: 10080,
    actionPayload: EMAIL(
      "Still thinking it over? — Handy Pioneers",
      "Hi {{customerFirstName}},\n\nJust following up on the estimate we sent. Let me know if you have any questions or need it adjusted — happy to walk through it together.\n\nBest,\nThe Handy Pioneers Team",
    ),
  },
  {
    name: "Estimate — Viewed Nudge SMS",
    category: "estimate_followup", stage: "estimate", trigger: "estimate_viewed",
    actionType: "send_sms", delayMinutes: 120,
    actionPayload: SMS("Hi {{customerFirstName}}, looks like you had a chance to review your estimate. Let us know if you have any questions — happy to walk you through it."),
  },
  {
    name: "Estimate — Approved Congrats SMS",
    category: "estimate_followup", stage: "estimate", trigger: "estimate_approved",
    actionType: "send_sms", delayMinutes: 0,
    actionPayload: SMS("Great news, {{customerFirstName}} — your estimate has been approved! We'll be in touch shortly to schedule. — Handy Pioneers"),
  },

  // ── job_lifecycle ───────────────────────────────────────────────────────
  {
    name: "Job — Kickoff SMS",
    category: "job_lifecycle", stage: "job", trigger: "job_created",
    actionType: "send_sms", delayMinutes: 0,
    actionPayload: SMS("Hi {{customerFirstName}}, your job is officially scheduled with Handy Pioneers! We'll confirm the exact date & time shortly. Excited to get started."),
  },
  {
    name: "Job — Day Before Reminder SMS",
    category: "job_lifecycle", stage: "job", trigger: "job_scheduled",
    actionType: "send_sms", delayMinutes: -1440,
    actionPayload: SMS("Hi {{customerFirstName}}, just a reminder — your Handy Pioneers crew is scheduled for tomorrow. Reply here if anything's changed."),
  },
  {
    name: "Job — On-The-Way SMS",
    category: "job_lifecycle", stage: "job", trigger: "tech_en_route",
    actionType: "send_sms", delayMinutes: 0,
    actionPayload: SMS("Hi {{customerFirstName}}, {{techName}} from Handy Pioneers is on the way. ETA: {{eta}}."),
  },
  {
    name: "Job — Completed Thank You SMS",
    category: "job_lifecycle", stage: "job", trigger: "job_completed",
    actionType: "send_sms", delayMinutes: 0,
    actionPayload: SMS("Hi {{customerFirstName}}, your project is complete! Thank you for choosing Handy Pioneers. Let us know if you need anything."),
  },
  {
    name: "Job — Internal Alert on Sign-Off",
    category: "job_lifecycle", stage: "job", trigger: "job_signed_off",
    actionType: "notify_owner", delayMinutes: 0,
    actionPayload: NOTIFY("Job Signed Off: {{customerName}}", "{{customerName}} signed off on their completion paperwork. Final invoice ready to send."),
  },

  // ── invoice_payment ─────────────────────────────────────────────────────
  {
    name: "Invoice — Sent Confirmation SMS",
    category: "invoice_payment", stage: "invoice", trigger: "invoice_sent",
    actionType: "send_sms", delayMinutes: 0,
    actionPayload: SMS("Hi {{customerFirstName}}, your Handy Pioneers invoice {{referenceNumber}} has been sent to your email. You can pay securely through your portal."),
  },
  {
    name: "Invoice — 3 Day Payment Nudge SMS",
    category: "invoice_payment", stage: "invoice", trigger: "invoice_sent",
    actionType: "send_sms", delayMinutes: 4320,
    actionPayload: SMS("Hi {{customerFirstName}}, friendly nudge — invoice {{referenceNumber}} is still open. Tap your portal to pay by card or ACH. Let me know if you need anything adjusted."),
  },
  {
    name: "Invoice — Overdue Reminder SMS",
    category: "invoice_payment", stage: "invoice", trigger: "invoice_overdue",
    actionType: "send_sms", delayMinutes: 0,
    actionPayload: SMS("Hi {{customerFirstName}}, invoice {{referenceNumber}} is past due. Please log in to your portal to pay or reply here if you have questions."),
  },
  {
    name: "Invoice — Overdue Reminder Email",
    category: "invoice_payment", stage: "invoice", trigger: "invoice_overdue",
    actionType: "send_email", delayMinutes: 0,
    actionPayload: EMAIL(
      "Payment reminder — Invoice {{referenceNumber}}",
      "Hi {{customerFirstName}},\n\nThis is a friendly reminder that invoice {{referenceNumber}} from Handy Pioneers is past due.\n\nPlease log in to your customer portal to view and pay at your earliest convenience.\n\nThank you,\nThe Handy Pioneers Team",
    ),
  },
  {
    name: "Invoice — Paid Receipt SMS",
    category: "invoice_payment", stage: "invoice", trigger: "invoice_paid",
    actionType: "send_sms", delayMinutes: 0,
    actionPayload: SMS("Hi {{customerFirstName}}, thanks for the payment on {{referenceNumber}}! A receipt is available in your customer portal. — Handy Pioneers"),
  },

  // ── review_retention ────────────────────────────────────────────────────
  {
    name: "Review — 24hr Request SMS",
    category: "review_retention", stage: "review", trigger: "job_completed",
    actionType: "send_sms", delayMinutes: 1440,
    actionPayload: SMS("Hi {{customerFirstName}}, if you're happy with the work we'd love a quick Google review — means the world to our small team! {{googleReviewLink}} — Handy Pioneers"),
  },
  {
    name: "Review — 48hr Request Email",
    category: "review_retention", stage: "review", trigger: "job_completed",
    actionType: "send_email", delayMinutes: 2880,
    actionPayload: EMAIL(
      "How did we do? — Handy Pioneers",
      "Hi {{customerFirstName}},\n\nThank you for choosing Handy Pioneers! If you have a moment, we'd really appreciate a Google review — it helps other homeowners find us:\n\n{{googleReviewLink}}\n\nThanks!\nThe Handy Pioneers Team",
    ),
  },
  {
    name: "Review — 7 Day Follow-Up SMS",
    category: "review_retention", stage: "review", trigger: "job_completed",
    actionType: "send_sms", delayMinutes: 10080,
    actionPayload: SMS("Hi {{customerFirstName}}, it's been a week since we finished your project! If you're still happy with how it turned out, a quick Google review would mean a lot: {{googleReviewLink}}"),
  },
  {
    name: "Retention — 6 Month Rebook Nudge",
    category: "review_retention", stage: "review", trigger: "job_completed",
    actionType: "send_email", delayMinutes: 259200, // ~180 days
    actionPayload: EMAIL(
      "Time for a seasonal check-in? — Handy Pioneers",
      "Hi {{customerFirstName}},\n\nHope all's well! It's been about 6 months since we wrapped up your project. If you have any new punch-list items building up, we'd love to handle them in one visit.\n\nReply here or book online — we save our members priority slots each month.\n\nBest,\nThe Handy Pioneers Team",
    ),
  },
  {
    name: "Retention — Annual Winback",
    category: "review_retention", stage: "review", trigger: "job_completed",
    actionType: "send_email", delayMinutes: 525600, // ~365 days
    actionPayload: EMAIL(
      "Your home one year later — Handy Pioneers",
      "Hi {{customerFirstName}},\n\nOne year ago today we finished your project. Time flies! If there's anything around the house that could use fresh attention, we'd love to help.\n\nAs a returning customer, your first hour is on us — just mention this email.\n\nBest,\nThe Handy Pioneers Team",
    ),
  },
];

let inserted = 0, updated = 0;
for (let i = 0; i < RULES.length; i++) {
  const r = RULES[i];
  const sortOrder = (i + 1) * 10;
  const existing = await sql`SELECT id FROM "automationRules" WHERE name = ${r.name} LIMIT 1`;
  if (existing.length > 0) {
    await sql`
      UPDATE "automationRules" SET
        category = ${r.category},
        stage = ${r.stage},
        "trigger" = ${r.trigger},
        "actionType" = ${r.actionType},
        "actionPayload" = ${r.actionPayload},
        "delayMinutes" = ${r.delayMinutes},
        "sortOrder" = ${sortOrder},
        "updatedAt" = now()
      WHERE name = ${r.name}
    `;
    updated++;
    console.log(`  UPDATE ${r.name}`);
  } else {
    await sql`
      INSERT INTO "automationRules"
        (name, category, stage, "trigger", "actionType", "actionPayload",
         "delayMinutes", enabled, "sortOrder", conditions)
      VALUES
        (${r.name}, ${r.category}, ${r.stage}, ${r.trigger}, ${r.actionType},
         ${r.actionPayload}, ${r.delayMinutes}, true, ${sortOrder}, '[]')
    `;
    inserted++;
    console.log(`  INSERT ${r.name}`);
  }
}

console.log(`\nDone. Inserted: ${inserted}, Updated: ${updated}, Total rules: ${RULES.length}`);
await sql.end();
