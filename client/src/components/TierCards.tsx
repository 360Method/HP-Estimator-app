/**
 * TierCards — the 360° membership offer as selectable cards.
 * Customer-facing labels only (Essential / Full Coverage / Maximum
 * Protection); prices come from the canonical shared tier definitions so
 * this matches the website checkout exactly. Shared by the staff
 * EnrollPropertyDialog and the on-site close flow's membership step,
 * so it is presentation-safe: no internal codes, no cost math.
 */
import { Check, Star } from "lucide-react";
import {
  TIER_DEFINITIONS,
  ALL_TIERS,
  formatDollars,
  getTierPrice,
  getTierPriceForBand,
  type MemberTier,
  type BillingCadence,
  type HomeSizeBand,
} from "@shared/threeSixtyTiers";

const CADENCE_OPTIONS: { id: BillingCadence; label: string; badge?: string; per: string }[] = [
  { id: "monthly", label: "Monthly", per: "/mo" },
  { id: "quarterly", label: "Quarterly", badge: "Save ~5%", per: "/quarter" },
  { id: "annual", label: "Annual", badge: "Best value", per: "/yr" },
];

export function cadencePerLabel(cadence: BillingCadence): string {
  return CADENCE_OPTIONS.find((c) => c.id === cadence)?.per ?? "";
}

export default function TierCards({
  tier,
  cadence,
  onTierChange,
  onCadenceChange,
  band,
}: {
  tier: MemberTier;
  cadence: BillingCadence;
  onTierChange: (t: MemberTier) => void;
  onCadenceChange: (c: BillingCadence) => void;
  /** When set, prices are sized to the home's band (the on-site close). */
  band?: HomeSizeBand;
}) {
  const priceFor = (id: MemberTier, c: BillingCadence) =>
    band ? getTierPriceForBand(id, c, band) : getTierPrice(id, c);
  return (
    <div className="space-y-4">
      {/* Billing cadence */}
      <div className="flex gap-2">
        {CADENCE_OPTIONS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onCadenceChange(c.id)}
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

      {/* Tier cards */}
      <div className="space-y-3">
        {ALL_TIERS.map((id) => {
          const def = TIER_DEFINITIONS[id];
          const isSelected = tier === id;
          const priceCents = priceFor(id, cadence);
          const per = cadencePerLabel(cadence);
          return (
            <div
              key={id}
              role="button"
              tabIndex={0}
              onClick={() => onTierChange(id)}
              onKeyDown={(e) => { if (e.key === "Enter") onTierChange(id); }}
              className={`rounded-lg border p-4 cursor-pointer transition-colors ${
                isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
              }`}
            >
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span className="font-semibold text-base">{def.label}</span>
                {id === "silver" && (
                  <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500 text-white">
                    <Star className="h-3 w-3 mr-1" />
                    Most Popular
                  </span>
                )}
                <span className="ml-auto text-lg font-bold text-primary">
                  {formatDollars(priceCents)}
                  <span className="text-sm font-normal text-muted-foreground">{per}</span>
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-1">{def.tagline}</p>
              {cadence === "annual" && (
                <p className="text-xs text-green-700 font-medium mb-1">
                  {formatDollars(Math.round(priceFor(id, "annual") / 12))}/mo equivalent
                </p>
              )}
              {isSelected && (
                <div className="space-y-1 mt-2">
                  {def.features.map((f, i) => (
                    <div key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <Check className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
