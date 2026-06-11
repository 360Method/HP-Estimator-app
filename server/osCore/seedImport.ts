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
import { osBusiness, osDocuments, osDocumentVersions, osFileBlobs, osFolders } from "../../drizzle/schema";

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
  taskTitleTemplate?: string | null;
  taskDueOffsetHours?: number | null;
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

function findSeedFile(name: string): string | null {
  const candidates = [
    path.resolve(process.cwd(), `server/osCore/seed/${name}`),
    path.resolve(import.meta.dirname ?? __dirname, `seed/${name}`),
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

function findBundle(): string | null {
  return findSeedFile("hp-os-seed.json");
}

function slugify(name: string): string {
  return (
    name
      .replace(/^\d+_/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 120) || "folder"
  );
}

function displayName(dirName: string): string {
  return dirName.replace(/^\d+_/, "").replace(/_/g, " ").trim();
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
        .select({
          docId: osDocuments.docId,
          body: osDocuments.body,
          title: osDocuments.title,
          enabled: osDocuments.enabled,
          kind: osDocuments.kind,
          cron: osDocuments.cron,
          events: osDocuments.events,
          tools: osDocuments.tools,
          approval: osDocuments.approval,
          taskTitleTemplate: osDocuments.taskTitleTemplate,
          taskDueOffsetHours: osDocuments.taskDueOffsetHours,
        })
        .from(osDocuments)
        .where(eq(osDocuments.sourcePath, doc.sourcePath))
        .limit(1);

      if (existing.length) {
        const row = existing[0];
        const docId = row.docId;
        const unchanged =
          row.body === doc.body &&
          row.title === doc.title &&
          row.enabled === doc.enabled &&
          row.kind === doc.kind &&
          (row.cron ?? null) === (doc.cron ?? null) &&
          (row.events ?? null) === (doc.events ?? null) &&
          (row.tools ?? null) === (doc.tools ?? null) &&
          row.approval === (doc.approval ?? "default") &&
          (row.taskTitleTemplate ?? null) === (doc.taskTitleTemplate ?? null) &&
          (row.taskDueOffsetHours ?? null) === (doc.taskDueOffsetHours ?? null);
        if (unchanged) continue;
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
        // Seed-owned: the bundle is authoritative for the whole row (body,
        // frontmatter, AND the enabled flag), so a corrected bundle can heal
        // a previously imported row on the next boot.
        await db
          .update(osDocuments)
          .set({
            body: doc.body,
            title: doc.title,
            type: doc.type,
            layer: doc.layer,
            kind: doc.kind,
            events: doc.events ?? null,
            cron: doc.cron ?? null,
            timezone: doc.timezone ?? null,
            tools: doc.tools ?? null,
            approval: doc.approval ?? "default",
            model: doc.model ?? null,
            maxTurns: doc.maxTurns ?? 6,
            runLimitDaily: doc.runLimitDaily ?? 20,
            enabled: doc.enabled,
            taskTitleTemplate: doc.taskTitleTemplate ?? null,
            taskDueOffsetHours: doc.taskDueOffsetHours ?? null,
            updatedAt: new Date(),
          })
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
        taskTitleTemplate: doc.taskTitleTemplate ?? null,
        taskDueOffsetHours: doc.taskDueOffsetHours ?? null,
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

// ─── Binary files manifest ────────────────────────────────────────────────────

type SeedFile = {
  sourcePath: string;
  folderPath: string;
  title: string;
  mime: string;
  size: number;
  dataBase64: string;
};

/**
 * Turns server/osCore/seed/hp-os-files.json (written by
 * scripts/build-os-files-bundle.mjs) into os_file_blobs rows + FILE entries
 * in the Library, served only via the authenticated /api/os/files route.
 * Folders are resolved by slug chain and created when a folder held only
 * binaries (the markdown seed never saw it). Idempotent: an existing
 * sourcePath is re-stored only when the size changed.
 */
export async function importOsFilesManifest(): Promise<void> {
  const manifestPath = findSeedFile("hp-os-files.json");
  if (!manifestPath) return;
  const db = await getDb();
  if (!db) return;

  let files: SeedFile[];
  try {
    files = (JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as { files: SeedFile[] }).files ?? [];
  } catch (err) {
    console.warn("[osSeed] files manifest unreadable, skipping:", err);
    return;
  }
  if (files.length === 0) return;

  // Cheap short-circuit: when every manifest file is already stored, skip
  // the per-file work (the manifest is ~7 MB of base64; parsing is fine,
  // 314 queries every boot is not).
  const [blobCount] = await db.select({ count: dsql<number>`COUNT(*)` }).from(osFileBlobs);
  const allPresent = Number(blobCount?.count ?? 0) >= files.length;

  const report = { folders: 0, created: 0, updated: 0 };
  try {
    // Folder resolution by slug chain, creating missing levels.
    const cache = new Map<string, number>();
    const resolveFolder = async (folderPath: string): Promise<number | null> => {
      if (cache.has(folderPath)) return cache.get(folderPath)!;
      let parentId: number | null = null;
      let walked = "";
      for (const part of folderPath.split("/")) {
        walked = walked ? `${walked}/${part}` : part;
        if (cache.has(walked)) {
          parentId = cache.get(walked)!;
          continue;
        }
        const slug = slugify(part);
        const found: Array<{ id: number }> = await db
          .select({ id: osFolders.id })
          .from(osFolders)
          .where(
            and(
              parentId === null ? isNull(osFolders.parentId) : eq(osFolders.parentId, parentId),
              eq(osFolders.slug, slug),
            ),
          )
          .limit(1);
        if (found.length) {
          parentId = found[0].id;
        } else {
          const insertedRows: Array<{ id: number }> = await db
            .insert(osFolders)
            .values({ parentId, slug, name: displayName(part), sortOrder: 99 })
            .returning({ id: osFolders.id });
          parentId = insertedRows[0].id;
          report.folders++;
        }
        cache.set(walked, parentId as number);
      }
      return parentId;
    };

    // HP-FILE-NNN allocation from current DB state.
    const [maxRow] = await db
      .select({ max: dsql<string | null>`MAX("docId")` })
      .from(osDocuments)
      .where(dsql`"docId" LIKE 'HP-FILE-%'`);
    let counter = maxRow?.max ? Number(String(maxRow.max).slice("HP-FILE-".length)) || 0 : 0;

    for (const f of files) {
      const existing = await db
        .select({ docId: osDocuments.docId, fileSize: osDocuments.fileSize })
        .from(osDocuments)
        .where(eq(osDocuments.sourcePath, f.sourcePath))
        .limit(1);

      if (existing.length) {
        const row = existing[0];
        if (allPresent && row.fileSize === f.size) continue;
        const blob = await db
          .select({ id: osFileBlobs.id, size: osFileBlobs.size })
          .from(osFileBlobs)
          .where(eq(osFileBlobs.sourcePath, f.sourcePath))
          .limit(1);
        if (blob.length && blob[0].size === f.size) continue;
        const data = Buffer.from(f.dataBase64, "base64");
        if (blob.length) {
          await db
            .update(osFileBlobs)
            .set({ mime: f.mime, size: f.size, data })
            .where(eq(osFileBlobs.sourcePath, f.sourcePath));
        } else {
          await db.insert(osFileBlobs).values({ sourcePath: f.sourcePath, mime: f.mime, size: f.size, data });
        }
        await db
          .update(osDocuments)
          .set({ fileMime: f.mime, fileSize: f.size, updatedAt: new Date() })
          .where(eq(osDocuments.docId, row.docId));
        report.updated++;
        continue;
      }

      const folderId = await resolveFolder(f.folderPath);
      if (!folderId) {
        console.warn(`[osSeed] no folder for file ${f.sourcePath} — skipped`);
        continue;
      }
      counter++;
      const docId = `HP-FILE-${String(counter).padStart(3, "0")}`;
      await db
        .insert(osFileBlobs)
        .values({
          sourcePath: f.sourcePath,
          mime: f.mime,
          size: f.size,
          data: Buffer.from(f.dataBase64, "base64"),
        })
        .onConflictDoNothing();
      await db.insert(osDocuments).values({
        docId,
        folderId,
        title: f.title.slice(0, 300),
        type: "FILE",
        status: "final",
        kind: "human",
        body: "",
        fileUrl: `/api/os/files/${docId}`,
        fileMime: f.mime,
        fileSize: f.size,
        internal: true,
        sourcePath: f.sourcePath,
        version: 1,
      });
      report.created++;
    }

    if (report.folders || report.created || report.updated) {
      console.log(
        `[osSeed] files: +${report.created} created, ${report.updated} updated, folders +${report.folders}`,
      );
    }
  } catch (err) {
    console.warn("[osSeed] files import failed (non-fatal):", err);
  }
}
