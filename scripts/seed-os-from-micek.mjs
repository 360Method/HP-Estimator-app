/**
 * scripts/seed-os-from-micek.mjs
 *
 * One-time (idempotent) import of the Micek-OS Handy Pioneers sub-OS into the
 * app's HP-OS tables. Run locally against staging first, then prod:
 *
 *   DATABASE_URL=<url> SEED_SOURCE="C:\Micek-OS\micek-os\businesses\Handy Pioneers" \
 *     node scripts/seed-os-from-micek.mjs
 *
 * Rules:
 *   - Folders keyed by their deterministic slug chain; docs keyed by sourcePath.
 *   - Re-runs update a document body ONLY while it is still at version 1 with
 *     editedBy='seed'; in-app edits are never clobbered.
 *   - P1..P16 -> HP-SOP-001..016, S1..S9 -> HP-SOP-101..109 (kind=human,
 *     status=final, enabled=false: nothing fires until each is switched on).
 *   - The app's three file SOPs -> HP-SOP-201..203 (kind=agent), frontmatter
 *     copied verbatim, enabled mirroring the file.
 *   - Binaries are skipped and listed at the end for a later Cloudinary pass.
 */

import fs from "fs";
import path from "path";
import postgres from "postgres";

const SOURCE = process.env.SEED_SOURCE ?? "C:\\Micek-OS\\micek-os\\businesses\\Handy Pioneers";
const APP_SOPS = path.resolve(process.cwd(), "server/agents/sops");
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
if (!fs.existsSync(SOURCE)) {
  console.error(`SEED_SOURCE not found: ${SOURCE}`);
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: "prefer" });

const AREA_BY_ROOT = {
  "01_Operations": "OPS",
  "02_Subcontractors": "SUBS",
  "03_Finance": "FIN",
  "04_Marketing": "MKT",
  "05_Technology": "TECH",
  "06_Clients": "CLI",
  "07_Legal_HR": "LEGAL",
  "Pioneers-Compass": "COMPASS",
};

const skippedBinaries = [];
const report = { folders: 0, created: 0, updated: 0, kept: 0 };

function slugify(name) {
  return (
    name
      .replace(/^\d+_/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 120) || "folder"
  );
}

function displayName(dirName) {
  return dirName.replace(/^\d+_/, "").replace(/_/g, " ").trim();
}

function titleFromMarkdown(body, fallback) {
  const m = body.match(/^#\s+(.+)$/m);
  return (m ? m[1] : fallback).trim().slice(0, 300);
}

/** Folder upsert by (parentId, slug); returns id. */
async function ensureFolder(parentId, dirName, sortOrder, areaCode) {
  const slug = slugify(dirName);
  const name = displayName(dirName);
  const existing = await sql`
    SELECT id FROM os_folders
    WHERE "businessId" = 1 AND "parentId" IS NOT DISTINCT FROM ${parentId} AND slug = ${slug}
    LIMIT 1`;
  if (existing.length) return existing[0].id;
  const [row] = await sql`
    INSERT INTO os_folders ("parentId", slug, name, "areaCode", "sortOrder")
    VALUES (${parentId}, ${slug}, ${name}, ${areaCode}, ${sortOrder})
    RETURNING id`;
  report.folders++;
  return row.id;
}

let docIdMax = new Map(); // prefix -> max NNN seen (loaded once, kept current)

async function loadDocIdCounters() {
  const rows = await sql`SELECT "docId" FROM os_documents`;
  for (const r of rows) {
    const m = r.docId.match(/^(HP-[A-Z]+-)(\d+)$/);
    if (!m) continue;
    const cur = docIdMax.get(m[1]) ?? 0;
    docIdMax.set(m[1], Math.max(cur, Number(m[2])));
  }
}

function allocateDocId(type) {
  const prefix = `HP-${type}-`;
  const next = (docIdMax.get(prefix) ?? 0) + 1;
  docIdMax.set(prefix, next);
  return `${prefix}${String(next).padStart(3, "0")}`;
}

function reserveDocId(docId) {
  const m = docId.match(/^(HP-[A-Z]+-)(\d+)$/);
  if (!m) return;
  const cur = docIdMax.get(m[1]) ?? 0;
  docIdMax.set(m[1], Math.max(cur, Number(m[2])));
}

/**
 * Upsert one document by sourcePath. `fields` carries docId (optional,
 * otherwise allocated), title, type, layer, kind, status, enabled, body,
 * plus any agent frontmatter columns.
 */
async function upsertDoc(folderId, sourcePath, fields) {
  const existing = await sql`
    SELECT "docId", version FROM os_documents WHERE "sourcePath" = ${sourcePath} LIMIT 1`;

  if (existing.length) {
    const docId = existing[0].docId;
    const [latestVer] = await sql`
      SELECT version, "editedBy" FROM os_document_versions
      WHERE "docId" = ${docId} ORDER BY version DESC LIMIT 1`;
    const seedOwned = !latestVer || (latestVer.version === 1 && latestVer.editedBy === "seed");
    if (!seedOwned) {
      report.kept++;
      return docId;
    }
    await sql`
      UPDATE os_documents SET
        body = ${fields.body}, title = ${fields.title}, "updatedAt" = now()
      WHERE "docId" = ${docId}`;
    await sql`
      UPDATE os_document_versions SET body = ${fields.body}
      WHERE "docId" = ${docId} AND version = 1`;
    report.updated++;
    return docId;
  }

  let docId = fields.docId;
  if (docId) {
    const clash = await sql`SELECT 1 FROM os_documents WHERE "docId" = ${docId} LIMIT 1`;
    if (clash.length) docId = null;
    else reserveDocId(docId);
  }
  if (!docId) docId = allocateDocId(fields.type);

  await sql`
    INSERT INTO os_documents (
      "docId", "folderId", title, type, layer, status, kind, body,
      events, cron, timezone, tools, approval, model, "maxTurns",
      "runLimitDaily", enabled, internal, "sourcePath", version
    ) VALUES (
      ${docId}, ${folderId}, ${fields.title}, ${fields.type}, ${fields.layer ?? null},
      ${fields.status ?? "final"}, ${fields.kind ?? "human"}, ${fields.body},
      ${fields.events ?? null}, ${fields.cron ?? null}, ${fields.timezone ?? null},
      ${fields.tools ?? null}, ${fields.approval ?? "default"}, ${fields.model ?? null},
      ${fields.maxTurns ?? 6}, ${fields.runLimitDaily ?? 20}, ${fields.enabled ?? false},
      true, ${sourcePath}, 1
    )`;
  await sql`
    INSERT INTO os_document_versions ("docId", version, body, frontmatter, "editedBy")
    VALUES (${docId}, 1, ${fields.body}, ${JSON.stringify({ seeded: sourcePath })}, 'seed')
    ON CONFLICT ("docId", version) DO NOTHING`;
  report.created++;
  return docId;
}

/** Classify a markdown file into docId/type/layer based on path and name. */
function classify(relPath, fileName, body) {
  const base = fileName.replace(/\.md$/, "");

  // P/S SOP library.
  let m = base.match(/^P(\d+)-(.+)$/);
  if (m) {
    return {
      docId: `HP-SOP-${String(Number(m[1])).padStart(3, "0")}`,
      type: "SOP",
      layer: "L2",
      kind: "human",
      title: titleFromMarkdown(body, `P${m[1]} ${m[2]}`),
    };
  }
  m = base.match(/^S(\d+)-(.+)$/);
  if (m) {
    return {
      docId: `HP-SOP-${String(100 + Number(m[1])).padStart(3, "0")}`,
      type: "SOP",
      layer: "L2",
      kind: "human",
      title: titleFromMarkdown(body, `S${m[1]} ${m[2]}`),
    };
  }

  // Files that already carry a universal id in their name (HP-DOC-002-...).
  m = base.match(/^(HP-[A-Z]+-\d{3})(?:-(.+))?$/);
  if (m) {
    const type = m[1].split("-")[1];
    return {
      docId: m[1],
      type: ["SOP", "WF", "DOC", "TPL", "REF", "DATA"].includes(type) ? type : "DOC",
      layer: null,
      kind: "human",
      title: titleFromMarkdown(body, m[2] ? m[2].replace(/-/g, " ") : m[1]),
    };
  }

  // Compass anchors.
  if (relPath === "CLAUDE.md") {
    return { docId: "HP-REF-000", type: "REF", layer: "L0", kind: "human", title: "HP Identity (Context Contract)" };
  }
  if (fileName === "HP-Context.md") {
    return { docId: "HP-REF-001", type: "REF", layer: "L3", kind: "human", title: "Operating Context and Guardrails" };
  }
  if (fileName === "HP-BOS-Filled.md") {
    return { docId: "HP-REF-002", type: "REF", layer: "L3", kind: "human", title: "Business Operating System (Filled)" };
  }
  if (relPath.includes("Scorecards")) {
    return { docId: null, type: "DATA", layer: "L4", kind: "human", title: titleFromMarkdown(body, base) };
  }

  return { docId: null, type: "DOC", layer: null, kind: "human", title: titleFromMarkdown(body, base.replace(/[-_]/g, " ")) };
}

async function walk(dirAbs, relPath, parentFolderId) {
  const entries = fs.readdirSync(dirAbs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
    const abs = path.join(dirAbs, entry.name);
    const rel = relPath ? `${relPath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      const isRoot = !relPath;
      const areaCode = isRoot ? (AREA_BY_ROOT[entry.name] ?? null) : null;
      const sortMatch = entry.name.match(/^(\d+)_/);
      const sortOrder = sortMatch ? Number(sortMatch[1]) : isRoot && entry.name === "Pioneers-Compass" ? 0 : 99;
      const folderId = await ensureFolder(parentFolderId, entry.name, sortOrder, areaCode);
      await walk(abs, rel, folderId);
      continue;
    }

    if (!entry.name.endsWith(".md")) {
      skippedBinaries.push(rel);
      continue;
    }
    if (parentFolderId === null) {
      // Root-level files (CLAUDE.md) land in the Compass folder, created below.
      continue;
    }
    const body = fs.readFileSync(abs, "utf-8");
    const cls = classify(rel, entry.name, body);
    await upsertDoc(parentFolderId, rel, { ...cls, body, status: "final", enabled: false });
  }
}

/** The app's existing file SOPs become DB agent SOPs HP-SOP-201.. */
async function seedAgentSops(compassSopsFolderId) {
  if (!fs.existsSync(APP_SOPS)) return;
  const files = [];
  const walkSops = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith("_") || e.name.startsWith(".")) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walkSops(abs);
      else if (e.name.endsWith(".md")) files.push(abs);
    }
  };
  walkSops(APP_SOPS);
  files.sort();

  let n = 201;
  for (const file of files) {
    const raw = fs.readFileSync(file, "utf-8").replace(/\r\n/g, "\n");
    const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!m) continue;
    const fields = new Map();
    for (const line of m[1].split("\n")) {
      const idx = line.indexOf(":");
      if (idx > 0) fields.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
    }
    const rel = `app-sops/${path.relative(APP_SOPS, file).replace(/\\/g, "/")}`;
    await upsertDoc(compassSopsFolderId, rel, {
      docId: `HP-SOP-${n}`,
      title: fields.get("title") || path.basename(file, ".md"),
      type: "SOP",
      layer: "L2",
      kind: "agent",
      status: "final",
      enabled: fields.get("enabled") === "true",
      body: m[2].trim(),
      events: fields.get("events") || null,
      cron: fields.get("cron") || null,
      timezone: fields.get("timezone") || null,
      tools: fields.get("tools") || null,
      approval: fields.get("approval") || "default",
      model: fields.get("model") || null,
      maxTurns: Number(fields.get("maxTurns")) || 6,
      runLimitDaily: Number(fields.get("runLimitDaily")) || 20,
    });
    n++;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

await sql`SELECT 1 FROM os_business WHERE id = 1`.catch(() => {
  console.error("os_business missing; deploy the ensureOsTables boot helper first.");
  process.exit(1);
});

// Stable, well-known HP guardrails written into business config. These are
// the non-negotiable margin rules from HP-Context.md; internal-only.
await sql`
  UPDATE os_business SET guardrails = ${JSON.stringify({
    marginFloorStandardPct: 30,
    marginFloorSmallJobPct: 40,
    smallJobHardCostThresholdUsd: 2000,
    internalLaborBillUsd: 150,
    internalLaborCostUsd: 100,
    pricingMode: "project",
    neverExpose: ["hard costs", "markup", "margin math", "subcontractor identity", "hourly time"],
  })}
  WHERE id = 1 AND (guardrails = '{}' OR guardrails IS NULL)`;

await loadDocIdCounters();

// Walk the tree.
await walk(SOURCE, "", null);

// Root CLAUDE.md lands in the Compass folder (the L0 home).
const [compass] = await sql`
  SELECT id FROM os_folders WHERE "businessId" = 1 AND "parentId" IS NULL AND slug = 'pioneers-compass' LIMIT 1`;
if (compass) {
  const claudePath = path.join(SOURCE, "CLAUDE.md");
  if (fs.existsSync(claudePath)) {
    const body = fs.readFileSync(claudePath, "utf-8");
    await upsertDoc(compass.id, "CLAUDE.md", {
      ...classify("CLAUDE.md", "CLAUDE.md", body),
      body,
      status: "final",
      enabled: false,
    });
  }
  const [sopsFolder] = await sql`
    SELECT id FROM os_folders WHERE "parentId" = ${compass.id} AND slug = 'sops' LIMIT 1`;
  if (sopsFolder) await seedAgentSops(sopsFolder.id);
  else console.warn("Compass SOPs folder not found; app agent SOPs not seeded.");
} else {
  console.warn("Pioneers-Compass folder not found; CLAUDE.md and agent SOPs not seeded.");
}

console.log(`Folders created: ${report.folders}`);
console.log(`Docs created: ${report.created}, re-seeded: ${report.updated}, kept (human-edited): ${report.kept}`);
if (skippedBinaries.length) {
  console.log(`Skipped ${skippedBinaries.length} non-markdown files (attach via Cloudinary later):`);
  for (const f of skippedBinaries) console.log(`  - ${f}`);
}

await sql.end();
