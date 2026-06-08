#!/usr/bin/env node
/**
 * Render the exact roadmap PDF a submission produced, from its stored
 * claudeResponse — for QA'ing a delivered roadmap without chasing the email.
 *
 * Usage:
 *   railway run -s HP-Estimator-app -- pnpm tsx scripts/render-roadmap-from-row.mjs <translationId> <outPath> [reportPdfPath]
 *
 * Pass a local copy of the submitted report as reportPdfPath to also
 * re-extract and place the inspector's photos (the row alone can't reproduce
 * them once the server's /tmp copy is gone).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { eq } from "drizzle-orm";
import { getDb } from "../server/db.ts";
import { priorityTranslations, portalAccounts, portalProperties } from "../drizzle/schema.priorityTranslation.ts";
import { renderPriorityTranslationPdf } from "../server/lib/priorityTranslation/pdf.ts";
import { extractReportPhotos, photosForFindings } from "../server/lib/priorityTranslation/reportPhotos.ts";
import { matchPhotosToFindings } from "../server/lib/priorityTranslation/photoMatcher.ts";

const [id, outPath, reportPdfPath] = process.argv.slice(2);
if (!id || !outPath) {
  console.error("usage: tsx scripts/render-roadmap-from-row.mjs <translationId> <outPath> [reportPdfPath]");
  process.exit(1);
}

const db = await getDb();
if (!db) throw new Error("DB unavailable");
const rows = await db
  .select()
  .from(priorityTranslations)
  .where(eq(priorityTranslations.id, id))
  .limit(1);
const row = rows[0];
if (!row) throw new Error(`${id} not found`);
if (!row.claudeResponse) throw new Error(`${id} has no stored claudeResponse (status=${row.status})`);

const claudeResponse =
  typeof row.claudeResponse === "string" ? JSON.parse(row.claudeResponse) : row.claudeResponse;

// Cover fields live on the related records, not the translation row (the row
// has no firstName/propertyAddress columns). Resolve them the way the
// production pipeline does: name from the portal account, address from the
// portal property.
const [account] = await db.select().from(portalAccounts).where(eq(portalAccounts.id, row.portalAccountId)).limit(1);
const [prop] = await db.select().from(portalProperties).where(eq(portalProperties.id, row.propertyId)).limit(1);
const firstName = account?.firstName ?? "";
const propertyAddress = prop
  ? [prop.street, [prop.city, prop.state].filter(Boolean).join(", "), prop.zip].filter(Boolean).join(", ")
  : "";

let photosByFinding;
if (reportPdfPath) {
  if (!existsSync(reportPdfPath)) throw new Error(`report PDF not found: ${reportPdfPath}`);
  const photosByPage = await extractReportPhotos(new Uint8Array(readFileSync(reportPdfPath)));
  // Vision-verified placement when a key is present (same as production);
  // bare positional mapping otherwise.
  if (process.env.ANTHROPIC_API_KEY) {
    photosByFinding = await matchPhotosToFindings({
      apiKey: process.env.ANTHROPIC_API_KEY,
      findings: claudeResponse.findings ?? [],
      photosByPage,
    });
  } else {
    photosByFinding = photosForFindings({
      findings: claudeResponse.findings ?? [],
      photosByPage,
    });
  }
  const attached = Object.values(photosByFinding).reduce((n, p) => n + p.length, 0);
  console.log(`[render-row] photos: ${photosByPage.size} pages with images, ${attached} attached`);
}

const pdfBuffer = await renderPriorityTranslationPdf({
  firstName,
  propertyAddress,
  claudeResponse,
  editionDate: row.deliveredAt ? new Date(row.deliveredAt) : new Date(),
  photosByFinding,
  photosLabel: "FROM YOUR INSPECTION REPORT",
});

writeFileSync(outPath, pdfBuffer);
console.log(
  `[render-row] ${id} -> ${outPath} (${(pdfBuffer.byteLength / 1024).toFixed(1)} KB, ${claudeResponse.findings?.length ?? 0} findings, status=${row.status})`,
);
process.exit(0);
