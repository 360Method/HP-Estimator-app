/**
 * scripts/generate-roadmap.mjs
 *
 * Generate a real customer 360° Priority Roadmap PDF from a findings JSON file.
 * This is the reliable, no-dependency path for an on-site baseline walkthrough:
 * it reuses the exact production renderer (server/lib/priorityTranslation/pdf.ts)
 * but takes its input from a file you fill in after the walk — no database, no
 * Anthropic key, no Railway. The output is byte-for-byte the same branded PDF
 * the app produces for the inspection-upload path.
 *
 * Usage:
 *   pnpm tsx scripts/generate-roadmap.mjs <input.json> [output.pdf]
 *
 * If output is omitted, writes to outputs/roadmap-<firstName>-<YYYY-MM-DD>.pdf
 *
 * Input shape (see scripts/roadmap-input.example.json for a full template):
 *   {
 *     "firstName": "Margaret",
 *     "propertyAddress": "4218 NW Riverstone Court, Vancouver, WA 98685",
 *     "editionDate": "2026-06-01",          // optional, defaults to today
 *     "claudeResponse": {
 *       "executive_summary": "...",          // 2–3 paragraphs, \n\n between them
 *       "property_character": "...",         // 1 paragraph
 *       "summary_1_paragraph": "...",        // = first paragraph of exec summary, verbatim
 *       "closing": "...",                    // 1 paragraph
 *       "findings": [
 *         {
 *           "category": "Plumbing — water heater replacement (50 gal gas)",
 *           "finding": "What the inspector / walkthrough observed.",
 *           "interpretation": "What it means for THIS home and time horizon.",
 *           "recommended_approach": "How Handy Pioneers would sequence the work.",
 *           "urgency": "NOW",                 // NOW | SOON | WAIT
 *           "investment_range_low_usd": 2400,
 *           "investment_range_high_usd": 4200,
 *           "reasoning": "Why this urgency and range."
 *         }
 *       ]
 *     }
 *   }
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderPriorityTranslationPdf } from "../server/lib/priorityTranslation/pdf.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

function slugify(s) {
  return String(s || "customer")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "customer";
}

function fail(msg) {
  console.error(`[roadmap] ${msg}`);
  process.exit(1);
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    fail("missing input file. Usage: pnpm tsx scripts/generate-roadmap.mjs <input.json> [output.pdf]");
  }

  let raw;
  try {
    raw = readFileSync(resolve(process.cwd(), inputPath), "utf8");
  } catch (e) {
    fail(`could not read input file '${inputPath}': ${e.message}`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    fail(`input is not valid JSON: ${e.message}`);
  }

  // ─── Minimal validation with friendly errors ──────────────────────────────
  if (!data.firstName) fail("input.firstName is required");
  if (!data.propertyAddress) fail("input.propertyAddress is required");
  const cr = data.claudeResponse;
  if (!cr || typeof cr !== "object") fail("input.claudeResponse object is required");
  if (!Array.isArray(cr.findings) || cr.findings.length === 0) {
    fail("input.claudeResponse.findings must be a non-empty array");
  }
  const ALLOWED = new Set(["NOW", "SOON", "WAIT"]);
  cr.findings.forEach((f, i) => {
    if (!ALLOWED.has(f.urgency)) {
      fail(`findings[${i}] urgency must be NOW | SOON | WAIT (got '${f.urgency}')`);
    }
    const lo = Number(f.investment_range_low_usd) || 0;
    const hi = Number(f.investment_range_high_usd) || 0;
    // monitoring items may legitimately be 0/0; otherwise enforce low < high
    if (!(lo === 0 && hi === 0) && !(lo >= 0 && lo < hi)) {
      fail(`findings[${i}] ('${f.category || "?"}') needs investment_range_low_usd < investment_range_high_usd (got ${lo}/${hi})`);
    }
  });
  if (!cr.summary_1_paragraph && typeof cr.executive_summary === "string") {
    // Back-compat: derive from the first paragraph of the executive summary.
    cr.summary_1_paragraph = cr.executive_summary.split("\n\n")[0];
  }

  const editionDate = data.editionDate ? new Date(data.editionDate) : new Date();

  console.log(`[roadmap] rendering for ${data.firstName} — ${cr.findings.length} findings...`);
  const pdfBuffer = await renderPriorityTranslationPdf({
    firstName: data.firstName,
    propertyAddress: data.propertyAddress,
    claudeResponse: cr,
    editionDate,
  });

  const today = new Date().toISOString().slice(0, 10);
  let outPath = process.argv[3];
  if (!outPath) {
    const outDir = resolve(REPO_ROOT, "outputs");
    mkdirSync(outDir, { recursive: true });
    outPath = resolve(outDir, `roadmap-${slugify(data.firstName)}-${today}.pdf`);
  } else {
    outPath = resolve(process.cwd(), outPath);
    mkdirSync(dirname(outPath), { recursive: true });
  }

  writeFileSync(outPath, pdfBuffer);
  const sizeKb = (pdfBuffer.byteLength / 1024).toFixed(1);
  console.log(`[roadmap] wrote ${outPath} (${sizeKb} KB)`);
}

main().catch((err) => {
  console.error("[roadmap] failed:", err);
  process.exit(1);
});
