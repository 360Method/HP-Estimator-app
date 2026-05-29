/**
 * Sub eligibility (audit Rec 7) — encodes the BOS rule that a subcontractor
 * whose billed gross margin falls below the small-job floor must not be put on
 * small jobs. Canonical example: a carpenter at $100/hr cost billed at $150/hr
 * is 33% GM, which clears the 30% standard floor but fails the 40% small-job
 * (hard cost < $2,000) floor.
 *
 * Pure module — shared by the server guard and any UI. Reuses the single-source
 * floor rule in marginFloor.ts.
 */
import { minGmFor, SMALL_JOB_HARD_COST_THRESHOLD } from "./marginFloor";

/** Default customer-billed labor rate ($150/hr), matching appSettings. */
export const DEFAULT_BILLED_HOURLY_CENTS = 15000;

export interface SubEligibility {
  eligible: boolean;
  /** Sub gross margin at the billed rate (0..1). */
  subGm: number;
  /** Applicable GM floor for the job. */
  floor: number;
  isSmallJob: boolean;
  reason: string;
}

/** Gross margin of billing a sub: (billed - cost) / billed. */
export function subGrossMargin(costCents: number, billedCents: number): number {
  if (billedCents <= 0) return 0;
  return (billedCents - costCents) / billedCents;
}

/**
 * Decide whether a sub may be assigned to a job. Eligibility is only *gated* on
 * small jobs (the BOS rule); on standard jobs any sub is allowed. Fails open
 * when the job's hard cost is unknown (can't classify as small).
 */
export function isSubEligibleForJob(args: {
  subHourlyCostCents: number;
  billedHourlyCents?: number | null;
  jobHardCostCents: number | null | undefined;
}): SubEligibility {
  const billed =
    args.billedHourlyCents && args.billedHourlyCents > 0
      ? args.billedHourlyCents
      : DEFAULT_BILLED_HOURLY_CENTS;
  const subGm = subGrossMargin(args.subHourlyCostCents, billed);
  const hardCostDollars = (args.jobHardCostCents ?? 0) / 100;
  const isSmallJob = hardCostDollars > 0 && hardCostDollars < SMALL_JOB_HARD_COST_THRESHOLD;
  const floor = minGmFor(hardCostDollars);
  const eligible = !isSmallJob || subGm >= floor - 0.001;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const reason = !isSmallJob
    ? `Standard job — sub eligibility not gated (sub GM ${pct(subGm)}).`
    : eligible
      ? `Sub GM ${pct(subGm)} meets the ${pct(floor)} small-job floor.`
      : `Sub GM ${pct(subGm)} is below the ${pct(floor)} small-job floor (hard cost < $${SMALL_JOB_HARD_COST_THRESHOLD}). Use a lower-cost sub or in-house labor.`;
  return { eligible, subGm, floor, isSmallJob, reason };
}
