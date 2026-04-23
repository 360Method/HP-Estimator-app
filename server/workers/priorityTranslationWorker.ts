/**
 * Priority Translation background worker.
 *
 * Two in-process schedulers bundled here so the Roadmap Generator pipeline
 * runs end-to-end without an external queue:
 *
 *   1. draftScheduler (runs every 60s)
 *      - Pulls priority_translations rows with status = draft_awaiting_claude
 *      - Invokes Claude, writes claudeResponse, flips to draft_awaiting_review
 *      - Serialized per-row so we never double-charge Anthropic on retries
 *
 *   2. reminderScheduler (runs every 60min)
 *      - Pulls rows with status = draft_awaiting_review older than 48h
 *      - If reminder_sent_at is null, emails Marcin ("Roadmap pending —
 *        waiting your review") and stamps reminder_sent_at
 *
 * Both schedulers are `startable()` — idempotent, safe to call multiple
 * times, and return a stop() handle for tests.
 *
 * Deployment note: in a multi-instance Railway setup these intervals will
 * fire on every instance, which just means a bit of redundant Claude cost
 * on concurrent picks. The `status !== "draft_awaiting_claude"` early-exit
 * inside runClaudeDraftForRow makes double-picks idempotent. If volume
 * climbs, migrate to a real queue (BullMQ) and retire this worker.
 */

import { and, eq, isNull, lt, or } from "drizzle-orm";
import { getDb } from "../db";
import { priorityTranslations, portalAccounts, portalProperties } from "../../drizzle/schema.priorityTranslation";
import { runClaudeDraftForRow } from "../routers/priorityTranslation";
import { notifyOwner } from "../_core/notification";

const DRAFT_INTERVAL_MS = 60 * 1000;               // 1 min
const REMINDER_INTERVAL_MS = 60 * 60 * 1000;       // 1 hour
const REVIEW_OVERDUE_MS = 48 * 60 * 60 * 1000;     // 48 hours

let draftTimer: NodeJS.Timeout | null = null;
let reminderTimer: NodeJS.Timeout | null = null;
let draftInFlight = false;

async function tickDraftScheduler(): Promise<void> {
  if (draftInFlight) return; // single-flight guard; next tick will retry
  draftInFlight = true;
  try {
    const db = await getDb();
    if (!db) return;

    const rows = await db
      .select({ id: priorityTranslations.id })
      .from(priorityTranslations)
      .where(eq(priorityTranslations.status, "draft_awaiting_claude"))
      .limit(10);

    for (const row of rows) {
      try {
        await runClaudeDraftForRow(db, row.id);
        console.log(`[PT Worker] Claude draft ready for ${row.id}`);
      } catch (err) {
        console.error(`[PT Worker] Claude draft failed for ${row.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[PT Worker] draft scheduler error:", err);
  } finally {
    draftInFlight = false;
  }
}

async function tickReminderScheduler(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const cutoff = new Date(Date.now() - REVIEW_OVERDUE_MS);
    // Rows stuck in review for > 48h and we haven't pinged Marcin yet.
    const overdue = await db
      .select({
        id: priorityTranslations.id,
        createdAt: priorityTranslations.createdAt,
        firstName: portalAccounts.firstName,
        lastName: portalAccounts.lastName,
        street: portalProperties.street,
        city: portalProperties.city,
      })
      .from(priorityTranslations)
      .leftJoin(portalAccounts, eq(portalAccounts.id, priorityTranslations.portalAccountId))
      .leftJoin(portalProperties, eq(portalProperties.id, priorityTranslations.propertyId))
      .where(
        and(
          eq(priorityTranslations.status, "draft_awaiting_review"),
          lt(priorityTranslations.createdAt, cutoff),
          or(isNull(priorityTranslations.reminderSentAt), eq(priorityTranslations.reminderSentAt, new Date(0)))
        )
      );

    for (const row of overdue) {
      const customerName = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || "a customer";
      const location = [row.street, row.city].filter(Boolean).join(", ") || "an address on file";
      try {
        await notifyOwner({
          title: `Roadmap pending for ${customerName} — waiting your review`,
          content: [
            `Hey Marcin —`,
            ``,
            `A Roadmap Generator submission for ${customerName} (${location}) has been`,
            `waiting for your review for more than 48 hours.`,
            ``,
            `Open HP Estimator admin → Roadmap Reviews to edit the findings and`,
            `send it to the customer when you're ready.`,
            ``,
            `Record id: ${row.id}`,
          ].join("\n"),
        });
        await db
          .update(priorityTranslations)
          .set({ reminderSentAt: new Date(), updatedAt: new Date() })
          .where(eq(priorityTranslations.id, row.id));
        console.log(`[PT Worker] reminder sent for ${row.id}`);
      } catch (err) {
        console.error(`[PT Worker] reminder failed for ${row.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[PT Worker] reminder scheduler error:", err);
  }
}

/**
 * Starts both schedulers. Returns a stop() handle for tests / graceful
 * shutdown. Idempotent — calling start() twice does not double-schedule.
 */
export function startPriorityTranslationWorker(): { stop: () => void } {
  if (draftTimer || reminderTimer) {
    return { stop: stopPriorityTranslationWorker };
  }

  // Kick both once on startup so anything queued while the server was down
  // gets picked up right away; then on their respective intervals.
  tickDraftScheduler().catch(console.error);
  tickReminderScheduler().catch(console.error);

  draftTimer = setInterval(() => tickDraftScheduler().catch(console.error), DRAFT_INTERVAL_MS);
  reminderTimer = setInterval(() => tickReminderScheduler().catch(console.error), REMINDER_INTERVAL_MS);

  console.log("[PT Worker] Priority Translation worker started (draft: 60s, reminder: 1h)");
  return { stop: stopPriorityTranslationWorker };
}

export function stopPriorityTranslationWorker(): void {
  if (draftTimer) {
    clearInterval(draftTimer);
    draftTimer = null;
  }
  if (reminderTimer) {
    clearInterval(reminderTimer);
    reminderTimer = null;
  }
}

// Exposed for tests / manual runs.
export const __testable__ = {
  tickDraftScheduler,
  tickReminderScheduler,
  DRAFT_INTERVAL_MS,
  REMINDER_INTERVAL_MS,
  REVIEW_OVERDUE_MS,
};
