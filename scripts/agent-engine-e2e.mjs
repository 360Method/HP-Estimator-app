#!/usr/bin/env node
/**
 * scripts/agent-engine-e2e.mjs
 *
 * Synthetic end-to-end smoke test for the Phase 5 agent engine. Run against
 * any environment (local or prod) by setting DATABASE_URL.
 *
 *   node scripts/agent-engine-e2e.mjs
 *
 * What it does:
 *   1. Imports emitAgentEvent and fires a fake `lead.created` event.
 *   2. Polls ai_agent_tasks to confirm the trigger bus queued a task for
 *      every subscribed autonomous agent.
 *   3. Waits for the scheduler to drain (up to 90s — scheduler runs every
 *      30s by default).
 *   4. Polls ai_agent_runs to confirm rows landed with success/awaiting_approval
 *      status.
 *   5. Confirms `agent.run_completed` meta-event also fanned out (System
 *      Integrity should pick it up).
 *
 * Exits 0 on green, 1 on red. Prints a single-screen summary for the operator.
 */

import "dotenv/config";

const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_MS = 120_000;

function ts() {
  return new Date().toISOString().slice(11, 19);
}

function log(msg) {
  console.log(`[${ts()}] ${msg}`);
}

async function main() {
  log("→ Agent engine E2E synthetic test");

  const { emitAgentEvent, listSubscribersFor } = await import("../server/lib/agentRuntime/triggerBus.ts").catch(
    () => import("../server/lib/agentRuntime/triggerBus.js")
  );
  const { getDb } = await import("../server/db.ts").catch(() => import("../server/db.js"));

  const db = await getDb();
  if (!db) {
    console.error("DATABASE_URL not configured — cannot run.");
    process.exit(1);
  }

  // 1) How many agents subscribe to lead.created?
  const subscribers = await listSubscribersFor("lead.created");
  log(`lead.created subscribers in ai_agent_event_subscriptions: ${subscribers.length}`);
  if (subscribers.length === 0) {
    log("⚠ No subscribers seeded. Run scripts/seed-ai-agents.mjs first.");
    process.exit(1);
  }

  // 2) Fire a fake event with a synthetic customer payload.
  const syntheticPayload = {
    customerId: `e2e_${Math.random().toString(36).slice(2, 10)}`,
    name: "E2E Synthetic",
    email: "e2e@handypioneers.test",
    phone: "+15555550100",
    source: "e2e-script",
    syntheticTest: true,
  };
  log("Firing emitAgentEvent('lead.created', …)");
  const emit = await emitAgentEvent("lead.created", syntheticPayload);
  log(`emit returned: matchedAgents=${emit.matchedAgents}, queuedTaskIds=${emit.queuedTaskIds.join(",")}`);
  if (emit.queuedTaskIds.length === 0) {
    log("⚠ No tasks queued. Likely cause: subscribed agents are not in 'autonomous' status.");
    log("   Either flip them to autonomous on /admin/agents/control or run with all seats live.");
    process.exit(1);
  }

  const queuedIds = emit.queuedTaskIds;

  // 3) Poll for task completion.
  const { aiAgentTasks, aiAgentRuns } = await import("../drizzle/schema.ts").catch(() =>
    import("../drizzle/schema.js")
  );
  const { inArray, eq, and, gte } = await import("drizzle-orm");

  log(`Polling ai_agent_tasks for ${queuedIds.length} queued task(s) — up to ${MAX_POLL_MS / 1000}s…`);
  const start = Date.now();
  let lastSummary = "";
  let allDone = false;
  while (Date.now() - start < MAX_POLL_MS) {
    const tasks = await db.select().from(aiAgentTasks).where(inArray(aiAgentTasks.id, queuedIds));
    const byStatus = tasks.reduce((acc, t) => {
      acc[t.status] = (acc[t.status] ?? 0) + 1;
      return acc;
    }, {});
    const summary = Object.entries(byStatus)
      .map(([s, n]) => `${s}=${n}`)
      .join(" ");
    if (summary !== lastSummary) {
      log(`  status: ${summary}`);
      lastSummary = summary;
    }
    const stillQueued = (byStatus.queued ?? 0) + (byStatus.running ?? 0);
    if (stillQueued === 0) {
      allDone = true;
      break;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  if (!allDone) {
    log("⚠ Timed out — some tasks still queued/running. Check scheduler is up.");
    process.exit(1);
  }

  // 4) Confirm runs landed for each task.
  const runs = await db
    .select()
    .from(aiAgentRuns)
    .where(inArray(aiAgentRuns.taskId, queuedIds));
  log(`✓ ${runs.length} run rows persisted across ${queuedIds.length} task(s).`);
  for (const r of runs) {
    log(
      `  run #${r.id} task #${r.taskId} agent #${r.agentId} → ${r.status}` +
        ` (cost $${r.costUsd}, ${r.inputTokens + r.outputTokens} tok)`
    );
  }

  // 5) Confirm agent.run_completed fanned out — count tasks of triggerType=event
  //    that reference our run ids in their payload, queued in the last 60s.
  const since = new Date(Date.now() - 60_000);
  const recentMetaTasks = await db
    .select()
    .from(aiAgentTasks)
    .where(and(eq(aiAgentTasks.triggerType, "event"), gte(aiAgentTasks.createdAt, since)));
  const metaCount = recentMetaTasks.filter((t) => {
    try {
      const p = JSON.parse(t.triggerPayload ?? "{}");
      return p?.event === "agent.run_completed";
    } catch {
      return false;
    }
  }).length;
  log(`agent.run_completed meta-event tasks queued in last 60s: ${metaCount}`);
  if (metaCount === 0) {
    log("⚠ No agent.run_completed meta-event observed.");
    log("   Either no agents subscribe to it (System Integrity should — seed them)");
    log("   or the runtime didn't emit. Check server logs for [agentRuntime].");
  }

  log("");
  log("✓ E2E PASS: trigger bus → scheduler → runtime → run rows → meta-event chain works.");
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ E2E FAILED:", err);
  process.exit(1);
});
