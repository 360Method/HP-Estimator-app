/**
 * Client-side sales tax resolution — the one place the three estimate UIs
 * (wizard review, PresentSection, EstimateSection) turn global tax settings
 * into a rate + dollar amount. Server-side resolution in estimate.send stays
 * as the backstop and must agree with this logic.
 */
import { CLARK_COUNTY_TAX_RATES } from './taxRates';
import type { GlobalSettings } from './types';

export interface ResolvedTax {
  /** Decimal rate, e.g. 0.089 */
  rate: number;
  /** Customer-safe label, e.g. "Vancouver (8.9%)" */
  label: string;
  /** WA DOR location code or 'custom' */
  code: string;
  /** Tax in dollars on totalPrice */
  taxAmount: number;
  /** totalPrice + taxAmount, dollars */
  grandTotal: number;
}

/**
 * Returns null when tax is off (disabled, 'none', or unresolvable code) —
 * callers treat null as "no tax line".
 */
export function resolveTax(
  global: Pick<GlobalSettings, 'taxEnabled' | 'taxRateCode' | 'customTaxPct'>,
  totalPrice: number,
): ResolvedTax | null {
  const taxEnabled = global.taxEnabled ?? false;
  const taxRateCode = global.taxRateCode ?? '0603';
  const customTaxPct = global.customTaxPct ?? 8.9;
  if (!taxEnabled || taxRateCode === 'none') return null;
  const info = taxRateCode === 'custom'
    ? { rate: customTaxPct / 100, label: `Custom (${customTaxPct}%)`, code: 'custom' }
    : CLARK_COUNTY_TAX_RATES.find(r => r.code === taxRateCode) ?? null;
  if (!info || info.rate <= 0) return null;
  const taxAmount = totalPrice * info.rate;
  return { rate: info.rate, label: info.label, code: info.code, taxAmount, grandTotal: totalPrice + taxAmount };
}
