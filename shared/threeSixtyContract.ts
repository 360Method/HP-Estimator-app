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
