/**
 * Read-only: dump live emailTemplates + smsTemplates + appSettings rows to a
 * JSON file so we can audit the exact copy customers receive (the Postgres rows
 * are the source of truth; the legacy MySQL seed file is superseded).
 *
 * Usage:
 *   railway run -s HP-Estimator-app -- pnpm tsx scripts/dump-templates.ts
 *
 * Writes scripts/.template-dump.json (gitignored). SELECT only — no writes.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getDb } from "../server/db";
import { emailTemplates, smsTemplates, appSettings } from "../drizzle/schema";

const db = await getDb();
if (!db) throw new Error("DB unavailable");

const emails = await db.select().from(emailTemplates).orderBy(emailTemplates.key);
const sms = await db.select().from(smsTemplates).orderBy(smsTemplates.key);
const settings = await db.select().from(appSettings);

const out = {
  dumpedAt: new Date().toISOString(),
  emailCount: emails.length,
  smsCount: sms.length,
  appSettings: settings,
  emailTemplates: emails,
  smsTemplates: sms,
};

const path = fileURLToPath(new URL("./.template-dump.json", import.meta.url));
writeFileSync(path, JSON.stringify(out, null, 2), "utf8");
console.log(`dumped ${emails.length} email + ${sms.length} sms templates + ${settings.length} settings row(s) to ${path}`);
process.exit(0);
