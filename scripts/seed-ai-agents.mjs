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

// ── Phase-4 default event subscriptions (autonomous triggers) ────────────────
// Maps a seatName to the list of domain events that should auto-fire that
// agent. The seed reads ai_agents.id by seatName and inserts into
// ai_agent_event_subscriptions. Idempotent — clears + re-inserts per agent.
//
// IMPORTANT: filter is an optional JSON match on the event payload's top-level
// keys. Margin Monitor only fires when an opportunity reaches 'completed'.
export const DEFAULT_EVENT_SUBSCRIPTIONS = {
  'Lead Nurturer AI':       [{ event: 'lead.created' }, { event: 'voicemail.received' }, { event: 'call.missed' }, { event: 'roadmap_generator.submitted' }],
  'Onboarding AI':          [{ event: 'customer.portal_account_created' }, { event: 'payment.received' }],
  'Nurture Cadence AI':     [{ event: 'subscription.renewed' }, { event: 'visit.completed' }],
  'Membership Success AI':  [{ event: 'subscription.cancelled' }],
  'Margin Monitor AI':      [{ event: 'opportunity.stage_changed', filter: { stage: 'completed' } }],
  'QA AI':                  [{ event: 'review.received' }, { event: 'visit.completed' }],
  'Cash Flow AI':           [{ event: 'payment.received' }, { event: 'invoice.overdue' }],
  'Bookkeeping AI':         [{ event: 'payment.received' }],
  'Community & Reviews AI': [{ event: 'review.received' }],
};

// ── Phase-4 default cron schedules ──────────────────────────────────────────
// Cron is 5-field standard. Timezone is a separate column. Each entry queues a
// task with triggerType='schedule' when due.
//   Integrator              — Monday 6am PT  weekly brief
//   each Department Head    — Monday 5am PT  dept KPI compilation
//   Content & SEO AI        — daily  9am PT  social/blog draft prompt
//   Nurture Cadence AI      — Monday 10am PT seasonal touchpoints
//   System Integrity AI     — every 15 min   health check (cron: */15 * * * *)
//   Security AI             — daily  2am PT  dependency/access audit
//   Cash Flow AI            — daily  5am PT  forecast refresh
//   Bookkeeping AI          — daily  5am PT  reconciliation
export const DEFAULT_SCHEDULES = [
  // Integrator (the seatName Marcin uses for the integrator agent — adjust if different)
  { seatName: 'Integrator AI',        cron: '0 6 * * 1',  tz: 'America/Los_Angeles', payload: { task: 'weekly_brief' } },
  // Department-Head weekly KPI roll-up (Monday 5am PT)
  { headDepartment: 'sales',           cron: '0 5 * * 1',  tz: 'America/Los_Angeles', payload: { task: 'weekly_dept_kpis' } },
  { headDepartment: 'operations',      cron: '0 5 * * 1',  tz: 'America/Los_Angeles', payload: { task: 'weekly_dept_kpis' } },
  { headDepartment: 'marketing',       cron: '0 5 * * 1',  tz: 'America/Los_Angeles', payload: { task: 'weekly_dept_kpis' } },
  { headDepartment: 'finance',         cron: '0 5 * * 1',  tz: 'America/Los_Angeles', payload: { task: 'weekly_dept_kpis' } },
  { headDepartment: 'customer_success', cron: '0 5 * * 1', tz: 'America/Los_Angeles', payload: { task: 'weekly_dept_kpis' } },
  { headDepartment: 'vendor_network',  cron: '0 5 * * 1',  tz: 'America/Los_Angeles', payload: { task: 'weekly_dept_kpis' } },
  { headDepartment: 'technology',      cron: '0 5 * * 1',  tz: 'America/Los_Angeles', payload: { task: 'weekly_dept_kpis' } },
  { headDepartment: 'strategy',        cron: '0 5 * * 1',  tz: 'America/Los_Angeles', payload: { task: 'weekly_dept_kpis' } },
  // Daily / sub-agent crons
  { seatName: 'Content & SEO AI',     cron: '0 9 * * *',  tz: 'America/Los_Angeles', payload: { task: 'daily_content_prompt' } },
  { seatName: 'Nurture Cadence AI',   cron: '0 10 * * 1', tz: 'America/Los_Angeles', payload: { task: 'seasonal_touchpoints' } },
  { seatName: 'System Integrity AI',  cron: '*/15 * * * *', tz: 'America/Los_Angeles', payload: { task: 'health_check' } },
  { seatName: 'Security AI',          cron: '0 2 * * *',  tz: 'America/Los_Angeles', payload: { task: 'audit_dependencies_and_access' } },
  { seatName: 'Cash Flow AI',         cron: '0 5 * * *',  tz: 'America/Los_Angeles', payload: { task: 'forecast_refresh' } },
  { seatName: 'Bookkeeping AI',       cron: '0 5 * * *',  tz: 'America/Los_Angeles', payload: { task: 'reconciliation' } },
];

async function main() {
  const conn = await mysql.createConnection(url);

  if (SEED_AGENTS.length === 0) {
    console.warn('⚠  SEED_AGENTS is empty. Edit scripts/seed-ai-agents.mjs to fill in the 25 rows.');
    console.warn('    Scaffold ran clean — no writes to ai_agents.');
    // Still seed phase-4 wiring against whatever rows already exist in prod.
    await seedPhase4Wiring(conn);
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

  // ── Pass 4 (Phase 4): event subscriptions + cron schedules ───────────────
  await seedPhase4Wiring(conn);

  await conn.end();
}

/**
 * Wire Phase-4 event subscriptions and cron schedules. Idempotent — clears
 * each agent's existing rows, then inserts the canonical defaults. Safe to
 * run against a roster where only some seats exist (missing rows are skipped
 * with a warning).
 */
async function seedPhase4Wiring(conn) {
  // Defensive: ensure phase-4 tables exist. Boot-time also creates them, but
  // running the seeder from a dev box that has never started the server should
  // still work.
  await conn.execute(`CREATE TABLE IF NOT EXISTS \`ai_agent_event_subscriptions\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`agentId\` int NOT NULL,
    \`eventName\` varchar(80) NOT NULL,
    \`filter\` text,
    \`enabled\` boolean NOT NULL DEFAULT true,
    \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(\`id\`)
  )`);
  await conn.execute(`CREATE TABLE IF NOT EXISTS \`ai_agent_schedules\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`agentId\` int NOT NULL,
    \`cronExpression\` varchar(80) NOT NULL,
    \`timezone\` varchar(64) NOT NULL DEFAULT 'America/Los_Angeles',
    \`enabled\` boolean NOT NULL DEFAULT true,
    \`lastRunAt\` timestamp NULL,
    \`nextRunAt\` timestamp NULL,
    \`payload\` text,
    \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(\`id\`)
  )`);

  // Helper: look up agentId by seatName (returns null if missing)
  const findBySeat = async (seatName) => {
    const [rows] = await conn.execute(
      'SELECT id FROM ai_agents WHERE seatName = ? LIMIT 1',
      [seatName]
    );
    return Array.isArray(rows) && rows[0] ? rows[0].id : null;
  };
  const findHead = async (department) => {
    const [rows] = await conn.execute(
      'SELECT id, seatName FROM ai_agents WHERE department = ? AND isDepartmentHead = 1 LIMIT 1',
      [department]
    );
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  };

  // ── Event subscriptions ─────────────────────────────────────────────────
  let subsTotal = 0;
  for (const [seatName, subs] of Object.entries(DEFAULT_EVENT_SUBSCRIPTIONS)) {
    const agentId = await findBySeat(seatName);
    if (!agentId) {
      console.warn(`⚠  subscriptions: '${seatName}' not in roster yet — skipping`);
      continue;
    }
    await conn.execute('DELETE FROM ai_agent_event_subscriptions WHERE agentId = ?', [agentId]);
    for (const s of subs) {
      await conn.execute(
        'INSERT INTO ai_agent_event_subscriptions (agentId, eventName, filter, enabled) VALUES (?, ?, ?, 1)',
        [agentId, s.event, s.filter ? JSON.stringify(s.filter) : null]
      );
      subsTotal++;
    }
    console.log(`✓ subscriptions: ${seatName} → ${subs.length} event(s)`);
  }
  console.log(`\n✓ Wrote ${subsTotal} event subscription(s).`);

  // ── Cron schedules ──────────────────────────────────────────────────────
  let schedTotal = 0;
  for (const sch of DEFAULT_SCHEDULES) {
    let agentId = null;
    let label = '';
    if (sch.seatName) {
      agentId = await findBySeat(sch.seatName);
      label = sch.seatName;
    } else if (sch.headDepartment) {
      const head = await findHead(sch.headDepartment);
      if (head) {
        agentId = head.id;
        label = head.seatName;
      }
    }
    if (!agentId) {
      console.warn(`⚠  schedule: '${sch.seatName ?? `head:${sch.headDepartment}`}' not in roster yet — skipping`);
      continue;
    }
    // De-dupe by (agentId, cronExpression). Don't blow away existing custom rows.
    const [existing] = await conn.execute(
      'SELECT id FROM ai_agent_schedules WHERE agentId = ? AND cronExpression = ? LIMIT 1',
      [agentId, sch.cron]
    );
    if (Array.isArray(existing) && existing.length > 0) {
      // Refresh payload + tz so re-running the seed is non-destructive but updates defaults.
      await conn.execute(
        'UPDATE ai_agent_schedules SET timezone = ?, payload = ?, enabled = 1 WHERE id = ?',
        [sch.tz, sch.payload ? JSON.stringify(sch.payload) : null, existing[0].id]
      );
      console.log(`↻ schedule: ${label} '${sch.cron}'`);
    } else {
      await conn.execute(
        'INSERT INTO ai_agent_schedules (agentId, cronExpression, timezone, enabled, payload) VALUES (?, ?, ?, 1, ?)',
        [agentId, sch.cron, sch.tz, sch.payload ? JSON.stringify(sch.payload) : null]
      );
      console.log(`＋ schedule: ${label} '${sch.cron}'`);
    }
    schedTotal++;
  }
  console.log(`\n✓ Wrote ${schedTotal} schedule(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
