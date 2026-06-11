/**
 * scripts/build-os-files-bundle.mjs
 *
 * Packs the Micek-OS HP sub-OS binary files (PDFs, signed agreements,
 * licenses, photos, templates) into server/osCore/seed/hp-os-files.json
 * (base64). The boot importer stores them as bytea rows in os_file_blobs
 * and creates FILE entries in the Library, served only through the
 * authenticated /api/os/files/:docId route.
 *
 * Why in the repo and the database, not an object store: these documents
 * include W9s and signed agreements; public-by-URL hosting is the wrong
 * trust boundary. The repo is private, the database is the app, and access
 * follows staff auth. ~5 MB total, a one-time bootstrap; files added later
 * go straight to the database through the app.
 *
 *   node scripts/build-os-files-bundle.mjs
 *
 * Skips: dot/underscore entries, .md (the text seed owns those),
 * 05_Technology/Archives (dev artifacts, not business documents), and
 * script/patch/dump files.
 */

import fs from "fs";
import path from "path";

const SOURCE = process.env.SEED_SOURCE ?? "C:\\Micek-OS\\micek-os\\businesses\\Handy Pioneers";
const OUT = path.resolve(process.cwd(), "server/osCore/seed/hp-os-files.json");

const MIME_BY_EXT = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".heic": "image/heic",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".html": "text/html",
  ".zip": "application/zip",
  ".txt": "text/plain",
  ".json": "application/json",
};

const SKIP_DIRS = new Set(["05_Technology/Archives"]);
const SKIP_EXT = new Set([".ps1", ".patch", ".sql", ".gs"]);
const MAX_FILE_BYTES = 5 * 1024 * 1024; // anything bigger does not belong inline

const files = [];
const skipped = [];

function walk(dirAbs, relPath) {
  for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
    const rel = relPath ? `${relPath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(rel)) {
        skipped.push(`${rel}/ (dev archives)`);
        continue;
      }
      walk(path.join(dirAbs, entry.name), rel);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (ext === ".md") continue;
    if (SKIP_EXT.has(ext)) {
      skipped.push(rel);
      continue;
    }
    const abs = path.join(dirAbs, entry.name);
    const stat = fs.statSync(abs);
    if (stat.size > MAX_FILE_BYTES) {
      skipped.push(`${rel} (${(stat.size / 1048576).toFixed(1)} MB, over the inline cap)`);
      continue;
    }
    files.push({
      sourcePath: rel,
      folderPath: rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "Pioneers-Compass",
      title: entry.name,
      mime: MIME_BY_EXT[ext] ?? "application/octet-stream",
      size: stat.size,
      dataBase64: fs.readFileSync(abs).toString("base64"),
    });
  }
}

walk(SOURCE, "");

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ builtAt: new Date().toISOString(), files }, null, 0), "utf-8");

const totalKb = Math.round(files.reduce((s, f) => s + f.size, 0) / 1024);
console.log(`Wrote ${OUT}`);
console.log(`Files: ${files.length} (${totalKb} KB raw)`);
if (skipped.length) {
  console.log(`Skipped ${skipped.length}:`);
  for (const s of skipped) console.log(`  - ${s}`);
}
