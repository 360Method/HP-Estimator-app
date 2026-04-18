/**
 * PortalReports — 360° Inspection Reports
 *
 * MEMBER (has reports): Shows real report list — click to view detail.
 * NON-MEMBER / NO REPORTS: Sales page showing what reports look like,
 *   example baseline report, home score preview, seasonal walkthrough
 *   breakdown → CTA to /portal/360-membership.
 */
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import PortalLayout from "@/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ClipboardList, ChevronRight, CheckCircle2, AlertTriangle,
  Shield, Home, Leaf, Sun, Wind, Snowflake, ArrowRight,
  Star, TrendingUp, Zap, Lock, Info,
} from "lucide-react";

// ─── Score Ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const radius = (size / 2) - 10;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 75 ? "#059669" : score >= 50 ? "#d97706" : "#dc2626";
  const label = score >= 80 ? "Excellent" : score >= 65 ? "Good" : score >= 50 ? "Fair" : "Needs Attention";
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth="10"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1.4s ease" }}
        />
      </svg>
      <div className="mt-[-80px] flex flex-col items-center">
        <span className="text-3xl font-black" style={{ color }}>{score}</span>
        <span className="text-[10px] text-muted-foreground font-medium">/100</span>
      </div>
      <div className="mt-10 text-xs font-semibold" style={{ color }}>{label}</div>
    </div>
  );
}

// ─── Example Baseline Report (sales preview) ─────────────────────────────────
function ExampleReport() {
  const systems = [
    { name: "Roof & Gutters",       score: 72, status: "Fair",      icon: "🏠", issues: ["Gutter seam separation at NW corner", "Granule loss on south-facing slope"] },
    { name: "HVAC",                 score: 88, status: "Good",      icon: "❄️", issues: [] },
    { name: "Plumbing",             score: 65, status: "Fair",      icon: "🚿", issues: ["Slow drain in master bath", "Water heater anode rod due for replacement"] },
    { name: "Electrical",           score: 91, status: "Excellent", icon: "⚡", issues: [] },
    { name: "Foundation & Exterior",score: 78, status: "Good",      icon: "🧱", issues: ["Minor caulking gap at garage door frame"] },
    { name: "Windows & Doors",      score: 82, status: "Good",      icon: "🪟", issues: [] },
    { name: "Attic & Insulation",   score: 60, status: "Fair",      icon: "🏗️", issues: ["R-value below recommended for climate zone", "Soffit vent partially blocked"] },
    { name: "Safety Systems",       score: 95, status: "Excellent", icon: "🔒", issues: [] },
  ];

  const recommendations = [
    { priority: "High",   section: "Plumbing",    item: "Replace water heater anode rod",       cost: "$120–$180" },
    { priority: "High",   section: "Roof",        item: "Reseal gutter seam at NW corner",      cost: "$80–$150" },
    { priority: "Medium", section: "Attic",       item: "Add blown-in insulation to R-49",      cost: "$800–$1,400" },
    { priority: "Low",    section: "Exterior",    item: "Recaulk garage door frame",            cost: "$40–$80" },
    { priority: "Low",    section: "Plumbing",    item: "Snake master bath drain",              cost: "$95–$150" },
  ];

  const priorityStyle: Record<string, { bg: string; text: string; icon: string }> = {
    High:   { bg: "bg-orange-50 border-orange-200", text: "text-orange-700", icon: "⚡" },
    Medium: { bg: "bg-yellow-50 border-yellow-200", text: "text-yellow-700", icon: "⚠" },
    Low:    { bg: "bg-blue-50 border-blue-200",     text: "text-blue-700",   icon: "👁" },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#1a2e1a] text-white rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-4 h-4 text-[#c8922a]" />
              <span className="text-xs font-bold text-[#c8922a] uppercase tracking-wide">360° Baseline Report</span>
            </div>
            <h3 className="text-lg font-black mb-0.5">Annual Home Scan</h3>
            <p className="text-white/60 text-xs">123 Example St · Vancouver, WA 98661</p>
            <p className="text-white/50 text-[10px] mt-1">Completed: March 15, 2025 · Technician: Mike R.</p>
          </div>
          <ScoreRing score={76} size={100} />
        </div>
      </div>

      {/* System scores */}
      <div>
        <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
          <Home className="w-4 h-4 text-[#c8922a]" /> System-by-System Breakdown
        </h4>
        <div className="grid grid-cols-2 gap-2">
          {systems.map((s, i) => {
            const c = s.score >= 80 ? "text-emerald-700" : s.score >= 60 ? "text-amber-700" : "text-red-700";
            const bg = s.score >= 80 ? "bg-emerald-50 border-emerald-200" : s.score >= 60 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";
            return (
              <div key={i} className={`rounded-xl border p-3 ${bg}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-800 flex items-center gap-1">
                    <span>{s.icon}</span> {s.name}
                  </span>
                  <span className={`text-sm font-black ${c}`}>{s.score}</span>
                </div>
                <div className="w-full bg-white/60 rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full transition-all"
                    style={{ width: `${s.score}%`, background: s.score >= 80 ? "#059669" : s.score >= 60 ? "#d97706" : "#dc2626" }}
                  />
                </div>
                {s.issues.length > 0 && (
                  <p className="text-[10px] text-gray-600 mt-1 leading-snug">{s.issues[0]}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Recommendations */}
      <div>
        <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4 text-amber-600" /> Action Items
        </h4>
        <div className="space-y-2">
          {recommendations.map((r, i) => {
            const s = priorityStyle[r.priority] ?? priorityStyle.Low;
            return (
              <div key={i} className={`rounded-lg border p-3 ${s.bg}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 mt-0.5">{s.icon}</span>
                    <div>
                      <p className="text-xs font-semibold text-gray-900">{r.item}</p>
                      <p className="text-[10px] text-gray-500">{r.section}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border ${s.text}`}>{r.priority}</span>
                    <p className="text-[10px] text-gray-500 mt-1">{r.cost}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Seasonal Visit Preview ───────────────────────────────────────────────────
function SeasonalPreview() {
  const seasons = [
    {
      label: "Spring Visit",
      icon: <Leaf className="w-4 h-4 text-emerald-600" />,
      color: "border-emerald-200 bg-emerald-50",
      tasks: ["Post-winter exterior inspection", "Gutter cleaning & downspout flush", "AC pre-season filter check", "Deck/patio condition check", "Caulking & weatherstripping review"],
      score: 82,
    },
    {
      label: "Summer Visit",
      icon: <Sun className="w-4 h-4 text-yellow-500" />,
      color: "border-yellow-200 bg-yellow-50",
      tasks: ["Roof & attic heat check", "Irrigation & exterior water features", "Pest entry point inspection", "Dryer vent cleaning", "Deck/fence stain assessment"],
      score: 88,
    },
    {
      label: "Fall Visit",
      icon: <Wind className="w-4 h-4 text-orange-600" />,
      color: "border-orange-200 bg-orange-50",
      tasks: ["Pre-winter exterior prep", "Gutter leaf clearing", "Heating system pre-season check", "Exterior faucet winterize", "Door & window seal touch-up"],
      score: 79,
    },
    {
      label: "Winter Visit",
      icon: <Snowflake className="w-4 h-4 text-blue-500" />,
      color: "border-blue-200 bg-blue-50",
      tasks: ["Pipe freeze risk assessment", "Attic insulation & ventilation check", "Fireplace & chimney visual", "Garage door & weatherstripping", "Emergency shut-off review"],
      score: 74,
    },
  ];

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {seasons.map((s, i) => (
        <div key={i} className={`rounded-xl border p-4 ${s.color}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {s.icon}
              <span className="text-xs font-bold text-gray-800">{s.label}</span>
            </div>
            <span className="text-xs font-black text-gray-700">{s.score}/100</span>
          </div>
          <ul className="space-y-1">
            {s.tasks.map((t, j) => (
              <li key={j} className="flex items-start gap-1.5 text-[11px] text-gray-700">
                <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0 mt-0.5" /> {t}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ─── Non-member sales page ────────────────────────────────────────────────────
function ReportsSalesPage() {
  const [, navigate] = useLocation();
  return (
    <PortalLayout>
      {/* Hero */}
      <div className="bg-[#1a2e1a] text-white">
        <div className="container py-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-[#c8922a]/20 border border-[#c8922a]/40 rounded-full px-3 py-1 mb-4">
            <ClipboardList className="w-3.5 h-3.5 text-[#c8922a]" />
            <span className="text-xs font-semibold text-[#c8922a] tracking-wide uppercase">360° Home Reports</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black leading-tight mb-3">
            Know your home's health,<br />
            <span className="text-[#c8922a]">before it costs you.</span>
          </h1>
          <p className="text-sm text-white/70 max-w-xl mb-6">
            360° members receive a detailed digital report after every visit — a home score out of 100, system-by-system breakdown, prioritized action list, and cost estimates. No guesswork, no surprises.
          </p>
          <Button
            className="bg-[#c8922a] hover:bg-[#b07a1f] text-white font-bold px-6 gap-2"
            onClick={() => navigate("/portal/360-membership")}
          >
            Get My Home Report <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="bg-white border-b">
        <div className="container py-6 max-w-3xl">
          <div className="grid grid-cols-3 gap-4 text-center">
            {[
              { stat: "76", label: "Average home score", sub: "before first 360° scan" },
              { stat: "4–8", label: "Issues found per scan", sub: "most caught before failure" },
              { stat: "$3,800", label: "Avg deferred maintenance", sub: "per unmanaged home/year" },
            ].map((s, i) => (
              <div key={i} className="p-3">
                <p className="text-2xl sm:text-3xl font-black text-[#c8922a] mb-1">{s.stat}</p>
                <p className="text-xs font-semibold text-gray-800 leading-snug">{s.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="container py-8 max-w-3xl space-y-10">

        {/* Example report */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center gap-2 bg-amber-100 border border-amber-300 rounded-full px-3 py-1">
              <Info className="w-3.5 h-3.5 text-amber-700" />
              <span className="text-xs font-semibold text-amber-700">Example Report — Sample Data</span>
            </div>
          </div>
          <ExampleReport />
        </div>

        {/* Seasonal walkthrough preview */}
        <div>
          <h2 className="text-lg font-black text-[#1a2e1a] mb-1">Seasonal visit reports</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Each seasonal visit produces its own scored report. Your home score updates after every visit so you can see progress over time.
          </p>
          <SeasonalPreview />
        </div>

        {/* What you get */}
        <div className="bg-[#1a2e1a]/5 rounded-2xl border p-6">
          <h2 className="text-base font-black text-[#1a2e1a] mb-4">Every report includes</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { icon: <TrendingUp className="w-4 h-4 text-[#c8922a]" />, title: "Home Score (1–100)", sub: "Composite score across all major systems" },
              { icon: <ClipboardList className="w-4 h-4 text-[#1a2e1a]" />, title: "System Breakdown", sub: "Individual score for 8+ home systems" },
              { icon: <AlertTriangle className="w-4 h-4 text-amber-600" />, title: "Prioritized Action List", sub: "Critical → High → Medium → Low" },
              { icon: <Zap className="w-4 h-4 text-blue-600" />, title: "Cost Estimates", sub: "Ballpark repair costs for each item" },
              { icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />, title: "Photo Documentation", sub: "Photos of every flagged issue" },
              { icon: <Star className="w-4 h-4 text-yellow-500" />, title: "Year-Over-Year Trend", sub: "Track improvement across visits" },
            ].map((f, i) => (
              <div key={i} className="flex items-start gap-3 bg-white rounded-xl border p-3">
                <div className="shrink-0 mt-0.5">{f.icon}</div>
                <div>
                  <p className="text-xs font-bold text-gray-900">{f.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{f.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="bg-[#1a2e1a] rounded-2xl p-6 text-white text-center">
          <Lock className="w-8 h-8 text-[#c8922a] mx-auto mb-3" />
          <h2 className="text-xl font-black mb-2">Your reports are waiting</h2>
          <p className="text-sm text-white/70 mb-5 max-w-sm mx-auto">
            Enroll in a 360° membership and your first Annual Home Scan is scheduled within 2 weeks. Your digital report is delivered the same day.
          </p>
          <Button
            className="bg-[#c8922a] hover:bg-[#b07a1f] text-white font-bold px-8 gap-2 text-base"
            onClick={() => navigate("/portal/360-membership")}
          >
            View Membership Plans <ArrowRight className="w-4 h-4" />
          </Button>
          <p className="text-white/40 text-[11px] mt-3">Plans from $59/mo · Cancel anytime</p>
        </div>
      </div>
    </PortalLayout>
  );
}

// ─── Member Reports List ──────────────────────────────────────────────────────
function MemberReportsList({ reports }: { reports: any[] }) {
  const [, navigate] = useLocation();
  return (
    <PortalLayout>
      <div className="container py-6 max-w-2xl">
        <h1 className="text-xl font-bold mb-1">360° Inspection Reports</h1>
        <p className="text-sm text-muted-foreground mb-5">
          Your home health history — click any report to view details.
        </p>
        <div className="space-y-3">
          {reports.map(report => {
            const score = report.healthScore ?? 0;
            const scoreColor = score >= 75 ? "#059669" : score >= 50 ? "#d97706" : "#dc2626";
            const rd = report.reportData;
            const criticalCount = (rd?.recommendations ?? []).filter((r: any) => r.priority === "Critical").length;
            const highCount = (rd?.recommendations ?? []).filter((r: any) => r.priority === "High").length;
            return (
              <Card
                key={report.id}
                className="border shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/portal/reports/${report.id}`)}
              >
                <CardContent className="py-3 px-4 flex items-center gap-4">
                  <div className="shrink-0 flex flex-col items-center w-12">
                    <span className="text-xl font-bold" style={{ color: scoreColor }}>{score}</span>
                    <span className="text-[10px] text-muted-foreground">/ 100</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">Home Inspection Report</span>
                      <Badge className="text-[10px]" variant={report.pdfUrl ? "default" : "secondary"}>
                        {report.pdfUrl ? "PDF Ready" : "Report"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(report.sentAt ?? 0).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                    </p>
                    {(criticalCount > 0 || highCount > 0) ? (
                      <div className="flex items-center gap-2 mt-1">
                        {criticalCount > 0 && (
                          <span className="text-[10px] text-red-700 flex items-center gap-0.5">
                            <AlertTriangle className="w-3 h-3" /> {criticalCount} Critical
                          </span>
                        )}
                        {highCount > 0 && (
                          <span className="text-[10px] text-orange-700 flex items-center gap-0.5">
                            <AlertTriangle className="w-3 h-3" /> {highCount} High
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[10px] text-emerald-700 flex items-center gap-0.5 mt-1">
                        <CheckCircle2 className="w-3 h-3" /> All systems good
                      </span>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </PortalLayout>
  );
}

// ─── Default export ───────────────────────────────────────────────────────────
export default function PortalReports() {
  const { data: reports, isLoading } = trpc.portal.getReports.useQuery();

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="container py-8 text-sm text-muted-foreground">Loading reports…</div>
      </PortalLayout>
    );
  }

  // Has real reports → show list
  if (reports && reports.length > 0) {
    return <MemberReportsList reports={reports} />;
  }

  // No reports → sales page
  return <ReportsSalesPage />;
}
