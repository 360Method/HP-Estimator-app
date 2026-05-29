#!/usr/bin/env node
/**
 * Verifies the 19 membership Stripe price env vars are set (audit follow-up).
 * Prints ONLY key names + set/missing status — never the secret values.
 *
 * Run against production:   railway run node scripts/verify-stripe-prices.mjs
 * Run locally with a .env:  node --env-file=.env scripts/verify-stripe-prices.mjs
 *
 * Mirrors shared/threeSixtyContract.ts (kept honest by threeSixtyContract.test.ts).
 */
const HOMEOWNER_TIERS = ["bronze", "silver", "gold"];
const PORTFOLIO_SEG = { exterior_shield: "EXTERIOR", full_coverage: "FULL", max: "MAX" };
const CADENCES = ["monthly", "quarterly", "annual"];

const keys = [];
for (const t of HOMEOWNER_TIERS) for (const c of CADENCES) keys.push(`STRIPE_PRICE_${t.toUpperCase()}_${c.toUpperCase()}`);
for (const seg of Object.values(PORTFOLIO_SEG)) for (const c of CADENCES) keys.push(`STRIPE_PRICE_PORTFOLIO_${seg}_${c.toUpperCase()}`);
keys.push("STRIPE_PRICE_INTERIOR_ADDON_ANNUAL_PER_DOOR");

const missing = [];
let set = 0;
for (const k of keys) {
  const present = typeof process.env[k] === "string" && process.env[k].length > 0;
  if (present) set++;
  else missing.push(k);
  console.log(`  ${present ? "✓" : "✗"} ${k}`);
}

console.log(`\n${set}/${keys.length} membership Stripe price vars set.`);
if (missing.length) {
  console.error(`\nMISSING (${missing.length}):\n  ${missing.join("\n  ")}`);
  process.exit(1);
}
console.log("All 19 membership price vars are configured. ✅");
