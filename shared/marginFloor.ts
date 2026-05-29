/**
 * Margin-floor rule — single source of truth for Handy Pioneers' gross-margin
 * non-negotiables. Pure (no deps), usable on both client and server.
 *
 * Rules (BOS / CLAUDE.md non-negotiables):
 *   - Standard job gross-margin floor: 30%
 *   - Small job (hard cost < $2,000) gross-margin floor: 40%
 *   - GM = (price - hardCost) / price
 *
 * The client calculator (client/src/lib/calc.ts) consumes this for its
 * price-side enforcement and UI flags; the server consumes it to independently
 * verify what the client persisted (so a forged/headless request can't bypass
 * the floor). Keep this the ONLY place the 0.30 / 0.40 / $2,000 constants live.
 */

export const MIN_GM_STANDARD = 0.3;
export const MIN_GM_SMALL_JOB = 0.4;
/** Hard cost (dollars) below which the 40% small-job floor applies. */
export const SMALL_JOB_HARD_COST_THRESHOLD = 2000;
/** Below this GM (but above the floor) a "low margin" warning is raised. */
export const LOW_MARGIN_WARN_GM = 0.35;

export type MarginStatus = "ok" | "warn" | "below_floor" | "empty";

export interface MarginAudit {
  hardCost: number;
  price: number;
  grossProfit: number;
  /** Gross margin as a ratio, 0..1. */
  gm: number;
  /** The applicable floor for this job (0.30 or 0.40). */
  minGM: number;
  isSmallJob: boolean;
  /** True when GM is below the applicable floor — the IDS-trigger condition. */
  belowFloor: boolean;
  /** Passes the floor but sits in the sub-35% warn band (standard jobs only). */
  lowMargin: boolean;
  status: MarginStatus;
}

/** The gross-margin floor that applies given a job's hard cost. */
export function minGmFor(hardCost: number): number {
  return hardCost < SMALL_JOB_HARD_COST_THRESHOLD ? MIN_GM_SMALL_JOB : MIN_GM_STANDARD;
}

/**
 * Compute the full margin audit for a job total. Matches the semantics of
 * calc.ts `getMarginFlag` exactly (the warn band only applies to standard jobs,
 * where the floor is below 35%).
 */
export function computeMarginAudit(hardCost: number, price: number): MarginAudit {
  const isSmallJob = hardCost < SMALL_JOB_HARD_COST_THRESHOLD;
  const minGM = minGmFor(hardCost);
  if (hardCost <= 0 || price <= 0) {
    return {
      hardCost,
      price,
      grossProfit: price - hardCost,
      gm: 0,
      minGM,
      isSmallJob,
      belowFloor: false,
      lowMargin: false,
      status: "empty",
    };
  }
  const grossProfit = price - hardCost;
  const gm = grossProfit / price;
  // -0.001 tolerance mirrors calc.ts (avoids float noise at the boundary).
  const belowFloor = gm < minGM - 0.001;
  const lowMargin = !belowFloor && gm < LOW_MARGIN_WARN_GM && minGM < LOW_MARGIN_WARN_GM;
  const status: MarginStatus = belowFloor ? "below_floor" : lowMargin ? "warn" : "ok";
  return { hardCost, price, grossProfit, gm, minGM, isSmallJob, belowFloor, lowMargin, status };
}

// ─── Basis-point helpers (integer bps for DB persistence; avoids float drift) ──
export function toBps(ratio: number): number {
  return Math.round(ratio * 10000);
}
export function fromBps(bps: number): number {
  return bps / 10000;
}
