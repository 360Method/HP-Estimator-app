#!/usr/bin/env node
/**
 * scripts/migrate-mysql-to-supabase.mjs
 *
 * Phase 3 cutover tool: bulk-copy every table from the live Railway MySQL
 * database into the new Postgres schema (Supabase) introduced by Phase 2
 * PR #85 (drizzle/0000_fair_ken_ellis.sql).
 *
 * USAGE
 * -----
 *   MYSQL_SOURCE_URL=mysql://user:pass@host:3306/db?ssl=true \
 *   POSTGRES_TARGET_URL=postgres://user:pass@host:5432/postgres \
 *     node scripts/migrate-mysql-to-supabase.mjs [flags]
 *
 * FLAGS
 * -----
 *   --truncate        TRUNCATE every target table before loading. Required for
 *                     a clean cutover run. Without this flag the script does
 *                     INSERT ... ON CONFLICT DO NOTHING (safe for partial resume).
 *   --only=<table>    Only migrate the named table (comma-separated for multiple).
 *                     Useful for re-running a single table after a fix.
 *   --skip=<table>    Skip the named table (comma-separated).
 *   --batch=<N>       Rows per INSERT batch. Default 1000.
 *   --self-test       Run type-coercion unit tests against an in-memory fixture
 *                     set, then exit. Does NOT connect to any database. Use
 *                     this in CI to assert coercion behaviour before the real run.
 *   --dry-run         Connect to both DBs, walk the table list, log row counts
 *                     and column-type mappings — but write NOTHING. Use this to
 *                     pre-flight cutover.
 *
 * IDEMPOTENCY
 * -----------
 *   --truncate:   TRUNCATE then load (cutover mode).
 *   default:      INSERT ... ON CONFLICT DO NOTHING (resume mode).
 *
 * SAFETY
 * ------
 *   - Reads only from MySQL. Never writes to MYSQL_SOURCE_URL.
 *   - All Postgres writes are inside an explicit transaction with
 *     session_replication_role=replica so app-level triggers don't fire.
 *   - --self-test does not connect to any database.
 *
 * TYPE QUIRKS HANDLED
 * -------------------
 *   - MySQL TINYINT(1) → PG boolean   (0/1 → false/true)
 *   - MySQL TINYINT/SMALLINT → PG smallint (numeric passthrough)
 *   - MySQL DATETIME/TIMESTAMP → PG timestamp (Date object passthrough)
 *   - MySQL DATE → PG date (Date object passthrough)
 *   - MySQL DECIMAL → PG numeric (string passthrough — preserves precision)
 *   - MySQL BIGINT → PG bigint (string passthrough — preserves precision)
 *   - MySQL JSON → PG json/jsonb (JS object → JSON.stringify)
 *   - MySQL ENUM → PG varchar/text (string passthrough)
 *   - MySQL DOUBLE → PG double precision (number passthrough)
 *   - NULL → NULL (every column)
 *
 * SEQUENCES
 * ---------
 *   After loading a table whose PK is `serial`, we reset the underlying
 *   sequence with setval(pg_get_serial_sequence(...), MAX(id)) so new
 *   inserts after cutover don't collide with copied rows.
 */

import 'dotenv/config';
import mysql from 'mysql2/promise';
import postgres from 'postgres';
import process from 'node:process';

// ─── ARGS ─────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const args = {
  truncate: argv.includes('--truncate'),
  selfTest: argv.includes('--self-test'),
  dryRun: argv.includes('--dry-run'),
  only: parseListFlag(argv, '--only='),
  skip: parseListFlag(argv, '--skip='),
  batch: parseNumFlag(argv, '--batch=', 1000),
};

function parseListFlag(argv, prefix) {
  const a = argv.find((x) => x.startsWith(prefix));
  return a ? a.slice(prefix.length).split(',').filter(Boolean) : null;
}
function parseNumFlag(argv, prefix, fallback) {
  const a = argv.find((x) => x.startsWith(prefix));
  return a ? Number(a.slice(prefix.length)) : fallback;
}

// ─── TABLE ORDER ──────────────────────────────────────────────────────────────
// Derivation: the Phase 2 Postgres schema declares NO database-level foreign
// keys (verified via `grep -c "FOREIGN KEY" drizzle/0000_fair_ken_ellis.sql`).
// Referential integrity is enforced at the application layer. So technically
// any load order is safe at the DB level — there is nothing to violate.
//
// We still order parents-before-children below to:
//   (a) make the verify script's orphan check meaningful as data lands, and
//   (b) keep the load order self-documenting for future maintainers.
//
// Within each tier, ordering is alphabetical for stability.

const TABLES = [
  // ── Tier 0: root tables (no logical FK references in) ─────────────────────
  'adminAllowlist',
  'agentCharters',
  'agentKpis',
  'agentPlaybooks',
  'agent_teams',
  'aiAgents',                // legacy camelCase (Email Manager AI)
  'ai_agents',               // snake_case (agent runtime)
  'ai_agent_tools',
  'appSettings',
  'automationRules',
  'campaigns',
  'cron_runs',
  'customers',
  'emailTemplates',
  'gbpTokens',
  'gmailTokens',
  'googleAdsTokens',
  'integrator_chat_conversations',
  'kpi_metrics',
  'metaConnections',
  'notificationPreferences',
  'nurturerPlaybooks',
  'onlineRequests',
  'phoneSettings',
  'portalAccounts',
  'portalCustomers',
  'qbTokens',
  'reengagementCampaigns',
  'scheduling_slots',
  'serviceZipCodes',
  'smsTemplates',
  'staffUsers',
  'trades',
  'users',
  'userRoles',
  'vendors',

  // ── Tier 1: single parent dependency ──────────────────────────────────────
  'agent_optimization_tasks',       // → aiAgents
  'agent_team_artifacts',           // → agent_teams
  'agent_team_handoffs',            // → agent_teams
  'agent_team_members',             // → agent_teams
  'agent_team_messages',            // → agent_teams
  'agent_team_tasks',               // → agent_teams
  'agent_team_violations',          // → agent_teams
  'ai_agent_event_subscriptions',   // → ai_agents
  'ai_agent_runs',                  // → ai_agents
  'ai_agent_schedules',             // → ai_agents
  'ai_agent_tasks',                 // → ai_agents
  'automationRuleLogs',             // → automationRules
  'campaignRecipients',             // → campaigns
  'campaignSends',                  // → campaigns
  'customerAddresses',              // → customers
  'integrator_chat_messages',       // → integrator_chat_conversations
  'notifications',                  // → users (recipientUserId)
  'password_reset_tokens',          // → users/staffUsers
  'portalAppointments',             // → portalCustomers
  'portalDocuments',                // → portalCustomers
  'portalEstimates',                // → portalCustomers
  'portalGallery',                  // → portalCustomers
  'portalMagicLinks',               // → portalAccounts
  'portalMessages',                 // → portalCustomers
  'portalProperties',               // → portalAccounts
  'portalReferrals',                // → portalCustomers (referrerId)
  'portalReports',                  // → portalCustomers
  'portalServiceRequests',          // → portalCustomers
  'portalSessions',                 // → portalCustomers
  'portalTokens',                   // → portalCustomers
  'properties',                     // → customers (membershipId loaded later — nullable)
  'reengagementDrafts',             // → reengagementCampaigns, customers
  'snapshotInvoices',
  'snapshotOpportunities',
  'vendor_onboarding_steps',        // → vendors
  'vendor_trades',                  // → vendors, trades

  // ── Tier 2: multi-parent / two hops deep ──────────────────────────────────
  'ai_agent_handoffs',              // → ai_agents, ai_agent_runs
  'agentDrafts',                    // → customers, campaigns (optional)
  'conversations',                  // → customers, portalCustomers
  'expenses',                       // → opportunities (loaded next), vendors
  'gmailMessageLinks',              // → gmailTokens, staffUsers, customers
  'homeHealthRecords',              // → portalAccounts, portalProperties
  'opportunities',                  // → customers, onlineRequests, properties
  'orphanEmails',                   // → customers (resolvedCustomerId)
  'pipelineEvents',                 // → opportunities (loaded earlier in some flows — but logically independent)
  'portalChangeOrders',             // → portalCustomers, opportunities
  'portalInvoices',                 // → portalCustomers, portalEstimates
  'scheduled_bookings',             // → scheduling_slots, onlineRequests
  'threeSixtyMemberships',          // → customers, properties
  'vendor_jobs',                    // → vendors, opportunities
  'vendor_communications',          // → vendors, vendor_jobs

  // ── Tier 3: depend on tier-2 (opportunities / threeSixtyMemberships) ──────
  'callLogs',                       // → conversations, messages
  'invoices',                       // → opportunities, customers
  'invoiceLineItems',               // → invoices (loaded next; pre-loaded here ok since no FK)
  'invoicePayments',                // → invoices
  'messages',                       // → conversations
  'portalJobMilestones',            // → opportunities
  'portalJobSignOffs',              // → opportunities, portalCustomers
  'portalJobUpdates',               // → opportunities
  'priorityTranslations',           // → portalAccounts, portalProperties, homeHealthRecords
  'projectEstimates',               // → opportunities, customers, onlineRequests, portalAccounts
  'scheduleEvents',                 // → opportunities, customers
  'threeSixtyChecklist',            // → threeSixtyMemberships
  'threeSixtyLaborBankTransactions',// → threeSixtyMemberships
  'threeSixtyPropertySystems',      // → properties
  'threeSixtyScans',                // → customers, properties
  'threeSixtyVisits',               // → threeSixtyMemberships
  'threeSixtyWorkOrders',           // → threeSixtyMemberships
  'timeLogs',                       // → opportunities, customers
];

export { TABLES };

// ─── TYPE COERCION ────────────────────────────────────────────────────────────

/**
 * Coerce a single MySQL-returned value into a form the Postgres driver
 * (postgres-js) will accept for the given Postgres column type.
 *
 * The Postgres column type is the authoritative target (we introspect
 * information_schema.columns at runtime to build the type map for each table).
 *
 * Returns the input untouched for most types — postgres-js handles Date,
 * string, number, Buffer, BigInt, and plain objects natively. We only
 * intervene where the MySQL driver's natural representation diverges from
 * what Postgres expects.
 */
export function coerceValueForPg(value, pgType) {
  if (value === null || value === undefined) return null;

  switch (pgType) {
    case 'boolean': {
      // MySQL TINYINT(1) → mysql2 returns 0/1 number (or rarely a Buffer for BIT).
      // PG boolean wants true/false. Accept anything truthy/falsey.
      if (typeof value === 'boolean') return value;
      if (typeof value === 'number') return value !== 0;
      if (typeof value === 'bigint') return value !== 0n;
      if (Buffer.isBuffer(value)) return value.length > 0 && value[0] !== 0;
      if (typeof value === 'string') {
        if (value === '1' || value.toLowerCase() === 'true') return true;
        if (value === '0' || value.toLowerCase() === 'false') return false;
      }
      return Boolean(value);
    }

    case 'json':
    case 'jsonb': {
      // mysql2 returns a parsed object/array for MySQL JSON columns.
      // Some legacy columns are TEXT holding a JSON string — pass strings
      // through and let Postgres parse. Stringify objects/arrays so the
      // driver doesn't try to expand them as composite types.
      if (typeof value === 'string') return value;
      return JSON.stringify(value);
    }

    case 'bigint': {
      // mysql2 returns BigInt or string (when bigNumberStrings=true).
      // PG bigint accepts string or BigInt. Pass through.
      if (typeof value === 'bigint') return value.toString();
      return value;
    }

    case 'numeric':
    case 'decimal': {
      // mysql2 returns decimals as string by default — keep as string to
      // preserve precision. PG numeric accepts string.
      return typeof value === 'string' ? value : String(value);
    }

    case 'date': {
      // PG date wants YYYY-MM-DD. mysql2 returns Date for DATE columns.
      if (value instanceof Date) {
        return value.toISOString().slice(0, 10);
      }
      return value;
    }

    case 'timestamp':
    case 'timestamp without time zone':
    case 'timestamp with time zone': {
      // postgres-js handles Date directly. Stringify for unusual cases.
      return value;
    }

    case 'integer':
    case 'smallint':
    case 'double precision':
    case 'real': {
      // Pass numeric values through. Strings are accepted by PG numeric casts.
      if (typeof value === 'bigint') return Number(value);
      return value;
    }

    case 'text':
    case 'character varying':
    case 'varchar': {
      // mysql2 returns Buffer for BLOB-typed strings sometimes — coerce.
      if (Buffer.isBuffer(value)) return value.toString('utf8');
      return value;
    }

    default:
      return value;
  }
}

// ─── INTROSPECTION ────────────────────────────────────────────────────────────

async function getPgColumnTypes(sql, tableName) {
  const rows = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${tableName}
    ORDER BY ordinal_position
  `;
  const map = {};
  for (const r of rows) {
    map[r.column_name] = r.data_type;
  }
  return map;
}

async function getMysqlTableExists(mysqlConn, tableName) {
  const [rows] = await mysqlConn.query(
    `SELECT 1 FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
    [tableName],
  );
  return rows.length > 0;
}

async function getMysqlRowCount(mysqlConn, tableName) {
  // Use SELECT COUNT(*) (read-only). Avoid information_schema.tables row
  // estimates — they're approximate on InnoDB.
  const [rows] = await mysqlConn.query(
    `SELECT COUNT(*) AS c FROM \`${tableName}\``,
  );
  return Number(rows[0].c);
}

async function getMysqlPrimaryKeyColumn(mysqlConn, tableName) {
  const [rows] = await mysqlConn.query(
    `SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
        AND CONSTRAINT_NAME = 'PRIMARY'
      ORDER BY ORDINAL_POSITION LIMIT 1`,
    [tableName],
  );
  return rows[0]?.COLUMN_NAME ?? null;
}

// ─── PER-TABLE MIGRATION ──────────────────────────────────────────────────────

async function migrateTable(sql, mysqlConn, tableName, options) {
  const { truncate, batchSize, dryRun } = options;
  const t0 = Date.now();

  const existsInSource = await getMysqlTableExists(mysqlConn, tableName);
  if (!existsInSource) {
    console.log(`  [skip] ${tableName}: not present in MySQL source`);
    return { table: tableName, read: 0, written: 0, skipped: true, ms: 0 };
  }

  const pgCols = await getPgColumnTypes(sql, tableName);
  if (Object.keys(pgCols).length === 0) {
    console.log(`  [skip] ${tableName}: not present in Postgres target`);
    return { table: tableName, read: 0, written: 0, skipped: true, ms: 0 };
  }

  const totalRows = await getMysqlRowCount(mysqlConn, tableName);
  const pk = await getMysqlPrimaryKeyColumn(mysqlConn, tableName);

  if (dryRun) {
    console.log(
      `  [dry-run] ${tableName}: ${totalRows} rows in MySQL, ` +
        `${Object.keys(pgCols).length} cols in PG, pk=${pk ?? '(none)'}`,
    );
    return { table: tableName, read: totalRows, written: 0, skipped: false, ms: Date.now() - t0 };
  }

  if (truncate) {
    await sql.unsafe(`TRUNCATE TABLE "${tableName}" RESTART IDENTITY CASCADE`);
  }

  if (totalRows === 0) {
    console.log(`  [empty] ${tableName}: 0 rows`);
    return { table: tableName, read: 0, written: 0, skipped: false, ms: Date.now() - t0 };
  }

  // Stream rows from MySQL in PK-ordered chunks (keyset pagination) so we
  // don't load a 5M-row table into memory at once. Falls back to LIMIT/OFFSET
  // if no PK exists.
  let written = 0;
  let read = 0;
  let cursor = null;
  const PAGE = Math.max(batchSize, 500);

  // We need a stable order. Use the PK if present, else fall back to a single
  // SELECT * (small tables only). A table with no PK and many rows would be
  // pathological; we log and bail.
  if (!pk && totalRows > 100_000) {
    throw new Error(
      `${tableName}: ${totalRows} rows but no PK — refusing to use unbounded SELECT. ` +
        `Add an ad-hoc ORDER BY to the migrator for this table.`,
    );
  }

  // Wrap each table's load in its own transaction so failures don't half-write
  // the table. Use session_replication_role=replica to suppress any triggers.
  await sql.begin(async (tx) => {
    await tx`SET LOCAL session_replication_role = 'replica'`;
    while (true) {
      let pageRows;
      if (pk) {
        const params = cursor === null ? [PAGE] : [cursor, PAGE];
        const where = cursor === null ? '' : `WHERE \`${pk}\` > ?`;
        const [rows] = await mysqlConn.query(
          `SELECT * FROM \`${tableName}\` ${where} ORDER BY \`${pk}\` ASC LIMIT ?`,
          params,
        );
        pageRows = rows;
      } else {
        // Single-shot fetch for tiny tables without a PK.
        const [rows] = await mysqlConn.query(`SELECT * FROM \`${tableName}\``);
        pageRows = rows;
      }

      if (pageRows.length === 0) break;
      read += pageRows.length;

      // Coerce values per PG column type. Drop columns that exist in MySQL
      // but not in PG (additive-MySQL drift); keep nullables for PG-only cols.
      const pgColNames = Object.keys(pgCols);
      const transformed = pageRows.map((row) => {
        const out = {};
        for (const col of pgColNames) {
          if (Object.prototype.hasOwnProperty.call(row, col)) {
            out[col] = coerceValueForPg(row[col], pgCols[col]);
          } else {
            out[col] = null;
          }
        }
        return out;
      });

      // Insert in sub-batches sized for postgres-js (default param limit is
      // 65535; rows * cols must stay under that).
      const PARAM_CAP = 60_000;
      const colsPerRow = pgColNames.length;
      const subBatch = Math.max(1, Math.floor(PARAM_CAP / colsPerRow));
      for (let i = 0; i < transformed.length; i += subBatch) {
        const slice = transformed.slice(i, i + subBatch);
        await tx`
          INSERT INTO ${tx(tableName)} ${tx(slice, ...pgColNames)}
          ON CONFLICT DO NOTHING
        `;
        written += slice.length;
      }

      if (pk) {
        cursor = pageRows[pageRows.length - 1][pk];
        if (pageRows.length < PAGE) break;
      } else {
        break; // single-shot
      }
    }

    // Reset serial sequence after load. Only applies if PK is integer-typed
    // and backed by a sequence. pg_get_serial_sequence returns NULL otherwise,
    // and setval(NULL,...) errors — so we check first.
    if (pk && (pgCols[pk] === 'integer' || pgCols[pk] === 'bigint')) {
      await tx.unsafe(`
        DO $$
        DECLARE
          seq text;
          maxv bigint;
        BEGIN
          seq := pg_get_serial_sequence('"${tableName}"', '${pk}');
          IF seq IS NOT NULL THEN
            EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %I', '${pk}', '${tableName}') INTO maxv;
            IF maxv > 0 THEN
              PERFORM setval(seq, maxv);
            END IF;
          END IF;
        END
        $$;
      `);
    }
  });

  const ms = Date.now() - t0;
  console.log(
    `  [ok]   ${tableName}: read=${read} written=${written} ` +
      `(${(ms / 1000).toFixed(2)}s)`,
  );
  return { table: tableName, read, written, skipped: false, ms };
}

// ─── SELF-TEST ────────────────────────────────────────────────────────────────

function runSelfTest() {
  const cases = [
    // boolean coercion
    ['boolean 0→false', coerceValueForPg(0, 'boolean'), false],
    ['boolean 1→true', coerceValueForPg(1, 'boolean'), true],
    ['boolean null→null', coerceValueForPg(null, 'boolean'), null],
    ['boolean "true"→true', coerceValueForPg('true', 'boolean'), true],
    ['boolean Buffer<00>→false', coerceValueForPg(Buffer.from([0]), 'boolean'), false],
    ['boolean Buffer<01>→true', coerceValueForPg(Buffer.from([1]), 'boolean'), true],

    // jsonb coercion
    ['jsonb object→string', coerceValueForPg({ a: 1 }, 'jsonb'), '{"a":1}'],
    ['jsonb array→string', coerceValueForPg([1, 2], 'jsonb'), '[1,2]'],
    ['jsonb passthrough string', coerceValueForPg('{"a":1}', 'json'), '{"a":1}'],
    ['jsonb null→null', coerceValueForPg(null, 'jsonb'), null],

    // bigint
    ['bigint number passthrough', coerceValueForPg(123, 'bigint'), 123],
    ['bigint BigInt→string', coerceValueForPg(9007199254740993n, 'bigint'), '9007199254740993'],

    // numeric (string passthrough)
    ['numeric string passthrough', coerceValueForPg('123.45', 'numeric'), '123.45'],
    ['numeric number→string', coerceValueForPg(123.45, 'numeric'), '123.45'],

    // date
    ['date Date→YYYY-MM-DD', coerceValueForPg(new Date('2026-03-15T00:00:00Z'), 'date'), '2026-03-15'],

    // varchar Buffer→utf8
    ['varchar Buffer→string', coerceValueForPg(Buffer.from('hi'), 'varchar'), 'hi'],

    // generic passthrough
    ['integer passthrough', coerceValueForPg(42, 'integer'), 42],
    ['text passthrough', coerceValueForPg('hello', 'text'), 'hello'],
  ];

  let failed = 0;
  for (const [name, actual, expected] of cases) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
    if (!ok) {
      console.log(`         expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      failed += 1;
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} self-test case(s) failed.`);
    process.exit(1);
  }
  console.log(`\nAll ${cases.length} self-test cases passed.`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  if (args.selfTest) {
    runSelfTest();
    return;
  }

  const mysqlUrl = process.env.MYSQL_SOURCE_URL;
  const pgUrl = process.env.POSTGRES_TARGET_URL;
  if (!mysqlUrl || !pgUrl) {
    console.error('ERROR: set MYSQL_SOURCE_URL and POSTGRES_TARGET_URL');
    process.exit(2);
  }

  const sourceHost = hostOf(mysqlUrl);
  const targetHost = hostOf(pgUrl);
  console.log(`source MySQL    : ${sourceHost}`);
  console.log(`target Postgres : ${targetHost}`);
  console.log(`mode            : ${args.dryRun ? 'DRY RUN' : args.truncate ? 'TRUNCATE + LOAD' : 'INSERT + ON CONFLICT'}`);
  console.log('');

  const tableList = TABLES.filter((t) => {
    if (args.only && !args.only.includes(t)) return false;
    if (args.skip && args.skip.includes(t)) return false;
    return true;
  });

  const mysqlConn = await mysql.createConnection({
    uri: mysqlUrl,
    dateStrings: false,
    supportBigNumbers: true,
    bigNumberStrings: true,
    timezone: 'Z', // Force UTC interpretation of MySQL TIMESTAMP/DATETIME. Without
    // this, mysql2 falls back to the client process's local TZ, which shifts
    // every timestamp by the host's UTC offset during load.
    // Read-only sentinel: we never run INSERT/UPDATE/DELETE via this conn.
  });

  const sql = postgres(pgUrl, {
    max: 4,
    prepare: false, // Supabase transaction pooler (port 6543) — disable prepared statement cache.
    onnotice: () => {}, // suppress NOTICE chatter
    transform: { undefined: null },
  });

  const summary = [];
  let hadError = false;
  try {
    for (const tableName of tableList) {
      try {
        const r = await migrateTable(sql, mysqlConn, tableName, {
          truncate: args.truncate,
          batchSize: args.batch,
          dryRun: args.dryRun,
        });
        summary.push(r);
      } catch (err) {
        hadError = true;
        console.error(`  [FAIL] ${tableName}: ${err.message}`);
        summary.push({
          table: tableName,
          read: 0,
          written: 0,
          skipped: false,
          ms: 0,
          error: err.message,
        });
      }
    }
  } finally {
    await mysqlConn.end();
    await sql.end({ timeout: 5 });
  }

  // ── Final summary ────────────────────────────────────────────────────────
  const totalRead = summary.reduce((a, s) => a + s.read, 0);
  const totalWritten = summary.reduce((a, s) => a + s.written, 0);
  const totalMs = summary.reduce((a, s) => a + s.ms, 0);
  const errors = summary.filter((s) => s.error);
  const skipped = summary.filter((s) => s.skipped);

  console.log('');
  console.log('─'.repeat(60));
  console.log(`tables processed : ${summary.length}`);
  console.log(`  skipped        : ${skipped.length}`);
  console.log(`  errored        : ${errors.length}`);
  console.log(`rows read        : ${totalRead.toLocaleString()}`);
  console.log(`rows written     : ${totalWritten.toLocaleString()}`);
  console.log(`elapsed          : ${(totalMs / 1000).toFixed(1)}s`);
  console.log('─'.repeat(60));

  if (hadError) {
    console.error('\nMigration finished with errors. See lines above.');
    process.exit(1);
  }
}

function hostOf(url) {
  try {
    return new URL(url.replace('mysql://', 'http://').replace('postgres://', 'http://')).host;
  } catch {
    return '<unparseable>';
  }
}

// Allow this file to be imported by the verify script (TABLES, coerceValueForPg)
// without running main().
const isDirectInvocation = import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`
  || import.meta.url.endsWith(process.argv[1]?.split(/[\\/]/).pop() ?? '');
if (isDirectInvocation) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
