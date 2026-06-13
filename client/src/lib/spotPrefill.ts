/**
 * client/src/lib/spotPrefill.ts
 *
 * Turns a spot-inspection seed (Opportunity.spotFindings) into wizard
 * state: findings that confidently match a price-book row become normal
 * selections; everything else becomes a zero-cost custom line flagged
 * "needs pricing" so the price check is where the consultant sets the
 * number. Matching is deliberately conservative: a wrong auto-price is
 * worse than a flagged line.
 */
import type { SpotFindingSeed } from "@/lib/types";

export type SpotSeedPbRow = {
  itemKey: string;
  name: string;
  category: string;
  defaultQty: string;
};

export type SpotSeedResult = {
  /** Wizard selection entries for confidently matched price-book rows. */
  selection: Record<string, { qty: number; tier: "good" }>;
  /** Custom-item specs for everything that needs a human price. */
  customs: Array<{ description: string; notes: string }>;
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

export function seedSelectionFromSpotFindings(
  findings: SpotFindingSeed[],
  pbRows: SpotSeedPbRow[],
  spotInspectionId: string,
): SpotSeedResult {
  const selection: SpotSeedResult["selection"] = {};
  const customs: SpotSeedResult["customs"] = [];
  findings.forEach((finding, idx) => {
    const row = matchPriceBookRow(finding, pbRows);
    if (row && !selection[row.itemKey]) {
      selection[row.itemKey] = { qty: parseFloat(row.defaultQty) || 1, tier: "good" };
      return;
    }
    customs.push({
      description: (finding.recommended_approach || finding.finding).slice(0, 300),
      notes: `spot:${spotInspectionId}:${idx} needs-pricing`,
    });
  });
  return { selection, customs };
}

/** True when a custom item came from a spot seed and still has no price. */
export function isUnpricedSpotItem(item: { notes?: string; matCostPerUnit: number; laborRate: number }): boolean {
  return !!item.notes?.startsWith("spot:") &&
    item.notes.includes("needs-pricing") &&
    item.matCostPerUnit <= 0 &&
    item.laborRate <= 0;
}
