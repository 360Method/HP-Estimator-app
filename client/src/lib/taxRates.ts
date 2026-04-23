/**
 * Clark County WA — ZIP code to sales tax rate lookup
 * Source: WA Department of Revenue, Q2 2026 rate tables
 * https://dor.wa.gov/taxes-rates/sales-and-use-tax-rates
 *
 * Each entry maps one or more ZIP codes to a WA DOR location code,
 * a human-readable label, and the combined state+local rate.
 *
 * Usage:
 *   import { getTaxRateForZip } from '@/lib/taxRates';
 *   const info = getTaxRateForZip('98683'); // { rate: 0.089, label: 'Vancouver (8.9%)', code: '0603' }
 */

export interface TaxRateInfo {
  /** WA DOR location code, e.g. "0603" */
  code: string;
  /** Human-readable label shown in dropdowns */
  label: string;
  /** Decimal rate, e.g. 0.089 for 8.9% */
  rate: number;
}

/**
 * Complete Clark County WA ZIP → tax rate mapping.
 * Multiple ZIPs can share the same entry (e.g. all Vancouver ZIPs → 0603).
 *
 * ZIP ranges sourced from USPS and cross-referenced with WA DOR Q2 2026.
 */
const ZIP_TAX_MAP: Record<string, TaxRateInfo> = {
  // ── Vancouver (8.9%) ─────────────────────────────────────────
  '98660': { code: '0603', label: 'Vancouver (8.9%)', rate: 0.089 },
  '98661': { code: '0603', label: 'Vancouver (8.9%)', rate: 0.089 },
  '98662': { code: '0603', label: 'Vancouver (8.9%)', rate: 0.089 },
  '98663': { code: '0603', label: 'Vancouver (8.9%)', rate: 0.089 },
  '98664': { code: '0603', label: 'Vancouver (8.9%)', rate: 0.089 },
  '98665': { code: '0603', label: 'Vancouver (8.9%)', rate: 0.089 },
  '98666': { code: '0603', label: 'Vancouver (8.9%)', rate: 0.089 },
  '98668': { code: '0603', label: 'Vancouver (8.9%)', rate: 0.089 },
  '98682': { code: '0603', label: 'Vancouver (8.9%)', rate: 0.089 },
  '98683': { code: '0603', label: 'Vancouver (8.9%)', rate: 0.089 },
  '98684': { code: '0603', label: 'Vancouver (8.9%)', rate: 0.089 },
  '98685': { code: '0603', label: 'Vancouver (8.9%)', rate: 0.089 },
  '98686': { code: '0603', label: 'Vancouver (8.9%)', rate: 0.089 },
  '98687': { code: '0603', label: 'Vancouver (8.9%)', rate: 0.089 },

  // ── Battle Ground (8.9%) ─────────────────────────────────────
  '98604': { code: '0601', label: 'Battle Ground (8.9%)', rate: 0.089 },

  // ── Camas (8.8%) ─────────────────────────────────────────────
  '98607': { code: '0602', label: 'Camas (8.8%)', rate: 0.088 },

  // ── La Center (8.8%) ─────────────────────────────────────────
  '98629': { code: '0611', label: 'La Center (8.8%)', rate: 0.088 },

  // ── Ridgefield (8.8%) ────────────────────────────────────────
  '98642': { code: '0604', label: 'Ridgefield (8.8%)', rate: 0.088 },

  // ── Washougal (8.6%) ─────────────────────────────────────────
  '98671': { code: '0605', label: 'Washougal (8.6%)', rate: 0.086 },

  // ── Woodland (7.9%) ──────────────────────────────────────────
  '98674': { code: '0607', label: 'Woodland (7.9%)', rate: 0.079 },

  // ── Yacolt (8.5%) ────────────────────────────────────────────
  '98675': { code: '0606', label: 'Yacolt (8.5%)', rate: 0.085 },

  // ── Clark County Unincorporated PTBA (8.7%) ──────────────────
  // Covers rural/unincorporated areas with public transit benefit area
  '98606': { code: '0666', label: 'Clark County Unincorp. PTBA (8.7%)', rate: 0.087 },
  '98622': { code: '0666', label: 'Clark County Unincorp. PTBA (8.7%)', rate: 0.087 },
  '98624': { code: '0666', label: 'Clark County Unincorp. PTBA (8.7%)', rate: 0.087 },
  '98625': { code: '0666', label: 'Clark County Unincorp. PTBA (8.7%)', rate: 0.087 },
  '98626': { code: '0666', label: 'Clark County Unincorp. PTBA (8.7%)', rate: 0.087 },
  '98640': { code: '0666', label: 'Clark County Unincorp. PTBA (8.7%)', rate: 0.087 },
  '98643': { code: '0666', label: 'Clark County Unincorp. PTBA (8.7%)', rate: 0.087 },
  '98648': { code: '0666', label: 'Clark County Unincorp. PTBA (8.7%)', rate: 0.087 },
  '98670': { code: '0666', label: 'Clark County Unincorp. PTBA (8.7%)', rate: 0.087 },
  '98672': { code: '0666', label: 'Clark County Unincorp. PTBA (8.7%)', rate: 0.087 },

  // ── Clark County Unincorporated (8.0%) ───────────────────────
  // Rural areas not within a city or PTBA boundary
  '98616': { code: '0600', label: 'Clark County Unincorp. (8.0%)', rate: 0.080 },
  '98639': { code: '0600', label: 'Clark County Unincorp. (8.0%)', rate: 0.080 },
  '98647': { code: '0600', label: 'Clark County Unincorp. (8.0%)', rate: 0.080 },
};

/**
 * Look up the WA sales tax rate for a given ZIP code.
 * Returns null if the ZIP is not in Clark County WA or is unrecognized.
 *
 * @param zip - 5-digit ZIP code string (leading zeros preserved)
 */
export function getTaxRateForZip(zip: string): TaxRateInfo | null {
  if (!zip) return null;
  const clean = zip.trim().slice(0, 5);
  return ZIP_TAX_MAP[clean] ?? null;
}

/**
 * All distinct Clark County tax rate entries, deduplicated by code.
 * Useful for populating dropdowns.
 */
export const CLARK_COUNTY_TAX_RATES: TaxRateInfo[] = [
  { code: 'none', label: 'No Tax (0%)', rate: 0 },
  { code: '0603', label: 'Vancouver (8.9%)', rate: 0.089 },
  { code: '0601', label: 'Battle Ground (8.9%)', rate: 0.089 },
  { code: '0602', label: 'Camas (8.8%)', rate: 0.088 },
  { code: '0611', label: 'La Center (8.8%)', rate: 0.088 },
  { code: '0604', label: 'Ridgefield (8.8%)', rate: 0.088 },
  { code: '0605', label: 'Washougal (8.6%)', rate: 0.086 },
  { code: '0607', label: 'Woodland (7.9%)', rate: 0.079 },
  { code: '0606', label: 'Yacolt (8.5%)', rate: 0.085 },
  { code: '0666', label: 'Clark County Unincorp. PTBA (8.7%)', rate: 0.087 },
  { code: '0600', label: 'Clark County Unincorp. (8.0%)', rate: 0.080 },
  { code: '0609', label: 'Cowlitz Tribe – Clark Unincorp. (8.0%)', rate: 0.080 },
  { code: 'custom', label: 'Custom rate…', rate: -1 },
];
