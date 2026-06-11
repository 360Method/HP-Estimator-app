#!/usr/bin/env node
/**
 * scripts/check-portal-leaks.mjs
 *
 * Source-level guard against internal HP economics leaking into customer-facing
 * code. Fails (exit 1) if any internal-only field name appears in the portal
 * tRPC routers or the portal client pages. This complements the runtime tRPC
 * leak guard (server/_core/portalLeakGuard.ts) and its tests: the runtime guard
 * protects the data path, this protects the source — catching a developer who
 * references a margin/cost field on a customer surface at all.
 *
 * Run locally: node scripts/check-portal-leaks.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Keep in sync with PORTAL_FORBIDDEN_KEYS in shared/portalSerializers.ts.
const FORBIDDEN = [
  "hardCostCents",
  "hardCost",
  "grossMarginBps",
  "grossMargin",
  "minGmBps",
  "isSmallJob",
  "belowFloor",
  "marginAuditedAt",
  "estimateSnapshot",
  "clientSnapshot",
  "laborCostCents",
  "costCents",
  "markupPercent",
  "markupBps",
];

const root = process.cwd();

// Customer-facing source that must never reference internal economics.
const FILES = ["server/routers/portal.ts", "server/routers/portalRoadmap.ts"];
const DIRS = ["client/src/pages/portal"];

function collectFromDir(dir) {
  const abs = join(root, dir);
  let out = [];
  let entries;
  try {
    entries = readdirSync(abs);
  } catch {
    return out; // dir may not exist in a partial checkout
  }
  for (const name of entries) {
    const rel = join(dir, name);
    const st = statSync(join(root, rel));
    if (st.isDirectory()) out = out.concat(collectFromDir(rel));
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}

const targets = [...FILES, ...DIRS.flatMap(collectFromDir)];

const wordRe = new RegExp(`\\b(${FORBIDDEN.join("|")})\\b`);
const violations = [];

for (const rel of targets) {
  let text;
  try {
    text = readFileSync(join(root, rel), "utf8");
  } catch {
    continue;
  }
  text.split(/\r?\n/).forEach((line, i) => {
    const m = line.match(wordRe);
    if (m) violations.push({ file: rel, line: i + 1, key: m[1], text: line.trim() });
  });
}

if (violations.length > 0) {
  console.error("Portal leak check FAILED — internal-only field(s) referenced in customer-facing code:\n");
  for (const v of violations) {
    console.error(`  ${relative(root, v.file)}:${v.line}  [${v.key}]  ${v.text}`);
  }
  console.error(
    "\nThese fields carry cost / markup / margin data and must never reach the portal.\n" +
      "Serialize an explicit allowlist (shared/portalSerializers.ts) instead.",
  );
  process.exit(1);
}

console.log(`Portal leak check passed — scanned ${targets.length} customer-facing file(s), no internal fields referenced.`);
