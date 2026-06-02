/**
 * server/lib/priorityTranslation/costRanges.ts
 *
 * Clark County, Washington investment ranges for common inspection findings.
 * These numbers are the initial source of truth for the 360° Priority
 * Translation lead magnet. Upper bound reflects HP's 30% minimum gross-margin
 * rule (40% under $2,000 hard cost per hp-estimate-builder-v1 policy).
 *
 * TODO: move to CMS (nucleus) — admin-editable table. See
 *   docs/NUCLEUS_MIGRATION.md once drafted.
 *
 * Format: category → { typical_low, typical_high, notes }
 * Values are USD, fully-loaded customer price (materials + labor + margin).
 * Claude uses these as an anchor when no direct range is extractable from
 * the inspection report. For items not in this table Claude falls back to
 * a general heuristic documented in prompt.ts.
 */

export type CostRange = {
  category: string;
  typical_low_usd: number;
  typical_high_usd: number;
  notes?: string;
};

export const COST_RANGES: readonly CostRange[] = [
  // ─── Roofing ─────────────────────────────────────────────────────────────
  { category: "Roof — minor flashing restoration", typical_low_usd: 650, typical_high_usd: 1800 },
  { category: "Roof — partial shingle replacement", typical_low_usd: 1800, typical_high_usd: 6500 },
  { category: "Roof — full composition replacement", typical_low_usd: 14000, typical_high_usd: 32000, notes: "3,000 sq ft home, 30-year architectural" },

  // ─── Exterior envelope ──────────────────────────────────────────────────
  { category: "Exterior siding — localized wood-rot restoration (spot repair)", typical_low_usd: 850, typical_high_usd: 4800, notes: "spot/section repair only — NOT a full re-side" },
  { category: "Exterior — full re-side / re-clad (whole home)", typical_low_usd: 18000, typical_high_usd: 60000, notes: "SCALE by wall area (≈ living sqft × 1.6–2.2 for 1–2 story) and material at ~$9–$18/sqft of wall: vinyl/LP lower end, cedar/fiber-cement upper end" },
  { category: "Exterior trim — restoration and paint (spot)", typical_low_usd: 1200, typical_high_usd: 5500 },
  { category: "Exterior — full repaint, body + trim (whole home)", typical_low_usd: 4500, typical_high_usd: 14000, notes: "SCALE by wall area + stories, ~$2–$4.50/sqft of wall" },
  { category: "Gutter — cleaning and re-pitch", typical_low_usd: 425, typical_high_usd: 950 },
  { category: "Gutter — replacement (aluminum)", typical_low_usd: 2800, typical_high_usd: 5400, notes: "~$15–$30/LF; ~180 LF on a typical single-story footprint — SCALE by roof perimeter" },
  { category: "Chimney — crown and flashing restoration", typical_low_usd: 1400, typical_high_usd: 3600 },

  // ─── Interior finishes ───────────────────────────────────────────────────
  { category: "Interior — whole-home repaint, walls/trim/doors", typical_low_usd: 4500, typical_high_usd: 14000, notes: "SCALE ~$2.50–$5.00/living sqft including trim and doors" },
  { category: "Flooring — replacement (per room / per sqft)", typical_low_usd: 1800, typical_high_usd: 9500, notes: "SCALE by area, ~$6–$16/sqft installed by material" },

  // ─── Plumbing ────────────────────────────────────────────────────────────
  { category: "Plumbing — single fixture replacement", typical_low_usd: 425, typical_high_usd: 1200 },
  { category: "Plumbing — supply line restoration (pex repipe, partial)", typical_low_usd: 1800, typical_high_usd: 5400 },
  { category: "Plumbing — water heater replacement (50 gal gas)", typical_low_usd: 2400, typical_high_usd: 4200 },
  { category: "Plumbing — tankless water heater install", typical_low_usd: 4800, typical_high_usd: 8500 },

  // ─── Electrical ──────────────────────────────────────────────────────────
  { category: "Electrical — GFCI/AFCI outlet replacement (per circuit)", typical_low_usd: 250, typical_high_usd: 650 },
  { category: "Electrical — panel replacement (200A service)", typical_low_usd: 3800, typical_high_usd: 7200 },
  { category: "Electrical — knob-and-tube remediation", typical_low_usd: 8500, typical_high_usd: 22000 },

  // ─── HVAC ────────────────────────────────────────────────────────────────
  { category: "HVAC — maintenance tune-up", typical_low_usd: 285, typical_high_usd: 475 },
  { category: "HVAC — furnace replacement (80k BTU)", typical_low_usd: 5400, typical_high_usd: 9800 },
  { category: "HVAC — heat pump replacement (3-ton)", typical_low_usd: 9500, typical_high_usd: 16500 },
  { category: "HVAC — ductwork sealing and rebalance", typical_low_usd: 1800, typical_high_usd: 4200 },

  // ─── Foundation / structural ─────────────────────────────────────────────
  { category: "Foundation — crack seal (minor, < 1/8 in)", typical_low_usd: 650, typical_high_usd: 1800 },
  { category: "Foundation — structural underpinning (per pier)", typical_low_usd: 1800, typical_high_usd: 3400 },
  { category: "Crawlspace — vapor barrier and drainage", typical_low_usd: 2200, typical_high_usd: 6400 },

  // ─── Windows / doors ─────────────────────────────────────────────────────
  { category: "Window — weatherstrip and glazing restoration", typical_low_usd: 285, typical_high_usd: 750 },
  { category: "Window — single replacement (vinyl, standard size)", typical_low_usd: 950, typical_high_usd: 2200 },
  { category: "Windows — full-home replacement (all units)", typical_low_usd: 9500, typical_high_usd: 30000, notes: "SCALE by window count (~1 window per 100–120 living sqft) × $950–$2,200 each" },
  { category: "Exterior door — weatherization", typical_low_usd: 285, typical_high_usd: 850 },
  { category: "Exterior door — full replacement", typical_low_usd: 1800, typical_high_usd: 4800 },

  // ─── Drainage / grading ──────────────────────────────────────────────────
  { category: "Grading — regrade at foundation (per side)", typical_low_usd: 850, typical_high_usd: 2400 },
  { category: "Drainage — French drain installation (50 LF)", typical_low_usd: 3800, typical_high_usd: 8400 },

  // ─── Safety / urgent ─────────────────────────────────────────────────────
  { category: "Safety — smoke/CO detector replacement (whole home)", typical_low_usd: 425, typical_high_usd: 950 },
  { category: "Safety — radon mitigation system", typical_low_usd: 1800, typical_high_usd: 3800 },
  { category: "Safety — egress window install", typical_low_usd: 2800, typical_high_usd: 5400 },
] as const;

/** Fuzzy lookup — returns null if no category match. */
export function findCostRange(category: string): CostRange | null {
  const needle = category.toLowerCase();
  return (
    COST_RANGES.find((r) => r.category.toLowerCase().includes(needle)) ??
    COST_RANGES.find((r) => needle.includes(r.category.toLowerCase().split(" — ")[0])) ??
    null
  );
}
