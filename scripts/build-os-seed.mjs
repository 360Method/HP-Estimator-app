/**
 * scripts/build-os-seed.mjs
 *
 * Builds the HP-OS seed bundle from the Micek-OS Handy Pioneers sub-OS plus
 * the app's own file SOPs, writing server/osCore/seed/hp-os-seed.json. The
 * bundle is committed; server/osCore/seedImport.ts applies it at boot on
 * every service (idempotent, never clobbers in-app edits). This split exists
 * because the databases are only reachable from inside Railway: the builder
 * runs where the source files are, the importer runs where the database is.
 *
 *   node scripts/build-os-seed.mjs
 *   (optional) SEED_SOURCE=<path to "businesses/Handy Pioneers">
 *
 * Doc id rules:
 *   - P1..P16 -> HP-SOP-001..016, S1..S9 -> HP-SOP-101..109 (kind=human)
 *   - Files already named HP-XXX-NNN keep their id
 *   - CLAUDE.md -> HP-REF-000, HP-Context.md -> HP-REF-001, HP-BOS-Filled.md
 *     -> HP-REF-002 (the Compass anchors)
 *   - The app's file SOPs -> HP-SOP-201.. (kind=agent, frontmatter verbatim)
 *   - Everything else: docId=null, allocated by the importer
 */

import fs from "fs";
import path from "path";

const SOURCE = process.env.SEED_SOURCE ?? "C:\\Micek-OS\\micek-os\\businesses\\Handy Pioneers";
const APP_SOPS = path.resolve(process.cwd(), "server/agents/sops");
const OUT = path.resolve(process.cwd(), "server/osCore/seed/hp-os-seed.json");

if (!fs.existsSync(SOURCE)) {
  console.error(`SEED_SOURCE not found: ${SOURCE}`);
  process.exit(1);
}

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

const folders = [];
const docs = [];
const skippedBinaries = [];

/**
 * Trigger wiring for human SOPs that have a live event in the app. Everything
 * still ships enabled=false; Marcin flips each on in the Library when ready.
 * P4: every estimate that reaches the portal spawns a margin-audit task.
 */
const HUMAN_SOP_TRIGGERS = {
  "HP-SOP-004": {
    events: "estimate.sent",
    taskTitleTemplate: "Run P4 margin audit for {{customerName}} ({{estimateNumber}})",
    taskDueOffsetHours: 8,
  },
};

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

function classify(relPath, fileName, body) {
  const base = fileName.replace(/\.md$/, "");

  let m = base.match(/^P(\d+)-(.+)$/);
  if (m) {
    return {
      docId: `HP-SOP-${String(Number(m[1])).padStart(3, "0")}`,
      type: "SOP",
      layer: "L2",
      title: titleFromMarkdown(body, `P${m[1]} ${m[2]}`),
    };
  }
  m = base.match(/^S(\d+)-(.+)$/);
  if (m) {
    return {
      docId: `HP-SOP-${String(100 + Number(m[1])).padStart(3, "0")}`,
      type: "SOP",
      layer: "L2",
      title: titleFromMarkdown(body, `S${m[1]} ${m[2]}`),
    };
  }
  m = base.match(/^(HP-[A-Z]+-\d{3})(?:-(.+))?$/);
  if (m) {
    const type = m[1].split("-")[1];
    return {
      docId: m[1],
      type: ["SOP", "WF", "DOC", "TPL", "REF", "DATA"].includes(type) ? type : "DOC",
      layer: null,
      title: titleFromMarkdown(body, m[2] ? m[2].replace(/-/g, " ") : m[1]),
    };
  }
  if (relPath === "CLAUDE.md") {
    return { docId: "HP-REF-000", type: "REF", layer: "L0", title: "HP Identity (Context Contract)" };
  }
  if (fileName === "HP-Context.md") {
    return { docId: "HP-REF-001", type: "REF", layer: "L3", title: "Operating Context and Guardrails" };
  }
  if (fileName === "HP-BOS-Filled.md") {
    return { docId: "HP-REF-002", type: "REF", layer: "L3", title: "Business Operating System (Filled)" };
  }
  if (relPath.includes("Scorecards")) {
    return { docId: null, type: "DATA", layer: "L4", title: titleFromMarkdown(body, base) };
  }
  return { docId: null, type: "DOC", layer: null, title: titleFromMarkdown(body, base.replace(/[-_]/g, " ")) };
}

function walk(dirAbs, relPath) {
  const entries = fs
    .readdirSync(dirAbs, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
    const abs = path.join(dirAbs, entry.name);
    const rel = relPath ? `${relPath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      const isRoot = !relPath;
      const sortMatch = entry.name.match(/^(\d+)_/);
      folders.push({
        path: rel,
        slug: slugify(entry.name),
        name: displayName(entry.name),
        areaCode: isRoot ? (AREA_BY_ROOT[entry.name] ?? null) : null,
        sortOrder: sortMatch ? Number(sortMatch[1]) : isRoot && entry.name === "Pioneers-Compass" ? 0 : 99,
      });
      walk(abs, rel);
      continue;
    }

    if (!entry.name.endsWith(".md")) {
      skippedBinaries.push(rel);
      continue;
    }
    const body = fs.readFileSync(abs, "utf-8");
    const folderPath = relPath || "Pioneers-Compass"; // root files (CLAUDE.md) live in Compass
    const cls = classify(rel, entry.name, body);
    docs.push({
      sourcePath: rel,
      folderPath,
      kind: "human",
      status: "final",
      enabled: false,
      body,
      ...cls,
      ...(HUMAN_SOP_TRIGGERS[cls.docId] ?? {}),
    });
  }
}

function buildAgentSops() {
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

  // Positional numbering must never reuse a docId an explicit human SOP
  // already claimed (HP-SOP-204 "How to Estimate a Job" collided with the
  // 4th agent SOP before this guard). Skip claimed numbers.
  const claimed = new Set(docs.map((d) => d.docId));
  let n = 201;
  const nextDocId = () => {
    while (claimed.has(`HP-SOP-${n}`)) n++;
    const id = `HP-SOP-${n}`;
    claimed.add(id);
    return id;
  };
  for (const file of files) {
    const raw = fs.readFileSync(file, "utf-8").replace(/\r\n/g, "\n");
    const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!m) continue;
    const fields = new Map();
    for (const line of m[1].split("\n")) {
      const idx = line.indexOf(":");
      if (idx > 0) fields.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
    }
    docs.push({
      sourcePath: `app-sops/${path.relative(APP_SOPS, file).replace(/\\/g, "/")}`,
      folderPath: "Pioneers-Compass/SOPs",
      docId: nextDocId(),
      title: fields.get("title") || path.basename(file, ".md"),
      type: "SOP",
      layer: "L2",
      kind: "agent",
      status: "final",
      // ALWAYS disabled: the file copies stay the live source until the
      // filesystem loader is retired (Phase 5). Enabling both would make
      // the dispatcher run the same SOP twice (file key + docId key).
      enabled: false,
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

walk(SOURCE, "");
buildAgentSops();

// Stable HP guardrails (the non-negotiable margin rules from HP-Context.md).
const bundle = {
  builtAt: new Date().toISOString(),
  business: {
    guardrails: {
      marginFloorStandardPct: 30,
      marginFloorSmallJobPct: 40,
      smallJobHardCostThresholdUsd: 2000,
      internalLaborBillUsd: 150,
      internalLaborCostUsd: 100,
      pricingMode: "project",
      neverExpose: ["hard costs", "markup", "margin math", "subcontractor identity", "hourly time"],
    },
  },
  folders,
  docs,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(bundle, null, 1), "utf-8");

console.log(`Wrote ${OUT}`);
console.log(`Folders: ${folders.length}, docs: ${docs.length} (${docs.filter((d) => d.kind === "agent").length} agent SOPs)`);
if (skippedBinaries.length) {
  console.log(`Skipped ${skippedBinaries.length} non-markdown files (attach via Cloudinary later):`);
  for (const f of skippedBinaries) console.log(`  - ${f}`);
}
