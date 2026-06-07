// Read-only: print the Claude response summary + findings for a submission.
// Usage: railway run -s HP-Estimator-app -- pnpm tsx scripts/dump-roadmap-row.mjs <translationId>
import { eq } from "drizzle-orm";
import { getDb } from "../server/db.ts";
import { priorityTranslations } from "../drizzle/schema.priorityTranslation.ts";
const id = process.argv[2];
const db = await getDb();
const [row] = await db.select().from(priorityTranslations).where(eq(priorityTranslations.id, id)).limit(1);
if (!row) { console.error("not found"); process.exit(1); }
const cr = typeof row.claudeResponse === "string" ? JSON.parse(row.claudeResponse) : row.claudeResponse;
console.log("KEYS:", Object.keys(cr).join(", "));
const f = cr.findings ?? [];
console.log("FINDINGS:", f.length);
if (f[0]) console.log("FINDING KEYS:", Object.keys(f[0]).join(", "));
for (const x of f) console.log("-", String(x.urgency ?? x.priority ?? "?").padEnd(5), "|", x.title ?? x.finding);
process.exit(0);
