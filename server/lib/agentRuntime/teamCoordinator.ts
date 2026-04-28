/**
 * server/lib/agentRuntime/teamCoordinator.ts
 *
 * Phase 2 — runs a 3-teammate team task with parallel fan-out + synthesis.
 *
 * Flow:
 *   1. Resolve the team's frontend / backend / qa members.
 *   2. Cost-cap check at the team level: sum the team's seats' aiAgentRuns.costUsd
 *      since midnight; if ≥ team.costCapDailyUsd, pause the task and return.
 *   3. Mark the task `in_progress` and stamp seat-specific system prompts.
 *   4. Promise.all → call `runAgent` once per teammate, with a triggerPayload
 *      that includes the teamTaskId and a role-tailored brief.
 *   5. After all three settle, compose a synthesis note on the task summarizing
 *      what each role produced (artifacts + summaries from notes log).
 *   6. Emit a `team.task_completed` event the Visionary Console / Integrator
 *      can subscribe to.
 *
 * Cross-department handoff:
 *   The Integrator can call `proposeTeamHandoff(fromTeamId, toTeamId, eventType,
 *   payload)` to escalate work from Sales → Operations or similar. We auto-accept
 *   handoffs when the eventType matches a registered auto-accept rule (Phase 2:
 *   "marketing.lead_qualified", "sales.estimate_approved"; Phase 3 adds
 *   operations.project_completed, cs.member_renewed, cs.churn_risk_flagged,
 *   vendor.gap_detected, vendor.performance_dropped); otherwise it lands
 *   in pending and the Integrator must review.
 */

import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "../../db";
import {
  aiAgents,
  aiAgentRuns,
  agentTeams,
  agentTeamMembers,
  agentTeamTasks,
  agentTeamHandoffs,
  agentTeamArtifacts,
} from "../../../drizzle/schema";
import { runAgent } from "./runtime";
import type { TeamRole } from "./teamTools";

const TEAM_TOOL_KEYS = [
  "team.writeArtifact",
  "team.readArtifacts",
  "team.sendDirectMessage",
  "team.readMessages",
  "team.markDone",
];

// Auto-accept eventTypes — when proposeTeamHandoff is called with one of these,
// the handoff is immediately marked accepted and a task is created on the
// receiving team. Phase 3 expands this set to cover the cross-department
// rhythms approved with Marcin.
//
// Intentionally NOT auto-accepted:
//   finance.margin_floor_breach — strategic decision; Integrator surfaces this
//   to Marcin via a notification rather than auto-routing to a team.
const AUTO_ACCEPT_HANDOFFS = new Set([
  // Phase 2
  "marketing.lead_qualified",     // Marketing → Sales (Lead Nurturer)
  "sales.estimate_approved",      // Sales → Operations (Dispatch)
  // Phase 3
  "operations.project_completed", // Operations → Customer Success (Onboarding)
  "cs.member_renewed",            // Customer Success → Sales (Membership Success)
  "cs.churn_risk_flagged",        // Customer Success → Marketing (Community & Reviews — testimonial recovery)
  "vendor.gap_detected",          // Operations/Vendor → Vendor Acquisition
  "vendor.performance_dropped",   // Operations/Vendor → Vendor Operations
]);

// ────────────────────────────────────────────────────────────────────────────
// Team task execution
// ────────────────────────────────────────────────────────────────────────────

export type TeammateExecution = {
  seatId: number;
  seatName: string;
  role: TeamRole;
  status: "success" | "failed" | "tool_error" | "cost_exceeded" | "timed_out" | "awaiting_approval";
  costUsd: number;
  output: string;
  error?: string;
  startedAt: string;
  finishedAt: string;
};

export type TeamTaskExecutionResult = {
  taskId: number;
  teamId: number;
  status: "done" | "in_progress" | "blocked" | "cost_capped";
  teammates: TeammateExecution[];
  totalCostUsd: number;
  synthesisNote: string;
  startedAt: string;
  finishedAt: string;
};

/**
 * Execute a team task by fanning out to all 3 teammates in parallel.
 */
export async function executeTeamTask(args: {
  taskId: number;
  triggerType?: "manual" | "event" | "delegated";
}): Promise<TeamTaskExecutionResult> {
  const startedAt = new Date().toISOString();
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [task] = await db
    .select()
    .from(agentTeamTasks)
    .where(eq(agentTeamTasks.id, args.taskId))
    .limit(1);
  if (!task) throw new Error(`Team task ${args.taskId} not found`);

  const [team] = await db.select().from(agentTeams).where(eq(agentTeams.id, task.teamId)).limit(1);
  if (!team) throw new Error(`Team ${task.teamId} not found`);

  if (team.status !== "active") {
    return {
      taskId: task.id,
      teamId: team.id,
      status: "blocked",
      teammates: [],
      totalCostUsd: 0,
      synthesisNote: `Team ${team.name} is ${team.status}; not executing.`,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }

  // Resolve members → frontend, backend, qa.
  const members = await db
    .select({
      seatId: agentTeamMembers.seatId,
      role: agentTeamMembers.role,
      seatName: aiAgents.seatName,
      systemPrompt: aiAgents.systemPrompt,
      status: aiAgents.status,
    })
    .from(agentTeamMembers)
    .leftJoin(aiAgents, eq(aiAgents.id, agentTeamMembers.seatId))
    .where(eq(agentTeamMembers.teamId, team.id));
  const triplet = ["frontend", "backend", "qa"] as const;
  const byRole = new Map<string, (typeof members)[number]>();
  for (const m of members) byRole.set(String(m.role), m);

  const missing = triplet.filter((r) => !byRole.get(r));
  if (missing.length > 0) {
    return {
      taskId: task.id,
      teamId: team.id,
      status: "blocked",
      teammates: [],
      totalCostUsd: 0,
      synthesisNote: `Team ${team.name} is missing roles: ${missing.join(", ")}. Cannot execute.`,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }

  // ── Team-level cost cap ─────────────────────────────────────────────────────
  const since = new Date();
  since.setHours(0, 0, 0, 0); // midnight local
  const seatIds = members.map((m) => m.seatId);
  const [{ costSum }] = await db
    .select({ costSum: sql<number>`COALESCE(SUM(${aiAgentRuns.costUsd}), 0)` })
    .from(aiAgentRuns)
    .where(and(inArray(aiAgentRuns.agentId, seatIds), gte(aiAgentRuns.createdAt, since)));
  const spentToday = Number(costSum ?? 0);
  const cap = Number(team.costCapDailyUsd);
  if (spentToday >= cap) {
    await db
      .update(agentTeamTasks)
      .set({
        status: "blocked",
        notes: appendNote(task.notes, `Team cost cap hit (${spentToday.toFixed(2)} / ${cap.toFixed(2)} USD). Paused.`),
      })
      .where(eq(agentTeamTasks.id, task.id));
    return {
      taskId: task.id,
      teamId: team.id,
      status: "cost_capped",
      teammates: [],
      totalCostUsd: spentToday,
      synthesisNote: `Team ${team.name} hit its daily cost cap (${spentToday.toFixed(2)}/${cap.toFixed(2)} USD). Task paused.`,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }

  // ── Mark task in-progress ───────────────────────────────────────────────────
  await db
    .update(agentTeamTasks)
    .set({
      status: "in_progress",
      notes: appendNote(task.notes, `Coordinator fan-out started for team ${team.name}.`),
    })
    .where(eq(agentTeamTasks.id, task.id));

  // ── Fan out — Promise.all so timestamps line up ─────────────────────────────
  const briefByRole: Record<TeamRole, string> = {
    frontend: `You are the FRONTEND teammate on the ${team.name} team. Your territory is 'drafts' (customer-facing copy). Read 'data' first via team_readArtifacts to ground your work, then write your draft to your territory via team_writeArtifact(territory='drafts'). DM the BACKEND if you need data they haven't produced. DM the QA when your draft is ready for audit. Call team_markDone when finished.`,
    backend: `You are the BACKEND teammate on the ${team.name} team. Your territory is 'data' (research, calculations, history). Pull the relevant context from your tools, write findings to your territory via team_writeArtifact(territory='data'). DM the FRONTEND with a 'data ready' message. Call team_markDone when finished.`,
    qa: `You are the QA teammate on the ${team.name} team. Your territory is 'audits' (voice, fact, margin, policy reviews). Wait briefly for FRONTEND drafts and BACKEND data (use team_readArtifacts / team_readMessages). Audit the draft + the data, write your audit to your territory via team_writeArtifact(territory='audits'). DM the FRONTEND if changes are required. Call team_markDone when finished.`,
    lead: `You are the LEAD on the ${team.name} team. Coordinate, do not duplicate teammates' work.`,
  };

  const taskBrief =
    `Team task #${task.id} — ${task.title}\n\n` +
    (task.description ?? "(no description)") +
    `\n\n` +
    (task.customerId ? `Customer: ${task.customerId}\n` : "") +
    `Priority: ${task.priority}\n` +
    `Pass teamTaskId=${task.id} to every team_* tool.`;

  const teammateRuns = triplet.map(async (role): Promise<TeammateExecution> => {
    const m = byRole.get(role)!;
    const tStart = new Date().toISOString();
    if (!m.seatName || m.status === "paused" || m.status === "disabled") {
      return {
        seatId: m.seatId,
        seatName: m.seatName ?? `seat#${m.seatId}`,
        role,
        status: "failed",
        costUsd: 0,
        output: "",
        error: `Seat is ${m.status ?? "missing"}`,
        startedAt: tStart,
        finishedAt: new Date().toISOString(),
      };
    }
    try {
      const result = await runAgent({
        agentId: m.seatId,
        triggerType: args.triggerType ?? "delegated",
        triggerPayload: {
          teamTaskId: task.id,
          teamId: team.id,
          teamName: team.name,
          role,
          brief: briefByRole[role as TeamRole],
          taskBrief,
        },
      });
      return {
        seatId: m.seatId,
        seatName: m.seatName,
        role,
        status: result.status,
        costUsd: result.costUsd,
        output: result.output,
        startedAt: tStart,
        finishedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        seatId: m.seatId,
        seatName: m.seatName ?? `seat#${m.seatId}`,
        role,
        status: "failed",
        costUsd: 0,
        output: "",
        error: err instanceof Error ? err.message : String(err),
        startedAt: tStart,
        finishedAt: new Date().toISOString(),
      };
    }
  });

  const settled = await Promise.all(teammateRuns);
  const totalCostUsd = settled.reduce((s, r) => s + r.costUsd, 0);

  // ── Synthesis ──────────────────────────────────────────────────────────────
  const artifacts = await db
    .select()
    .from(agentTeamArtifacts)
    .where(eq(agentTeamArtifacts.taskId, task.id))
    .orderBy(asc(agentTeamArtifacts.territory), asc(agentTeamArtifacts.key));

  const synth = buildSynthesisNote({ team, settled, artifacts });

  const [latestTask] = await db
    .select()
    .from(agentTeamTasks)
    .where(eq(agentTeamTasks.id, task.id))
    .limit(1);
  const newNotes = appendNote(latestTask?.notes ?? null, synth);

  // Determine final status. Prefer `done` if all teammates succeeded AND each
  // role role-marked done (markDone updates status itself); otherwise
  // `in_progress` so the operator can intervene.
  const allOk = settled.every((s) => s.status === "success");
  const finalStatus: "done" | "in_progress" =
    latestTask?.status === "done" ? "done" : allOk ? "done" : "in_progress";

  await db
    .update(agentTeamTasks)
    .set({
      notes: newNotes,
      status: finalStatus,
      completedAt: finalStatus === "done" ? new Date() : latestTask?.completedAt,
    })
    .where(eq(agentTeamTasks.id, task.id));

  // Best-effort event emission so KPI/Integrator subscribers can react.
  void emitTeamEvent("team.task_completed", {
    taskId: task.id,
    teamId: team.id,
    teamName: team.name,
    department: team.department,
    status: finalStatus,
    totalCostUsd,
    teammates: settled.map((s) => ({
      seatId: s.seatId,
      role: s.role,
      status: s.status,
      costUsd: s.costUsd,
    })),
  });

  return {
    taskId: task.id,
    teamId: team.id,
    status: finalStatus,
    teammates: settled,
    totalCostUsd,
    synthesisNote: synth,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

function appendNote(existing: string | null, line: string): string {
  const stamp = new Date().toISOString();
  const next = `[${stamp}] ${line}`;
  return existing ? `${existing}\n${next}` : next;
}

function buildSynthesisNote(args: {
  team: { name: string };
  settled: TeammateExecution[];
  artifacts: Array<{ territory: string; key: string }>;
}): string {
  const lines: string[] = [];
  lines.push(`Team ${args.team.name} synthesis:`);
  for (const t of args.settled) {
    const tag = t.status === "success" ? "✓" : "✗";
    const summary = (t.output || t.error || "(no output)").slice(0, 200).replace(/\s+/g, " ").trim();
    lines.push(`  ${tag} ${t.role} (${t.seatName}, $${t.costUsd.toFixed(4)}, ${t.status}): ${summary}`);
  }
  if (args.artifacts.length > 0) {
    const byTerritory = new Map<string, string[]>();
    for (const a of args.artifacts) {
      const arr = byTerritory.get(a.territory) ?? [];
      arr.push(a.key);
      byTerritory.set(a.territory, arr);
    }
    lines.push(`  artifacts: ${[...byTerritory.entries()].map(([t, ks]) => `${t}=[${ks.join(",")}]`).join(" ")}`);
  } else {
    lines.push(`  artifacts: (none — territory writes did not produce output)`);
  }
  return lines.join("\n");
}

async function emitTeamEvent(eventName: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const { emitAgentEvent } = await import("./triggerBus");
    await emitAgentEvent(eventName, payload);
  } catch (err) {
    console.warn("[teamCoordinator] emit event failed (non-fatal):", err);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Cross-team handoff
// ────────────────────────────────────────────────────────────────────────────

export async function proposeTeamHandoff(args: {
  fromTeamId: number;
  toTeamId: number;
  eventType: string;
  payload?: Record<string, unknown>;
}): Promise<{ handoffId: number; autoAccepted: boolean; createdTaskId: number | null }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const inserted = await db.insert(agentTeamHandoffs).values({
    fromTeamId: args.fromTeamId,
    toTeamId: args.toTeamId,
    eventType: args.eventType,
    payload: args.payload ? JSON.stringify(args.payload) : null,
    status: "pending",
  });
  const handoffId = Number((inserted as { insertId?: number }).insertId ?? 0);

  // Auto-accept when the event type is on the registered list. Creates a task
  // on the receiving team so the work is immediately visible in the queue.
  if (AUTO_ACCEPT_HANDOFFS.has(args.eventType)) {
    await db
      .update(agentTeamHandoffs)
      .set({ status: "accepted", acceptedAt: new Date() })
      .where(eq(agentTeamHandoffs.id, handoffId));
    const inserted2 = await db.insert(agentTeamTasks).values({
      teamId: args.toTeamId,
      title: `Handoff: ${args.eventType}`,
      description: args.payload ? JSON.stringify(args.payload, null, 2) : null,
      sourceEventType: args.eventType,
      sourceEventPayload: args.payload ? JSON.stringify(args.payload) : null,
      customerId: typeof args.payload?.customerId === "string" ? (args.payload!.customerId as string) : null,
      priority: "normal",
      status: "open",
    });
    const createdTaskId = Number((inserted2 as { insertId?: number }).insertId ?? 0);
    return { handoffId, autoAccepted: true, createdTaskId };
  }
  return { handoffId, autoAccepted: false, createdTaskId: null };
}
