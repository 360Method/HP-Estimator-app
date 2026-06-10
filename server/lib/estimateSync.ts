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
