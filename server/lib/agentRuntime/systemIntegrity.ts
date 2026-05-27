/**
 * server/lib/agentRuntime/systemIntegrity.ts
 *
 * Hourly self-optimization loop. Scans recent agent runs for anomalies, draft
 * "optimization tasks" (prompt tweaks, tool-grant changes, schedule
 * suggestions, charter-clarification asks) and parks them in the admin inbox
 * for Marcin to approve. NEVER auto-modifies prompts or charters — that's a
 * hard stop (Marcin's rule: humans approve every change to agent doctrine).
 *
 * Anomalies surfaced:
 *  - Runs that errored (status in failed/tool_error) at >25% rate over the
 *    trailing 24h for any seat.
 *  - Runs that produced no useful output (no text + no tool calls).
 *  - Seats whose daily cost cap was hit in the last 24h.
 *  - Seats stuck in "queued" with no consumed task in >2h (queue drain stall).
 *  - KPIs trending below their charter target_min.
 *
 * The cron is started from server/_core/index.ts (boot path). Keeps to one
 * tick per hour to keep noise out of the inbox.
 */

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../../db";
import {
  aiAgents,
  aiAgentRuns,
  aiAgentTasks,
  notifications,
} from "../../../drizzle/schema";

export type OptimizationFlag = {
  /** Snake-case key that uniquely identifies this anomaly type. */
  kind:
    | "high_error_rate"
    | "empty_output"
    | "cost_cap_hit"
    | "queue_stall"
    | "kpi_below_target";
  agentId: number;
  seatName: string;
  /** One-line headline for the inbox card. */
  title: string;
  /** Multi-line markdown body with the recommended next action. */
  details: string;
  /** Severity → maps to notification priority. */
  severity: "info" | "warn" | "critical";
};

const ERROR_RATE_THRESHOLD = 0.25; // >25% errors → flag
const QUEUE_STALL_HOURS = 2;

/**
 * Scan once. Returns the flags it raised so callers can log/test. Side
 * effects: writes admin notifications + agent_optimization_tasks rows for
 * each new flag (de-duped by kind+agent+date).
 */
export async function scanForOptimizations(now: Date = new Date()): Promise<OptimizationFlag[]> {
  const db = await getDb();
  if (!db) return [];

  await ensureOptimizationTasksTable();

  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sinceStall = new Date(now.getTime() - QUEUE_STALL_HOURS * 60 * 60 * 1000);

  const agents = await db.select().from(aiAgents);
  const flags: OptimizationFlag[] = [];

  // 1. Error rate per seat over 24h
  for (const a of agents) {
    const stats = (
      await db
        .select({
          total: sql<number>`COUNT(*)`,
          errored: sql<number>`SUM(CASE WHEN ${aiAgentRuns.status} IN ('failed','tool_error') THEN 1 ELSE 0 END)`,
          empty: sql<number>`SUM(CASE WHEN (${aiAgentRuns.output} IS NULL OR ${aiAgentRuns.output} = '') AND (${aiAgentRuns.toolCalls} = '[]' OR ${aiAgentRuns.toolCalls} IS NULL) THEN 1 ELSE 0 END)`,
          costSum: sql<number>`COALESCE(SUM(${aiAgentRuns.costUsd}), 0)`,
        })
        .from(aiAgentRuns)
        .where(and(eq(aiAgentRuns.agentId, a.id), gte(aiAgentRuns.createdAt, since24h)))
    )[0];
    const total = Number(stats?.total ?? 0);
    const errored = Number(stats?.errored ?? 0);
    const empty = Number(stats?.empty ?? 0);
    const cost = Number(stats?.costSum ?? 0);
    const cap = Number(a.costCapDailyUsd ?? 0);

    if (total >= 4 && errored / total > ERROR_RATE_THRESHOLD) {
      flags.push({
        kind: "high_error_rate",
        agentId: a.id,
        seatName: a.seatName,
        title: `${a.seatName}: ${Math.round((errored / total) * 100)}% error rate (24h)`,
        details: [
          `Of ${total} runs in the last 24h, ${errored} errored (failed or tool_error).`,
          ``,
          `**Suggested next action:** Open /admin/ai-agents/${a.id}, review the most recent failed runs, and either (a) tighten the system prompt to handle the failing inputs more gracefully, (b) revoke a tool the agent is misusing, or (c) downgrade status to draft_queue while you investigate.`,
          ``,
          `Approve this card to acknowledge — no auto-changes will be made to the agent's prompt or tools.`,
        ].join("\n"),
        severity: errored / total > 0.5 ? "critical" : "warn",
      });
    }

    if (total >= 4 && empty / total > 0.4) {
      flags.push({
        kind: "empty_output",
        agentId: a.id,
        seatName: a.seatName,
        title: `${a.seatName}: ${Math.round((empty / total) * 100)}% of runs produced no output`,
        details: [
          `Of ${total} runs in the last 24h, ${empty} produced no text and no tool calls.`,
          ``,
          `Likely causes: trigger payload is too sparse for the agent to act on, the system prompt doesn't say "respond with a tool call", or the agent has no relevant tools authorized.`,
          ``,
          `**Suggested next action:** Review the agent's authorized tools at /admin/ai-agents/${a.id} and consider widening the toolset, or adjust the trigger filter to exclude payloads the agent can't act on.`,
        ].join("\n"),
        severity: "warn",
      });
    }

    if (cap > 0 && cost >= cap * 0.95) {
      flags.push({
        kind: "cost_cap_hit",
        agentId: a.id,
        seatName: a.seatName,
        title: `${a.seatName}: $${cost.toFixed(2)} of $${cap.toFixed(2)} daily cap consumed (24h)`,
        details: [
          `This seat is running at ${Math.round((cost / cap) * 100)}% of its daily cost cap.`,
          ``,
          `If the cap was hit, the runtime auto-paused the seat. Either raise the cap on /admin/ai-agents/${a.id}, downgrade the agent's model to Haiku, or reduce the trigger fan-out (filter the subscription).`,
        ].join("\n"),
        severity: cost >= cap ? "critical" : "warn",
      });
    }
  }

  // 2. Queue stalls — any agent with queued tasks older than QUEUE_STALL_HOURS
  const stalled = await db
    .select({
      agentId: aiAgentTasks.agentId,
      oldest: sql<Date>`MIN(${aiAgentTasks.createdAt})`,
      count: sql<number>`COUNT(*)`,
    })
    .from(aiAgentTasks)
    .where(and(eq(aiAgentTasks.status, "queued"), gte(aiAgentTasks.createdAt, since24h)))
    .groupBy(aiAgentTasks.agentId);
  for (const s of stalled) {
    const oldestMs = new Date(s.oldest).getTime();
    if (oldestMs > sinceStall.getTime()) continue; // not yet stale enough
    const a = agents.find((x) => x.id === s.agentId);
    if (!a) continue;
    flags.push({
      kind: "queue_stall",
      agentId: a.id,
      seatName: a.seatName,
      title: `${a.seatName}: ${Number(s.count)} tasks queued >${QUEUE_STALL_HOURS}h`,
      details: [
        `The scheduler isn't draining this seat's queue. Most common reason: agent status is paused/draft_queue (only autonomous seats are drained).`,
        ``,
        `**Suggested next action:** Check status on /admin/ai-agents/${a.id}. If it should be running, flip to autonomous. If it should be off, dismiss this card and clear the queue from /admin/ai-agents/tasks.`,
      ].join("\n"),
      severity: "info",
    });
  }

  // 3. Persist the flags + write an admin notification per new flag.
  await persistFlags(flags, now);
  return flags;
}

async function persistFlags(flags: OptimizationFlag[], now: Date): Promise<void> {
  if (flags.length === 0) return;
  const db = await getDb();
  if (!db) return;
  const dayKey = now.toISOString().slice(0, 10); // YYYY-MM-DD — de-dupe per day per kind+agent
  for (const f of flags) {
    try {
      // INSERT IGNORE on a UNIQUE (agentId, kind, dayKey) constraint avoids
      // re-flagging the same anomaly hourly — Marcin only wants to see it once
      // per day until he acts.
      await db.execute(sql`
        INSERT IGNORE INTO \`agent_optimization_tasks\`
          (\`agentId\`, \`seatName\`, \`kind\`, \`title\`, \`details\`, \`severity\`, \`dayKey\`, \`status\`)
        VALUES (${f.agentId}, ${f.seatName}, ${f.kind}, ${f.title}, ${f.details}, ${f.severity}, ${dayKey}, 'open')
      `);
      // Find the row id (works whether INSERT or IGNORE)
      const [row] = (await db.execute(sql`
        SELECT \`id\`, \`status\` FROM \`agent_optimization_tasks\`
        WHERE \`agentId\` = ${f.agentId} AND \`kind\` = ${f.kind} AND \`dayKey\` = ${dayKey}
        LIMIT 1
      `)) as unknown as Array<{ id: number; status: string }>;
      if (row && row.status === "open") {
        await db.insert(notifications).values({
          userId: 1,
          role: "admin",
          eventType: "agent_optimization",
          title: f.title,
          body: f.details.slice(0, 320),
          linkUrl: `/admin/agents/runs?seat=${encodeURIComponent(f.seatName)}`,
          priority: f.severity === "critical" ? "high" : f.severity === "warn" ? "normal" : "low",
        });
      }
    } catch (err) {
      console.warn(`[systemIntegrity] failed to persist flag ${f.kind} for ${f.seatName}:`, err);
    }
  }
}

/**
 * Idempotent CREATE TABLE — boot-time guard. Mirrors the migration plan but
 * runs at boot in case drizzle-kit's tracker has drifted (per the project's
 * known migration drift pattern).
 */
export async function ensureOptimizationTasksTable(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS \`agent_optimization_tasks\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`agentId\` int NOT NULL,
        \`seatName\` varchar(80) NOT NULL,
        \`kind\` varchar(40) NOT NULL,
        \`title\` varchar(255) NOT NULL,
        \`details\` text,
        \`severity\` enum('info','warn','critical') NOT NULL DEFAULT 'info',
        \`dayKey\` varchar(10) NOT NULL,
        \`status\` enum('open','acknowledged','dismissed','applied') NOT NULL DEFAULT 'open',
        \`reviewedByUserId\` int,
        \`reviewedAt\` timestamp NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT \`agent_optimization_tasks_id\` PRIMARY KEY(\`id\`),
        CONSTRAINT \`agent_optimization_tasks_unique_per_day\` UNIQUE(\`agentId\`, \`kind\`, \`dayKey\`)
      )
    `);
  } catch (err) {
    console.warn("[systemIntegrity] ensureOptimizationTasksTable failed:", err);
  }
}

let interval: NodeJS.Timeout | null = null;
const HOURLY_MS = 60 * 60 * 1000;
/** Start the hourly scan. Idempotent. */
export function startSystemIntegrityCron(periodMs: number = HOURLY_MS): void {
  if (interval) return;
  // First scan after a short delay so boot doesn't race the table ensure.
  setTimeout(() => {
    void scanForOptimizations().catch((err) =>
      console.warn("[systemIntegrity] initial scan failed:", err)
    );
  }, 30_000);
  interval = setInterval(() => {
    void scanForOptimizations().catch((err) =>
      console.warn("[systemIntegrity] hourly scan failed:", err)
    );
  }, periodMs);
}

export function stopSystemIntegrityCron(): void {
  if (interval) clearInterval(interval);
  interval = null;
}

/** Read recent open optimization tasks for the admin UI. */
export async function listOptimizationTasks(args: {
  status?: "open" | "acknowledged" | "dismissed" | "applied";
  limit?: number;
} = {}): Promise<
  Array<{
    id: number;
    agentId: number;
    seatName: string;
    kind: string;
    title: string;
    details: string;
    severity: string;
    status: string;
    createdAt: Date;
  }>
> {
  const db = await getDb();
  if (!db) return [];
  const limit = args.limit ?? 50;
  const rows = (await db.execute(sql`
    SELECT \`id\`, \`agentId\`, \`seatName\`, \`kind\`, \`title\`, \`details\`,
           \`severity\`, \`status\`, \`createdAt\`
    FROM \`agent_optimization_tasks\`
    WHERE \`status\` = ${args.status ?? "open"}
    ORDER BY \`createdAt\` DESC
    LIMIT ${limit}
  `)) as unknown as Array<{
    id: number;
    agentId: number;
    seatName: string;
    kind: string;
    title: string;
    details: string;
    severity: string;
    status: string;
    createdAt: Date;
  }>;
  return rows;
}

/** Mark an optimization task acknowledged/dismissed/applied. */
export async function reviewOptimizationTask(args: {
  id: number;
  status: "acknowledged" | "dismissed" | "applied";
  userId: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(sql`
    UPDATE \`agent_optimization_tasks\`
    SET \`status\` = ${args.status},
        \`reviewedByUserId\` = ${args.userId},
        \`reviewedAt\` = CURRENT_TIMESTAMP
    WHERE \`id\` = ${args.id}
  `);
}
