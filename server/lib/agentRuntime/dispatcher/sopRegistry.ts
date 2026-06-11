/**
 * server/lib/agentRuntime/dispatcher/sopRegistry.ts
 *
 * The SOP library, two sources merged into one registry:
 *
 *   1. Markdown files under server/agents/sops/<domain>/<name>.md with flat
 *      key:value frontmatter (deliberately not YAML; the schema is fixed and
 *      flat so a 40-line parser beats a dependency). Deploy-controlled.
 *   2. HP-OS documents: os_documents rows with type=SOP, kind=agent,
 *      status=final, enabled=true. Keyed by docId (HP-SOP-204). Editable in
 *      the app's Library; refreshDbSops() keeps the in-memory cache current
 *      (boot, the 30s scheduler tick, and direct invalidation on save).
 *
 * The public getters stay synchronous: callers (runtime, dispatcher, hub)
 * read the merged in-memory maps. DB rows win on a key collision, which
 * cannot happen in practice because file keys are paths and DB keys are
 * docIds. A DB edit is visible at most ~30s later via the tick refresh, or
 * immediately when the editing router calls invalidateDbSopCache().
 *
 * Packaging note: the server bundles to dist/index.js but the Railway image
 * copies the full repo to /app (COPY . /app) and starts from there, so the
 * .md files are present at <cwd>/server/agents/sops in dev AND in prod.
 */

import fs from "fs";
import path from "path";

export type SopApproval = "default" | "always" | "never-send";
export type SopKind = "agent" | "external-worker";

export type SopDefinition = {
  /** Registry key: relative path without extension, e.g. "members-360/enrollment-followthrough". */
  sopPath: string;
  filePath: string;
  title: string;
  events: string[];
  cron: string | null;
  timezone: string;
  tools: string[];
  approval: SopApproval;
  model: string | null;
  maxTurns: number;
  runLimitDaily: number;
  enabled: boolean;
  kind: SopKind;
  /** The markdown body — the system prompt for this SOP's runs. */
  body: string;
};

export const DEFAULT_SOP_MODEL = "claude-haiku-4-5";
const MAX_TURNS_CEILING = 8;

// ─── Frontmatter parsing ──────────────────────────────────────────────────────

/**
 * Parses a flat `key: value` frontmatter block delimited by `---` lines.
 * Lists are comma-separated. Returns null when the file has no frontmatter.
 * Exported for tests.
 */
export function parseSopFile(raw: string, sopPath: string, filePath = ""): SopDefinition | null {
  const normalized = raw.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;

  const fields = new Map<string, string>();
  for (const line of match[1].split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf(":");
    if (idx <= 0) continue;
    fields.set(trimmed.slice(0, idx).trim(), trimmed.slice(idx + 1).trim());
  }

  const list = (key: string): string[] =>
    (fields.get(key) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const num = (key: string, fallback: number): number => {
    const v = Number(fields.get(key));
    return Number.isFinite(v) && v >= 0 ? v : fallback;
  };

  const approvalRaw = fields.get("approval") ?? "default";
  const approval: SopApproval =
    approvalRaw === "always" || approvalRaw === "never-send" ? approvalRaw : "default";

  const kindRaw = fields.get("kind") ?? "agent";
  const kind: SopKind = kindRaw === "external-worker" ? "external-worker" : "agent";

  return {
    sopPath,
    filePath,
    title: fields.get("title") || sopPath,
    events: list("events"),
    cron: fields.get("cron") || null,
    timezone: fields.get("timezone") || "America/Los_Angeles",
    tools: list("tools"),
    approval,
    model: fields.get("model") || null,
    maxTurns: Math.min(num("maxTurns", 6), MAX_TURNS_CEILING),
    runLimitDaily: num("runLimitDaily", 20),
    enabled: fields.get("enabled") === "true",
    kind,
    body: match[2].trim(),
  };
}

// ─── Filesystem loading ───────────────────────────────────────────────────────

function findSopsDir(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "server/agents/sops"),
    // Fallback when cwd isn't the repo root (e.g. tests run from a subdir).
    path.resolve(import.meta.dirname ?? __dirname, "../../../agents/sops"),
  ];
  for (const dir of candidates) {
    try {
      if (fs.statSync(dir).isDirectory()) return dir;
    } catch {
      // try next
    }
  }
  return null;
}

function walkMarkdownFiles(dir: string, base: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue; // _templates etc.
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkMarkdownFiles(full, base));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

let cache: Map<string, SopDefinition> | null = null;
let cacheLoadedAt = 0;
/** In dev, re-read the folder at most every few seconds so edits show up without a restart. */
const DEV_CACHE_MS = 5_000;

export function loadSops(force = false): Map<string, SopDefinition> {
  const isDev = process.env.NODE_ENV !== "production";
  const stale = isDev && Date.now() - cacheLoadedAt > DEV_CACHE_MS;
  if (cache && !force && !stale) return cache;

  const registry = new Map<string, SopDefinition>();
  const dir = findSopsDir();
  if (!dir) {
    console.warn("[sopRegistry] SOP directory not found — registry is empty.");
    cache = registry;
    cacheLoadedAt = Date.now();
    return registry;
  }

  for (const file of walkMarkdownFiles(dir, dir)) {
    const rel = path.relative(dir, file).replace(/\\/g, "/").replace(/\.md$/, "");
    try {
      const parsed = parseSopFile(fs.readFileSync(file, "utf-8"), rel, file);
      if (!parsed) {
        console.warn(`[sopRegistry] ${rel}: no frontmatter — skipped.`);
        continue;
      }
      registry.set(rel, parsed);
    } catch (err) {
      console.warn(`[sopRegistry] failed to load ${rel}:`, err);
    }
  }

  cache = registry;
  cacheLoadedAt = Date.now();
  return registry;
}

// ─── HP-OS database source ────────────────────────────────────────────────────

let dbCache: Map<string, SopDefinition> = new Map();
/** `${count}:${maxUpdatedAtMs}` of the loadable set; null forces a reload. */
let dbCacheStamp: string | null = null;

/** Call after any save/publish/enable change so the next refresh reloads. */
export function invalidateDbSopCache(): void {
  dbCacheStamp = null;
}

/** Maps an os_documents row to the same shape file SOPs parse into. */
export function sopFromDbRow(row: {
  docId: string;
  title: string;
  body: string;
  events: string | null;
  cron: string | null;
  timezone: string | null;
  tools: string | null;
  approval: string;
  model: string | null;
  maxTurns: number;
  runLimitDaily: number;
  enabled: boolean;
}): SopDefinition {
  const split = (v: string | null): string[] =>
    (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const approval: SopApproval =
    row.approval === "always" || row.approval === "never-send" ? row.approval : "default";
  return {
    sopPath: row.docId,
    filePath: "",
    title: row.title || row.docId,
    events: split(row.events),
    cron: row.cron || null,
    timezone: row.timezone || "America/Los_Angeles",
    tools: split(row.tools),
    approval,
    model: row.model || null,
    maxTurns: Math.min(Math.max(0, row.maxTurns || 6), MAX_TURNS_CEILING),
    runLimitDaily: row.runLimitDaily > 0 ? row.runLimitDaily : 20,
    enabled: row.enabled,
    kind: "agent",
    body: (row.body ?? "").trim(),
  };
}

/**
 * Reloads the DB-sourced half of the registry when the loadable set changed
 * (cheap COUNT + MAX(updatedAt) stamp) or when forced. Failures leave the
 * previous cache in place; the registry must never break the scheduler tick.
 */
export async function refreshDbSops(force = false): Promise<void> {
  try {
    const { getDb } = await import("../../../db");
    const db = await getDb();
    if (!db) return;
    const { osDocuments } = await import("../../../../drizzle/schema");
    const { and, eq, sql } = await import("drizzle-orm");
    const loadable = and(
      eq(osDocuments.type, "SOP"),
      eq(osDocuments.kind, "agent"),
      eq(osDocuments.status, "final"),
      eq(osDocuments.enabled, true),
    );
    const [stampRow] = await db
      .select({
        count: sql<number>`COUNT(*)`,
        maxUpdated: sql<Date | null>`MAX(${osDocuments.updatedAt})`,
      })
      .from(osDocuments)
      .where(loadable);
    const stamp = `${Number(stampRow?.count ?? 0)}:${stampRow?.maxUpdated ? new Date(stampRow.maxUpdated).getTime() : 0}`;
    if (!force && stamp === dbCacheStamp) return;

    const rows = await db.select().from(osDocuments).where(loadable);
    const next = new Map<string, SopDefinition>();
    for (const row of rows) {
      try {
        next.set(row.docId, sopFromDbRow(row));
      } catch (err) {
        console.warn(`[sopRegistry] bad DB SOP ${row.docId} — skipped:`, err);
      }
    }
    dbCache = next;
    dbCacheStamp = stamp;
  } catch (err) {
    // os_documents may not exist yet on first boot; stay quiet but visible.
    console.warn("[sopRegistry] refreshDbSops failed (non-fatal):", err);
  }
}

// ─── Merged getters (file + DB; DB wins on collision) ────────────────────────

function mergedSops(): Map<string, SopDefinition> {
  const merged = new Map(loadSops());
  for (const [key, sop] of dbCache) merged.set(key, sop);
  return merged;
}

export function listSops(): SopDefinition[] {
  return Array.from(mergedSops().values()).sort((a, b) => a.sopPath.localeCompare(b.sopPath));
}

export function getSop(sopPath: string): SopDefinition | undefined {
  return mergedSops().get(sopPath);
}

/** Enabled, dispatcher-executed SOPs subscribed to this event. */
export function sopsForEvent(eventName: string): SopDefinition[] {
  return listSops().filter(
    (s) => s.enabled && s.kind === "agent" && s.events.includes(eventName),
  );
}

/** Enabled, dispatcher-executed SOPs that carry a cron expression. */
export function sopsWithCron(): SopDefinition[] {
  return listSops().filter((s) => s.enabled && s.kind === "agent" && Boolean(s.cron));
}
