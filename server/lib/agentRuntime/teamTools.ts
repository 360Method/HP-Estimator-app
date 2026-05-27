/**
 * server/lib/agentRuntime/teamTools.ts
 *
 * Phase 2 — team-coordination tools used by the 3-teammate pattern (frontend
 * / backend / qa). Each tool is invoked inside a single seat's `runAgent`
 * loop and operates against a particular `agent_team_tasks` row.
 *
 * The 3 rules implemented here:
 *
 *   Rule 1 — OWN TERRITORY
 *     frontend → drafts/    (customer-facing copy)
 *     backend  → data/      (research, calculations, history)
 *     qa       → audits/    (voice, fact, margin, policy reviews)
 *
 *     `team.writeArtifact(territory, ...)` rejects when the caller's role on
 *     the team doesn't match the territory. Violations are persisted to
 *     `agent_team_violations` so the Visionary Console can surface them.
 *
 *   Rule 2 — DIRECT MESSAGES (skip the lead)
 *     Any teammate can DM another via `team.sendDirectMessage(toSeatName, body)`
 *     — the message lands on `agent_team_messages` with `toSeatId` set, and
 *     the recipient sees it via `team.readMessages` (filtered to messages
 *     addressed to them OR broadcast to the team).
 *
 *   Rule 3 — START PARALLEL
 *     Enforced by the coordinator (executeTeamTask), not by tools — all 3
 *     seats are kicked off in parallel via Promise.all. The tools just allow
 *     them to converge via the shared task + messages + artifacts.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { and, asc, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { registerTool } from "./tools";
import { getDb } from "../../db";
import {
  aiAgents,
  agentTeamMembers,
  agentTeamTasks,
  agentTeamMessages,
  agentTeamArtifacts,
  agentTeamViolations,
} from "../../../drizzle/schema";

type TeamRole = "frontend" | "backend" | "qa" | "lead";
type Territory = "drafts" | "data" | "audits";

const TERRITORY_OWNER: Record<Territory, TeamRole> = {
  drafts: "frontend",
  data: "backend",
  audits: "qa",
};

async function db() {
  const d = await getDb();
  if (!d) throw new Error("Database not available");
  return d;
}

/**
 * Resolve the team and role for a given seat against a particular team task.
 * Returns null if the seat is not a member of the team owning the task.
 */
async function resolveTeamMembership(
  agentId: number,
  teamTaskId: number
): Promise<{ teamId: number; role: TeamRole } | null> {
  const d = await db();
  const [task] = await d
    .select({ teamId: agentTeamTasks.teamId })
    .from(agentTeamTasks)
    .where(eq(agentTeamTasks.id, teamTaskId))
    .limit(1);
  if (!task) return null;
  const [member] = await d
    .select({ role: agentTeamMembers.role })
    .from(agentTeamMembers)
    .where(and(eq(agentTeamMembers.teamId, task.teamId), eq(agentTeamMembers.seatId, agentId)))
    .limit(1);
  if (!member) return null;
  return { teamId: task.teamId, role: member.role as TeamRole };
}

// ── 1. team.writeArtifact ─────────────────────────────────────────────────────
// Territory-enforced write. Reject + log if the calling seat's role doesn't
// own the territory.

registerTool({
  key: "team.writeArtifact",
  requiresApproval: false,
  definition: {
    name: "team_writeArtifact",
    description:
      "Write a structured artifact to YOUR territory on the current team task. Frontends write to 'drafts', Backends write to 'data', QAs write to 'audits'. Cross-territory writes are REJECTED and logged. Each (taskId, territory, key) pair is unique — re-writing the same key overwrites.",
    input_schema: {
      type: "object",
      properties: {
        teamTaskId: { type: "number", description: "The agent_team_tasks id this artifact belongs to." },
        territory: { type: "string", enum: ["drafts", "data", "audits"] },
        key: { type: "string", description: "Stable identifier for this artifact within the territory (e.g. 'sms_first_touch', 'cost_breakdown', 'voice_audit')." },
        content: {
          type: "object",
          description: "Structured payload. JSON. Keep under 16k chars when serialized.",
          additionalProperties: true,
        },
      },
      required: ["teamTaskId", "territory", "key", "content"],
    },
  },
  handler: async ({ input, ctx }) => {
    const teamTaskId = Number(input.teamTaskId);
    const territory = String(input.territory) as Territory;
    const key = String(input.key).slice(0, 120);
    const content = input.content;

    const membership = await resolveTeamMembership(ctx.agentId, teamTaskId);
    if (!membership) {
      throw new Error(
        `Seat ${ctx.agentId} is not a member of the team owning task ${teamTaskId}.`
      );
    }
    const requiredRole = TERRITORY_OWNER[territory];
    if (membership.role !== requiredRole) {
      // Log the violation — the Visionary Console surfaces these.
      const d = await db();
      try {
        await d.insert(agentTeamViolations).values({
          taskId: teamTaskId,
          teamId: membership.teamId,
          seatId: ctx.agentId,
          attemptedRole: membership.role,
          attemptedTerritory: territory,
          attemptedKey: key,
          reason: `Territory '${territory}' is owned by '${requiredRole}' role; caller role is '${membership.role}'.`,
        });
      } catch (err) {
        console.warn("[teamTools] failed to log violation:", err);
      }
      throw new Error(
        `Territory '${territory}' is owned by ${requiredRole}; you are ${membership.role}. Write rejected.`
      );
    }

    const d = await db();
    const contentJson = JSON.stringify(content ?? null);
    if (contentJson.length > 16_000) {
      throw new Error(`Artifact too large (${contentJson.length} chars). Keep under 16,000.`);
    }
    // Upsert (taskId, territory, key) — re-writes overwrite the same row.
    try {
      await d.insert(agentTeamArtifacts).values({
        taskId: teamTaskId,
        teamId: membership.teamId,
        fromSeatId: ctx.agentId,
        territory,
        key,
        contentJson,
      });
    } catch (err) {
      // Duplicate (uniq constraint) → update in place
      const msg = err instanceof Error ? err.message : String(err);
      if (/duplicate/i.test(msg)) {
        await d
          .update(agentTeamArtifacts)
          .set({ contentJson, fromSeatId: ctx.agentId, createdAt: new Date() })
          .where(
            and(
              eq(agentTeamArtifacts.taskId, teamTaskId),
              eq(agentTeamArtifacts.territory, territory),
              eq(agentTeamArtifacts.key, key)
            )
          );
      } else {
        throw err;
      }
    }
    return { ok: true, taskId: teamTaskId, territory, key };
  },
});

// ── 2. team.readArtifacts ─────────────────────────────────────────────────────

registerTool({
  key: "team.readArtifacts",
  requiresApproval: false,
  definition: {
    name: "team_readArtifacts",
    description:
      "Read artifacts produced by your teammates on the current team task. You can scope by territory ('drafts' | 'data' | 'audits') or read all of them. Frontends typically read 'data' first to ground their copy in fresh research; QAs typically read 'drafts' AND 'data' before auditing.",
    input_schema: {
      type: "object",
      properties: {
        teamTaskId: { type: "number" },
        territory: { type: "string", enum: ["drafts", "data", "audits"], description: "Optional. Omit to read all." },
      },
      required: ["teamTaskId"],
    },
  },
  handler: async ({ input, ctx }) => {
    const teamTaskId = Number(input.teamTaskId);
    const territory = input.territory ? (String(input.territory) as Territory) : undefined;
    const membership = await resolveTeamMembership(ctx.agentId, teamTaskId);
    if (!membership) throw new Error(`Seat ${ctx.agentId} not on the team for task ${teamTaskId}.`);
    const d = await db();
    const where = territory
      ? and(eq(agentTeamArtifacts.taskId, teamTaskId), eq(agentTeamArtifacts.territory, territory))
      : eq(agentTeamArtifacts.taskId, teamTaskId);
    const rows = await d
      .select()
      .from(agentTeamArtifacts)
      .where(where)
      .orderBy(asc(agentTeamArtifacts.territory), asc(agentTeamArtifacts.key));
    return rows.map((r) => ({
      id: r.id,
      territory: r.territory,
      key: r.key,
      fromSeatId: r.fromSeatId,
      content: safeParse(r.contentJson),
      createdAt: r.createdAt,
    }));
  },
});

// ── 3. team.sendDirectMessage ─────────────────────────────────────────────────

registerTool({
  key: "team.sendDirectMessage",
  requiresApproval: false,
  definition: {
    name: "team_sendDirectMessage",
    description:
      "Direct-message a specific teammate on the current team task — bypassing the team lead. Use the recipient's seatName (e.g. 'ai_lead_nurturer_backend'). Common patterns: Frontend asks Backend for data ('what stage is this customer at?'); QA tells Frontend a draft has voice issues; Backend signals Frontend that data is ready.",
    input_schema: {
      type: "object",
      properties: {
        teamTaskId: { type: "number" },
        toSeatName: { type: "string", description: "Recipient seatName (e.g. 'ai_project_estimator_backend')." },
        body: { type: "string", description: "Message body — plain text or markdown, under 8000 chars." },
      },
      required: ["teamTaskId", "toSeatName", "body"],
    },
  },
  handler: async ({ input, ctx }) => {
    const teamTaskId = Number(input.teamTaskId);
    const body = String(input.body).slice(0, 8000);
    const toSeatName = String(input.toSeatName);
    const membership = await resolveTeamMembership(ctx.agentId, teamTaskId);
    if (!membership) throw new Error(`Seat ${ctx.agentId} not on the team for task ${teamTaskId}.`);

    const d = await db();
    const [recipient] = await d
      .select()
      .from(aiAgents)
      .where(eq(aiAgents.seatName, toSeatName))
      .limit(1);
    if (!recipient) throw new Error(`Recipient seat '${toSeatName}' not found.`);

    // Recipient must be on the same team. Direct messages stay inside the team.
    const [recipientMember] = await d
      .select()
      .from(agentTeamMembers)
      .where(
        and(
          eq(agentTeamMembers.teamId, membership.teamId),
          eq(agentTeamMembers.seatId, recipient.id)
        )
      )
      .limit(1);
    if (!recipientMember) {
      throw new Error(
        `Recipient '${toSeatName}' is not on this team. Use agentTeams.proposeHandoff for cross-team coordination.`
      );
    }

    const inserted = await d.insert(agentTeamMessages).values({
      teamId: membership.teamId,
      fromSeatId: ctx.agentId,
      toSeatId: recipient.id,
      body,
      // We treat (taskId-prefixed-thread) by stamping body marker not threadId, to
      // avoid coupling; threadId stays null for now.
    });
    return {
      ok: true,
      messageId: Number((inserted as { insertId?: number }).insertId ?? 0),
      to: toSeatName,
    };
  },
});

// ── 4. team.readMessages ──────────────────────────────────────────────────────

registerTool({
  key: "team.readMessages",
  requiresApproval: false,
  definition: {
    name: "team_readMessages",
    description:
      "Read messages on the current team — both direct messages addressed to you and broadcasts to the whole team. Use sinceId to fetch only what's new since your last read.",
    input_schema: {
      type: "object",
      properties: {
        teamTaskId: { type: "number" },
        sinceId: { type: "number", description: "Only messages with id > sinceId. Use 0 to read all." },
        limit: { type: "number", description: "Default 50, max 200." },
      },
      required: ["teamTaskId"],
    },
  },
  handler: async ({ input, ctx }) => {
    const teamTaskId = Number(input.teamTaskId);
    const sinceId = Number(input.sinceId ?? 0);
    const limit = Math.min(200, Number(input.limit ?? 50));
    const membership = await resolveTeamMembership(ctx.agentId, teamTaskId);
    if (!membership) throw new Error(`Seat ${ctx.agentId} not on team for task ${teamTaskId}.`);
    const d = await db();
    const rows = await d
      .select()
      .from(agentTeamMessages)
      .where(
        and(
          eq(agentTeamMessages.teamId, membership.teamId),
          gt(agentTeamMessages.id, sinceId),
          or(
            eq(agentTeamMessages.toSeatId, ctx.agentId),
            // toSeatId IS NULL → broadcast to whole team
            sql`${agentTeamMessages.toSeatId} IS NULL`
          )
        )
      )
      .orderBy(asc(agentTeamMessages.id))
      .limit(limit);
    return rows.map((m) => ({
      id: m.id,
      fromSeatId: m.fromSeatId,
      toSeatId: m.toSeatId,
      body: m.body,
      createdAt: m.createdAt,
    }));
  },
});

// ── 5. team.markDone ──────────────────────────────────────────────────────────

registerTool({
  key: "team.markDone",
  requiresApproval: false,
  definition: {
    name: "team_markDone",
    description:
      "Signal that YOUR portion of the team task is complete. Once all three teammates (frontend/backend/qa) have called this, the coordinator marks the task as done and triggers the synthesis pass. Provide a one-paragraph summary of what you produced.",
    input_schema: {
      type: "object",
      properties: {
        teamTaskId: { type: "number" },
        summary: { type: "string", description: "What you delivered. Under 800 chars." },
      },
      required: ["teamTaskId", "summary"],
    },
  },
  handler: async ({ input, ctx }) => {
    const teamTaskId = Number(input.teamTaskId);
    const summary = String(input.summary).slice(0, 800);
    const membership = await resolveTeamMembership(ctx.agentId, teamTaskId);
    if (!membership) throw new Error(`Seat ${ctx.agentId} not on team for task ${teamTaskId}.`);
    const d = await db();

    // Append to task notes with a stable role-prefix so we can detect 3-of-3.
    const [task] = await d
      .select()
      .from(agentTeamTasks)
      .where(eq(agentTeamTasks.id, teamTaskId))
      .limit(1);
    if (!task) throw new Error(`Task ${teamTaskId} not found.`);

    const stamp = new Date().toISOString();
    const line = `[${stamp}] (${membership.role}#${ctx.agentId} done) ${summary}`;
    const newNotes = task.notes ? `${task.notes}\n${line}` : line;

    // Detect 3-of-3 by checking how many distinct roles have a "done" line.
    const rolesDone = new Set<string>();
    for (const ln of newNotes.split("\n")) {
      const m = ln.match(/\((frontend|backend|qa)#\d+ done\)/);
      if (m) rolesDone.add(m[1]);
    }
    const allDone = rolesDone.has("frontend") && rolesDone.has("backend") && rolesDone.has("qa");

    await d
      .update(agentTeamTasks)
      .set({
        notes: newNotes,
        status: allDone ? "done" : task.status === "open" ? "in_progress" : task.status,
        completedAt: allDone ? new Date() : task.completedAt,
      })
      .where(eq(agentTeamTasks.id, teamTaskId));

    return { ok: true, allDone, rolesDone: Array.from(rolesDone) };
  },
});

// ── helpers ───────────────────────────────────────────────────────────────────

function safeParse(v: string | null): unknown {
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

export const TEAM_TOOL_KEYS = [
  "team.writeArtifact",
  "team.readArtifacts",
  "team.sendDirectMessage",
  "team.readMessages",
  "team.markDone",
] as const;

// Re-export types so other files (coordinator) can share the same enum.
export type { TeamRole, Territory };
