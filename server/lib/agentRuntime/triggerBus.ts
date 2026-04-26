/**
 * server/lib/agentRuntime/triggerBus.ts
 *
 * Domain-event fanout. Business code calls `emitAgentEvent('lead.created', payload)`
 * after an interesting thing happens; the bus looks up `ai_agent_event_subscriptions`
 * and queues a task per subscribed (autonomous) agent. The runtime scheduler picks
 * the queued tasks up on its tick.
 *
 * Why a queue + scheduler instead of inline runs:
 *   - Agent runs may take seconds; we don't want them in the hot tRPC request path.
 *   - The scheduler already enforces autonomous-only execution, so paused/draft
 *     agents simply skip without blowing up.
 *   - Failures inside an agent run never affect the originating business action.
 */

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { aiAgentEventSubscriptions, aiAgentTasks } from "../../../drizzle/schema";

/**
 * Canonical domain event keys. Keep this in sync with the seeder so a typo
 * in an emit site doesn't silently no-op.
 */
export const AGENT_EVENTS = [
  "lead.created",
  "opportunity.stage_changed",
  "invoice.overdue",
  "customer.portal_account_created",
  "visit.scheduled",
  "visit.completed",
  "payment.received",
  "roadmap_generator.submitted",
  "call.missed",
  "voicemail.received",
  "subscription.renewed",
  "subscription.cancelled",
  "review.received",
] as const;

export type AgentEventName = (typeof AGENT_EVENTS)[number] | (string & {});

export type EmitOptions = {
  /** Skip queue write — useful for tests. */
  dryRun?: boolean;
};

/**
 * Public entry point. Call this from any business action after the action has
 * been persisted. Failures here are logged and swallowed so the caller never
 * sees them — agent triggers must never break a primary write.
 */
export async function emitAgentEvent(
  eventName: AgentEventName,
  payload: Record<string, unknown> = {},
  opts: EmitOptions = {}
): Promise<{ queuedTaskIds: number[]; matchedAgents: number }> {
  try {
    return await triggerAgentsFor(eventName, payload, opts);
  } catch (err) {
    console.warn(`[triggerBus] emit '${eventName}' failed (non-fatal):`, err);
    return { queuedTaskIds: [], matchedAgents: 0 };
  }
}

/**
 * Find every autonomous agent subscribed to `eventName`, optionally filter by
 * the subscription's JSON `filter` clause, and queue an `event`-type task for
 * each. Filters are simple AND-of-equals over top-level payload keys.
 */
export async function triggerAgentsFor(
  eventName: AgentEventName,
  payload: Record<string, unknown>,
  opts: EmitOptions = {}
): Promise<{ queuedTaskIds: number[]; matchedAgents: number }> {
  const db = await getDb();
  if (!db) return { queuedTaskIds: [], matchedAgents: 0 };

  const subs = await db
    .select()
    .from(aiAgentEventSubscriptions)
    .where(
      and(
        eq(aiAgentEventSubscriptions.eventName, String(eventName)),
        eq(aiAgentEventSubscriptions.enabled, true)
      )
    );

  if (subs.length === 0) return { queuedTaskIds: [], matchedAgents: 0 };

  const matched = subs.filter((s) => filterMatches(s.filter, payload));
  if (matched.length === 0) return { queuedTaskIds: [], matchedAgents: 0 };
  if (opts.dryRun) {
    return { queuedTaskIds: [], matchedAgents: matched.length };
  }

  const queuedTaskIds: number[] = [];
  for (const sub of matched) {
    try {
      const inserted = await db.insert(aiAgentTasks).values({
        agentId: sub.agentId,
        triggerType: "event",
        triggerPayload: JSON.stringify({ event: eventName, ...payload }),
        status: "queued",
      });
      const id = Number((inserted as { insertId?: number }).insertId ?? 0);
      if (id) queuedTaskIds.push(id);
    } catch (err) {
      console.warn(`[triggerBus] queue failed for agent #${sub.agentId} on '${eventName}':`, err);
    }
  }

  return { queuedTaskIds, matchedAgents: matched.length };
}

function filterMatches(filterJson: string | null, payload: Record<string, unknown>): boolean {
  if (!filterJson) return true;
  let filter: Record<string, unknown>;
  try {
    filter = JSON.parse(filterJson);
  } catch {
    return true;
  }
  for (const [key, expected] of Object.entries(filter)) {
    if (payload[key] !== expected) return false;
  }
  return true;
}

/**
 * Diagnostic — lists every agent subscribed to `eventName`. Used by the admin
 * UI's "Triggers" tab and by the seeder to verify wiring after a fresh seed.
 */
export async function listSubscribersFor(eventName: AgentEventName): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ agentId: aiAgentEventSubscriptions.agentId })
    .from(aiAgentEventSubscriptions)
    .where(
      and(
        eq(aiAgentEventSubscriptions.eventName, String(eventName)),
        eq(aiAgentEventSubscriptions.enabled, true)
      )
    );
  return rows.map((r) => r.agentId);
}

/**
 * Diagnostic — counts queued+running tasks per event in the last 24h.
 * Powers the admin "trigger health" widget.
 */
export async function recentEventActivity(): Promise<Array<{ event: string; count: number }>> {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      payload: aiAgentTasks.triggerPayload,
      count: sql<number>`COUNT(*)`,
    })
    .from(aiAgentTasks)
    .where(and(eq(aiAgentTasks.triggerType, "event"), sql`${aiAgentTasks.createdAt} >= ${since}`))
    .groupBy(aiAgentTasks.triggerPayload);
  const byEvent = new Map<string, number>();
  for (const r of rows) {
    let event = "unknown";
    try {
      const obj = JSON.parse(r.payload ?? "{}") as { event?: string };
      if (obj?.event) event = obj.event;
    } catch {
      // ignore
    }
    byEvent.set(event, (byEvent.get(event) ?? 0) + Number(r.count ?? 0));
  }
  return Array.from(byEvent.entries()).map(([event, count]) => ({ event, count }));
}
