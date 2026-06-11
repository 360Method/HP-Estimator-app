/**
 * server/osCore/seedImport.ts
 *
 * Applies the committed HP-OS seed bundle (server/osCore/seed/hp-os-seed.json,
 * produced by scripts/build-os-seed.mjs) to the database at boot. Idempotent:
 *
 *   - Folders are keyed by their slug chain; existing folders are reused.
 *   - Documents are keyed by sourcePath. A re-import updates a document only
 *     while it is still seed-owned (latest version row is version 1 with
 *     editedBy='seed'); anything a human or agent has touched is left alone.
 *   - Guardrails are written to os_business only while still empty.
 *
 * The bundle ships inside the image (same packaging trick as the SOP files:
 * the Railway image copies the full repo), so seeding needs no external
 * connectivity and runs identically on staging and prod.
 */

import fs from "fs";
import path from "path";
import { and, eq, isNull, sql as dsql } from "drizzle-orm";
import { getDb } from "../db";
import { osBusiness, osDocuments, osDocumentVersions, osFolders } from "../../drizzle/schema";

type SeedDoc = {
  sourcePath: string;
  folderPath: string;
  docId: string | null;
  title: string;
  type: "SOP" | "WF" | "DOC" | "TPL" | "REF" | "DATA";
  layer: string | null;
  kind: "human" | "agent";
  status: "draft" | "review" | "final" | "archived";
  enabled: boolean;
  body: string;
  events?: string | null;
  cron?: string | null;
  timezone?: string | null;
  tools?: string | null;
  approval?: "default" | "always" | "never-send";
  model?: string | null;
  maxTurns?: number;
  runLimitDaily?: number;
};

type SeedBundle = {
  builtAt: string;
  business?: { guardrails?: Record<string, unknown> };
  folders: Array<{
    path: string;
    slug: string;
    name: string;
    areaCode: string | null;
    sortOrder: number;
  }>;
  docs: SeedDoc[];
};

function findBundle(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "server/osCore/seed/hp-os-seed.json"),
    path.resolve(import.meta.dirname ?? __dirname, "seed/hp-os-seed.json"),
  ];
  for (const p of candidates) {
    try {
      if (fs.statSync(p).isFile()) return p;
    } catch {
      // try next
    }
  }
  return null;
}

export async function importOsSeedBundle(): Promise<void> {
  const bundlePath = findBundle();
  if (!bundlePath) return; // bundle not built yet; nothing to do
  const db = await getDb();
  if (!db) return;

  let bundle: SeedBundle;
  try {
    bundle = JSON.parse(fs.readFileSync(bundlePath, "utf-8"));
  } catch (err) {
    console.warn("[osSeed] bundle unreadable, skipping:", err);
    return;
  }

  const report = { folders: 0, created: 0, updated: 0, kept: 0 };
  try {
    // Guardrails: only while still empty (never overwrite tuned values).
    if (bundle.business?.guardrails) {
      await db
        .update(osBusiness)
        .set({ guardrails: JSON.stringify(bundle.business.guardrails) })
        .where(and(eq(osBusiness.id, 1), eq(osBusiness.guardrails, "{}")));
    }

    // Folders, parents before children (sorted by path depth).
    const idByPath = new Map<string, number>();
    const sorted = [...bundle.folders].sort(
      (a, b) => a.path.split("/").length - b.path.split("/").length,
    );
    for (const f of sorted) {
      const parentPath = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : null;
      const parentId = parentPath ? (idByPath.get(parentPath) ?? null) : null;
      const existing = await db
        .select({ id: osFolders.id })
        .from(osFolders)
        .where(
          and(
            parentId === null ? isNull(osFolders.parentId) : eq(osFolders.parentId, parentId),
            eq(osFolders.slug, f.slug),
          ),
        )
        .limit(1);
      if (existing.length) {
        idByPath.set(f.path, existing[0].id);
        continue;
      }
      const [inserted] = await db
        .insert(osFolders)
        .values({
          parentId,
          slug: f.slug,
          name: f.name,
          areaCode: f.areaCode,
          sortOrder: f.sortOrder,
        })
        .returning({ id: osFolders.id });
      idByPath.set(f.path, inserted.id);
      report.folders++;
    }

    // DocId allocation counters from current DB state.
    const counters = new Map<string, number>();
    const allIds = await db.select({ docId: osDocuments.docId }).from(osDocuments);
    for (const r of allIds) {
      const m = r.docId.match(/^(HP-[A-Z]+-)(\d+)$/);
      if (!m) continue;
      counters.set(m[1], Math.max(counters.get(m[1]) ?? 0, Number(m[2])));
    }
    const allocate = (type: string): string => {
      const prefix = `HP-${type}-`;
      const next = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, next);
      return `${prefix}${String(next).padStart(3, "0")}`;
    };
    const reserve = (docId: string) => {
      const m = docId.match(/^(HP-[A-Z]+-)(\d+)$/);
      if (m) counters.set(m[1], Math.max(counters.get(m[1]) ?? 0, Number(m[2])));
    };

    for (const doc of bundle.docs) {
      const folderId = idByPath.get(doc.folderPath);
      if (!folderId) {
        console.warn(`[osSeed] no folder for ${doc.sourcePath} (${doc.folderPath}) — skipped`);
        continue;
      }

      const existing = await db
        .select({ docId: osDocuments.docId })
        .from(osDocuments)
        .where(eq(osDocuments.sourcePath, doc.sourcePath))
        .limit(1);

      if (existing.length) {
        const docId = existing[0].docId;
        const [latestVer] = await db
          .select({ version: osDocumentVersions.version, editedBy: osDocumentVersions.editedBy })
          .from(osDocumentVersions)
          .where(eq(osDocumentVersions.docId, docId))
          .orderBy(dsql`version DESC`)
          .limit(1);
        const seedOwned = !latestVer || (latestVer.version === 1 && latestVer.editedBy === "seed");
        if (!seedOwned) {
          report.kept++;
          continue;
        }
        await db
          .update(osDocuments)
          .set({ body: doc.body, title: doc.title, updatedAt: new Date() })
          .where(eq(osDocuments.docId, docId));
        await db
          .update(osDocumentVersions)
          .set({ body: doc.body })
          .where(and(eq(osDocumentVersions.docId, docId), eq(osDocumentVersions.version, 1)));
        report.updated++;
        continue;
      }

      let docId = doc.docId;
      if (docId) {
        const clash = await db
          .select({ id: osDocuments.id })
          .from(osDocuments)
          .where(eq(osDocuments.docId, docId))
          .limit(1);
        if (clash.length) docId = null;
        else reserve(docId);
      }
      if (!docId) docId = allocate(doc.type);

      await db.insert(osDocuments).values({
        docId,
        folderId,
        title: doc.title,
        type: doc.type,
        layer: doc.layer,
        status: doc.status,
        kind: doc.kind,
        body: doc.body,
        events: doc.events ?? null,
        cron: doc.cron ?? null,
        timezone: doc.timezone ?? null,
        tools: doc.tools ?? null,
        approval: doc.approval ?? "default",
        model: doc.model ?? null,
        maxTurns: doc.maxTurns ?? 6,
        runLimitDaily: doc.runLimitDaily ?? 20,
        enabled: doc.enabled,
        internal: true,
        sourcePath: doc.sourcePath,
        version: 1,
      });
      await db
        .insert(osDocumentVersions)
        .values({
          docId,
          version: 1,
          body: doc.body,
          frontmatter: JSON.stringify({ seeded: doc.sourcePath }),
          editedBy: "seed",
        })
        .onConflictDoNothing();
      report.created++;
    }

    if (report.folders || report.created || report.updated) {
      console.log(
        `[osSeed] folders +${report.folders}, docs +${report.created} created, ${report.updated} re-seeded, ${report.kept} kept (edited in app)`,
      );
    }
  } catch (err) {
    console.warn("[osSeed] import failed (non-fatal):", err);
  }
}
