/**
 * server/lib/spotInspection/status.ts
 *
 * Pure lifecycle rules for a spot inspection row, kept apart so they can be
 * unit tested. The hard rule: nothing customer-visible exists before a human
 * approves the AI draft, so `completed` is reachable only from
 * `awaiting_review`.
 *
 *   submitted -> processing -> awaiting_review -> completed
 *        \           \-> failed                      |
 *         \-> processing (retry from failed) <-------/
 */
import type { PriorityTranslationStatus } from "../../../drizzle/schema.priorityTranslation";

const TRANSITIONS: Record<PriorityTranslationStatus, PriorityTranslationStatus[]> = {
  submitted: ["processing"],
  processing: ["awaiting_review", "failed"],
  awaiting_review: ["completed", "processing"], // re-generate is allowed before approval
  completed: [],
  failed: ["processing"],
};

export function canTransition(
  from: PriorityTranslationStatus,
  to: PriorityTranslationStatus,
): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function assertTransition(
  from: PriorityTranslationStatus,
  to: PriorityTranslationStatus,
): void {
  if (!canTransition(from, to)) {
    throw new Error(`Spot inspection cannot move from ${from} to ${to}`);
  }
}

/** The one gate that matters: delivery requires an approved-pending draft. */
export function canApprove(status: PriorityTranslationStatus): boolean {
  return status === "awaiting_review";
}
