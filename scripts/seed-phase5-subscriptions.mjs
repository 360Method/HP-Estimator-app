#!/usr/bin/env node
/**
 * scripts/seed-phase5-subscriptions.mjs
 *
 * Additive seed for the Phase 5 events introduced by feat/agent-engine. The
 * existing scripts/seed-ai-agents.mjs handles the original event roster
 * (lead.created, opportunity.stage_changed, payment.received, voicemail.received,
 * roadmap_generator.submitted). This script adds the missing chain:
 *
 *   agent.run_completed → ai_system_integrity (anomaly logging)
 *   invoice.created → ai_cash_flow + ai_onboarding (post-create receipt draft)
 *   customer.portal_account_created → ai_onboarding + ai_nurture_cadence
 *   call.missed → ai_sdr (Lead Nurturer)
 *   subscription.renewed → ai_membership_success + ai_cash_flow
 *   subscription.cancelled → ai_membership_success + ai_nurture_cadence
 *
 * Idempotent: INSERT IGNORE on (agentId, eventName) avoids duplicates if you
 * re-run. Safe to run on prod.
 *
 *   node scripts/seed-phase5-subscriptions.mjs
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

/** event → seatName[]. Filter by autonomous status is enforced at queue-drain time. */
const SUBSCRIPTIONS = {
  "agent.run_completed": ["ai_system_integrity"],
  "invoice.created": ["ai_cash_flow", "ai_onboarding"],
  "customer.portal_account_created": ["ai_onboarding", "ai_nurture_cadence"],
  "call.missed": ["ai_sdr"],
  "subscription.renewed": ["ai_membership_success", "ai_cash_flow"],
  "subscription.cancelled": ["ai_membership_success", "ai_nurture_cadence"],
  "review.received": ["ai_community_reviews"],
  "email.received": ["ai_sdr"],
};

async function main() {
  const conn = await mysql.createConnection(url);
  try {
    // Look up agent ids by seatName.
    const [agents] = await conn.execute(
      "SELECT id, seatName FROM ai_agents WHERE seatName IN (?, ?, ?, ?, ?, ?, ?)",
      [
        "ai_system_integrity",
        "ai_cash_flow",
        "ai_onboarding",
        "ai_nurture_cadence",
        "ai_sdr",
        "ai_membership_success",
        "ai_community_reviews",
      ]
    );
    const byName = new Map(agents.map((a) => [a.seatName, a.id]));
    if (byName.size === 0) {
      console.error("No agent rows found. Run scripts/seed-ai-agents.mjs first.");
      process.exit(1);
    }

    let added = 0;
    let skipped = 0;
    for (const [eventName, seats] of Object.entries(SUBSCRIPTIONS)) {
      for (const seat of seats) {
        const id = byName.get(seat);
        if (!id) {
          console.warn(`  ⚠ ${seat} not in ai_agents — skipping ${eventName}`);
          skipped++;
          continue;
        }
        // INSERT … WHERE NOT EXISTS pattern (no UNIQUE constraint on the table).
        const [existing] = await conn.execute(
          "SELECT id FROM ai_agent_event_subscriptions WHERE agentId = ? AND eventName = ? LIMIT 1",
          [id, eventName]
        );
        if (existing.length > 0) {
          skipped++;
          continue;
        }
        await conn.execute(
          "INSERT INTO ai_agent_event_subscriptions (agentId, eventName, enabled) VALUES (?, ?, 1)",
          [id, eventName]
        );
        added++;
        console.log(`  + ${seat} ← ${eventName}`);
      }
    }
    console.log(`\n${added} new subscription(s) added, ${skipped} already existed.`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
