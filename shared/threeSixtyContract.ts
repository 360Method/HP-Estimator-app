/**
 * 360° checkout wire contract — the SINGLE SOURCE OF TRUTH for the tier and
 * cadence identifiers that cross the wire between the funnel
 * (360.handypioneers.com), the marketing site, and this backend.
 *
 * The backend checkout routers build their Zod enums from these arrays, so the
 * accepted values cannot drift from the contract. The funnel ships a byte-for-
 * byte copy of this file (hp-360-funnel/client/src/contract/threeSixtyContract.ts)
 * and a test that asserts what it sends conforms — that pair is what prevents a
 * recurrence of the homeowner-checkout bug where the funnel sent the portfolio
 * vocabulary (exterior_shield/full_coverage/max) to the homeowner endpoint.
 *
 * KEEP IN SYNC across both repos. If you change anything here, copy this file
 * into the funnel and run the contract tests in both repos.
 */

/** Homeowner (single-property) 360 membership tiers. */
export const HOMEOWNER_TIERS = ["bronze", "silver", "gold"] as const;
export type HomeownerTier = (typeof HOMEOWNER_TIERS)[number];

/** Portfolio (multi-property) coverage tiers — a DIFFERENT vocabulary. */
export const PORTFOLIO_TIERS = ["exterior_shield", "full_coverage", "max"] as const;
export type PortfolioTier = (typeof PORTFOLIO_TIERS)[number];

/** Billing cadences (shared by both checkout flows). */
export const BILLING_CADENCES = ["monthly", "quarterly", "annual"] as const;
export type Cadence = (typeof BILLING_CADENCES)[number];

export function isHomeownerTier(v: string): v is HomeownerTier {
  return (HOMEOWNER_TIERS as readonly string[]).includes(v);
}
export function isPortfolioTier(v: string): v is PortfolioTier {
  return (PORTFOLIO_TIERS as readonly string[]).includes(v);
}

// ─── Stripe price env-key builders (the keys the backend resolves) ────────────

export function homeownerPriceEnvKey(tier: HomeownerTier, cadence: Cadence): string {
  return `STRIPE_PRICE_${tier.toUpperCase()}_${cadence.toUpperCase()}`;
}

const PORTFOLIO_KEY_SEGMENT: Record<PortfolioTier, string> = {
  exterior_shield: "EXTERIOR",
  full_coverage: "FULL",
  max: "MAX",
};

export function portfolioPriceEnvKey(tier: PortfolioTier, cadence: Cadence): string {
  return `STRIPE_PRICE_PORTFOLIO_${PORTFOLIO_KEY_SEGMENT[tier]}_${cadence.toUpperCase()}`;
}

export const INTERIOR_ADDON_PRICE_ENV_KEY = "STRIPE_PRICE_INTERIOR_ADDON_ANNUAL_PER_DOOR";

// ─── Home size bands (INTERNAL — never shown to customers) ────────────────────
// Mirror of the marketing site's bandForSqft (handy-pioneers-manus
// client/src/lib/tiers.ts). The roadmap-funnel OTO resolves the band
// SERVER-SIDE from the CRM properties row (tamper-resistant), so the band
// logic must live in this shared contract, not only in the frontend.

export const HOME_SIZE_BANDS = ["standard", "large", "estate", "grand"] as const;
export type HomeSizeBand = (typeof HOME_SIZE_BANDS)[number];

/** <2,000 → standard · 2,000–3,500 → large · 3,500–5,000 → estate · 5,000+ → grand */
export function bandForSqft(sqft: number | null | undefined): HomeSizeBand {
  if (!sqft || sqft <= 0) return "standard";
  if (sqft < 2000) return "standard";
  if (sqft < 3500) return "large";
  if (sqft < 5000) return "estate";
  return "grand";
}

/**
 * Size-banded Maximum-tier annual buy-now prices (the roadmap-funnel OTO).
 * New artifacts use the customer-facing tier vocabulary (MAX, not GOLD):
 * STRIPE_PRICE_MAX_ANNUAL_BUYNOW_{STANDARD|LARGE|ESTATE|GRAND}.
 * Amounts (cents): 124900 / 166900 / 200900 / 242900 — derived from the
 * published monthly grid × 12 × 0.70, rounded to the $9-ending convention.
 * Keep in sync with GOLD_BUYNOW_ANNUAL in handy-pioneers-manus tiers.ts.
 */
export function sizedBuynowPriceEnvKey(band: HomeSizeBand): string {
  return `STRIPE_PRICE_MAX_ANNUAL_BUYNOW_${band.toUpperCase()}`;
}

/**
 * The 19 membership-checkout Stripe price env keys the backend must have set:
 * 9 homeowner (3 tiers × 3 cadences) + 9 portfolio + 1 interior add-on.
 * (Turnover-cleaning prices are a separate product set, tracked in
 * stripe.prices.test.ts.)
 */
export function requiredMembershipPriceEnvKeys(): string[] {
  const keys: string[] = [];
  for (const t of HOMEOWNER_TIERS) for (const c of BILLING_CADENCES) keys.push(homeownerPriceEnvKey(t, c));
  for (const t of PORTFOLIO_TIERS) for (const c of BILLING_CADENCES) keys.push(portfolioPriceEnvKey(t, c));
  keys.push(INTERIOR_ADDON_PRICE_ENV_KEY);
  return keys;
}
