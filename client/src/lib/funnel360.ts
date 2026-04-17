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
    label: "Bronze",
    tagline: "Essential protection for the budget-conscious homeowner",
    monthlyPrice: 5900,
    quarterlyPrice: 16900,
    annualPrice: 58800,
    monthlyEquivAnnual: 4900,
    seasonalVisits: 1,
    includesAnnualScan: false,
    laborBankCreditCents: 10000,
    priorityScheduling: false,
    headlineDiscount: "5%",
    features: [
      "1 seasonal visit per year",
      "$100 labor bank credit",
      "5% off all jobs",
      "Documented property health report",
      "Priority booking window",
    ],
    color: "#cd7f32",
  },
  {
    id: "silver",
    label: "Silver",
    tagline: "The most popular plan — great coverage, real savings",
    monthlyPrice: 9900,
    quarterlyPrice: 28900,
    annualPrice: 94800,
    monthlyEquivAnnual: 7900,
    seasonalVisits: 2,
    includesAnnualScan: false,
    laborBankCreditCents: 25000,
    priorityScheduling: false,
    headlineDiscount: "10%",
    features: [
      "2 seasonal visits per year",
      "$250 labor bank credit",
      "10% off jobs up to $2,500",
      "5% off jobs $2,501–$10,000",
      "2% off jobs above $10,000",
      "Documented property health report",
    ],
    color: "#9ca3af",
    popular: true,
  },
  {
    id: "gold",
    label: "Gold",
    tagline: "Maximum coverage, priority service, and the biggest savings",
    monthlyPrice: 14900,
    quarterlyPrice: 41900,
    annualPrice: 142800,
    monthlyEquivAnnual: 11900,
    seasonalVisits: 4,
    includesAnnualScan: true,
    laborBankCreditCents: 50000,
    priorityScheduling: true,
    headlineDiscount: "15%",
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
