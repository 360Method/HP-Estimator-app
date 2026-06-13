/**
 * client/src/lib/spotPrefill.ts
 *
 * Turns a spot-inspection seed (Opportunity.spotFindings) into a set of
 * pre-filled, editable estimate line items: ONE line per finding, all
 * visible together on the price check. A finding that confidently matches
 * a price-book row comes in priced from that row; everything else comes in
 * zero-cost and flagged "needs pricing" so the consultant sets the number.
 * Either way the consultant can edit, reprice, or delete each line, and add
 * more. Matching stays conservative: a wrong auto-price is worse than a
 * line the consultant prices by hand.
 */
import type { SpotFindingSeed } from "@/lib/types";

export type SpotSeedPbRow = {
  itemKey: string;
  name: string;
  category: string;
  unitType: string;
  laborMode: "hr" | "flat";
  laborRate: string;
  hrsPerUnit: string;
  flatRatePerUnit: string;
  hasTiers: boolean;
  tiersJson: string | null;
  defaultQty: string;
};

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

const STOPWORDS = new Set([
  "the", "and", "a", "an", "of", "in", "on", "to", "for", "with", "or",
  "per", "new", "repair", "replace", "replacement", "install", "installation",
]);

function significantTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
}

/**
 * Confident match: every significant token of the price-book row name
 * appears in the finding's text. Short or generic names (under two
 * significant tokens) never auto-match.
 */
function matchPriceBookRow(finding: SpotFindingSeed, rows: SpotSeedPbRow[]): SpotSeedPbRow | null {
  const haystack = [finding.category, finding.finding, finding.recommended_approach ?? ""]
    .join(" ")
    .toLowerCase();
  for (const row of rows) {
    const tokens = significantTokens(row.name);
    if (tokens.length < 2) continue;
    if (tokens.every((t) => haystack.includes(t))) return row;
  }
  return null;
}

/**
 * Build one editable line per finding. The whole set lands on the price
 * check so the consultant sees everything they picked, in one place. Each
 * line arrives PRICED so nothing reads as "needs pricing" out of the gate:
 *  - a confident price-book match comes in priced from that row;
 *  - otherwise the AI's planning range seeds the price. The range is a
 *    customer-facing retail bracket, so we start at its low end and back
 *    into the hard cost at the global margin (price = cost / (1 - gm)), put
 *    that into the material field, and leave labor at zero. The consultant
 *    refines or rebalances it; the customer price already lands in range.
 *  - only a finding with neither a match nor a positive range stays
 *    flagged for a hand price.
 * The whole line stays editable through the full calculator engine.
 */
export function seedCustomsFromSpotFindings(
  findings: SpotFindingSeed[],
  pbRows: SpotSeedPbRow[],
  spotInspectionId: string,
  globalMarkupPct = 0.4,
): SpotSeedCustom[] {
  const gm = globalMarkupPct > 0 && globalMarkupPct < 1 ? globalMarkupPct : 0.4;
  return findings.map((finding, idx) => {
    const description = (finding.recommended_approach || finding.finding || finding.category).slice(0, 300);
    const row = matchPriceBookRow(finding, pbRows);
    if (row) {
      let matCost = 0;
      if (row.hasTiers && row.tiersJson) {
        try { matCost = Number(JSON.parse(row.tiersJson)?.good?.rate ?? 0); } catch { /* none */ }
      }
      const laborHrsPerUnit = row.laborMode === "hr" ? parseFloat(row.hrsPerUnit) || 0 : 1;
      const laborRate = row.laborMode === "hr" ? parseFloat(row.laborRate) || 0 : parseFloat(row.flatRatePerUnit) || 0;
      const priced = matCost > 0 || laborRate > 0;
      return {
        description,
        notes: `spot:${spotInspectionId}:${idx}${priced ? "" : " needs-pricing"}`,
        unitType: row.unitType || "unit",
        qty: parseFloat(row.defaultQty) || 1,
        matCostPerUnit: matCost,
        laborHrsPerUnit,
        laborRate,
      };
    }
    // Seed from the AI's planning range: start at the low end so we never
    // auto-inflate a quote, and the consultant raises it toward the high end.
    const startPrice = finding.low > 0 ? finding.low : 0;
    if (startPrice > 0) {
      const hardCost = Math.round(startPrice * (1 - gm));
      return {
        description,
        notes: `spot:${spotInspectionId}:${idx}`,
        unitType: "unit",
        qty: 1,
        matCostPerUnit: hardCost,
        laborHrsPerUnit: 0,
        laborRate: 0,
      };
    }
    return {
      description,
      notes: `spot:${spotInspectionId}:${idx} needs-pricing`,
      unitType: "unit",
      qty: 1,
      matCostPerUnit: 0,
      laborHrsPerUnit: 1,
      laborRate: 0,
    };
  });
}

/** True when a spot-seeded line still has no price (blocks send, shows the badge). */
export function isUnpricedSpotItem(item: { notes?: string; matCostPerUnit: number; laborRate: number }): boolean {
  return !!item.notes?.startsWith("spot:") && item.matCostPerUnit <= 0 && item.laborRate <= 0;
}
