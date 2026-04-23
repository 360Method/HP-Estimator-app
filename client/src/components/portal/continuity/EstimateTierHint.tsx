/**
 * EstimateTierHint — soft side module on estimate detail.
 * Shows which 360° tier would have absorbed this scope, in the voice of a
 * steward noting "this is already your standard of care at X tier."
 * Deterministic mapping: thresholds on total + scope keywords.
 */
import { useLocation } from "wouter";
import { Layers, ChevronRight } from "lucide-react";
import { useContinuityEnabled } from "./useContinuityEnabled";

interface EstimateTierHintProps {
  /** Estimate total in cents */
  totalCents: number;
  /** Plain-text scope (overview / line-item summary) used for tier classification */
  scopeText?: string | null;
  /** If customer is already a member we skip — they already see the overlap. */
  isMember?: boolean;
}

// TODO: move to CMS (nucleus)
type Tier = "bronze" | "silver" | "gold";
const TIER_COPY: Record<Tier, { label: string; line: string; accent: string }> = {
  bronze: {
    label: "Bronze",
    line: "A Bronze steward would fold this into their standard of care.",
    accent: "#a87528",
  },
  silver: {
    label: "Silver",
    line: "This scope is included in the Silver standard of care.",
    accent: "#9ca3af",
  },
  gold: {
    label: "Gold",
    line: "Gold members execute this in their next seasonal visit.",
    accent: "#c8922a",
  },
};

function classifyTier(totalCents: number, scopeText?: string | null): Tier {
  const haystack = (scopeText ?? "").toLowerCase();
  // Gold triggers: multi-system, larger scopes, full remodels
  const goldSignals = [
    "remodel",
    "addition",
    "roof replacement",
    "siding",
    "hvac replacement",
    "electrical panel",
  ];
  if (totalCents >= 1_500_000 || goldSignals.some((s) => haystack.includes(s))) return "gold";
  if (totalCents >= 400_000) return "silver";
  return "bronze";
}

export default function EstimateTierHint({
  totalCents,
  scopeText,
  isMember,
}: EstimateTierHintProps) {
  const enabled = useContinuityEnabled();
  const [, navigate] = useLocation();

  if (!enabled || isMember) return null;

  const tier = classifyTier(totalCents, scopeText);
  const { label, line, accent } = TIER_COPY[tier];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 print:hidden">
      <div className="flex items-center gap-2 mb-2">
        <Layers className="w-4 h-4" style={{ color: accent }} />
        <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400 font-semibold">
          On your estimate · 360° Context
        </p>
      </div>
      <p className="text-sm text-gray-800 leading-snug">
        <span className="font-semibold" style={{ color: accent }}>
          {label} tier
        </span>{" "}
        — {line}
      </p>
      <p className="text-xs text-gray-500 mt-2 leading-relaxed">
        Members compound work like this into seasonal visits on their own home rather than one-off projects.
      </p>
      <button
        onClick={() => navigate("/portal/360-membership?source=estimate_tier_hint")}
        className="mt-3 w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#1a2e1a]/5 hover:bg-[#1a2e1a]/10 text-[#1a2e1a] text-xs font-semibold transition-colors"
      >
        <span>See how {label} compares</span>
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
