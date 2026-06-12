/**
 * closeSteps — the pure step machine for the on-site close flow.
 * Derives the presentation sequence from the close context so the page
 * component stays dumb and the skip rules are unit-testable:
 *   preflight → roadmap → membership → estimate → sign → pay → done
 * Skips: roadmap when there are no deliverables; membership when the
 * property is already enrolled; estimate/sign when nothing is synced; pay
 * when the deposit is zero or already paid. Sign stays in the sequence
 * after approval (the screen collapses to a banner) so re-entering the
 * flow mid-close lands somewhere sensible.
 */

export type CloseStepKey =
  | "preflight"
  | "roadmap"
  | "membership"
  | "estimate"
  | "sign"
  | "pay"
  | "done";

export interface CloseStepContext {
  hasRoadmap: boolean;
  alreadyMember: boolean;
  /** Latest presentable estimate status: sent | viewed | approved | null */
  estimateStatus: string | null;
  depositAmountCents: number;
  /** due | paid | null (no deposit invoice yet) */
  depositInvoiceStatus: string | null;
}

export function deriveCloseSteps(ctx: CloseStepContext): CloseStepKey[] {
  const steps: CloseStepKey[] = ["preflight"];
  if (ctx.hasRoadmap) steps.push("roadmap");
  if (!ctx.alreadyMember) steps.push("membership");
  if (ctx.estimateStatus) {
    steps.push("estimate", "sign");
    if (ctx.depositAmountCents > 0 && ctx.depositInvoiceStatus !== "paid") {
      steps.push("pay");
    }
  }
  steps.push("done");
  return steps;
}

/** Refresh-safe: resolve a ?step= value to a step actually in the sequence. */
export function normalizeStep(steps: CloseStepKey[], requested: string | null | undefined): CloseStepKey {
  if (requested && (steps as string[]).includes(requested)) return requested as CloseStepKey;
  return steps[0];
}

export function nextStep(steps: CloseStepKey[], current: CloseStepKey): CloseStepKey | null {
  const i = steps.indexOf(current);
  return i >= 0 && i < steps.length - 1 ? steps[i + 1] : null;
}

export function prevStep(steps: CloseStepKey[], current: CloseStepKey): CloseStepKey | null {
  const i = steps.indexOf(current);
  return i > 0 ? steps[i - 1] : null;
}
