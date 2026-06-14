/**
 * client/src/lib/spotPrefill.ts
 *
 * Turns a spot-inspection seed (Opportunity.spotFindings) into a set of
 * pre-filled, editable estimate line items: ONE line per finding, all
 * visible together on the price check, each PRICED from the inspection's
 * own planning range so nothing reads as "needs pricing" out of the gate.
 *
 * The range is a customer-facing retail bracket, so we start at its
 * midpoint and back into the hard cost at the global margin (price = cost /
 * (1 - gm)), drop that into the material field, and leave labor at zero. The
 * full calculator engine drives the line from there, so the consultant
 * rebalances material vs. labor, changes the margin, or raises the price
 * toward the high end. We deliberately do NOT guess a price-book SKU: a
 * loose match can land far below the finding's own estimate, which is
 * worse than starting from the number the inspection already gave.
 */
import type { SpotFindingSeed } from "@/lib/types";

/** One pre-filled estimate line, ready to hand to addCustomItem. */
export type SpotSeedCustom = {
  description: string;
  notes: string;
  unitType: string;
  qty: number;
  matCostPerUnit: number;
  laborHrsPerUnit: number;
  laborRate: number;
};

export function seedCustomsFromSpotFindings(
  findings: SpotFindingSeed[],
  spotInspectionId: string,
  globalMarkupPct = 0.4,
): SpotSeedCustom[] {
  const gm = globalMarkupPct > 0 && globalMarkupPct < 1 ? globalMarkupPct : 0.4;
  return findings.map((finding, idx) => {
    const description = (finding.recommended_approach || finding.finding || finding.category).slice(0, 300);
    // Start at the midpoint of the range, a balanced planning baseline the
    // consultant nudges up or down to fit the scope.
    const low = finding.low > 0 ? finding.low : 0;
    const high = finding.high > low ? finding.high : low;
    const startPrice = low > 0 ? (low + high) / 2 : 0;
    const hardCost = startPrice > 0 ? Math.round(startPrice * (1 - gm)) : 0;
    return {
      description,
      notes: `spot:${spotInspectionId}:${idx}${hardCost > 0 ? "" : " needs-pricing"}`,
      unitType: "unit",
      qty: 1,
      matCostPerUnit: hardCost,
      laborHrsPerUnit: 0,
      laborRate: 0,
    };
  });
}

/** True when a spot-seeded line still has no price (blocks send, shows the badge). */
export function isUnpricedSpotItem(item: { notes?: string; matCostPerUnit: number; laborRate: number }): boolean {
  return !!item.notes?.startsWith("spot:") && item.matCostPerUnit <= 0 && item.laborRate <= 0;
}
