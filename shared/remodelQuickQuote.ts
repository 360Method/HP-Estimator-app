/**
 * Remodel quick-quote math (360 Method Step 8, Upgrade).
 *
 * Pure functions for the on-site value consultation: the consultant measures
 * the room, picks a preset, and the app shows Good / Better / Best retail
 * ranges instantly. Every figure in this module is RETAIL (customer price,
 * margins already baked into the preset rates). No cost, markup, or margin
 * fields exist here at all, so nothing can leak to a customer screen.
 *
 * The quoted range is a conversation starter, not a contract: firming up the
 * scope happens in the estimate wizard, where the margin audit still gates
 * every send.
 */
import { calcMemberDiscount, type MemberTier } from "./threeSixtyTiers";

export type QuoteTierKey = "good" | "better" | "best";

export const QUOTE_TIER_ORDER: QuoteTierKey[] = ["good", "better", "best"];

export interface QuoteTierRates {
  /** Retail dollars per unit (sqft), low and high bound. */
  rateLow: number;
  rateHigh: number;
  /** Customer-facing materials story for this tier. */
  name: string;
  desc: string;
}

export interface QuoteLfAddon {
  key: string;
  label: string;
  /** Retail dollars per lineal foot. */
  rateLow: number;
  rateHigh: number;
}

export interface QuotePreset {
  presetKey: string;
  label: string;
  description: string;
  unitType: string; // 'sqft'
  tiers: Record<QuoteTierKey, QuoteTierRates>;
  lfAddons: QuoteLfAddon[];
  /** Fixed retail floor so a tiny room never prices absurdly low. */
  baseFeeLow: number;
  baseFeeHigh: number;
  /** Smallest sqft the preset is calibrated for (display hint, not a hard stop). */
  minSqft: number;
}

export interface QuoteMeasurements {
  sqft: number;
  /** Lineal feet entered per addon key. */
  lfByAddon?: Record<string, number>;
}

export interface QuoteTierResult {
  tier: QuoteTierKey;
  name: string;
  desc: string;
  /** Retail range in whole dollars, rounded to hundreds. */
  low: number;
  high: number;
  /** Member savings on each bound, present only when a member tier was given. */
  memberSavingsLow?: number;
  memberSavingsHigh?: number;
}

export interface QuickQuoteResult {
  tiers: QuoteTierResult[];
  sqft: number;
  belowMinSqft: boolean;
}

/** Round a retail figure to a presentation-friendly hundred. */
export function roundToHundred(n: number): number {
  return Math.round(n / 100) * 100;
}

function boundTotal(
  preset: QuotePreset,
  rates: QuoteTierRates,
  m: QuoteMeasurements,
  bound: "low" | "high",
): number {
  const rate = bound === "low" ? rates.rateLow : rates.rateHigh;
  const baseFee = bound === "low" ? preset.baseFeeLow : preset.baseFeeHigh;
  const area = Math.max(baseFee, rate * m.sqft);
  let addons = 0;
  for (const addon of preset.lfAddons) {
    const lf = m.lfByAddon?.[addon.key] ?? 0;
    if (lf <= 0) continue;
    addons += (bound === "low" ? addon.rateLow : addon.rateHigh) * lf;
  }
  return area + addons;
}

/**
 * Compute the Good / Better / Best retail ranges for a measured room.
 * Pass the customer's membership tier to also show what membership saves;
 * the saving is display information, the quoted range stays the retail range.
 */
export function computeQuickQuote(
  preset: QuotePreset,
  measurements: QuoteMeasurements,
  memberTier?: MemberTier | null,
): QuickQuoteResult {
  const sqft = Math.max(0, measurements.sqft);
  const m = { ...measurements, sqft };

  const tiers: QuoteTierResult[] = QUOTE_TIER_ORDER.map((tier) => {
    const rates = preset.tiers[tier];
    let low = roundToHundred(boundTotal(preset, rates, m, "low"));
    let high = roundToHundred(boundTotal(preset, rates, m, "high"));
    if (high < low) high = low;

    const result: QuoteTierResult = { tier, name: rates.name, desc: rates.desc, low, high };
    if (memberTier) {
      result.memberSavingsLow = calcMemberDiscount(memberTier, low * 100) / 100;
      result.memberSavingsHigh = calcMemberDiscount(memberTier, high * 100) / 100;
    }
    return result;
  });

  return { tiers, sqft, belowMinSqft: sqft > 0 && sqft < preset.minSqft };
}

/** Parse the DB tiersJson/lfAddonsJson text columns into a typed preset. */
export function presetFromRow(row: {
  presetKey: string;
  label: string;
  description: string | null;
  unitType: string;
  tiersJson: string;
  lfAddonsJson: string | null;
  baseFeeLow: string | number;
  baseFeeHigh: string | number;
  minSqft: string | number;
}): QuotePreset | null {
  try {
    const tiers = JSON.parse(row.tiersJson) as Record<QuoteTierKey, QuoteTierRates>;
    for (const key of QUOTE_TIER_ORDER) {
      const t = tiers[key];
      if (!t || typeof t.rateLow !== "number" || typeof t.rateHigh !== "number") return null;
    }
    const lfAddons = row.lfAddonsJson ? (JSON.parse(row.lfAddonsJson) as QuoteLfAddon[]) : [];
    return {
      presetKey: row.presetKey,
      label: row.label,
      description: row.description ?? "",
      unitType: row.unitType,
      tiers,
      lfAddons: Array.isArray(lfAddons) ? lfAddons : [],
      baseFeeLow: Number(row.baseFeeLow),
      baseFeeHigh: Number(row.baseFeeHigh),
      minSqft: Number(row.minSqft),
    };
  } catch {
    return null;
  }
}
