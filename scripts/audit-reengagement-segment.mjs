/**
 * scripts/audit-reengagement-segment.mjs
 *
 * READ-ONLY audit of the re-engagement cohort. Buckets every customer (or a
 * filtered subset) into HOT / WARM / COLD / SKIPPED and prints counts.
 *
 * Usage (from a Railway-authenticated shell):
 *   railway run --service mysql node scripts/audit-reengagement-segment.mjs
 *   railway run --service mysql node scripts/audit-reengagement-segment.mjs --leadSource=hcp
 *
 * Or locally with DATABASE_URL set:
 *   DATABASE_URL='mysql://...' node scripts/audit-reengagement-segment.mjs
 *
 * NO writes. NO emails. NO Anthropic calls. Just counts.
 */
import mysql from "mysql2/promise";

const DAY_MS = 24 * 60 * 60 * 1000;
const SIX_MONTHS_MS = 182 * DAY_MS;
const TWENTY_FOUR_MONTHS_MS = 730 * DAY_MS;

function bucketize(lastWorkMs) {
  if (lastWorkMs === null) return "cold";
  const age = Date.now() - lastWorkMs;
  if (age <= SIX_MONTHS_MS) return "hot";
  if (age <= TWENTY_FOUR_MONTHS_MS) return "warm";
  return "cold";
}

const args = process.argv.slice(2);
const leadSourceArg = args.find((a) => a.startsWith("--leadSource="));
const leadSourceLike = leadSourceArg ? leadSourceArg.split("=")[1] : null;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set. Run via `railway run` or export it locally.");
    process.exit(1);
  }
  const conn = await mysql.createConnection(url);

  let customerQuery = "SELECT id, firstName, lastName, email, mobilePhone, doNotService, leadSource FROM customers";
  const params = [];
  if (leadSourceLike) {
    customerQuery += " WHERE LOWER(leadSource) LIKE ?";
    params.push(`%${leadSourceLike.toLowerCase()}%`);
  }
  const [customers] = await conn.execute(customerQuery, params);

  console.log(`\nLoaded ${customers.length} customers${leadSourceLike ? ` (leadSource ~ ${leadSourceLike})` : ""}\n`);

  const buckets = { hot: [], warm: [], cold: [], skipped: [] };
  const skipReasons = {};

  for (const c of customers) {
    if (c.doNotService) {
      buckets.skipped.push({ id: c.id, reason: "doNotService" });
      skipReasons["doNotService"] = (skipReasons["doNotService"] ?? 0) + 1;
      continue;
    }
    if (!c.email && !c.mobilePhone) {
      buckets.skipped.push({ id: c.id, reason: "no email and no phone" });
      skipReasons["no_contact"] = (skipReasons["no_contact"] ?? 0) + 1;
      continue;
    }
    // Most recent paid invoice
    const [invRows] = await conn.execute(
      "SELECT issuedAt, paidAt, total FROM invoices WHERE customerId = ? AND status = 'paid' ORDER BY issuedAt DESC LIMIT 1",
      [c.id],
    );
    let lastWorkMs = null;
    if (invRows.length > 0) {
      const inv = invRows[0];
      const candidate = inv.paidAt || inv.issuedAt;
      if (candidate) {
        const t = Date.parse(candidate);
        if (!Number.isNaN(t)) lastWorkMs = t;
      }
    }
    // Fall back to most recent won opportunity if no invoice
    if (lastWorkMs === null) {
      const [oppRows] = await conn.execute(
        "SELECT wonAt FROM opportunities WHERE customerId = ? AND wonAt IS NOT NULL ORDER BY wonAt DESC LIMIT 1",
        [c.id],
      );
      if (oppRows.length > 0 && oppRows[0].wonAt) {
        const t = Date.parse(oppRows[0].wonAt);
        if (!Number.isNaN(t)) lastWorkMs = t;
      }
    }
    const seg = bucketize(lastWorkMs);
    buckets[seg].push({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`.trim(),
      email: c.email,
      phone: c.mobilePhone,
      leadSource: c.leadSource,
      lastWorkDate: lastWorkMs ? new Date(lastWorkMs).toISOString().slice(0, 10) : null,
    });
  }

  console.log("=".repeat(64));
  console.log("RE-ENGAGEMENT SEGMENTATION");
  console.log("=".repeat(64));
  console.log(`HOT    (≤6 mo):     ${buckets.hot.length}`);
  console.log(`WARM   (6–24 mo):   ${buckets.warm.length}`);
  console.log(`COLD   (24+ mo):    ${buckets.cold.length}`);
  console.log(`SKIPPED:            ${buckets.skipped.length}`);
  console.log(`  reasons: ${JSON.stringify(skipReasons)}`);
  console.log(`TOTAL ELIGIBLE:     ${buckets.hot.length + buckets.warm.length + buckets.cold.length}`);
  console.log(`TOTAL CONSIDERED:   ${customers.length}`);
  console.log("=".repeat(64));

  // Show first 5 of each bucket
  for (const s of ["hot", "warm", "cold"]) {
    console.log(`\n--- First 5 of ${s.toUpperCase()} ---`);
    for (const c of buckets[s].slice(0, 5)) {
      console.log(
        `  ${c.id}  ${c.name.padEnd(25)} ${(c.email || c.phone || "(no contact)").padEnd(35)} last:${c.lastWorkDate ?? "—"}`,
      );
    }
  }

  await conn.end();
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
