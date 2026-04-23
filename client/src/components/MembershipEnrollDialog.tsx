/**
 * MembershipEnrollDialog
 * Enroll a specific property in a 360° membership tier.
 * Mirrors 360.handypioneers.com pricing and discount tables exactly.
 * Supports both homeowner (single) and portfolio/rental plan types.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, Home, Building2, Check, Star } from "lucide-react";
import { Property } from "@/lib/types";
import { toast } from "sonner";

// ─── Tier definitions ────────────────────────────────────────────────────────

type TierId = "bronze" | "silver" | "gold";
type PlanType = "single" | "portfolio";
type Cadence = "monthly" | "quarterly" | "annual";

interface TierDef {
  id: TierId;
  /** Label shown on 360.handypioneers.com for homeowner plan */
  homeLabel: string;
  /** Label shown on 360.handypioneers.com for portfolio plan */
  portfolioLabel: string;
  tagline: string;
  monthlyPrice: number;
  /** Quarterly saves ~5% (homeowner) / ~7% (portfolio) — shown as effective monthly */
  quarterlyPrice: number;
  /** Annual saves ~17% */
  annualPrice: number;
  visits: string;
  laborBank: number; // dollars
  popular?: boolean;
  features: string[];
  discounts: { label: string; value: string }[];
}

const TIERS: TierDef[] = [
  {
    id: "bronze",
    homeLabel: "Essential",
    portfolioLabel: "Exterior Shield",
    tagline: "Protect the basics. Catch problems early.",
    monthlyPrice: 59,
    quarterlyPrice: 56,
    annualPrice: 49,
    visits: "2 visits/yr — Spring + Fall",
    laborBank: 0,
    features: [
      "Annual 360° Home Scan (2–3 hr documented assessment)",
      "Spring visit — post-rain damage assessment + moss/gutter service",
      "Fall visit — rain-season prep + weatherization",
      "Prioritized repair report with cost estimates",
      "Member discount on all out-of-scope jobs",
      "HP direct line — no hold queues",
    ],
    discounts: [
      { label: "Jobs under $1,000", value: "5% off" },
      { label: "Jobs $1,000–$5,000", value: "3% off" },
      { label: "Jobs over $5,000", value: "1.5% off" },
    ],
  },
  {
    id: "silver",
    homeLabel: "Full Coverage",
    portfolioLabel: "Full Coverage",
    tagline: "Four seasons of protection + pre-paid labor.",
    monthlyPrice: 99,
    quarterlyPrice: 94,
    annualPrice: 82,
    visits: "4 visits/yr — All 4 Seasons",
    laborBank: 300,
    popular: true,
    features: [
      "Everything in Essential, plus:",
      "$300 labor bank credit (use on any handyman task)",
      "Summer visit — dry-season exterior + HVAC prep",
      "Winter visit — freeze protection + moisture inspection",
      "Upsell-to-estimate in one tap — findings become quotes instantly",
      "Annual maintenance report for home equity documentation",
    ],
    discounts: [
      { label: "Jobs under $1,000", value: "8% off" },
      { label: "Jobs $1,000–$5,000", value: "5% off" },
      { label: "Jobs over $5,000", value: "2.5% off" },
    ],
  },
  {
    id: "gold",
    homeLabel: "Maximum Protection",
    portfolioLabel: "Portfolio Max",
    tagline: "The full system. Priority access. Maximum savings.",
    monthlyPrice: 149,
    quarterlyPrice: 141,
    annualPrice: 124,
    visits: "4 visits/yr — All 4 Seasons + Priority",
    laborBank: 600,
    features: [
      "Everything in Full Coverage, plus:",
      "$600 labor bank credit — you're ahead after month 5",
      "Priority scheduling — your calls go first",
      "Dedicated HP account manager",
      "Pre-negotiated sub-contractor rates on major work",
      "Home equity maintenance log for refinancing or sale",
    ],
    discounts: [
      { label: "Jobs under $1,000", value: "12% off" },
      { label: "Jobs $1,000–$5,000", value: "8% off" },
      { label: "Jobs over $5,000", value: "4% off" },
    ],
  },
];

const CADENCES: { id: Cadence; label: string; badge?: string }[] = [
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Quarterly", badge: "Save ~5%" },
  { id: "annual", label: "Annual", badge: "Save ~17%" },
];

const PORTFOLIO_CADENCES: { id: Cadence; label: string; badge?: string }[] = [
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Quarterly", badge: "Save ~7%" },
  { id: "annual", label: "Annual", badge: "Save ~17%" },
];

function effectivePrice(tier: TierDef, cadence: Cadence): number {
  if (cadence === "quarterly") return tier.quarterlyPrice;
  if (cadence === "annual") return tier.annualPrice;
  return tier.monthlyPrice;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface MembershipEnrollDialogProps {
  property: Property;
  open: boolean;
  onClose: () => void;
  onEnrolled: () => void;
}

export default function MembershipEnrollDialog({
  property,
  open,
  onClose,
  onEnrolled,
}: MembershipEnrollDialogProps) {
  const [planType, setPlanType] = useState<PlanType>("single");
  const [tier, setTier] = useState<TierId>("silver");
  const [cadence, setCadence] = useState<Cadence>("annual");
  const [interiorAddon, setInteriorAddon] = useState(false);

  const enrollMutation = trpc.properties.enrollMembership.useMutation({
    onSuccess: () => {
      const tierDef = TIERS.find((t) => t.id === tier)!;
      const label = planType === "portfolio" ? tierDef.portfolioLabel : tierDef.homeLabel;
      toast.success(`${property.label} enrolled in 360° ${label}.`);
      onEnrolled();
    },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const addressLine = [property.street, property.city, property.state]
    .filter(Boolean)
    .join(", ");

  const selectedTier = TIERS.find((t) => t.id === tier)!;
  const price = effectivePrice(selectedTier, cadence);
  const cadenceList = planType === "portfolio" ? PORTFOLIO_CADENCES : CADENCES;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Enroll in 360° Membership
          </DialogTitle>
          <DialogDescription>
            {property.label}
            {addressLine ? ` — ${addressLine}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Plan type toggle */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Plan type</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: "single" as PlanType, icon: Home, label: "Homeowner", sub: "Personal residence" },
                  { id: "portfolio" as PlanType, icon: Building2, label: "Rental / Portfolio", sub: "Landlord or property manager" },
                ] as const
              ).map(({ id, icon: Icon, label, sub }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPlanType(id)}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                    planType === id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Billing cadence */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Billing cadence</Label>
            <div className="flex gap-2">
              {cadenceList.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCadence(c.id)}
                  className={`flex-1 flex flex-col items-center rounded-lg border px-3 py-2 transition-colors ${
                    cadence === c.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <span className="text-sm font-medium">{c.label}</span>
                  {c.badge && (
                    <span className="text-xs text-green-600 font-medium">{c.badge}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tier cards */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Select tier</Label>
            <RadioGroup
              value={tier}
              onValueChange={(v) => setTier(v as TierId)}
              className="space-y-3"
            >
              {TIERS.map((t) => {
                const label = planType === "portfolio" ? t.portfolioLabel : t.homeLabel;
                const p = effectivePrice(t, cadence);
                const isSelected = tier === t.id;
                return (
                  <div
                    key={t.id}
                    className={`rounded-lg border p-4 cursor-pointer transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40"
                    }`}
                    onClick={() => setTier(t.id)}
                  >
                    <div className="flex items-start gap-3">
                      <RadioGroupItem value={t.id} id={`tier-${t.id}`} className="mt-1" />
                      <div className="flex-1 min-w-0">
                        {/* Header row */}
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <Label htmlFor={`tier-${t.id}`} className="font-semibold cursor-pointer text-base">
                            {label}
                          </Label>
                          {t.popular && (
                            <Badge className="text-xs bg-amber-500 text-white border-0">
                              <Star className="h-3 w-3 mr-1" />
                              Most Popular
                            </Badge>
                          )}
                          <span className="ml-auto text-lg font-bold text-primary">
                            ${p}<span className="text-sm font-normal text-muted-foreground">/mo</span>
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">{t.tagline}</p>

                        {/* Visits + labor bank badges */}
                        <div className="flex flex-wrap gap-2 mb-3">
                          <Badge variant="secondary" className="text-xs">
                            📅 {t.visits}
                          </Badge>
                          {t.laborBank > 0 && (
                            <Badge
                              variant="secondary"
                              className="text-xs text-green-700 bg-green-50 cursor-help"
                              title="This credit accrues after the first 90 days"
                            >
                              ⏳ ${t.laborBank} labor bank credit
                            </Badge>
                          )}
                        </div>

                        {/* Features (collapsed unless selected) */}
                        {isSelected && (
                          <div className="space-y-1 mb-3">
                            {t.features.map((f, i) => (
                              <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                <Check className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
                                <span>{f}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Discount table */}
                        {isSelected && (
                          <div className="rounded-md bg-muted/50 p-2">
                            <p className="text-xs font-medium mb-1.5 text-muted-foreground uppercase tracking-wide">
                              Member Repair Discounts
                            </p>
                            <div className="grid grid-cols-3 gap-1">
                              {t.discounts.map((d) => (
                                <div key={d.label} className="text-center">
                                  <p className="text-sm font-bold text-green-600">{d.value}</p>
                                  <p className="text-xs text-muted-foreground leading-tight">{d.label}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </RadioGroup>
          </div>

          {/* Interior add-on (portfolio only) */}
          {planType === "portfolio" && (
            <div
              className={`rounded-lg border p-4 cursor-pointer transition-colors ${
                interiorAddon ? "border-primary bg-primary/5" : "border-border"
              }`}
              onClick={() => setInteriorAddon((v) => !v)}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={interiorAddon}
                  onChange={() => setInteriorAddon((v) => !v)}
                  className="mt-1 h-4 w-4 cursor-pointer"
                  id="interior-addon"
                />
                <div>
                  <Label htmlFor="interior-addon" className="font-semibold cursor-pointer">
                    🚪 Interior Unit Add-On
                    <Badge variant="outline" className="ml-2 text-xs">$49/door/yr — annual billing</Badge>
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    2 visits/yr per occupied unit — HVAC filter swap, smoke/CO detector test, under-sink plumbing check, weatherstripping, GFCI test, exhaust fan, water heater inspection, habitability flag. Each visit generates a per-unit photo report.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="rounded-lg bg-muted/40 p-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">
                {planType === "portfolio"
                  ? TIERS.find((t) => t.id === tier)!.portfolioLabel
                  : TIERS.find((t) => t.id === tier)!.homeLabel}{" "}
                · {cadence}
              </span>
              <span className="font-semibold">
                ${price}/mo
                {interiorAddon && planType === "portfolio" && (
                  <span className="text-muted-foreground font-normal"> + $49/door/yr interior</span>
                )}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              No long-term contracts. Cancel anytime. All plans include the Annual 360° Home Scan.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={enrollMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              enrollMutation.mutate({
                propertyId: property.id,
                customerId: property.customerId,
                tier,
                cadence,
                notes: planType === "portfolio"
                  ? `Portfolio plan${interiorAddon ? " + interior add-on" : ""}`
                  : undefined,
              })
            }
            disabled={enrollMutation.isPending}
          >
            {enrollMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Enroll in 360°
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
