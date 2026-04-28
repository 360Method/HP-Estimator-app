/**
 * server/lib/agentRuntime/cronRuns.ts
 *
 * DB-backed dedupe for time-of-day schedulers (KPI rollups, integrator brief).
 * The in-memory `lastDaily` / `lastWeekly` markers in kpiRollup.ts and the
 * 6am-Monday brief reset on every Railway redeploy — without a persistent
 * marker, a redeploy at 4:08am PT could re-run the daily rollup, and a
 * redeploy at 6:30am Monday could re-run the integrator brief.
 *
 * Pattern:
 *   await ensureCronRunsTable();
 *   const claimed = await claimCronRun("kpi_daily_rollup", "2026-04-28");
 *   if (claimed) { ...do the work... }
 *
 * The `runKey` is a job identifier; the `periodKey` is whatever the caller
 * uses to scope idempotency (a date, an ISO week, etc.). UNIQUE(runKey,
 * periodKey) means a second insert in the same period silently no-ops.
 */
import { sql } from "drizzle-orm";
import { getDb } from "../../db";

let ensured = false;

export async function ensureCronRunsTable(): Promise<void> {
  if (ensured) return;
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS \`cron_runs\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`runKey\` varchar(64) NOT NULL,
        \`periodKey\` varchar(32) NOT NULL,
        \`status\` enum('claimed','succeeded','failed') NOT NULL DEFAULT 'claimed',
        \`detail\` text,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`cron_runs_id\` PRIMARY KEY(\`id\`),
        CONSTRAINT \`cron_runs_run_period_uniq\` UNIQUE(\`runKey\`, \`periodKey\`)
      )
    `);
    ensured = true;
  } catch (err) {
    console.warn("[cronRuns] ensureCronRunsTable failed:", err);
  }
}

/**
 * Atomically claim ownership of a cron firing. Returns true if this caller
 * acquired the slot, false if another instance already claimed (or completed)
 * the same period. Safe to call repeatedly — the UNIQUE constraint enforces
 * single-claim.
 */
export async function claimCronRun(runKey: string, periodKey: string): Promise<boolean> {
  await ensureCronRunsTable();
  const db = await getDb();
  if (!db) return false;
  try {
    const res = (await db.execute(sql`
      INSERT IGNORE INTO \`cron_runs\` (\`runKey\`, \`periodKey\`, \`status\`)
      VALUES (${runKey}, ${periodKey}, 'claimed')
    `)) as unknown as { affectedRows?: number } | Array<unknown>;
    const affected = (res as { affectedRows?: number }).affectedRows;
    return typeof affected === "number" ? affected > 0 : true;
  } catch (err) {
    console.warn(`[cronRuns] claim failed for ${runKey}@${periodKey}:`, err);
    return false;
  }
}

export async function markCronRunResult(
  runKey: string,
  periodKey: string,
  status: "succeeded" | "failed",
  detail?: string,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      UPDATE \`cron_runs\`
      SET \`status\` = ${status}, \`detail\` = ${detail ?? null}
      WHERE \`runKey\` = ${runKey} AND \`periodKey\` = ${periodKey}
    `);
  } catch (err) {
    console.warn(`[cronRuns] markCronRunResult failed for ${runKey}@${periodKey}:`, err);
  }
}

/** Pacific date (YYYY-MM-DD) for daily dedupe. */
export function pacificDateKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts;
}

/**
 * ISO-week key in Pacific Time, e.g. "2026-W17". Used for weekly dedupe so
 * the Monday integrator brief and dept→company rollup each fire at most once
 * per ISO week regardless of restarts.
 */
export function pacificIsoWeekKey(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const y = Number(parts.year);
  const m = Number(parts.month);
  const d = Number(parts.day);
  const target = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (target.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  target.setUTCDate(target.getUTCDate() - dayNum + 3); // Thursday of this week
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((target.getTime() - firstThursday.getTime()) / 86_400_000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
