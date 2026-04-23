/**
 * HomeHealthScoreWidget — dashboard module, strictly scoped to THIS customer.
 *
 * Data source: `portal.getHomeHealthSummary`, which filters portalReports by the
 * logged-in portalCustomer.id on the server. No aggregation, no hardcoded stats.
 *
 * Three render states:
 *  1. Score present → circular gauge with this customer's latest score + NOW-item CTA
 *  2. No baseline yet (score === null) → "Complete your Baseline" empty state
 *  3. Continuity disabled or still loading → renders null
 */
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Activity, ChevronRight, Gauge } from "lucide-react";
import { useContinuityEnabled } from "./useContinuityEnabled";

interface HomeHealthScoreWidgetProps {
  /** Customer's first name — anchors copy to the logged-in customer. */
  customerFirstName: string;
}

// TODO: move to CMS (nucleus)
const COPY = {
  eyebrow: "Home Health Score",
  emptyHeadline: (firstName: string) =>
    `Complete your Baseline, ${firstName}, to see your Home Health Score`,
  emptyBody:
    "A Baseline Walkthrough at your property produces a single score — where your home stands, what's compounding in value, and what's quietly aging out. Specific to your home, never an average.",
  emptyCta: "Schedule a complimentary Baseline",
  memberBody:
    "Updated with every 360° visit at your property. Open NOW items are ones we'd steward in the next quarter.",
  memberCta: "Review open NOW items",
};

function scoreColor(score: number): string {
  if (score >= 80) return "#059669";
  if (score >= 60) return "#c8922a";
  return "#b91c1c";
}

function scoreLabel(score: number): string {
  if (score >= 85) return "Excellent standard of care";
  if (score >= 70) return "Solid — a few items compounding";
  if (score >= 55) return "Worth a proactive visit";
  return "Overdue for stewardship";
}

export default function HomeHealthScoreWidget({ customerFirstName }: HomeHealthScoreWidgetProps) {
  const enabled = useContinuityEnabled();
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.portal.getHomeHealthSummary.useQuery(undefined, {
    staleTime: 2 * 60 * 1000,
  });

  if (!enabled || isLoading || !data) return null;

  const { score, openNowItems, latestReportId } = data;

  // Empty state — no baseline yet for this customer
  if (score === null) {
    return (
      <div
        className="rounded-xl border border-[#1a2e1a]/15 overflow-hidden"
        style={{ background: "linear-gradient(180deg,#fefcf8 0%,#fdf4e0 100%)" }}
      >
        <div className="px-5 pt-5 pb-4 flex items-start gap-3">
          <div className="w-12 h-12 rounded-full bg-[#1a2e1a] flex items-center justify-center shrink-0">
            <Gauge className="w-6 h-6 text-[#c8922a]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#c8922a] font-semibold">
              {COPY.eyebrow}
            </p>
            <p className="text-base font-semibold text-[#1a2e1a] leading-snug mt-0.5">
              {COPY.emptyHeadline(customerFirstName)}
            </p>
            <p className="text-xs text-gray-600 mt-2 leading-relaxed">{COPY.emptyBody}</p>
          </div>
        </div>
        <button
          onClick={() => navigate("/portal/360-membership?source=home_health_empty")}
          className="w-full flex items-center justify-between gap-2 px-5 py-3 bg-[#1a2e1a] hover:bg-[#2d4a2d] text-white text-sm font-semibold transition-colors"
        >
          <span>{COPY.emptyCta}</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const accent = scoreColor(score);
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-5 pt-5 pb-4 flex items-center gap-4">
        <div
          className="w-20 h-20 rounded-full flex flex-col items-center justify-center shrink-0"
          style={{
            background: `conic-gradient(${accent} ${score * 3.6}deg, #f3f4f6 0deg)`,
          }}
        >
          <div className="w-16 h-16 rounded-full bg-white flex flex-col items-center justify-center">
            <p className="text-2xl font-bold leading-none" style={{ color: accent }}>
              {score}
            </p>
            <p className="text-[9px] text-gray-400 uppercase tracking-wider">/ 100</p>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-[0.14em] font-semibold" style={{ color: accent }}>
            Your {COPY.eyebrow}
          </p>
          <p className="text-sm font-semibold text-gray-900 mt-0.5">{scoreLabel(score)}</p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">{COPY.memberBody}</p>
        </div>
      </div>
      {openNowItems > 0 && (
        <button
          onClick={() =>
            navigate(latestReportId ? `/portal/reports/${latestReportId}` : "/portal/reports")
          }
          className="w-full flex items-center justify-between gap-2 px-5 py-2.5 border-t border-gray-100 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold transition-colors"
        >
          <span className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" />
            {openNowItems} open {openNowItems === 1 ? "item" : "items"} at your home to address now
          </span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
