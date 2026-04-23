/**
 * InvoiceValueCompounds — renders on a paid invoice page.
 * Shows year-to-date investment and re-frames single projects as part of a
 * compounding stewardship pattern. Links to enrollment.
 */
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { TrendingUp, ChevronRight } from "lucide-react";
import { useContinuityEnabled } from "./useContinuityEnabled";

interface InvoiceValueCompoundsProps {
  /** Suppresses the module when the customer is already a 360° member. */
  isMember?: boolean;
}

function fmtMoney(cents: number): string {
  const dollars = Math.round(cents / 100);
  return `$${dollars.toLocaleString("en-US")}`;
}

// TODO: move to CMS (nucleus)
const COPY = {
  eyebrow: "Your investment this year",
  line1: (amount: string) =>
    `You've invested ${amount} in your home this year. That's real value — the kind that shows up in appraisals, insurance, and resale.`,
  line2:
    "Members compound this with annual asset valuation reports, so every dollar spent is documented and working for you.",
  cta: "See how value compounds as a member",
};

export default function InvoiceValueCompounds({ isMember }: InvoiceValueCompoundsProps) {
  const enabled = useContinuityEnabled();
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.portal.getDashboard.useQuery(undefined, {
    staleTime: 60_000,
  });

  if (!enabled || isMember || isLoading || !data) return null;

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
  const paidThisYear = (data.invoices ?? []).filter((inv: any) => {
    const paidAt = inv.paidAt ? new Date(inv.paidAt).getTime() : null;
    return inv.status === "paid" && paidAt && paidAt >= yearStart;
  });
  const totalCents = paidThisYear.reduce(
    (sum: number, inv: any) => sum + (inv.amountPaid ?? inv.amountDue ?? 0),
    0,
  );

  if (totalCents <= 0) return null;

  return (
    <div
      className="rounded-xl border border-emerald-200 overflow-hidden print:hidden"
      style={{ background: "linear-gradient(180deg,#f6fbf7 0%,#ecfaf1 100%)" }}
    >
      <div className="px-5 pt-5 pb-2 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center shrink-0">
          <TrendingUp className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-emerald-700 font-semibold">
            {COPY.eyebrow}
          </p>
          <p className="text-2xl font-bold text-emerald-900 leading-none mt-1">
            {fmtMoney(totalCents)}
          </p>
          <p className="text-[11px] text-emerald-700 mt-0.5">
            across {paidThisYear.length} paid {paidThisYear.length === 1 ? "project" : "projects"} in {now.getFullYear()}
          </p>
        </div>
      </div>
      <p className="px-5 text-xs text-gray-700 leading-relaxed mt-1">
        {COPY.line1(fmtMoney(totalCents))}
      </p>
      <p className="px-5 text-xs text-gray-700 leading-relaxed mt-2 pb-4">{COPY.line2}</p>
      <button
        onClick={() => navigate("/portal/360-membership?source=invoice_compound")}
        className="w-full flex items-center justify-between gap-2 px-5 py-3 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold transition-colors"
      >
        <span>{COPY.cta}</span>
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
