/**
 * RichTierCards — the on-site mirror of the handypioneers.com/membership tier
 * cards, so the in-person offer matches what the customer would see online.
 * Same structure as the website TierCard: name pill, monthly-equivalent
 * price, billed-as line, savings badge, tagline, visits pill, labor-bank
 * callout, feature list, and the member-rate table. Size-aware and
 * selectable (the close flow drives enrollment from the selection below).
 *
 * Customer-facing: retail prices only, never cost or margin.
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

const CADENCE_OPTIONS: { id: BillingCadence; label: string; badge?: string }[] = [
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Quarterly", badge: "Save ~5%" },
  { id: "annual", label: "Annual", badge: "Best value" },
];

const INK = "var(--hp-ink)";
const GOLD = "var(--hp-gold-deep)";
const HAIR = "var(--hp-hairline)";

function visitDescription(id: MemberTier): string {
  const def = TIER_DEFINITIONS[id];
  if (def.seasonalVisits >= 4) return id === "gold" ? "All 4 seasons + priority" : "All 4 seasons";
  return def.seasons.join(" + ");
}

function bracketLabel(ceilingCents: number, prevCents: number): string {
  if (ceilingCents === Infinity) return `Jobs over ${formatDollars(prevCents)}`;
  if (prevCents === 0) return `Jobs under ${formatDollars(ceilingCents)}`;
  return `${formatDollars(prevCents)}–${formatDollars(ceilingCents)}`;
}

// Whole-dollar amounts everywhere — no cents.
const whole = (cents: number) => Math.round(cents / 100) * 100;

function monthlyEquiv(id: MemberTier, cadence: BillingCadence, band?: HomeSizeBand): number {
  const price = band ? getTierPriceForBand(id, cadence, band) : getTierPrice(id, cadence);
  if (cadence === "monthly") return price;
  if (cadence === "quarterly") return whole((price * 4) / 12);
  return whole(price / 12);
}

function annualSavings(id: MemberTier, cadence: BillingCadence, band?: HomeSizeBand): number {
  if (cadence === "monthly") return 0;
  const monthly = (band ? getTierPriceForBand(id, "monthly", band) : getTierPrice(id, "monthly")) * 12;
  const price = band ? getTierPriceForBand(id, cadence, band) : getTierPrice(id, cadence);
  const total = cadence === "quarterly" ? price * 4 : price;
  return Math.max(0, whole(monthly - total));
}

export default function RichTierCards({
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
  band?: HomeSizeBand;
}) {
  return (
    <div className="space-y-4">
      {/* Billing cadence */}
      <div className="flex gap-2">
        {CADENCE_OPTIONS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onCadenceChange(c.id)}
            className="flex-1 flex flex-col items-center rounded-lg border px-3 py-2 transition-colors"
            style={cadence === c.id ? { borderColor: GOLD, background: "rgba(200,146,42,0.08)" } : { borderColor: HAIR }}
          >
            <span className="text-sm font-medium" style={{ color: INK }}>{c.label}</span>
            {c.badge && <span className="text-xs font-medium text-green-700">{c.badge}</span>}
          </button>
        ))}
      </div>

      {/* Tier cards */}
      <div className="space-y-3">
        {ALL_TIERS.map((id) => {
          const def = TIER_DEFINITIONS[id];
          const isSelected = tier === id;
          const popular = id === "silver";
          const price = band ? getTierPriceForBand(id, cadence, band) : getTierPrice(id, cadence);
          const eq = monthlyEquiv(id, cadence, band);
          const savings = annualSavings(id, cadence, band);
          const laborBank = def.laborBankCreditCents;
          return (
            <div
              key={id}
              role="button"
              tabIndex={0}
              onClick={() => onTierChange(id)}
              onKeyDown={(e) => { if (e.key === "Enter") onTierChange(id); }}
              className="relative rounded-xl border-2 p-4 cursor-pointer transition-shadow hover:shadow-md bg-white"
              style={{ borderColor: isSelected ? GOLD : popular ? INK : HAIR }}
            >
              {popular && (
                <div
                  className="absolute -top-2.5 left-4 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1"
                  style={{ background: INK }}
                >
                  <Star className="w-2.5 h-2.5" /> Most Popular
                </div>
              )}

              <div className="flex items-start justify-between gap-2">
                <span
                  className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold"
                  style={{ background: "rgba(200,146,42,0.12)", color: GOLD }}
                >
                  {def.label}
                </span>
                {isSelected && <Check className="w-5 h-5" style={{ color: GOLD }} />}
              </div>

              <div className="mt-2">
                <span className="text-3xl font-black hp-serif" style={{ color: INK }}>{formatDollars(eq)}</span>
                <span className="text-sm ml-1 text-muted-foreground">/mo</span>
              </div>
              {cadence !== "monthly" && (
                <p className="text-xs text-muted-foreground">
                  billed {formatDollars(price)}/{cadence === "quarterly" ? "qtr" : "yr"}
                </p>
              )}
              {savings > 0 && (
                <span
                  className="inline-flex mt-1 px-2 py-0.5 rounded text-xs font-bold"
                  style={{ background: "rgba(40,120,60,0.1)", color: "#15803d" }}
                >
                  Save {formatDollars(savings)}/yr · {cadence === "quarterly" ? "5" : "17"}% off
                </span>
              )}

              <p className="text-sm mt-2 mb-2 text-muted-foreground leading-relaxed">{def.tagline}</p>

              <div
                className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded mb-2"
                style={{ background: "rgba(26,46,26,0.06)", color: INK }}
              >
                📅 {def.seasonalVisits} visit{def.seasonalVisits > 1 ? "s" : ""}/yr — {visitDescription(id)}
              </div>

              {laborBank > 0 && (
                <div
                  className="rounded-md px-3 py-2 mb-2 text-xs"
                  style={{ background: "rgba(200,146,42,0.08)", border: "1px solid rgba(200,146,42,0.25)" }}
                >
                  <span className="font-bold" style={{ color: GOLD }}>
                    {formatDollars(laborBank)} labor bank credit
                  </span>
                  <span className="text-muted-foreground"> — pre-paid labor for any in-between task (leaky faucet, stuck door, fixture swap).</span>
                </div>
              )}

              {/* Features show on the selected card to keep the stack scannable */}
              {isSelected && (
                <>
                  <ul className="space-y-1.5 mt-2 mb-3">
                    {def.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs" style={{ color: INK }}>
                        <Check className="w-3 h-3 mt-0.5 shrink-0" style={{ color: GOLD }} />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">
                      Member rates on out-of-scope work
                    </p>
                    <div className="space-y-0.5">
                      {def.discountBrackets.map((b, i) => {
                        const prev = i === 0 ? 0 : def.discountBrackets[i - 1].ceilingCents;
                        return (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{bracketLabel(b.ceilingCents, prev)}</span>
                            <span className="font-bold" style={{ color: INK }}>{Math.round(b.rate * 100 * 10) / 10}% member rate</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
