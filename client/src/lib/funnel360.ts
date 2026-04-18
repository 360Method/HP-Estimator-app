/**
 * HP 360 Funnel — shared constants, ZIP validation, and API helpers.
 * Frontend knows nothing about Stripe price IDs — all pricing logic is backend.
 */

// ─── Service Area ZIP Codes ───────────────────────────────────────────────────
// Clark County WA + Portland metro OR
export const SERVICE_AREA_ZIPS = new Set([
  // Vancouver WA
  "98660","98661","98662","98663","98664","98665","98666","98668",
  "98682","98683","98684","98685","98686","98687",
  // Clark County WA cities
  "98604","98607","98629","98642","98671","98674","98675",
  // Clark County WA unincorporated
  "98606","98616","98622","98624","98625","98626","98639","98640",
  "98643","98647","98648","98670","98672",
  // Portland OR metro
  "97201","97202","97203","97204","97205","97206","97207","97208","97209","97210",
  "97211","97212","97213","97214","97215","97216","97217","97218","97219","97220",
  "97221","97222","97223","97224","97225","97227","97229","97230","97231","97232",
  "97233","97236","97239","97266","97267","97268","97269",
  // Beaverton / Hillsboro OR
  "97005","97006","97007","97008","97123","97124",
  // Gresham / Troutdale OR
  "97030","97060",
]);

export function isServiceAreaZip(zip: string): boolean {
  return SERVICE_AREA_ZIPS.has(zip.trim());
}

// ─── Tier Definitions (display only — prices from backend) ───────────────────
export interface TierInfo {
  id: "bronze" | "silver" | "gold";
  label: string;
  tagline: string;
  monthlyPrice: number;   // cents
  quarterlyPrice: number; // cents
  annualPrice: number;    // cents
  monthlyEquivAnnual: number; // cents — displayed as "as low as $X/mo"
  seasonalVisits: number;
  includesAnnualScan: boolean;
  laborBankCreditCents: number;
  priorityScheduling: boolean;
  headlineDiscount: string;
  features: string[];
  color: string;
  popular?: boolean;
}

export const TIERS: TierInfo[] = [
  {
    id: "bronze",
    label: "Essential",
    tagline: "Protect the basics. Catch problems early.",
    monthlyPrice: 5900,
    quarterlyPrice: 16900,
    annualPrice: 58800,
    monthlyEquivAnnual: 4900,
    seasonalVisits: 2,
    includesAnnualScan: true,
    laborBankCreditCents: 0,
    priorityScheduling: false,
    headlineDiscount: "5%",
    features: [
      "Annual 360° Home Scan (2–3 hr documented assessment)",
      "2 seasonal visits — Spring & Fall",
      "5% off jobs under $1,000 · 3% off $1k–$5k · 1.5% off $5k+",
      "Prioritized repair report with cost estimates",
      "HP direct line — no hold queues",
    ],
    color: "#cd7f32",
  },
  {
    id: "silver",
    label: "Full Coverage",
    tagline: "Four seasons of protection + pre-paid labor.",
    monthlyPrice: 9900,
    quarterlyPrice: 27900,
    annualPrice: 94800,
    monthlyEquivAnnual: 7900,
    seasonalVisits: 4,
    includesAnnualScan: true,
    laborBankCreditCents: 30000,
    priorityScheduling: false,
    headlineDiscount: "8%",
    features: [
      "Everything in Essential, plus:",
      "4 seasonal visits — all 4 seasons",
      "$300 labor bank credit (use on any handyman task)",
      "8% off jobs under $1,000 · 5% off $1k–$5k · 2.5% off $5k+",
      "Annual maintenance report for home equity documentation",
    ],
    color: "#9ca3af",
    popular: true,
  },
  {
    id: "gold",
    label: "Maximum Protection",
    tagline: "The full system. Priority access. Maximum savings.",
    monthlyPrice: 14900,
    quarterlyPrice: 41900,
    annualPrice: 142800,
    monthlyEquivAnnual: 11900,
    seasonalVisits: 4,
    includesAnnualScan: true,
    laborBankCreditCents: 60000,
    priorityScheduling: true,
    headlineDiscount: "12%",
    features: [
      "Everything in Full Coverage, plus:",
      "4 seasonal visits — all 4 seasons + priority",
      "$600 labor bank credit — you're ahead after month 5",
      "12% off jobs under $1,000 · 8% off $1k–$5k · 4% off $5k+",
      "Priority scheduling — your calls go first",
      "Dedicated HP account manager",
    ],
    color: "#d4af37",
  },
];

export type BillingCadence = "monthly" | "quarterly" | "annual";

export const CADENCE_LABELS: Record<BillingCadence, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

export function getTierPrice(tier: TierInfo, cadence: BillingCadence): number {
  if (cadence === "monthly") return tier.monthlyPrice;
  if (cadence === "quarterly") return tier.quarterlyPrice;
  return tier.annualPrice;
}

export function formatDollars(cents: number): string {
  const d = cents / 100;
  return d % 1 === 0 ? `$${d.toFixed(0)}` : `$${d.toFixed(2)}`;
}

// ─── Portfolio Tier Definitions ───────────────────────────────────────────────
export interface PortfolioTierInfo {
  id: "essential" | "full" | "maximum";
  label: string;
  tagline: string;
  perPropertyMonthly: number; // cents
  features: string[];
  color: string;
}

export const PORTFOLIO_TIERS: PortfolioTierInfo[] = [
  {
    id: "essential",
    label: "Exterior Shield",
    tagline: "Exterior-only coverage — roof, gutters, siding, windows",
    perPropertyMonthly: 4900,
    features: [
      "Roof & gutter inspection",
      "Siding & window check",
      "Exterior drainage review",
      "Seasonal exterior visit",
    ],
    color: "#3b82f6",
  },
  {
    id: "full",
    label: "Full Coverage",
    tagline: "Exterior + interior systems — HVAC, plumbing, electrical",
    perPropertyMonthly: 7900,
    features: [
      "Everything in Exterior Shield",
      "HVAC filter & system check",
      "Plumbing inspection",
      "Electrical panel review",
      "2 seasonal visits",
    ],
    color: "#8b5cf6",
    popular: true,
  } as PortfolioTierInfo & { popular?: boolean },
  {
    id: "maximum",
    label: "Max Protection",
    tagline: "All systems + priority service + annual 360° scan",
    perPropertyMonthly: 11900,
    features: [
      "Everything in Full Coverage",
      "Annual 360° property scan",
      "Priority scheduling",
      "4 seasonal visits",
      "Dedicated property manager contact",
    ],
    color: "#d4af37",
  },
];

// ─── API Gateway Helpers ──────────────────────────────────────────────────────
const API_BASE = "https://pro.handypioneers.com";

export async function fireEvent(payload: {
  event: string;
  type: "homeowner" | "portfolio";
  data: Record<string, unknown>;
}): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/360/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // fire-and-forget — silently ignore network errors
  }
}

export async function createCheckoutSession(payload: {
  type: "homeowner" | "portfolio";
  tier?: string;
  cadence: BillingCadence;
  properties?: Array<{
    address: string;
    type: string;
    tier: string;
    interiorAddon: boolean;
    interiorDoors?: number;
  }>;
  customer: {
    name: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    zip: string;
  };
  origin: string;
}): Promise<{ url: string }> {
  const res = await fetch(`${API_BASE}/api/360/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  // Support both direct { url } and wrapped { result.data.json.url }
  const url = json?.url ?? json?.result?.data?.json?.url;
  if (!url) {
    const errMsg = json?.error ?? json?.result?.data?.json?.error ?? "Checkout session creation failed";
    throw new Error(errMsg);
  }
  return { url };
}
