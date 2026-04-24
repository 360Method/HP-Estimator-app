/**
 * Seed the 25-agent roster: 1 Integrator + 8 Department Heads + 16 sub-agents.
 * Idempotent — upserts by seatName. Safe to re-run; editing a row by hand in
 * /admin/ai-agents won't be clobbered unless you also edit it here.
 *
 * Run: node scripts/seed-ai-agents.mjs
 * Staging: DATABASE_URL=$STAGING_DATABASE_URL node scripts/seed-ai-agents.mjs
 *
 * Hierarchy rule (enforced by server/lib/agentRuntime/hierarchy.ts):
 *   - Integrator:    department='integrator', isDepartmentHead=false, reportsToSeatId=null
 *   - Dept Head:     isDepartmentHead=true,  reportsToSeatId=<Integrator.id>
 *   - Sub-agent:     isDepartmentHead=false, reportsToSeatId=<Head in same department>.id
 *
 * Default status is 'draft_queue' — flip to 'autonomous' for internal-ops agents
 * that never touch customers (System Integrity, Security, Margin Monitor,
 * Bookkeeping read-only, Brand Guardian review-only).
 *
 * ── HOW TO FILL THIS IN ──
 * Marcin will supply the 25 rows as JSON. Drop them into `SEED_AGENTS` below.
 * Each row shape:
 *   {
 *     seatName: string,
 *     department: 'sales'|'operations'|'marketing'|'finance'|
 *                 'customer_success'|'vendor_network'|'technology'|'strategy'|
 *                 'integrator',
 *     role: string,                          // one-liner
 *     systemPrompt: string,                  // draft prompt, editable in admin UI
 *     model?: string,                        // default: claude-haiku-4-5-20251001
 *     isDepartmentHead: boolean,
 *     parentSeatName: string | null,         // resolved to parent's id at seed time
 *     status: 'draft_queue'|'autonomous'|'paused'|'disabled',
 *     costCapDailyUsd?: number,              // default 5
 *     runLimitDaily?: number,                // default 200
 *     toolKeys?: string[],                   // subset of the 15 Phase-2 tools
 *   }
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

// ── All 15 Phase-2 tool keys (see server/lib/agentRuntime/phase2Tools.ts) ────
export const ALL_TOOL_KEYS = [
  'kpis.record',                       // seat-default KPI (Phase 1 built-in)
  'customers.list',
  'customers.get',
  'opportunities.list',
  'opportunities.get',
  'comms.draftEmail',                  // ⚠ requires approval
  'comms.draftSms',                    // ⚠ requires approval
  'comms.sendTransactionalEmail',      // whitelisted templates only
  'tasks.create',
  'vendors.logContact',
  'invoices.query',
  'payments.query',
  'kpis.get',
  'kpis.recordExplicit',
  'hierarchy.pingIntegrator',
  'hierarchy.pingDepartmentHead',
];

/**
 * FILL ME IN — 25 agents. Leave empty to just scaffold the roster shape.
 * The script exits 0 with a warning if SEED_AGENTS is empty.
 * @type {Array<{
 *   seatName: string,
 *   department: string,
 *   role: string,
 *   systemPrompt: string,
 *   model?: string,
 *   isDepartmentHead: boolean,
 *   parentSeatName: string | null,
 *   status: string,
 *   costCapDailyUsd?: number,
 *   runLimitDaily?: number,
 *   toolKeys?: string[],
 * }>}
 */
const SEED_AGENTS = [
  // ── INTEGRATOR (1) ─────────────────────────────────────────────────────────
  // { seatName: 'Integrator AI', department: 'integrator', ... }

  // ── DEPARTMENT HEADS (8) ───────────────────────────────────────────────────
  // { seatName: 'Head of Sales & Lead Management', department: 'sales', isDepartmentHead: true, parentSeatName: 'Integrator AI', ... }
  // { seatName: 'Head of Operations',              department: 'operations',        isDepartmentHead: true, parentSeatName: 'Integrator AI', ... }
  // { seatName: 'Head of Marketing',               department: 'marketing',         isDepartmentHead: true, parentSeatName: 'Integrator AI', ... }
  // { seatName: 'Head of Finance',                 department: 'finance',           isDepartmentHead: true, parentSeatName: 'Integrator AI', ... }
  // { seatName: 'Head of Customer Success',        department: 'customer_success',  isDepartmentHead: true, parentSeatName: 'Integrator AI', ... }
  // { seatName: 'Head of Vendor Network',          department: 'vendor_network',    isDepartmentHead: true, parentSeatName: 'Integrator AI', ... }
  // { seatName: 'Head of Technology',              department: 'technology',        isDepartmentHead: true, parentSeatName: 'Integrator AI', ... }
  // { seatName: 'Head of Strategy & Expansion',    department: 'strategy',          isDepartmentHead: true, parentSeatName: 'Integrator AI', ... }

  // ── SUB-AGENTS (16) — reportsTo the Head in their own department ───────────
  // sales:            { Lead Router AI, Nurture AI },
  // operations:       { Dispatch AI, System Integrity AI (autonomous) },
  // marketing:        { Campaign Composer AI, Brand Guardian AI (autonomous) },
  // finance:          { Bookkeeping AI (autonomous), Margin Monitor AI (autonomous) },
  // customer_success: { Member Concierge AI, CSAT Watchdog AI },
  // vendor_network:   { Vendor Sourcing AI, Vendor Compliance AI },
  // technology:       { Security AI (autonomous), Release Notes AI },
  // strategy:         { Market Scan AI, Opportunity Scorer AI },
];

async function main() {
  const conn = await mysql.createConnection(url);

  if (SEED_AGENTS.length === 0) {
    console.warn('⚠  SEED_AGENTS is empty. Edit scripts/seed-ai-agents.mjs to fill in the 25 rows.');
    console.warn('    Scaffold ran clean — no writes.');
    await conn.end();
    return;
  }

  // ── Pass 1: upsert all rows without parent wiring (to get ids) ───────────
  const byName = new Map();
  for (const a of SEED_AGENTS) {
    const [existing] = await conn.execute(
      'SELECT id FROM ai_agents WHERE seatName = ? LIMIT 1',
      [a.seatName]
    );
    const row = Array.isArray(existing) && existing[0];
    const model = a.model ?? 'claude-haiku-4-5-20251001';
    const costCap = (a.costCapDailyUsd ?? 5).toFixed(2);
    const runLimit = a.runLimitDaily ?? 200;
    if (row) {
      await conn.execute(
        `UPDATE ai_agents SET department=?, role=?, systemPrompt=?, model=?,
         isDepartmentHead=?, costCapDailyUsd=?, runLimitDaily=?, status=?
         WHERE id=?`,
        [a.department, a.role, a.systemPrompt, model,
         a.isDepartmentHead ? 1 : 0, costCap, runLimit, a.status ?? 'draft_queue',
         row.id]
      );
      byName.set(a.seatName, row.id);
      console.log(`↻ updated #${row.id} ${a.seatName}`);
    } else {
      const [res] = await conn.execute(
        `INSERT INTO ai_agents
         (seatName, department, role, systemPrompt, model,
          isDepartmentHead, reportsToSeatId, costCapDailyUsd, runLimitDaily, status)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
        [a.seatName, a.department, a.role, a.systemPrompt, model,
         a.isDepartmentHead ? 1 : 0, costCap, runLimit, a.status ?? 'draft_queue']
      );
      byName.set(a.seatName, res.insertId);
      console.log(`＋ created #${res.insertId} ${a.seatName}`);
    }
  }

  // ── Pass 2: wire reportsToSeatId now that every seat has an id ───────────
  for (const a of SEED_AGENTS) {
    if (!a.parentSeatName) continue;
    const childId = byName.get(a.seatName);
    const parentId = byName.get(a.parentSeatName);
    if (!parentId) {
      console.warn(`⚠  parent '${a.parentSeatName}' not found for '${a.seatName}' — skipped`);
      continue;
    }
    await conn.execute(
      'UPDATE ai_agents SET reportsToSeatId=? WHERE id=?',
      [parentId, childId]
    );
  }

  // ── Pass 3: tool authorizations ──────────────────────────────────────────
  for (const a of SEED_AGENTS) {
    if (!a.toolKeys || a.toolKeys.length === 0) continue;
    const agentId = byName.get(a.seatName);
    await conn.execute('DELETE FROM ai_agent_tools WHERE agentId=?', [agentId]);
    for (const toolKey of a.toolKeys) {
      await conn.execute(
        'INSERT INTO ai_agent_tools (agentId, toolKey, authorized) VALUES (?, ?, 1)',
        [agentId, toolKey]
      );
    }
  }

  console.log(`\n✓ Seeded ${SEED_AGENTS.length} agents.`);
  await conn.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
