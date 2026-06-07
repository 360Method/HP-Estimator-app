/**
 * scripts/generate-roadmap-sample.mjs
 *
 * Generate the sample 360° Priority Roadmap PDF shown on the marketing site.
 * Content: docs/samples/sample-roadmap-content.json — a fictionalized version
 * of a real pipeline-generated roadmap (real findings and voice, fictional
 * persona and address, no identifying details). Photos: real anonymous
 * inspector detail shots in docs/samples/sample-photos/.
 *
 * Usage:  pnpm tsx scripts/generate-roadmap-sample.mjs
 * Output: docs/samples/roadmap-sample-<YYYY-MM-DD>-<version>.pdf
 *         docs/samples/roadmap-sample-latest.pdf
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { renderPriorityTranslationPdf } from "../server/lib/priorityTranslation/pdf.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const MOCK_RESPONSE = JSON.parse(
  readFileSync(resolve(REPO_ROOT, "docs", "samples", "sample-roadmap-content.json"), "utf-8"),
);

async function main() {
  console.log("[sample] rendering 360° Priority Roadmap PDF...");
  // Real inspector detail shots (anonymous close-ups) from the source report,
  // keyed by finding index in the sample content.
  const PHOTO_DIR = resolve(REPO_ROOT, "docs", "samples", "sample-photos");
  const photosByFinding = {};
  for (let idx = 0; idx < MOCK_RESPONSE.findings.length; idx++) {
    const list = [];
    for (let n = 0; n < 3; n++) {
      const p = resolve(PHOTO_DIR, `finding-${idx}-${n}.jpg`);
      if (existsSync(p)) list.push(new Uint8Array(readFileSync(p)));
    }
    if (list.length) photosByFinding[idx] = list;
  }
  const pdfBuffer = await renderPriorityTranslationPdf({
    firstName: "Daniel",
    propertyAddress: "7414 NE Alder Crest Drive, Vancouver, WA 98662",
    claudeResponse: MOCK_RESPONSE,
    editionDate: new Date(),
    photosByFinding,
    photosLabel: "FROM THE INSPECTION REPORT",
  });

  const today = new Date().toISOString().slice(0, 10);
  const outDir = resolve(REPO_ROOT, "docs", "samples");
  mkdirSync(outDir, { recursive: true });
  // Write both the dated v2 file AND the canonical "latest" file the funnel
  // site embeds. Keeping the dated file lets us diff visually against past
  // editions; the canonical file lets the marketing site link to a stable URL.
  const versionTag = process.env.ROADMAP_SAMPLE_VERSION || "v2";
  const datedPath = resolve(outDir, `roadmap-sample-${today}-${versionTag}.pdf`);
  const canonicalPath = resolve(outDir, `roadmap-sample-latest.pdf`);
  writeFileSync(datedPath, pdfBuffer);
  writeFileSync(canonicalPath, pdfBuffer);
  const outPath = datedPath;

  const sizeKb = (pdfBuffer.byteLength / 1024).toFixed(1);
  console.log(`[sample] wrote ${outPath} (${sizeKb} KB, ${MOCK_RESPONSE.findings.length} findings)`);
}

main().catch((err) => {
  console.error("[sample] failed:", err);
  process.exit(1);
});
