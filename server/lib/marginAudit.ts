/**
 * Server-side margin audit — derives the authoritative gross-margin fields for
 * an opportunity from its estimateSnapshot, using the shared floor rule. Lets
 * the server independently record/enforce the 30%/40% floors rather than
 * trusting the client calculator (Rec 1).
 */
import { computeMarginAudit, toBps } from "../../shared/marginFloor";

export interface OpportunityMarginFields {
  hardCostCents: number;
  grossMarginBps: number;
  minGmBps: number;
  isSmallJob: boolean;
  belowFloor: boolean;
  marginAuditedAt: string;
}

function num(v: unknown): number | null {
  return typeof v === "number" && isFinite(v) ? v : null;
}

/**
 * Pull {hardCost, price} (in dollars) out of an estimateSnapshot JSON string.
 * The client stores calc totals in dollars. Hard cost is read directly when
 * present, otherwise derived from price + GM (hardCost = price * (1 - gm)).
 * Returns null when the snapshot has no usable price.
 */
export function extractTotals(
  snapshotJson: string | null | undefined,
): { hardCost: number; price: number } | null {
  if (!snapshotJson) return null;
  let snap: unknown;
  try {
    snap = JSON.parse(snapshotJson);
  } catch {
    return null;
  }
  const t = (snap as { totals?: Record<string, unknown> })?.totals;
  if (!t || typeof t !== "object") return null;
  const price = num(t.totalPrice) ?? num(t.price);
  if (price == null || price <= 0) return null;
  let hardCost = num(t.totalHard) ?? num(t.hardCost);
  const gm = num(t.totalGM) ?? num(t.gm);
  if ((hardCost == null || hardCost <= 0) && gm != null) {
    hardCost = price * (1 - gm); // derive when hard cost not persisted in the snapshot
  }
  if (hardCost == null || hardCost < 0) return null;
  return { hardCost, price };
}

/**
 * Compute the opportunity margin DB fields from an estimateSnapshot, or null if
 * not derivable (caller should leave the columns untouched in that case).
 */
export function marginFieldsFromSnapshot(
  snapshotJson: string | null | undefined,
  nowIso: string = new Date().toISOString(),
): OpportunityMarginFields | null {
  const totals = extractTotals(snapshotJson);
  if (!totals) return null;
  const audit = computeMarginAudit(totals.hardCost, totals.price);
  return {
    hardCostCents: Math.round(totals.hardCost * 100),
    grossMarginBps: toBps(audit.gm),
    minGmBps: toBps(audit.minGM),
    isSmallJob: audit.isSmallJob,
    belowFloor: audit.belowFloor,
    marginAuditedAt: nowIso,
  };
}
