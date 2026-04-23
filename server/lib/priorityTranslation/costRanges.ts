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
  { category: "Exterior siding — wood rot restoration", typical_low_usd: 850, typical_high_usd: 4800 },
  { category: "Exterior trim — restoration and paint", typical_low_usd: 1200, typical_high_usd: 5500 },
  { category: "Gutter — cleaning and re-pitch", typical_low_usd: 425, typical_high_usd: 950 },
  { category: "Gutter — replacement (aluminum, 180 LF)", typical_low_usd: 2800, typical_high_usd: 5400 },
  { category: "Chimney — crown and flashing restoration", typical_low_usd: 1400, typical_high_usd: 3600 },

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
