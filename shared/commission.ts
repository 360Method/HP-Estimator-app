/**
 * Consultant commission rule (HP-SOP-205): single source of truth, pure and
 * usable on both client and server.
 *
 * The deal: each consultant has a personal rate (< 10% of job price, in bps).
 * Commission is owed ONLY when the job carried 40%+ gross margin at sale
 * (an eligibility gate: the 30/40 send floors in marginFloor.ts are separate
 * and unchanged), and becomes payable once the customer has paid in full.
 * "Paid out" is a manual ledger action, recorded as commissionPaidAt.
 *
 * Everything here is INTERNAL: commission figures never reach the portal.
 */

/** Gross-margin eligibility gate: jobs below 40% GM at sale pay no commission. */
export const COMMISSION_GATE_GM_BPS = 4000;
/** Personal rates must stay under 10% of job price. */
export const MAX_COMMISSION_RATE_BPS = 1000;

export type CommissionStatus =
  | "ineligible"       // GM at sale below the 40% gate: commission is zero
  | "awaiting_payment" // gate cleared, customer has not yet paid in full
  | "payable"          // gate cleared and fully collected: owed now
  | "paid_out";        // manually marked paid

export function commissionStatus(args: {
  /** Gross margin at sale in basis points (opportunities.grossMarginBps). */
  grossMarginBps: number | null | undefined;
  /** True when every invoice on the job is collected. */
  fullyPaid: boolean;
  /** Set when the Integrator marked this commission paid out. */
  commissionPaidAt: Date | string | null | undefined;
}): CommissionStatus {
  const gm = args.grossMarginBps;
  if (gm == null || gm < COMMISSION_GATE_GM_BPS) return "ineligible";
  if (args.commissionPaidAt) return "paid_out";
  return args.fullyPaid ? "payable" : "awaiting_payment";
}

/**
 * Commission amount in cents: rate (bps) applied to the job price (cents).
 * Rates at or above the 10% cap are treated as misconfiguration and pay zero
 * rather than silently overpaying.
 */
export function commissionCents(priceCents: number, rateBps: number): number {
  if (!Number.isFinite(priceCents) || priceCents <= 0) return 0;
  if (!Number.isFinite(rateBps) || rateBps <= 0 || rateBps >= MAX_COMMISSION_RATE_BPS) return 0;
  return Math.round((priceCents * rateBps) / 10000);
}
