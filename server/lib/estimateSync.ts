/**
 * estimateSync — pro↔portal estimate reflection helpers (Phase F).
 *
 * Phase F closes the internal↔portal sync gaps one mutation at a time.
 * Gap #2: a portal decline must reach the pro-side pipeline the same way an
 * approval already does (approveEstimate sets the opportunity to Won + SSE).
 */

/**
 * Stage to move a linked opportunity to when its portal estimate is declined.
 * Returns null when the opportunity should be left alone:
 *  - job-area: the estimate was already converted; declining a stale portal
 *    copy must not kill live job work.
 *  - already at the target stage: nothing to do.
 */
export function declinedOpportunityStage(
  area: string | null | undefined,
  currentStage?: string | null,
): 'Rejected' | 'Lost' | null {
  const target = area === 'estimate' ? 'Rejected' : area === 'lead' ? 'Lost' : null;
  if (!target || currentStage === target) return null;
  return target;
}

export interface PortalEstimateSibling {
  id: number;
  estimateNumber: string;
  status: string;
}

/**
 * Gap #1: what to do with the existing portal estimates for an opportunity
 * when staff send (or re-send) an estimate.
 *  - blockedBy: the incoming number collides with an APPROVED estimate — a
 *    signed agreement is never overwritten; the caller should refuse and ask
 *    for a new number / change order.
 *  - supersedeIds: still-live unapproved siblings under OLD numbers; expire
 *    them so the customer only ever sees one live estimate per job. Approved,
 *    declined, and already-expired siblings are history and stay untouched.
 * A same-number unapproved row is neither blocked nor superseded: the
 * createPortalEstimate upsert refreshes it in place.
 */
export function planEstimateResend(
  existing: PortalEstimateSibling[],
  incomingNumber: string,
): { blockedBy: PortalEstimateSibling | null; supersedeIds: number[] } {
  const norm = (s: string) => s.trim().toLowerCase();
  const sameNumber = existing.find((e) => norm(e.estimateNumber) === norm(incomingNumber));
  if (sameNumber && sameNumber.status === 'approved') {
    return { blockedBy: sameNumber, supersedeIds: [] };
  }
  const LIVE = new Set(['pending', 'sent', 'viewed']);
  const supersedeIds = existing
    .filter((e) => norm(e.estimateNumber) !== norm(incomingNumber) && LIVE.has(e.status))
    .map((e) => e.id);
  return { blockedBy: null, supersedeIds };
}
