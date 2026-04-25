/**
 * Seed charter runtime tables from docs/agents/*.md charter files.
 * Run: node scripts/seed-charters.mjs
 *
 * For each charter doc:
 *   1. Read full markdown → upsert into agentCharters
 *   2. Parse KPI tables → upsert into agentKpis
 *   3. Parse Initial Playbook Library → upsert into agentPlaybooks
 *   4. Update aiAgents.charterLoaded / kpiCount / playbookCount
 *
 * Idempotent — safe to run on every deploy.
 *
 * KPI table format (in charter markdown):
 *   | key | label | target_min | target_max | unit | period |
 *
 * Playbook format:
 *   ### Playbook: <Name>
 *   **Slug:** `<slug>`
 *   **Category:** <category>
 *   **Owner:** `<seatName>`
 *   **Variables:** `{{var1}}`, `{{var2}}`
 *   <content>
 *   ---
 */

import 'dotenv/config';
import mysql   from 'mysql2/promise';
import fs      from 'fs';
import path    from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR  = path.join(__dirname, '..', 'docs', 'agents');

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map filename stem → department enum value in ai_agents */
const DEPT_MAP = {
  'integrator-visionary': 'integrator',
  'sales':                'sales',
  'operations':           'operations',
  'marketing':            'marketing',
  'finance':              'finance',
  'customer-success':     'customer_success',
  'vendor-trades':        'vendor_network',
  'technology':           'technology',
  'strategy-expansion':   'strategy',
};

/**
 * Parse all KPI markdown tables from a charter doc.
 * Returns array of { scopeType, scopeId, key, label, targetMin, targetMax, unit, period }
 */
function parseKpis(markdown, defaultDept) {
  const kpis = [];

  // Match all markdown tables that have the charter KPI column pattern
  // Header row must contain: key | label | target_min | target_max | unit | period
  const tableRe = /\|\s*key\s*\|\s*label\s*\|\s*target_min\s*\|\s*target_max\s*\|\s*unit\s*\|\s*period\s*\|[\s\S]*?(?=\n\n|\n##|\n###|\n---|\Z)/gi;
  const tables = markdown.match(tableRe) ?? [];

  // Find which seat or dept owns each table by looking backwards in the text
  for (const table of tables) {
    const tablePos = markdown.indexOf(table);
    const before   = markdown.slice(0, tablePos);

    // Determine scopeType and scopeId
    let scopeType = 'department';
    let scopeId   = defaultDept;

    // Look for nearest Seat ID marker above this table
    const seatIdMatch = [...before.matchAll(/\*\*Seat ID:\*\*\s*`([^`]+)`/g)].pop();
    if (seatIdMatch) {
      scopeType = 'seat';
      scopeId   = seatIdMatch[1];
    } else if (before.includes('## North-Star KPIs') && !before.includes('### ')) {
      scopeType = 'department';
      scopeId   = defaultDept;
    }

    // Parse data rows (skip header and separator)
    const lines = table.split('\n').filter(l => l.trim().startsWith('|'));
    for (const line of lines) {
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length < 6) continue;
      const [key, label, rawMin, rawMax, unit, period] = cells;
      if (key === 'key' || key.startsWith('---')) continue; // header/separator

      const targetMin = rawMin === 'null' || rawMin === '' ? null : parseFloat(rawMin);
      const targetMax = rawMax === 'null' || rawMax === '' ? null : parseFloat(rawMax);

      if (!key || !label || !unit || !period) continue;

      kpis.push({ scopeType, scopeId, key, label, targetMin, targetMax, unit, period });
    }
  }

  return kpis;
}

/**
 * Parse the "Initial Playbook Library" section of a charter doc.
 * Returns array of playbook objects.
 */
function parsePlaybooks(markdown, defaultDept) {
  const playbooks = [];

  // Find the Initial Playbook Library section
  const sectionMatch = markdown.match(/## Initial Playbook Library([\s\S]*?)(?=\n## |\n# |$)/i);
  if (!sectionMatch) return playbooks;

  const section = sectionMatch[1];

  // Split on ### Playbook: headers
  const playbookBlocks = section.split(/(?=### Playbook:)/);

  for (const block of playbookBlocks) {
    if (!block.trim() || !block.includes('**Slug:**')) continue;

    const nameMatch     = block.match(/### Playbook:\s*(.+)/);
    const slugMatch     = block.match(/\*\*Slug:\*\*\s*`([^`]+)`/);
    const catMatch      = block.match(/\*\*Category:\*\*\s*(\S+)/);
    const ownerMatch    = block.match(/\*\*Owner:\*\*\s*`([^`]+)`/);
    const varsMatch     = block.match(/\*\*Variables:\*\*\s*(.+)/);

    if (!nameMatch || !slugMatch) continue;

    const name     = nameMatch[1].trim();
    const slug     = slugMatch[1].trim();
    const category = catMatch?.[1]?.trim() ?? 'internal-memo';
    const owner    = ownerMatch?.[1]?.trim() ?? 'integrator';

    // Extract variable names from {{...}} placeholders
    const varsLine = varsMatch?.[1] ?? '';
    const varNames = [...varsLine.matchAll(/`{{([^}]+)}}`/g)].map(m => m[1]);

    // Content is everything after the metadata lines
    // Strip the header line + metadata lines, then the trailing ---
    const contentStart = block.indexOf('\n', block.indexOf('**Variables:**') > -1
      ? block.indexOf('**Variables:**')
      : block.indexOf('**Category:**'));
    let content = contentStart > -1 ? block.slice(contentStart).trim() : '';
    content = content.replace(/^---\s*$/, '').trim();

    playbooks.push({
      ownerSeatName:   owner,
      ownerDepartment: defaultDept,
      name,
      slug,
      content,
      variables: JSON.stringify(varNames),
      category,
    });
  }

  return playbooks;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.md') && f !== 'SEAT_AUDIT.md');
console.log(`Found ${files.length} charter files in docs/agents/`);

let totalKpis      = 0;
let totalPlaybooks = 0;

for (const file of files) {
  const stem       = file.replace(/\.md$/, '');
  const department = DEPT_MAP[stem];
  if (!department) {
    console.warn(`  ⚠ Unknown stem "${stem}" — skipping`);
    continue;
  }

  const filePath = path.join(DOCS_DIR, file);
  const markdown = fs.readFileSync(filePath, 'utf8');

  console.log(`\nProcessing ${file} → department: ${department}`);

  // 1. Upsert charter
  await conn.execute(
    `INSERT INTO \`agentCharters\` (department, markdownContent, version)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE
       markdownContent = VALUES(markdownContent),
       version         = version + 1,
       updatedAt       = NOW()`,
    [department, markdown]
  );
  console.log(`  ✓ Charter upserted`);

  // 2. Parse + upsert KPIs
  const kpis = parseKpis(markdown, department);
  for (const kpi of kpis) {
    await conn.execute(
      `INSERT INTO \`agentKpis\`
         (scopeType, scopeId, \`key\`, label, targetMin, targetMax, unit, period)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         label     = VALUES(label),
         targetMin = VALUES(targetMin),
         targetMax = VALUES(targetMax),
         unit      = VALUES(unit),
         period    = VALUES(period)`,
      [kpi.scopeType, kpi.scopeId, kpi.key, kpi.label, kpi.targetMin, kpi.targetMax, kpi.unit, kpi.period]
    );
  }
  totalKpis += kpis.length;
  console.log(`  ✓ ${kpis.length} KPIs upserted`);

  // 3. Parse + upsert playbooks
  const playbooks = parsePlaybooks(markdown, department);
  for (const pb of playbooks) {
    await conn.execute(
      `INSERT INTO \`agentPlaybooks\`
         (ownerSeatName, ownerDepartment, name, slug, content, variables, category, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         ownerSeatName   = VALUES(ownerSeatName),
         ownerDepartment = VALUES(ownerDepartment),
         name            = VALUES(name),
         content         = VALUES(content),
         variables       = VALUES(variables),
         category        = VALUES(category),
         version         = version + 1,
         updatedAt       = NOW()`,
      [pb.ownerSeatName, pb.ownerDepartment, pb.name, pb.slug, pb.content, pb.variables, pb.category]
    );
  }
  totalPlaybooks += playbooks.length;
  console.log(`  ✓ ${playbooks.length} playbooks upserted`);

  // 4. Update ai_agents.charterLoaded / kpiCount / playbookCount for seats in this dept
  const [agentRows] = await conn.execute(
    `SELECT seatName FROM \`ai_agents\` WHERE department = ?`,
    [department]
  );
  for (const { seatName } of agentRows) {
    const [kpiRows]      = await conn.execute(`SELECT COUNT(*) as c FROM \`agentKpis\` WHERE scopeId = ?`, [seatName]);
    const [playbookRows] = await conn.execute(`SELECT COUNT(*) as c FROM \`agentPlaybooks\` WHERE ownerSeatName = ?`, [seatName]);
    const kc = kpiRows[0].c;
    const pc = playbookRows[0].c;
    await conn.execute(
      `UPDATE \`ai_agents\` SET charterLoaded=true, kpiCount=?, playbookCount=? WHERE seatName=?`,
      [kc, pc, seatName]
    );
  }
  // Also mark charterLoaded for any remaining seats in this dept
  await conn.execute(
    `UPDATE \`ai_agents\` a
     SET a.charterLoaded = true
     WHERE a.department = ?`,
    [department]
  );
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`Total KPIs seeded:      ${totalKpis}`);
console.log(`Total playbooks seeded: ${totalPlaybooks}`);
console.log(`Departments processed:  ${files.length}`);

// ── Generate SEAT_AUDIT.md ────────────────────────────────────────────────────
console.log(`\nGenerating docs/agents/SEAT_AUDIT.md…`);

const [agentRows] = await conn.execute(`
  SELECT
    a.seatName,
    a.department,
    a.status,
    a.isDepartmentHead,
    COALESCE(a.charterLoaded, false) AS charterLoaded,
    COALESCE(a.kpiCount, 0) AS kpiCount,
    COALESCE(a.playbookCount, 0) AS playbookCount,
    (SELECT COUNT(*) FROM \`ai_agent_event_subscriptions\` e WHERE e.agentId = a.id AND e.enabled = 1) AS eventCount,
    (SELECT COUNT(*) FROM \`ai_agent_schedules\` s WHERE s.agentId = a.id AND s.enabled = 1) AS scheduleCount
  FROM \`ai_agents\` a
  ORDER BY a.department, a.seatName
`);

const EXPECTED_SEATS = [
  'integrator','ai_sdr','ai_membership_success','cx_lead',
  'project_manager','ai_dispatch','ai_qa','internal_tradesmen','external_contractor_network',
  'ai_content_seo','ai_paid_ads','ai_brand_guardian','ai_community_reviews',
  'ai_bookkeeping','ai_margin_monitor','ai_cash_flow','cpa_tax',
  'ai_onboarding','ai_annual_valuation','ai_nurture_cadence','member_concierge',
  'ai_vendor_outreach','ai_vendor_onboarding','ai_trade_matching','ai_vendor_performance',
  'ai_system_integrity','ai_security','software_engineer',
  'ai_market_research','ai_expansion_playbook','ai_licensing_whitelabel',
];

const foundSeats = new Set(agentRows.map(r => r.seatName));

let auditRows = '';
let operationalCount = 0;
const incompleteReasons = [];

for (const seat of EXPECTED_SEATS) {
  const row = agentRows.find(r => r.seatName === seat);
  const exists = !!row;

  if (!exists) {
    auditRows += `| ${seat} | — | ✗ missing | ✗ | 0 | 0 | — | **incomplete** (not in ai_agents) |\n`;
    incompleteReasons.push(`${seat}: not in ai_agents`);
    continue;
  }

  const charterLoaded  = row.charterLoaded ? '✓' : '✗';
  const kpiCount       = row.kpiCount;
  const playbookCount  = row.playbookCount;
  const hasTrigger     = Number(row.eventCount) > 0;
  const hasSchedule    = Number(row.scheduleCount) > 0;
  const triggerSched   = hasTrigger || hasSchedule
    ? (hasTrigger ? 'event' : '') + (hasTrigger && hasSchedule ? '+' : '') + (hasSchedule ? 'cron' : '')
    : 'none';

  const missing = [];
  if (!row.charterLoaded) missing.push('no charter');
  if (kpiCount === 0) missing.push('0 KPIs');
  if (playbookCount === 0) missing.push('0 playbooks');

  const status = missing.length === 0 ? '**operational**' : `**incomplete** (${missing.join(', ')})`;
  if (missing.length === 0) operationalCount++;
  else incompleteReasons.push(`${seat}: ${missing.join(', ')}`);

  auditRows += `| ${row.seatName} | ${row.department} | ✓ | ${charterLoaded} | ${kpiCount} | ${playbookCount} | ${triggerSched} | ${status} |\n`;
}

// Add seats found in DB but not in expected list
for (const row of agentRows) {
  if (!EXPECTED_SEATS.includes(row.seatName)) {
    auditRows += `| ${row.seatName} _(extra)_ | ${row.department} | ✓ | ${row.charterLoaded ? '✓' : '✗'} | ${row.kpiCount} | ${row.playbookCount} | — | ⚠ not in expected list |\n`;
  }
}

const auditMd = `# Agent Seat Audit

Generated: ${new Date().toISOString().split('T')[0]}

## Summary
- **Total expected seats:** ${EXPECTED_SEATS.length}
- **Found in ai_agents:** ${foundSeats.size}
- **Operational:** ${operationalCount}
- **Incomplete:** ${EXPECTED_SEATS.length - operationalCount}
- **Total KPIs seeded:** ${totalKpis}
- **Total playbooks seeded:** ${totalPlaybooks}

## Seat Status

| Seat | Department | Exists in ai_agents | Charter Loaded | KPIs Seeded | Playbooks Seeded | Trigger/Schedule | Status |
|------|-----------|---------------------|----------------|-------------|-----------------|-----------------|--------|
${auditRows}
## Decisions Needed

${incompleteReasons.length === 0
  ? '_All seats operational — no action needed._'
  : incompleteReasons.map(r => `- ${r}`).join('\n')}
`;

const auditPath = path.join(DOCS_DIR, 'SEAT_AUDIT.md');
fs.writeFileSync(auditPath, auditMd);
console.log(`✓ SEAT_AUDIT.md written to ${auditPath}`);

await conn.end();
console.log('\nDone.');
