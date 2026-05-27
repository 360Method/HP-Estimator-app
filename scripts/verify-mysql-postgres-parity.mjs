#!/usr/bin/env node
/**
 * scripts/verify-mysql-postgres-parity.mjs
 *
 * Phase 3 verification tool: confirm that the data loaded into Postgres by
 * `migrate-mysql-to-supabase.mjs` matches what's in MySQL.
 *
 * USAGE
 * -----
 *   MYSQL_SOURCE_URL=mysql://... \
 *   POSTGRES_TARGET_URL=postgres://... \
 *     node scripts/verify-mysql-postgres-parity.mjs [flags]
 *
 * FLAGS
 * -----
 *   --sample=<N>      Per-table PK-sample size for row-equality check. Default 50.
 *   --only=<table>    Only verify the named table (comma-separated).
 *   --skip=<table>    Skip the named table (comma-separated).
 *   --no-rowcheck     Skip the row-by-row sample comparison (counts + orphans only).
 *   --no-orphans      Skip the orphan-FK check.
 *
 * WHAT IT CHECKS
 * --------------
 *   1. Row count: SELECT COUNT(*) on each side. Reports any mismatch.
 *   2. Sample rows: pick N rows by PK from MySQL, look them up in Postgres,
 *      compare every column. Reports the first mismatch per row.
 *   3. Orphan FK check: for each known app-level FK column (e.g.
 *      opportunities.customerId → customers.id), assert every non-null value
 *      in Postgres has a matching parent row. Reports orphan count per FK.
 *
 * EXITS NON-ZERO ON ANY MISMATCH.
 */

import 'dotenv/config';
import mysql from 'mysql2/promise';
import postgres from 'postgres';
import process from 'node:process';
import { TABLES, coerceValueForPg } from './migrate-mysql-to-supabase.mjs';

// ─── ARGS ─────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const args = {
  sample: parseNumFlag(argv, '--sample=', 50),
  only: parseListFlag(argv, '--only='),
  skip: parseListFlag(argv, '--skip='),
  rowCheck: !argv.includes('--no-rowcheck'),
  orphans: !argv.includes('--no-orphans'),
};

function parseListFlag(argv, prefix) {
  const a = argv.find((x) => x.startsWith(prefix));
  return a ? a.slice(prefix.length).split(',').filter(Boolean) : null;
}
function parseNumFlag(argv, prefix, fallback) {
  const a = argv.find((x) => x.startsWith(prefix));
  return a ? Number(a.slice(prefix.length)) : fallback;
}

// ─── APP-LEVEL FK MAP ─────────────────────────────────────────────────────────
// The Phase 2 Postgres schema declares no DB-level FKs (see migrator script).
// This map lists the logical FK relationships enforced by the application.
// Each entry: { childTable, childCol, parentTable, parentCol }.
// Derived by grepping the Drizzle schema files for columns whose name ends
// in `Id` and matching them to PK tables. Add to this list as new app-level
// FKs are introduced.

const APP_FKS = [
  // customers as parent
  { childTable: 'opportunities', childCol: 'customerId', parentTable: 'customers', parentCol: 'id' },
  { childTable: 'properties', childCol: 'customerId', parentTable: 'customers', parentCol: 'id' },
  { childTable: 'customerAddresses', childCol: 'customerId', parentTable: 'customers', parentCol: 'id' },
  { childTable: 'invoices', childCol: 'customerId', parentTable: 'customers', parentCol: 'id' },
  { childTable: 'scheduleEvents', childCol: 'customerId', parentTable: 'customers', parentCol: 'id' },
  { childTable: 'timeLogs', childCol: 'customerId', parentTable: 'customers', parentCol: 'id' },
  { childTable: 'threeSixtyMemberships', childCol: 'customerId', parentTable: 'customers', parentCol: 'id' },
  { childTable: 'threeSixtyScans', childCol: 'customerId', parentTable: 'customers', parentCol: 'id' },

  // opportunities as parent
  { childTable: 'invoices', childCol: 'opportunityId', parentTable: 'opportunities', parentCol: 'id' },
  { childTable: 'expenses', childCol: 'opportunityId', parentTable: 'opportunities', parentCol: 'id' },
  { childTable: 'portalJobMilestones', childCol: 'hpOpportunityId', parentTable: 'opportunities', parentCol: 'id' },
  { childTable: 'portalJobUpdates', childCol: 'hpOpportunityId', parentTable: 'opportunities', parentCol: 'id' },
  { childTable: 'portalJobSignOffs', childCol: 'hpOpportunityId', parentTable: 'opportunities', parentCol: 'id' },
  { childTable: 'scheduleEvents', childCol: 'opportunityId', parentTable: 'opportunities', parentCol: 'id' },
  { childTable: 'timeLogs', childCol: 'opportunityId', parentTable: 'opportunities', parentCol: 'id' },
  { childTable: 'projectEstimates', childCol: 'opportunityId', parentTable: 'opportunities', parentCol: 'id' },
  { childTable: 'vendor_jobs', childCol: 'opportunityId', parentTable: 'opportunities', parentCol: 'id' },

  // invoices as parent
  { childTable: 'invoiceLineItems', childCol: 'invoiceId', parentTable: 'invoices', parentCol: 'id' },
  { childTable: 'invoicePayments', childCol: 'invoiceId', parentTable: 'invoices', parentCol: 'id' },

  // properties as parent
  { childTable: 'opportunities', childCol: 'propertyId', parentTable: 'properties', parentCol: 'id' },

  // threeSixtyMemberships as parent
  // (threeSixtyPropertySystems and threeSixtyScans have no propertyId column —
  //  they relate to a membership, not a property, via membershipId.)
  { childTable: 'threeSixtyPropertySystems', childCol: 'membershipId', parentTable: 'threeSixtyMemberships', parentCol: 'id' },
  { childTable: 'threeSixtyScans', childCol: 'membershipId', parentTable: 'threeSixtyMemberships', parentCol: 'id' },

  // conversations / messages
  { childTable: 'messages', childCol: 'conversationId', parentTable: 'conversations', parentCol: 'id' },
  { childTable: 'callLogs', childCol: 'conversationId', parentTable: 'conversations', parentCol: 'id' },
  { childTable: 'callLogs', childCol: 'messageId', parentTable: 'messages', parentCol: 'id' },

  // portalCustomers as parent
  { childTable: 'portalTokens', childCol: 'customerId', parentTable: 'portalCustomers', parentCol: 'id' },
  { childTable: 'portalSessions', childCol: 'customerId', parentTable: 'portalCustomers', parentCol: 'id' },
  { childTable: 'portalEstimates', childCol: 'customerId', parentTable: 'portalCustomers', parentCol: 'id' },
  { childTable: 'portalInvoices', childCol: 'customerId', parentTable: 'portalCustomers', parentCol: 'id' },
  { childTable: 'portalAppointments', childCol: 'customerId', parentTable: 'portalCustomers', parentCol: 'id' },
  { childTable: 'portalMessages', childCol: 'customerId', parentTable: 'portalCustomers', parentCol: 'id' },
  { childTable: 'portalGallery', childCol: 'customerId', parentTable: 'portalCustomers', parentCol: 'id' },
  { childTable: 'portalServiceRequests', childCol: 'customerId', parentTable: 'portalCustomers', parentCol: 'id' },
  { childTable: 'portalJobSignOffs', childCol: 'customerId', parentTable: 'portalCustomers', parentCol: 'id' },

  // portalAccounts as parent
  { childTable: 'portalMagicLinks', childCol: 'portalAccountId', parentTable: 'portalAccounts', parentCol: 'id' },
  { childTable: 'portalProperties', childCol: 'portalAccountId', parentTable: 'portalAccounts', parentCol: 'id' },
  { childTable: 'homeHealthRecords', childCol: 'portalAccountId', parentTable: 'portalAccounts', parentCol: 'id' },
  { childTable: 'priorityTranslations', childCol: 'portalAccountId', parentTable: 'portalAccounts', parentCol: 'id' },

  // vendors / trades
  { childTable: 'vendor_trades', childCol: 'vendorId', parentTable: 'vendors', parentCol: 'id' },
  { childTable: 'vendor_trades', childCol: 'tradeId', parentTable: 'trades', parentCol: 'id' },
  { childTable: 'vendor_jobs', childCol: 'vendorId', parentTable: 'vendors', parentCol: 'id' },
  { childTable: 'vendor_communications', childCol: 'vendorId', parentTable: 'vendors', parentCol: 'id' },
  // (vendor_communications has no vendorJobId column — it relates to vendors and
  //  to opportunities, but not to a specific vendor_job. Removed bogus entry.)
  { childTable: 'vendor_onboarding_steps', childCol: 'vendorId', parentTable: 'vendors', parentCol: 'id' },

  // agent teams
  { childTable: 'agent_team_members', childCol: 'teamId', parentTable: 'agent_teams', parentCol: 'id' },
  { childTable: 'agent_team_tasks', childCol: 'teamId', parentTable: 'agent_teams', parentCol: 'id' },
  { childTable: 'agent_team_messages', childCol: 'teamId', parentTable: 'agent_teams', parentCol: 'id' },
  // agent_team_handoffs uses fromTeamId/toTeamId, not teamId — both edges are
  // logical FKs to agent_teams.
  { childTable: 'agent_team_handoffs', childCol: 'fromTeamId', parentTable: 'agent_teams', parentCol: 'id' },
  { childTable: 'agent_team_handoffs', childCol: 'toTeamId', parentTable: 'agent_teams', parentCol: 'id' },
  { childTable: 'agent_team_artifacts', childCol: 'teamId', parentTable: 'agent_teams', parentCol: 'id' },
  { childTable: 'agent_team_violations', childCol: 'teamId', parentTable: 'agent_teams', parentCol: 'id' },
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

async function getMysqlRowCount(mysqlConn, tableName) {
  const [rows] = await mysqlConn.query(`SELECT COUNT(*) AS c FROM \`${tableName}\``);
  return Number(rows[0].c);
}

async function getPgRowCount(sql, tableName) {
  const rows = await sql`SELECT COUNT(*)::int AS c FROM ${sql(tableName)}`;
  return rows[0].c;
}

async function getMysqlTableExists(mysqlConn, tableName) {
  const [rows] = await mysqlConn.query(
    `SELECT 1 FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
    [tableName],
  );
  return rows.length > 0;
}

async function getPgTableExists(sql, tableName) {
  const rows = await sql`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${tableName} LIMIT 1
  `;
  return rows.length > 0;
}

async function getPgColumnTypes(sql, tableName) {
  const rows = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${tableName}
    ORDER BY ordinal_position
  `;
  const map = {};
  for (const r of rows) map[r.column_name] = r.data_type;
  return map;
}

async function getMysqlPrimaryKey(mysqlConn, tableName) {
  const [rows] = await mysqlConn.query(
    `SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
        AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION LIMIT 1`,
    [tableName],
  );
  return rows[0]?.COLUMN_NAME ?? null;
}

/**
 * Compare a MySQL row (left) against a Postgres row (right) for the columns
 * that exist in both. Returns null on match, or { column, mysql, pg } on first
 * mismatch.
 *
 * Comparison runs after coercing the MySQL value through the same coercion the
 * migrator applies, so a TINYINT(1)=1 (MySQL) matches boolean=true (PG).
 */
function diffRows(mysqlRow, pgRow, pgColTypes) {
  for (const [col, pgType] of Object.entries(pgColTypes)) {
    if (!Object.prototype.hasOwnProperty.call(mysqlRow, col)) continue;
    const expected = coerceValueForPg(mysqlRow[col], pgType);
    const actual = pgRow[col];

    if (!valuesEqual(expected, actual, pgType)) {
      return { column: col, expected, actual, pgType };
    }
  }
  return null;
}

function valuesEqual(a, b, pgType) {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;

  // Date comparison — PG timestamp comes back as Date, MySQL TIMESTAMP coerces
  // to Date. Compare epoch ms.
  if (a instanceof Date || b instanceof Date) {
    const ams = a instanceof Date ? a.getTime() : new Date(a).getTime();
    const bms = b instanceof Date ? b.getTime() : new Date(b).getTime();
    return ams === bms;
  }

  // Numeric / bigint — accept string/number/bigint interchangeably.
  if (pgType === 'numeric' || pgType === 'bigint') {
    return String(a) === String(b);
  }

  // JSON: parse both sides and structurally compare.
  if (pgType === 'json' || pgType === 'jsonb') {
    const parse = (v) => {
      if (v === null) return null;
      if (typeof v === 'string') {
        try { return JSON.parse(v); } catch { return v; }
      }
      return v;
    };
    return JSON.stringify(parse(a)) === JSON.stringify(parse(b));
  }

  return a === b;
}

// ─── CHECKS ───────────────────────────────────────────────────────────────────

async function checkCount(sql, mysqlConn, tableName) {
  const [m, p] = await Promise.all([
    getMysqlRowCount(mysqlConn, tableName),
    getPgRowCount(sql, tableName),
  ]);
  return { mysql: m, pg: p, match: m === p };
}

async function checkRowSample(sql, mysqlConn, tableName, sampleSize) {
  const pk = await getMysqlPrimaryKey(mysqlConn, tableName);
  if (!pk) {
    return { skipped: true, reason: 'no primary key on MySQL side' };
  }
  const pgCols = await getPgColumnTypes(sql, tableName);

  // Pull a deterministic sample (every Nth row by PK ascending) so we cover
  // both ends of the table, not just the head.
  const total = await getMysqlRowCount(mysqlConn, tableName);
  if (total === 0) return { skipped: true, reason: 'empty table', total: 0 };

  const stride = Math.max(1, Math.floor(total / sampleSize));
  const [mysqlRows] = await mysqlConn.query(
    `SELECT * FROM \`${tableName}\` ORDER BY \`${pk}\` ASC LIMIT ${sampleSize * stride}`,
  );
  const sample = [];
  for (let i = 0; i < mysqlRows.length; i += stride) {
    sample.push(mysqlRows[i]);
    if (sample.length >= sampleSize) break;
  }

  const mismatches = [];
  for (const row of sample) {
    const pkValue = row[pk];
    const pgRows = await sql`
      SELECT * FROM ${sql(tableName)} WHERE ${sql(pk)} = ${pkValue} LIMIT 1
    `;
    if (pgRows.length === 0) {
      mismatches.push({ pk: pkValue, column: '(row)', expected: 'present', actual: 'missing' });
      continue;
    }
    const diff = diffRows(row, pgRows[0], pgCols);
    if (diff) {
      mismatches.push({ pk: pkValue, ...diff });
    }
  }

  return { sampled: sample.length, mismatches };
}

async function checkOrphans(sql, fk) {
  // Count Postgres rows in child whose non-null FK has no matching parent row.
  // If the child or parent table is missing, skip (still pre-cutover).
  const childExists = await getPgTableExists(sql, fk.childTable);
  const parentExists = await getPgTableExists(sql, fk.parentTable);
  if (!childExists || !parentExists) {
    return { skipped: true, reason: 'table missing' };
  }
  const rows = await sql`
    SELECT COUNT(*)::int AS c
    FROM ${sql(fk.childTable)} c
    WHERE c.${sql(fk.childCol)} IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM ${sql(fk.parentTable)} p
        WHERE p.${sql(fk.parentCol)} = c.${sql(fk.childCol)}
      )
  `;
  return { orphans: rows[0].c };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const mysqlUrl = process.env.MYSQL_SOURCE_URL;
  const pgUrl = process.env.POSTGRES_TARGET_URL;
  if (!mysqlUrl || !pgUrl) {
    console.error('ERROR: set MYSQL_SOURCE_URL and POSTGRES_TARGET_URL');
    process.exit(2);
  }

  const mysqlConn = await mysql.createConnection({
    uri: mysqlUrl,
    dateStrings: false,
    supportBigNumbers: true,
    bigNumberStrings: true,
    timezone: 'Z', // Match the loader — both sides must read MySQL TIMESTAMPs as UTC
    // for the comparison to be meaningful.
  });
  const sql = postgres(pgUrl, {
    max: 4,
    prepare: false, // Supabase transaction pooler (port 6543).
    onnotice: () => {},
    transform: { undefined: null },
    // Override the built-in 'date' parser. The default for `timestamp without
    // time zone` (PG type 1114) is `new Date(text)`, which interprets text as
    // the JS process's local TZ. When the operator's machine isn't in UTC,
    // every timestamp on the PG side ends up off by the local offset — making
    // it look like the migrated data is shifted, when actually the stored
    // values are correct and only the read-side parser is lying. Force UTC
    // interpretation for no-TZ timestamps so the row-by-row comparison is
    // honest regardless of where verify is run from.
    types: {
      date: {
        to: 1184,
        from: [1082, 1114, 1184],
        serialize: (x) => (x instanceof Date ? x : new Date(x)).toISOString(),
        parse: (x) => {
          if (typeof x !== 'string') return new Date(x);
          if (/^\d{4}-\d{2}-\d{2}$/.test(x)) return new Date(x + 'T00:00:00Z');
          // Already carries an explicit offset (typical for type 1184) — trust it.
          if (/[+-]\d{2}(:?\d{2})?$|Z$/.test(x)) return new Date(x);
          // No TZ marker — type 1114. Treat the wall-clock as UTC.
          return new Date(x.replace(' ', 'T') + 'Z');
        },
      },
    },
  });

  const tableList = TABLES.filter((t) => {
    if (args.only && !args.only.includes(t)) return false;
    if (args.skip && args.skip.includes(t)) return false;
    return true;
  });

  let countMismatches = 0;
  let rowMismatches = 0;
  let orphanCount = 0;

  try {
    // ── 1. counts ────────────────────────────────────────────────────────
    console.log('── row counts ──────────────────────────────────────────────');
    for (const tableName of tableList) {
      if (!(await getMysqlTableExists(mysqlConn, tableName))) {
        console.log(`  [skip] ${tableName}: not in MySQL`);
        continue;
      }
      if (!(await getPgTableExists(sql, tableName))) {
        console.log(`  [skip] ${tableName}: not in Postgres`);
        continue;
      }
      const c = await checkCount(sql, mysqlConn, tableName);
      const tag = c.match ? '[ok]  ' : '[MISMATCH]';
      console.log(`  ${tag} ${tableName}: mysql=${c.mysql} pg=${c.pg}`);
      if (!c.match) countMismatches += 1;
    }

    // ── 2. row sample ────────────────────────────────────────────────────
    if (args.rowCheck) {
      console.log('');
      console.log(`── row sample (n=${args.sample}) ──────────────────────────`);
      for (const tableName of tableList) {
        if (!(await getMysqlTableExists(mysqlConn, tableName))) continue;
        if (!(await getPgTableExists(sql, tableName))) continue;
        const r = await checkRowSample(sql, mysqlConn, tableName, args.sample);
        if (r.skipped) {
          console.log(`  [skip] ${tableName}: ${r.reason}`);
        } else if (r.mismatches.length === 0) {
          console.log(`  [ok]   ${tableName}: ${r.sampled} rows match`);
        } else {
          rowMismatches += r.mismatches.length;
          console.log(`  [MISMATCH] ${tableName}: ${r.mismatches.length}/${r.sampled} rows differ`);
          for (const m of r.mismatches.slice(0, 5)) {
            console.log(`     pk=${m.pk} col=${m.column} mysql=${JSON.stringify(m.expected)} pg=${JSON.stringify(m.actual)}`);
          }
          if (r.mismatches.length > 5) {
            console.log(`     (… and ${r.mismatches.length - 5} more)`);
          }
        }
      }
    }

    // ── 3. orphan FK check ───────────────────────────────────────────────
    if (args.orphans) {
      console.log('');
      console.log(`── orphan FK check (${APP_FKS.length} app-level FKs) ─────`);
      for (const fk of APP_FKS) {
        if (args.only && !args.only.includes(fk.childTable)) continue;
        if (args.skip && args.skip.includes(fk.childTable)) continue;
        const r = await checkOrphans(sql, fk);
        const label = `${fk.childTable}.${fk.childCol} → ${fk.parentTable}.${fk.parentCol}`;
        if (r.skipped) {
          console.log(`  [skip] ${label}: ${r.reason}`);
        } else if (r.orphans === 0) {
          console.log(`  [ok]   ${label}: 0 orphans`);
        } else {
          orphanCount += r.orphans;
          console.log(`  [ORPHANS] ${label}: ${r.orphans}`);
        }
      }
    }
  } finally {
    await mysqlConn.end();
    await sql.end({ timeout: 5 });
  }

  console.log('');
  console.log('─'.repeat(60));
  console.log(`count mismatches : ${countMismatches}`);
  console.log(`row mismatches   : ${rowMismatches}`);
  console.log(`orphan rows      : ${orphanCount}`);
  console.log('─'.repeat(60));

  if (countMismatches > 0 || rowMismatches > 0 || orphanCount > 0) {
    console.error('\nVerification FAILED.');
    process.exit(1);
  }
  console.log('\nVerification PASSED.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
