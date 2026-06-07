/**
 * One-off: strip em/en dashes from live customer-facing template copy
 * (emailTemplates + smsTemplates rows). Marcin's call (2026-06-06): an em
 * dash reads AI-written; none should reach a customer on any surface.
 *
 * Surgical UPDATE per affected row — preserves every operator edit except
 * the dashes themselves. Em dash becomes a spaced hyphen; en dash a hyphen.
 *
 * Usage:
 *   railway run -s HP-Estimator-app -- pnpm tsx scripts/strip-dashes-templates.ts          (dry run)
 *   railway run -s HP-Estimator-app -- pnpm tsx scripts/strip-dashes-templates.ts --apply
 */
import { eq } from "drizzle-orm";
import { getDb } from "../server/db";
import { emailTemplates, smsTemplates } from "../drizzle/schema";

const APPLY = process.argv.includes("--apply");
const DASH = /[–—]/;

function strip(s: string | null): string | null {
  if (!s || !DASH.test(s)) return s;
  return s.replace(/[ \t]*—[ \t]*/g, " - ").replace(/–/g, "-");
}

const db = await getDb();
if (!db) throw new Error("DB unavailable");

let changed = 0;

for (const row of await db.select().from(emailTemplates)) {
  const next = {
    name: strip(row.name),
    subject: strip(row.subject),
    preheader: strip(row.preheader),
    html: strip(row.html),
    text: strip(row.text),
  };
  const dirty = Object.entries(next).some(([k, v]) => v !== (row as any)[k]);
  if (!dirty) continue;
  changed++;
  console.log(`email ${row.key}: dashes found${APPLY ? " — updating" : ""}`);
  if (APPLY) {
    await db.update(emailTemplates).set({ ...next, updatedAt: new Date() } as any)
      .where(eq(emailTemplates.id, row.id));
  }
}

for (const row of await db.select().from(smsTemplates)) {
  const next = { name: strip(row.name), body: strip(row.body) };
  const dirty = next.name !== row.name || next.body !== row.body;
  if (!dirty) continue;
  changed++;
  console.log(`sms ${row.key}: dashes found${APPLY ? " — updating" : ""}`);
  if (APPLY) {
    await db.update(smsTemplates).set({ ...next, updatedAt: new Date() } as any)
      .where(eq(smsTemplates.id, row.id));
  }
}

console.log(`${APPLY ? "updated" : "would update"} ${changed} template rows`);
process.exit(0);
