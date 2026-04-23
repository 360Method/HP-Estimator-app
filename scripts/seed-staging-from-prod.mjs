/**
 * Seed staging DB with a scrubbed subset of production data.
 *
 * Usage:
 *   PROD_DATABASE_URL=mysql://... \
 *   STAGING_DATABASE_URL=mysql://... \
 *   node scripts/seed-staging-from-prod.mjs
 *
 * What it does:
 *   - Copies 20 customers (random sample, non-merged), plus their properties,
 *     customerAddresses, most-recent opportunity, and all invoices for those
 *     opportunities (including invoiceLineItems + invoicePayments).
 *   - Scrubs PII: emails → staging+<id>@handypioneers.com, phones → fake 555
 *     variants. Street addresses are left intact (public record).
 *   - Idempotent: truncates the same set of tables on staging before reseeding.
 *
 * Safety:
 *   - Refuses to run unless both URLs are set AND they point at DIFFERENT hosts
 *     (so you cannot accidentally overwrite prod with itself).
 *   - Never writes to PROD_DATABASE_URL.
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const PROD_URL = process.env.PROD_DATABASE_URL;
const STAGING_URL = process.env.STAGING_DATABASE_URL;
const SAMPLE_SIZE = Number(process.env.SAMPLE_SIZE ?? 20);

if (!PROD_URL || !STAGING_URL) {
  console.error('ERROR: set PROD_DATABASE_URL and STAGING_DATABASE_URL');
  process.exit(1);
}

function hostOf(url) {
  try { return new URL(url).host; } catch { return url; }
}
if (hostOf(PROD_URL) === hostOf(STAGING_URL)) {
  console.error('ERROR: PROD_DATABASE_URL and STAGING_DATABASE_URL resolve to the same host — refusing.');
  process.exit(1);
}

const prod = await mysql.createConnection(PROD_URL);
const staging = await mysql.createConnection(STAGING_URL);

// Tables we overwrite on staging (order matters: children first for deletes).
const STAGING_TABLES_TO_CLEAR = [
  'invoicePayments',
  'invoiceLineItems',
  'invoices',
  'opportunities',
  'customerAddresses',
  'properties',
  'customers',
];

function fakeEmail(id) {
  return `staging+${id}@handypioneers.com`;
}
function fakePhone(id) {
  // Deterministic 555-xxxx variant seeded by id
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  const last4 = String(1000 + (h % 9000));
  return `+1503555${last4}`;
}
function scrubCustomer(row) {
  return {
    ...row,
    email: row.email ? fakeEmail(row.id) : '',
    mobilePhone: row.mobilePhone ? fakePhone(`${row.id}-m`) : '',
    homePhone: row.homePhone ? fakePhone(`${row.id}-h`) : '',
    workPhone: row.workPhone ? fakePhone(`${row.id}-w`) : '',
    additionalPhones: null,
    additionalEmails: null,
  };
}

async function tableExists(conn, name) {
  const [rows] = await conn.query(
    'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1',
    [name],
  );
  return rows.length > 0;
}

async function clearStaging() {
  console.log('[staging] clearing target tables');
  await staging.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of STAGING_TABLES_TO_CLEAR) {
    if (await tableExists(staging, t)) {
      await staging.query(`DELETE FROM \`${t}\``);
      console.log(`  cleared ${t}`);
    } else {
      console.log(`  skip ${t} (not present)`);
    }
  }
  await staging.query('SET FOREIGN_KEY_CHECKS = 1');
}

async function insertRows(table, rows) {
  if (!rows.length) return;
  if (!(await tableExists(staging, table))) {
    console.log(`  skip ${table} (table missing on staging)`);
    return;
  }
  const cols = Object.keys(rows[0]);
  const placeholders = `(${cols.map(() => '?').join(',')})`;
  const sql = `INSERT INTO \`${table}\` (${cols.map(c => `\`${c}\``).join(',')}) VALUES ${rows.map(() => placeholders).join(',')}`;
  const flat = rows.flatMap(r => cols.map(c => r[c] ?? null));
  await staging.query(sql, flat);
  console.log(`  inserted ${rows.length} into ${table}`);
}

async function main() {
  console.log(`[seed] prod=${hostOf(PROD_URL)} staging=${hostOf(STAGING_URL)} sample=${SAMPLE_SIZE}`);

  // 1. Sample customers (non-merged)
  const [customers] = await prod.query(
    'SELECT * FROM customers WHERE mergedIntoId IS NULL ORDER BY RAND() LIMIT ?',
    [SAMPLE_SIZE],
  );
  if (!customers.length) {
    console.log('[seed] no customers found — nothing to do');
    return;
  }
  const custIds = customers.map(c => c.id);
  console.log(`[prod] picked ${custIds.length} customers`);

  // 2. Pull their dependents
  const inPH = custIds.map(() => '?').join(',');
  const [properties] = await tableExists(prod, 'properties')
    ? await prod.query(`SELECT * FROM properties WHERE customerId IN (${inPH})`, custIds)
    : [[]];
  const [addresses] = await prod.query(
    `SELECT * FROM customerAddresses WHERE customerId IN (${inPH})`, custIds,
  );

  // Most-recent opportunity per customer
  const [oppsAll] = await prod.query(
    `SELECT * FROM opportunities WHERE customerId IN (${inPH}) ORDER BY createdAt DESC`, custIds,
  );
  const seenCust = new Set();
  const opportunities = [];
  for (const o of oppsAll) {
    if (seenCust.has(o.customerId)) continue;
    seenCust.add(o.customerId);
    opportunities.push(o);
  }
  const oppIds = opportunities.map(o => o.id);

  let invoices = [], lineItems = [], payments = [];
  if (oppIds.length) {
    const oppPH = oppIds.map(() => '?').join(',');
    [invoices] = await prod.query(
      `SELECT * FROM invoices WHERE opportunityId IN (${oppPH})`, oppIds,
    );
    const invIds = invoices.map(i => i.id);
    if (invIds.length) {
      const invPH = invIds.map(() => '?').join(',');
      [lineItems] = await prod.query(
        `SELECT * FROM invoiceLineItems WHERE invoiceId IN (${invPH})`, invIds,
      );
      [payments] = await prod.query(
        `SELECT * FROM invoicePayments WHERE invoiceId IN (${invPH})`, invIds,
      );
    }
  }

  console.log(`[prod] ${properties.length} properties, ${addresses.length} addresses, ${opportunities.length} opps, ${invoices.length} invoices, ${lineItems.length} line items, ${payments.length} payments`);

  // 3. Clear staging
  await clearStaging();

  // 4. Insert in FK-safe order, scrubbing PII on customers
  const scrubbedCustomers = customers.map(scrubCustomer);
  await insertRows('customers', scrubbedCustomers);
  await insertRows('properties', properties);
  await insertRows('customerAddresses', addresses);
  await insertRows('opportunities', opportunities);
  await insertRows('invoices', invoices);
  await insertRows('invoiceLineItems', lineItems);
  await insertRows('invoicePayments', payments);

  console.log('[seed] done');
}

try {
  await main();
} catch (err) {
  console.error('[seed] failed:', err);
  process.exitCode = 1;
} finally {
  await prod.end();
  await staging.end();
}
