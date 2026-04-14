/**
 * 360° Method — Membership Tier Definitions & Discount Calculator
 * Delivered by Handy Pioneers
 *
 * Pricing uses clean round monthly equivalents when billed annually:
 *   Bronze  → $588/yr  = $49/mo equivalent
 *   Silver  → $948/yr  = $79/mo equivalent
 *   Gold    → $1,428/yr = $119/mo equivalent
 *
 * Monthly and quarterly options carry a small premium that makes
 * the annual rate feel like the obvious choice.
 *
 * Discount structure uses a step-ladder cap to protect margin on large jobs.
 */

export type MemberTier = "bronze" | "silver" | "gold";
export type BillingCadence = "monthly" | "quarterly" | "annual";

export interface TierPricing {
  /** Price per billing period in cents */
  monthly: number;
  quarterly: number;
  annual: number;
  /** Annual equivalent in cents (for comparison display) */
  annualEquivalent: {
    fromMonthly: number;
    fromQuarterly: number;
  };
  /** Savings vs. monthly billing, in cents */
  savingsVsMonthly: {
    quarterly: number;
    annual: number;
  };
  /** Clean monthly equivalent when billed annually (for display) */
  monthlyEquivalentAnnual: number;
}

export interface TierDefinition {
  id: MemberTier;
  label: string;
  tagline: string;
  pricing: TierPricing;
  /** Included seasonal visits per year */
  seasonalVisits: number;
  /** Whether the annual 360 Home Scan is included */
  includesAnnualScan: boolean;
  /** Labor bank credit added at enrollment and renewal, in cents */
  laborBankCreditCents: number;
  /** Whether priority scheduling is included */
  priorityScheduling: boolean;
  /** Human-readable feature list for marketing */
  features: string[];
  /** Discount brackets: sorted ascending by ceiling */
  discountBrackets: DiscountBracket[];
  /**
   * Stripe Price IDs for each cadence.
   * Set via environment / Stripe dashboard after creating products.
   * Populated in shared/stripeProducts.ts — imported at runtime.
   */
  stripePriceIds: {
    monthly: string;
    quarterly: string;
    annual: string;
  };
}

export interface DiscountBracket {
  /** Upper bound of this bracket in cents. Use Infinity for the final bracket. */
  ceilingCents: number;
  /** Discount rate as a decimal (e.g. 0.15 = 15%) */
  rate: number;
}

// ─── PRICING HELPER ──────────────────────────────────────────────────────────

function buildPricing(
  monthlyDollars: number,
  quarterlyDollars: number,
  annualDollars: number
): TierPricing {
  const monthly = Math.round(monthlyDollars * 100);
  const quarterly = Math.round(quarterlyDollars * 100);
  const annual = Math.round(annualDollars * 100);
  const fromMonthly = monthly * 12;
  const fromQuarterly = quarterly * 4;

  return {
    monthly,
    quarterly,
    annual,
    annualEquivalent: {
      fromMonthly,
      fromQuarterly,
    },
    savingsVsMonthly: {
      quarterly: fromMonthly - fromQuarterly,
      annual: fromMonthly - annual,
    },
    // Clean round monthly equivalent when billed annually
    monthlyEquivalentAnnual: Math.round(annual / 12),
  };
}

// ─── TIER DEFINITIONS ────────────────────────────────────────────────────────

export const TIER_DEFINITIONS: Record<MemberTier, TierDefinition> = {
  bronze: {
    id: "bronze",
    label: "Bronze",
    tagline: "Essential protection for the proactive homeowner",
    pricing: buildPricing(
      59,    // $59/mo
      169,   // $169/quarter  (saves $48/yr vs monthly)
      588,   // $588/yr = $49/mo equivalent (saves $120/yr vs monthly)
    ),
    seasonalVisits: 2,
    includesAnnualScan: true,
    laborBankCreditCents: 0,
    priorityScheduling: false,
    features: [
      "Annual 360° Home Scan ($350 value)",
      "2 seasonal visits — Spring & Fall",
      "5% off jobs up to $2,500",
      "3% off jobs $2,501–$10,000",
      "Documented property health report",
    ],
    discountBrackets: [
      { ceilingCents: 250000, rate: 0.05 },   // 5% on first $2,500
      { ceilingCents: 1000000, rate: 0.03 },  // 3% on $2,501–$10,000
      { ceilingCents: Infinity, rate: 0.00 }, // 0% above $10,000
    ],
    stripePriceIds: {
      monthly: "",
      quarterly: "",
      annual: "",
    },  // IDs resolved server-side via STRIPE_PRICE_360_BRONZE_* env vars
  },

  silver: {
    id: "silver",
    label: "Silver",
    tagline: "Full-season coverage with a labor credit cushion",
    pricing: buildPricing(
      99,    // $99/mo
      279,   // $279/quarter  (saves $48/yr vs monthly)
      948,   // $948/yr = $79/mo equivalent (saves $240/yr vs monthly)
    ),
    seasonalVisits: 4,
    includesAnnualScan: true,
    laborBankCreditCents: 20000, // $200
    priorityScheduling: false,
    features: [
      "Annual 360° Home Scan ($350 value)",
      "4 seasonal visits — all seasons",
      "$200 labor bank credit",
      "10% off jobs up to $2,500",
      "5% off jobs $2,501–$10,000",
      "2% off jobs above $10,000",
      "Documented property health report",
    ],
    discountBrackets: [
      { ceilingCents: 250000, rate: 0.10 },   // 10% on first $2,500
      { ceilingCents: 1000000, rate: 0.05 },  // 5% on $2,501–$10,000
      { ceilingCents: Infinity, rate: 0.02 }, // 2% above $10,000
    ],
    stripePriceIds: {
      monthly: "",
      quarterly: "",
      annual: "",
    },  // IDs resolved server-side via STRIPE_PRICE_360_SILVER_* env vars
  },

  gold: {
    id: "gold",
    label: "Gold",
    tagline: "Maximum coverage, priority service, and the biggest savings",
    pricing: buildPricing(
      149,   // $149/mo
      419,   // $419/quarter  (saves $48/yr vs monthly)
      1428,  // $1,428/yr = $119/mo equivalent (saves $360/yr vs monthly)
    ),
    seasonalVisits: 4,
    includesAnnualScan: true,
    laborBankCreditCents: 50000, // $500
    priorityScheduling: true,
    features: [
      "Annual 360° Home Scan ($350 value)",
      "4 seasonal visits — all seasons",
      "$500 labor bank credit",
      "Priority scheduling",
      "15% off jobs up to $2,500",
      "8% off jobs $2,501–$10,000",
      "3% off jobs above $10,000",
      "Documented property health report",
    ],
    discountBrackets: [
      { ceilingCents: 250000, rate: 0.15 },   // 15% on first $2,500
      { ceilingCents: 1000000, rate: 0.08 },  // 8% on $2,501–$10,000
      { ceilingCents: Infinity, rate: 0.03 }, // 3% above $10,000
    ],
    stripePriceIds: {
      monthly: "",
      quarterly: "",
      annual: "",
    },  // IDs resolved server-side via STRIPE_PRICE_360_GOLD_* env vars
  },
};

// ─── PRICING DISPLAY HELPERS ─────────────────────────────────────────────────

/** Format cents as a dollar string, e.g. 4900 → "$49" */
export function formatDollars(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0
    ? `$${dollars.toFixed(0)}`
    : `$${dollars.toFixed(2)}`;
}

/** Get the price for a given tier and cadence */
export function getTierPrice(tier: MemberTier, cadence: BillingCadence): number {
  return TIER_DEFINITIONS[tier].pricing[cadence];
}

/** Get annual equivalent cost for display comparison */
export function getAnnualEquivalent(tier: MemberTier, cadence: BillingCadence): number {
  const pricing = TIER_DEFINITIONS[tier].pricing;
  if (cadence === "annual") return pricing.annual;
  if (cadence === "quarterly") return pricing.annualEquivalent.fromQuarterly;
  return pricing.annualEquivalent.fromMonthly;
}

/** Get savings vs monthly billing */
export function getSavingsVsMonthly(tier: MemberTier, cadence: BillingCadence): number {
  if (cadence === "monthly") return 0;
  return TIER_DEFINITIONS[tier].pricing.savingsVsMonthly[cadence];
}

// ─── DISCOUNT CALCULATOR ─────────────────────────────────────────────────────

/**
 * Calculate the total member discount for a job.
 *
 * @param tier - The member's tier
 * @param jobTotalCents - The job total in cents (before discount)
 * @returns The discount amount in cents
 *
 * @example
 * // Gold member, $15,000 job
 * calcMemberDiscount("gold", 1500000)
 * // => 112500 ($1,125 — effective rate 7.5%, not flat 15%)
 */
export function calcMemberDiscount(tier: MemberTier, jobTotalCents: number): number {
  const brackets = TIER_DEFINITIONS[tier].discountBrackets;
  let remaining = jobTotalCents;
  let previousCeiling = 0;
  let totalDiscount = 0;

  for (const bracket of brackets) {
    if (remaining <= 0) break;

    const bracketSize =
      bracket.ceilingCents === Infinity
        ? remaining
        : Math.min(remaining, bracket.ceilingCents - previousCeiling);

    const amountInBracket = Math.min(remaining, bracketSize);
    totalDiscount += Math.round(amountInBracket * bracket.rate);
    remaining -= amountInBracket;
    if (bracket.ceilingCents !== Infinity) {
      previousCeiling = bracket.ceilingCents;
    }
  }

  return totalDiscount;
}

/**
 * Returns the effective discount rate as a percentage string for display.
 * e.g. "7.5%" for a $15,000 Gold job.
 */
export function effectiveDiscountRate(tier: MemberTier, jobTotalCents: number): string {
  if (jobTotalCents === 0) return "0%";
  const discount = calcMemberDiscount(tier, jobTotalCents);
  const rate = (discount / jobTotalCents) * 100;
  return `${rate % 1 === 0 ? rate.toFixed(0) : rate.toFixed(1)}%`;
}

/**
 * Returns the max headline discount percentage for a tier (for marketing copy).
 */
export function headlineDiscountPct(tier: MemberTier): number {
  return TIER_DEFINITIONS[tier].discountBrackets[0].rate * 100;
}

export const ALL_TIERS: MemberTier[] = ["bronze", "silver", "gold"];

/**
 * Cadence labels for display
 */
export const CADENCE_LABELS: Record<BillingCadence, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

/**
 * Cadence interval for Stripe subscription creation
 */
export const CADENCE_STRIPE_INTERVAL: Record<BillingCadence, { interval: string; interval_count: number }> = {
  monthly: { interval: "month", interval_count: 1 },
  quarterly: { interval: "month", interval_count: 3 },
  annual: { interval: "year", interval_count: 1 },
};
