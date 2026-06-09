/**
 * Fix live customer-facing template copy in the Postgres DB (source of truth):
 *   1. Replace every dead phone number with the one true (360) 838-6731.
 *   2. Drop the AI-tell word "thrilled" from the 360 membership welcome.
 *   3. Correct appSettings.supportPhone to the real number.
 *
 * Surgical per-row UPDATE — preserves every operator edit except the targeted
 * substrings. Mirrors scripts/strip-dashes-templates.ts.
 *
 *   railway run -s HP-Estimator-app -- pnpm tsx scripts/fix-email-phone-and-voice.ts          (dry run)
 *   railway run -s HP-Estimator-app -- pnpm tsx scripts/fix-email-phone-and-voice.ts --apply
 */
import { eq } from "drizzle-orm";
import { getDb } from "../server/db";
import { emailTemplates, smsTemplates, appSettings } from "../drizzle/schema";

const APPLY = process.argv.includes("--apply");

// Order matters: 11-digit tel before 10-digit so substrings don't double-hit.
const PHONE: [string, string][] = [
  ["13602415718", "13608386731"], ["13605449858", "13608386731"],
  ["13603344428", "13608386731"], ["13605199618", "13608386731"],
  ["3602415718", "3608386731"], ["3605449858", "3608386731"],
  ["3603344428", "3608386731"], ["3605199618", "3608386731"],
  ["(360) 241-5718", "(360) 838-6731"], ["(360) 544-9858", "(360) 838-6731"],
  ["(360) 334-4428", "(360) 838-6731"], ["(360) 519-9618", "(360) 838-6731"],
];

function fixPhone(s: string | null): string | null {
  if (!s) return s;
  let out = s;
  for (const [from, to] of PHONE) out = out.split(from).join(to);
  return out;
}

// Voice nits keyed by template key.
const VOICE: Record<string, [string, string][]> = {
  mem_welcome: [["and we're thrilled to be the long-term home-care team you can count on", "and we're glad to be the long-term home-care team you can count on"]],
};

function fixVoice(key: string, s: string | null): string | null {
  if (!s || !VOICE[key]) return s;
  let out = s;
  for (const [from, to] of VOICE[key]) out = out.split(from).join(to);
  return out;
}

const db = await getDb();
if (!db) throw new Error("DB unavailable");

let changed = 0;

for (const row of await db.select().from(emailTemplates)) {
  const next = {
    name: fixPhone(row.name),
    subject: fixVoice(row.key, fixPhone(row.subject)),
    preheader: fixPhone(row.preheader),
    html: fixVoice(row.key, fixPhone(row.html)),
    text: fixVoice(row.key, fixPhone(row.text)),
  };
  const dirty = Object.entries(next).some(([k, v]) => v !== (row as any)[k]);
  if (!dirty) continue;
  changed++;
  console.log(`email ${row.key}${APPLY ? " — updating" : ""}`);
  if (APPLY) {
    await db.update(emailTemplates).set({ ...next, updatedAt: new Date() } as any).where(eq(emailTemplates.id, row.id));
  }
}

for (const row of await db.select().from(smsTemplates)) {
  const next = { name: fixPhone(row.name), body: fixPhone(row.body) };
  if (next.name === row.name && next.body === row.body) continue;
  changed++;
  console.log(`sms ${row.key}${APPLY ? " — updating" : ""}`);
  if (APPLY) {
    await db.update(smsTemplates).set({ ...next, updatedAt: new Date() } as any).where(eq(smsTemplates.id, row.id));
  }
}

for (const row of await db.select().from(appSettings)) {
  const nextPhone = fixPhone(row.supportPhone);
  const nextFooter = fixPhone(row.documentFooter);
  if (nextPhone === row.supportPhone && nextFooter === row.documentFooter) continue;
  changed++;
  console.log(`appSettings #${row.id}: supportPhone ${row.supportPhone} -> ${nextPhone}${APPLY ? " — updating" : ""}`);
  if (APPLY) {
    await db.update(appSettings).set({ supportPhone: nextPhone, documentFooter: nextFooter } as any).where(eq(appSettings.id, row.id));
  }
}

console.log(`\n${APPLY ? "updated" : "would update"} ${changed} rows`);
process.exit(0);
