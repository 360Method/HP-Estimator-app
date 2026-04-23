/**
 * 360° Method — Membership Tier Definitions & Discount Calculator
 * Delivered by Handy Pioneers
 *
 * DB keys stay as bronze / silver / gold to avoid a destructive migration.
 * Display labels match 360.handypioneers.com:
 *   bronze  → "Essential"           $59/mo  | $169/quarter | $588/yr ($49/mo equiv)
 *   silver  → "Full Coverage"       $99/mo  | $279/quarter | $948/yr ($79/mo equiv)
 *   gold    → "Maximum Protection"  $149/mo | $419/quarter | $1,428/yr ($119/mo equiv)
 *
 * Discount brackets match 360.handypioneers.com (step-ladder, by job size):
 *   Essential:          5% / 3% / 1.5%
 *   Full Coverage:      8% / 5% / 2.5%
 *   Maximum Protection: 12% / 8% / 4%
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
  /** Which seasons are included */
  seasons: string[];
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
  /** Discount rate as a decimal (e.g. 0.12 = 12%) */
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
  // DB key: "bronze" → display: "Essential"
  bronze: {
    id: "bronze",
    label: "Essential",
    tagline: "Protect the basics. Catch problems early.",
    pricing: buildPricing(
      59,   // $59/mo
      169,  // $169/quarter (~5% savings vs monthly)
      588,  // $588/yr = $49/mo equivalent (~17% savings vs monthly)
    ),
    seasonalVisits: 2,
    seasons: ["Spring", "Fall"],
    includesAnnualScan: true,
    laborBankCreditCents: 0,
    priorityScheduling: false,
    features: [
      "Annual 360° Home Scan (2–3 hr documented assessment)",
      "2 seasonal visits — Spring & Fall",
      "Prioritized repair report with cost estimates",
      "Member discount on all out-of-scope jobs",
      "HP direct line — no hold queues",
    ],
    discountBrackets: [
      { ceilingCents: 100000, rate: 0.05 },    // 5% on jobs under $1,000
      { ceilingCents: 500000, rate: 0.03 },    // 3% on $1,000–$5,000
      { ceilingCents: Infinity, rate: 0.015 }, // 1.5% on jobs over $5,000
    ],
    stripePriceIds: {
      monthly: "",
      quarterly: "",
      annual: "",
    },
  },

  // DB key: "silver" → display: "Full Coverage"
  silver: {
    id: "silver",
    label: "Full Coverage",
    tagline: "Four seasons of protection + pre-paid labor.",
    pricing: buildPricing(
      99,   // $99/mo
      279,  // $279/quarter (~5% savings vs monthly)
      948,  // $948/yr = $79/mo equivalent (~20% savings vs monthly)
    ),
    seasonalVisits: 4,
    seasons: ["Spring", "Summer", "Fall", "Winter"],
    includesAnnualScan: true,
    laborBankCreditCents: 30000, // $300
    priorityScheduling: false,
    features: [
      "Everything in Essential, plus:",
      "4 seasonal visits — all 4 seasons",
      "$300 labor bank credit (use on any handyman task)",
      "Summer visit — dry-season exterior + HVAC prep",
      "Winter visit — freeze protection + moisture inspection",
      "Annual maintenance report for home equity documentation",
    ],
    discountBrackets: [
      { ceilingCents: 100000, rate: 0.08 },    // 8% on jobs under $1,000
      { ceilingCents: 500000, rate: 0.05 },    // 5% on $1,000–$5,000
      { ceilingCents: Infinity, rate: 0.025 }, // 2.5% on jobs over $5,000
    ],
    stripePriceIds: {
      monthly: "",
      quarterly: "",
      annual: "",
    },
  },

  // DB key: "gold" → display: "Maximum Protection"
  gold: {
    id: "gold",
    label: "Maximum Protection",
    tagline: "The full system. Priority access. Maximum savings.",
    pricing: buildPricing(
      149,  // $149/mo
      419,  // $419/quarter (~6% savings vs monthly)
      1428, // $1,428/yr = $119/mo equivalent (~20% savings vs monthly)
    ),
    seasonalVisits: 4,
    seasons: ["Spring", "Summer", "Fall", "Winter"],
    includesAnnualScan: true,
    laborBankCreditCents: 60000, // $600
    priorityScheduling: true,
    features: [
      "Everything in Full Coverage, plus:",
      "4 seasonal visits — all 4 seasons + priority",
      "$600 labor bank credit — you're ahead after month 5",
      "Priority scheduling — your calls go first",
      "Dedicated HP account manager",
      "Pre-negotiated sub-contractor rates on major work",
      "Home equity maintenance log for refinancing or sale",
    ],
    discountBrackets: [
      { ceilingCents: 100000, rate: 0.12 },   // 12% on jobs under $1,000
      { ceilingCents: 500000, rate: 0.08 },   // 8% on $1,000–$5,000
      { ceilingCents: Infinity, rate: 0.04 }, // 4% on jobs over $5,000
    ],
    stripePriceIds: {
      monthly: "",
      quarterly: "",
      annual: "",
    },
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
 * @param tier - The member's tier (DB key: bronze / silver / gold)
 * @param jobTotalCents - The job total in cents (before discount)
 * @returns The discount amount in cents
 *
 * @example
 * // gold (Maximum Protection) member, $6,000 job
 * calcMemberDiscount("gold", 600000)
 * // => $80 (12% on first $1k) + $320 (8% on $1k–$5k) + $40 (4% on $5k–$6k) = $440
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
 * e.g. "7.5%" for a $15,000 gold job.
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
