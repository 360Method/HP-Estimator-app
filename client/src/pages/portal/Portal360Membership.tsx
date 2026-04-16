/**
 * Portal360Membership — Customer-facing 360° Home Membership dashboard.
 *
 * Shows:
 *   • Membership tier badge + renewal date
 *   • Labor bank balance (animated ring) + last 5 transactions
 *   • Upcoming / scheduled work orders with status timeline
 *   • Recent inspection reports with health score + per-item estimate CTAs
 *   • "Request Service" shortcut for flagged items
 *
 * HP brand: forest green #1a2e1a / warm gold #c8922a
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import PortalLayout from "@/components/PortalLayout";
import { TIER_DEFINITIONS } from "@shared/threeSixtyTiers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Loader2,
  ArrowLeft,
  Star,
  Coins,
  CalendarCheck,
  ClipboardList,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Wrench,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Home,
  Leaf,
  Sun,
  Snowflake,
  Wind,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}
function fmtDate(ts: number | Date | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

const TIER_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  bronze: { label: "Bronze", color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
  silver: { label: "Silver", color: "text-slate-600", bg: "bg-slate-50 border-slate-200" },
  gold:   { label: "Gold",   color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" },
};

const WO_TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  baseline_scan: { label: "Baseline Home Scan",  icon: <Home className="w-4 h-4" />,      color: "text-[#1a2e1a]" },
  spring:        { label: "Spring Visit",         icon: <Leaf className="w-4 h-4" />,      color: "text-emerald-700" },
  summer:        { label: "Summer Visit",         icon: <Sun className="w-4 h-4" />,       color: "text-yellow-600" },
  fall:          { label: "Fall Visit",           icon: <Wind className="w-4 h-4" />,      color: "text-orange-700" },
  winter:        { label: "Winter Visit",         icon: <Snowflake className="w-4 h-4" />, color: "text-blue-600" },
};

const WO_STATUS_META: Record<string, { label: string; bg: string }> = {
  open:        { label: "Pending Schedule",  bg: "bg-gray-100 text-gray-600" },
  scheduled:   { label: "Scheduled",         bg: "bg-blue-100 text-blue-700" },
  in_progress: { label: "In Progress",       bg: "bg-yellow-100 text-yellow-700" },
  completed:   { label: "Completed",         bg: "bg-emerald-100 text-emerald-700" },
  skipped:     { label: "Skipped",           bg: "bg-red-100 text-red-600" },
};

// ─── Labor Bank Ring ──────────────────────────────────────────────────────────
function LaborBankRing({ balanceCents, maxCents }: { balanceCents: number; maxCents: number }) {
  const pct = Math.min(100, Math.round((balanceCents / Math.max(maxCents, 1)) * 100));
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const color = pct > 60 ? "#059669" : pct > 25 ? "#d97706" : "#dc2626";
  return (
    <div className="flex flex-col items-center">
      <svg width="130" height="130" viewBox="0 0 130 130" className="-rotate-90">
        <circle cx="65" cy="65" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="12" />
        <circle
          cx="65" cy="65" r={radius}
          fill="none" stroke={color} strokeWidth="12"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1.2s ease" }}
        />
      </svg>
      <div className="mt-[-96px] flex flex-col items-center">
        <span className="text-2xl font-bold" style={{ color }}>{fmtMoney(balanceCents)}</span>
        <span className="text-xs text-muted-foreground">Labor Bank</span>
      </div>
      <div className="mt-14 text-xs text-muted-foreground">{pct}% remaining</div>
    </div>
  );
}

// ─── Work Order Card ──────────────────────────────────────────────────────────
function WorkOrderCard({ wo, onViewReport }: {
  wo: {
    id: number; type: string; status: string; visitYear: number;
    scheduledDate?: number | null; completedDate?: number | null;
    portalReportId?: number | null; healthScore?: number | null;
  };
  onViewReport: (reportId: number) => void;
}) {
  const meta = WO_TYPE_META[wo.type] ?? WO_TYPE_META.spring;
  const statusMeta = WO_STATUS_META[wo.status] ?? WO_STATUS_META.open;
  const isCompleted = wo.status === "completed";
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border bg-white hover:shadow-sm transition-shadow">
      <div className={`w-9 h-9 rounded-full flex items-center justify-center bg-gray-50 border ${meta.color}`}>
        {meta.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-900">{meta.label}</span>
          <span className="text-xs text-muted-foreground">{wo.visitYear}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusMeta.bg}`}>
            {statusMeta.label}
          </span>
        </div>
        {wo.scheduledDate && !isCompleted && (
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Scheduled: {fmtDate(wo.scheduledDate)}
          </p>
        )}
        {isCompleted && wo.completedDate && (
          <p className="text-xs text-emerald-700 mt-0.5 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Completed {fmtDate(wo.completedDate)}
            {wo.healthScore != null && (
              <span className="ml-1 font-semibold">· Home Score: {wo.healthScore}/100</span>
            )}
          </p>
        )}
      </div>
      {isCompleted && wo.portalReportId && (
        <Button
          size="sm"
          variant="outline"
          className="text-xs shrink-0 gap-1"
          onClick={() => onViewReport(wo.portalReportId!)}
        >
          <ClipboardList className="w-3 h-3" /> Report
        </Button>
      )}
    </div>
  );
}

// ─── Recommendation Row ───────────────────────────────────────────────────────
function RecRow({ rec, onRequest }: {
  rec: { priority: string; section: string; item: string; estimatedCostLow?: number; estimatedCostHigh?: number; notes?: string };
  onRequest: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg: Record<string, { color: string; bg: string; border: string; icon: string }> = {
    Critical: { color: "text-red-700", bg: "bg-red-50", border: "border-red-200", icon: "🚨" },
    High:     { color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", icon: "⚡" },
    Medium:   { color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200", icon: "⚠" },
    Low:      { color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", icon: "👁" },
  };
  const c = cfg[rec.priority] ?? cfg.Low;
  return (
    <div className={`rounded-lg border ${c.border} ${c.bg} p-3`}>
      <div className="flex items-start gap-2">
        <span className="shrink-0 mt-0.5">{c.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{rec.item}</span>
            <Badge className={`text-[10px] bg-white border ${c.border} ${c.color}`}>{rec.priority}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{rec.section}</p>
          {(rec.estimatedCostLow || rec.estimatedCostHigh) && (
            <p className="text-xs font-medium text-orange-700 mt-1 flex items-center gap-1">
              <DollarSign className="w-3 h-3" />
              Est. ${rec.estimatedCostLow ?? "?"} – ${rec.estimatedCostHigh ?? "?"}
            </p>
          )}
          {expanded && rec.notes && (
            <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/40">{rec.notes}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            className="text-[10px] h-7 px-2 bg-[#c8922a] hover:bg-[#b07a1f] text-white gap-1"
            onClick={onRequest}
          >
            <Wrench className="w-3 h-3" /> Get Estimate
          </Button>
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Portal360Membership() {
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.portal.getMembership360.useQuery();

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="container py-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading your membership…
        </div>
      </PortalLayout>
    );
  }

  if (!data) {
    return (
      <PortalLayout>
        <div className="container py-12 text-center max-w-md mx-auto">
          <Star className="w-10 h-10 text-[#c8922a] mx-auto mb-3" />
          <h2 className="text-lg font-bold mb-2">No Active 360° Membership</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Enroll in the 360° Home Method to get seasonal visits, a labor bank, and full home health reports.
          </p>
          <Button
            className="bg-[#1a2e1a] hover:bg-[#2d4a2d] text-white"
            onClick={() => window.open("https://360.handypioneers.com", "_blank")}
          >
            Learn More
          </Button>
        </div>
      </PortalLayout>
    );
  }

  const { membership, laborBankBalance, ledger, workOrders, reports, linkedEstimates } = data;
  const tier = TIER_LABELS[membership.tier ?? "bronze"] ?? TIER_LABELS.bronze;

  // Separate upcoming vs completed work orders
  const upcoming = workOrders.filter(wo => wo.status !== "completed" && wo.status !== "skipped");
  const completed = workOrders.filter(wo => wo.status === "completed");

  // Flatten recommendations from all reports for the "Action Items" section
  const allRecs: Array<{ priority: string; section: string; item: string; estimatedCostLow?: number; estimatedCostHigh?: number; notes?: string }> = [];
  for (const r of reports) {
    const recs = (r.reportData?.recommendations ?? []) as typeof allRecs;
    allRecs.push(...recs);
  }
  const actionRecs = allRecs.filter(r => r.priority === "Critical" || r.priority === "High").slice(0, 6);

  // Max labor bank for ring display — use tier definition's initial credit
  const tierDef = membership.tier ? TIER_DEFINITIONS[membership.tier as keyof typeof TIER_DEFINITIONS] : null;
  const maxLaborBank = tierDef?.laborBankCreditCents ?? Math.max(laborBankBalance, 1);

  return (
    <PortalLayout>
      <div className="container py-6 max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <Button variant="ghost" size="icon" onClick={() => navigate("/portal/home")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-[#1a2e1a]">360° Home Membership</h1>
            <p className="text-xs text-muted-foreground">Your home, protected year-round</p>
          </div>
          <span className={`text-xs px-3 py-1 rounded-full border font-semibold ${tier.bg} ${tier.color}`}>
            {tier.label} Member
          </span>
        </div>

        {/* Membership summary row */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white border rounded-xl p-3 text-center">
            <CalendarCheck className="w-5 h-5 text-[#c8922a] mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">Renews</p>
            <p className="text-sm font-semibold">{fmtDate(membership.renewalDate)}</p>
          </div>
          <div className="bg-white border rounded-xl p-3 text-center">
            <ClipboardList className="w-5 h-5 text-[#1a2e1a] mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">Visits Left</p>
            <p className="text-sm font-semibold">
              {upcoming.filter(w => w.status === "open" || w.status === "scheduled").length}
            </p>
          </div>
          <div className="bg-white border rounded-xl p-3 text-center">
            <Coins className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">Labor Bank</p>
            <p className="text-sm font-semibold text-emerald-700">{fmtMoney(laborBankBalance)}</p>
          </div>
        </div>

        {/* Labor Bank Card */}
        <Card className="border shadow-sm mb-5">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Coins className="w-4 h-4 text-emerald-600" /> Labor Bank
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex items-center gap-6">
              <LaborBankRing balanceCents={laborBankBalance} maxCents={maxLaborBank} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground mb-2">
                  Your labor bank covers labor costs on eligible repairs. Use it anytime during your membership year.
                </p>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {ledger.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">No transactions yet.</p>
                  )}
                  {ledger.map((tx, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground truncate max-w-[160px]">
                        {tx.description ?? (tx.type === "credit" ? "Credit added" : "Labor applied")}
                      </span>
                      <span className={tx.type === "credit" ? "text-emerald-700 font-semibold" : "text-red-600 font-semibold"}>
                        {tx.type === "credit" ? "+" : "-"}{fmtMoney(Math.abs(tx.amountCents ?? 0))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Visits */}
        {upcoming.length > 0 && (
          <div className="mb-5">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <CalendarCheck className="w-4 h-4 text-[#c8922a]" /> Upcoming Visits
            </h2>
            <div className="space-y-2">
              {upcoming.map(wo => (
                <WorkOrderCard
                  key={wo.id}
                  wo={wo}
                  onViewReport={(id) => navigate(`/portal/reports/${id}`)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Action Items — flagged repairs from reports */}
        {actionRecs.length > 0 && (
          <div className="mb-5">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-orange-500" /> Action Items
              <span className="text-xs text-muted-foreground font-normal">— from your latest report</span>
            </h2>
            <div className="space-y-2">
              {actionRecs.map((rec, i) => (
                <RecRow
                  key={i}
                  rec={rec}
                  onRequest={() => {
                    navigate("/portal/request");
                    toast.info(`Requesting estimate for: ${rec.item}`);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Completed Visits */}
        {completed.length > 0 && (
          <div className="mb-5">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Visit History
            </h2>
            <div className="space-y-2">
              {completed.map(wo => (
                <WorkOrderCard
                  key={wo.id}
                  wo={wo}
                  onViewReport={(id) => navigate(`/portal/reports/${id}`)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Linked Estimates & Repairs */}
        {linkedEstimates && linkedEstimates.length > 0 && (
          <div className="mb-5">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-[#c8922a]" /> Repair Estimates
              <span className="text-xs text-muted-foreground font-normal">— from your inspection reports</span>
            </h2>
            <div className="space-y-2">
              {linkedEstimates.map((est) => (
                <div
                  key={est.id}
                  className="flex items-center gap-3 p-3 rounded-xl border bg-white hover:shadow-sm transition-shadow"
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center bg-amber-50 border border-amber-200">
                    <Wrench className="w-4 h-4 text-amber-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{est.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        est.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                        est.status === 'sent' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {est.status === 'approved' ? 'Approved' : est.status === 'sent' ? 'Awaiting Review' : est.status}
                      </span>
                      {est.totalAmount != null && (
                        <span className="text-xs text-muted-foreground">
                          Est. {fmtMoney(est.totalAmount)}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={est.status === 'approved' ? 'outline' : 'default'}
                    className={`text-xs shrink-0 gap-1 ${
                      est.status !== 'approved'
                        ? 'bg-[#1a2e1a] hover:bg-[#2d4a2d] text-white'
                        : ''
                    }`}
                    onClick={() => navigate(`/portal/estimates/${est.id}`)}
                  >
                    {est.status === 'approved' ? 'View' : 'Review & Approve'}
                    <ChevronRight className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reports shortcut */}
        {reports.length > 0 && (
          <Card
            className="border border-[#1a2e1a]/20 bg-[#1a2e1a]/5 cursor-pointer hover:shadow-sm transition-shadow mb-4"
            onClick={() => navigate("/portal/reports")}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <ClipboardList className="w-5 h-5 text-[#1a2e1a]" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-[#1a2e1a]">View All Inspection Reports</p>
                <p className="text-xs text-muted-foreground">{reports.length} report{reports.length !== 1 ? "s" : ""} on file</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </CardContent>
          </Card>
        )}

        {/* CTA */}
        <Card className="border border-[#c8922a]/30 bg-amber-50">
          <CardContent className="p-4 text-center">
            <h3 className="text-sm font-semibold text-[#1a2e1a] mb-1">Need something fixed?</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Your labor bank can be applied to any eligible repair. Request a free estimate today.
            </p>
            <Button
              size="sm"
              className="bg-[#c8922a] hover:bg-[#b07a1f] text-white"
              onClick={() => navigate("/portal/request")}
            >
              Request Service
            </Button>
          </CardContent>
        </Card>
      </div>
    </PortalLayout>
  );
}
