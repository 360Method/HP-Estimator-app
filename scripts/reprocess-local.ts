/**
 * One-off: reprocess a roadmap submission LOCALLY against prod env.
 * Used when the server's copy of the uploaded PDF was lost (no volume) but a
 * rescued copy exists on this machine.
 *
 * Usage:
 *   railway run -s HP-Estimator-app -- pnpm tsx scripts/reprocess-local.ts <translationId> <localPdfPath>
 *
 * Points the row's pdfStoragePath at the local file, then runs the same
 * reprocessRoadmap the server uses — DB, Anthropic, and Resend come from the
 * injected prod env. Sends the real customer email on success.
 */
import fs from "fs";
import { eq } from "drizzle-orm";
import { getDb } from "../server/db";
import { priorityTranslations } from "../drizzle/schema.priorityTranslation";
import { reprocessRoadmap } from "../server/lib/priorityTranslation/orchestrator";

const [id, localPdf] = process.argv.slice(2);
if (!id || !localPdf || !fs.existsSync(localPdf)) {
  console.error("usage: tsx scripts/reprocess-local.ts <translationId> <existing localPdfPath>");
  process.exit(1);
}

const db = await getDb();
if (!db) throw new Error("DB unavailable");
await db
  .update(priorityTranslations)
  .set({ pdfStoragePath: localPdf, updatedAt: new Date() })
  .where(eq(priorityTranslations.id, id));
console.log(`[reprocess-local] ${id} pdfStoragePath -> ${localPdf} (${(fs.statSync(localPdf).size / 1024 / 1024).toFixed(1)} MB)`);

await reprocessRoadmap(id);
console.log("[reprocess-local] done — check row status / customer inbox");
process.exit(0);
