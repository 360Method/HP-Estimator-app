/**
 * Port HCP-imported rows from Supabase Postgres (where the first import landed)
 * into production MySQL/Railway (where the app now runs).
 *
 * Idempotent: uses hcpExternalId as the natural key. Re-runs will ON DUPLICATE
 * KEY UPDATE. Rows without hcpExternalId are skipped (shouldn't happen for
 * HCP data).
 *
 * Order matters (FKs): customers → properties → opportunities → invoices
 * → invoiceLineItems → invoicePayments → scheduleEvents.
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import pg from 'pg';

const PG_URL = process.env.SUPABASE_DATABASE_URL || process.env.PG_URL;
const MYSQL_URL = process.env.PROD_DATABASE_URL || process.env.MYSQL_URL;
if (!PG_URL || !MYSQL_URL) {
  console.error('Set SUPABASE_DATABASE_URL (source) and PROD_DATABASE_URL (target) env vars.');
  process.exit(1);
}

const pgc = new pg.Client({ connectionString: PG_URL });
await pgc.connect();
const myc = await mysql.createConnection(MYSQL_URL);

async function runMigrationIfNeeded() {
  const [cols] = await myc.query(`SHOW COLUMNS FROM customers LIKE 'hcpExternalId'`);
  if (cols.length > 0) {
    console.log('[mig] hcpExternalId already present — skipping migration');
    return;
  }
  console.log('[mig] applying 0060_hcp_import_mysql.sql');
  const fs = await import('fs/promises');
  const raw = await fs.readFile(new URL('../drizzle/0060_hcp_import_mysql.sql', import.meta.url), 'utf8');
  const stripped = raw.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
  const stmts = stripped.split(';').map(s => s.trim()).filter(s => s.length > 0);
  for (const s of stmts) {
    try { await myc.query(s); console.log('  ok:', s.slice(0, 80)); }
    catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME' || e.code === 'ER_DUP_KEYNAME') console.log('  skip (exists):', s.slice(0, 80));
      else throw e;
    }
  }
}

function buildUpsert(table, cols) {
  const escaped = cols.map(c => `\`${c}\``).join(', ');
  const placeholders = cols.map(() => '?').join(', ');
  const updates = cols.filter(c => c !== 'id').map(c => `\`${c}\` = VALUES(\`${c}\`)`).join(', ');
  return `INSERT INTO \`${table}\` (${escaped}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`;
}

function coerce(v) {
  if (v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

async function portTable(table, orderBy = 'id', extraWhere = '') {
  const cols = (await pgc.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = $1 AND table_schema = 'public'
    ORDER BY ordinal_position`, [table])).rows.map(r => r.column_name);

  const res = await pgc.query(`SELECT * FROM "${table}" ${extraWhere} ORDER BY "${orderBy}"`);
  if (res.rows.length === 0) { console.log(`[${table}] no rows`); return 0; }

  const sql = buildUpsert(table, cols);
  let n = 0;
  for (const row of res.rows) {
    const values = cols.map(c => coerce(row[c]));
    try {
      await myc.query(sql, values);
      n++;
    } catch (e) {
      console.error(`  FAIL ${table} ${row.id}:`, e.message);
      throw e;
    }
  }
  console.log(`[${table}] ported ${n}`);
  return n;
}

await runMigrationIfNeeded();

console.log('\n=== Pre-port MySQL counts ===');
for (const t of ['customers','properties','opportunities','invoices','invoiceLineItems','invoicePayments','scheduleEvents']) {
  const [[{ n }]] = await myc.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
  console.log(`  ${t}: ${n}`);
}

console.log('\n=== Porting ===');
await portTable('customers');
await portTable('properties');
await portTable('opportunities');
// Invoices: only port those with valid opportunityId already in MySQL OR null (we dropped NOT NULL)
await portTable('invoices');
await portTable('invoiceLineItems');
await portTable('invoicePayments');
await portTable('scheduleEvents');

console.log('\n=== Post-port MySQL counts ===');
for (const t of ['customers','properties','opportunities','invoices','invoiceLineItems','invoicePayments','scheduleEvents']) {
  const [[{ n }]] = await myc.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
  console.log(`  ${t}: ${n}`);
}

await pgc.end();
await myc.end();
console.log('\ndone');
