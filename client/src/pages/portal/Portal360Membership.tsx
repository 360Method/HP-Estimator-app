/**
 * Portal360Membership
 *
 * NON-MEMBER: Full sales funnel — hero, problem stats, tier comparison,
 *             savings calculator, testimonials, FAQ, sticky CTA.
 *
 * MEMBER: Rich value dashboard — savings counter, seasonal timeline,
 *         labor bank, visit history, action items, upgrade nudge, referral.
 *
 * HP brand: forest green #1a2e1a / warm gold #c8922a
 */
import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import PortalLayout from "@/components/PortalLayout";
import EnrollModal from "@/components/EnrollModal";
import { TIER_DEFINITIONS, formatDollars, calcMemberDiscount } from "@shared/threeSixtyTiers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Loader2, ArrowLeft, Star, Coins, CalendarCheck, ClipboardList,
  ChevronRight, CheckCircle2, Clock, AlertTriangle, Wrench, DollarSign,
  ChevronDown, ChevronUp, Home, Leaf, Sun, Snowflake, Wind, CalendarPlus,
  TrendingUp, Shield, Zap, Users, ArrowRight, Gift, ExternalLink, Info,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtMoney(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}
function fmtDate(ts: number | Date | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const TIER_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  bronze: { label: "Bronze", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  silver: { label: "Silver", color: "text-slate-600", bg: "bg-slate-50", border: "border-slate-200" },
  gold:   { label: "Gold",   color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200" },
};

const WO_TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string; season: string }> = {
  baseline_scan: { label: "Home Scan",    icon: <Home className="w-4 h-4" />,      color: "text-[#1a2e1a]", season: "" },
  spring:        { label: "Spring",       icon: <Leaf className="w-4 h-4" />,      color: "text-emerald-700", season: "spring" },
  summer:        { label: "Summer",       icon: <Sun className="w-4 h-4" />,       color: "text-yellow-600", season: "summer" },
  fall:          { label: "Fall",         icon: <Wind className="w-4 h-4" />,      color: "text-orange-700", season: "fall" },
  winter:        { label: "Winter",       icon: <Snowflake className="w-4 h-4" />, color: "text-blue-600", season: "winter" },
};

const WO_STATUS_META: Record<string, { label: string; bg: string }> = {
  open:        { label: "Pending",    bg: "bg-gray-100 text-gray-600" },
  scheduled:   { label: "Scheduled", bg: "bg-blue-100 text-blue-700" },
  in_progress: { label: "In Progress", bg: "bg-yellow-100 text-yellow-700" },
  completed:   { label: "Completed", bg: "bg-emerald-100 text-emerald-700" },
  skipped:     { label: "Skipped",   bg: "bg-red-100 text-red-600" },
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
        <circle cx="65" cy="65" r={radius} fill="none" stroke={color} strokeWidth="12"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1.2s ease" }} />
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
  wo: { id: number; type: string; status: string; visitYear: number;
        scheduledDate?: number | null; completedDate?: number | null;
        portalReportId?: number | null; healthScore?: number | null };
  onViewReport: (id: number) => void;
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
          <span className="text-sm font-semibold text-gray-900">{meta.label} Visit</span>
          <span className="text-xs text-muted-foreground">{wo.visitYear}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusMeta.bg}`}>{statusMeta.label}</span>
        </div>
        {wo.scheduledDate && !isCompleted && (
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Scheduled: {fmtDate(wo.scheduledDate)}
          </p>
        )}
        {isCompleted && wo.completedDate && (
          <p className="text-xs text-emerald-700 mt-0.5 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Completed {fmtDate(wo.completedDate)}
            {wo.healthScore != null && <span className="ml-1 font-semibold">· Score: {wo.healthScore}/100</span>}
          </p>
        )}
      </div>
      {isCompleted && wo.portalReportId && (
        <Button size="sm" variant="outline" className="text-xs shrink-0 gap-1" onClick={() => onViewReport(wo.portalReportId!)}>
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
          <Button size="sm" className="text-[10px] h-7 px-2 bg-[#c8922a] hover:bg-[#b07a1f] text-white gap-1" onClick={onRequest}>
            <Wrench className="w-3 h-3" /> Get Estimate
          </Button>
          <button onClick={() => setExpanded(v => !v)} className="text-muted-foreground hover:text-foreground">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Annual Home Health Report Opt-In ────────────────────────────────────────
// Default OFF (Customer Success Charter §5). When the AI Annual Valuation seat
// is built out, it reads this flag to schedule the report on the member's
// onboarding anniversary.
function AnnualValuationOptIn({ membershipId, initialOptIn }: { membershipId: number; initialOptIn: boolean }) {
  const [optIn, setOptIn] = useState(initialOptIn);
  const [pending, setPending] = useState(false);
  const utils = trpc.useUtils();
  const mutation = trpc.portal.setAnnualValuationOptIn.useMutation({
    onSuccess: ({ optIn }) => {
      setOptIn(optIn);
      toast.success(optIn ? "Annual Home Health Report enrolled." : "Annual Home Health Report opt-out saved.");
      utils.portal.getMembership360.invalidate();
    },
    onError: (err) => {
      toast.error(err.message ?? "Could not save your preference.");
      setOptIn(initialOptIn);
    },
    onSettled: () => setPending(false),
  });

  const toggle = () => {
    if (pending) return;
    setPending(true);
    const next = !optIn;
    setOptIn(next);
    mutation.mutate({ membershipId, optIn: next });
  };

  return (
    <div className="rounded-xl border border-[#1a2e1a]/15 bg-gradient-to-br from-[#fafaf7] to-[#f4f1e8] p-4 mb-5">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-white border border-[#c8922a]/30 flex items-center justify-center shrink-0">
          <Shield className="w-4 h-4 text-[#1a2e1a]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#1a2e1a]">Annual Home Health Report</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            A comprehensive valuation of your property's standard of care, delivered each year on your membership anniversary. Members can opt in at any time.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={optIn}
          onClick={toggle}
          disabled={pending}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#c8922a]/40 focus:ring-offset-2 ${
            optIn ? "bg-[#1a2e1a]" : "bg-gray-300"
          } ${pending ? "opacity-60" : ""}`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              optIn ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

// ─── NON-MEMBER FUNNEL ────────────────────────────────────────────────────────

// ─── Per-tier task lists (for popup) ────────────────────────────────────────
const TIER_TASKS: Record<string, { category: string; tasks: string[] }[]> = {
  bronze: [
    {
      category: "Annual 360° Home Scan",
      tasks: [
        "Full interior & exterior walkthrough",
        "Roof condition & gutter inspection",
        "Foundation & drainage assessment",
        "HVAC filter check & visual inspection",
        "Plumbing supply & drain visual",
        "Electrical panel & GFCI check",
        "Attic & crawlspace moisture check",
        "Window & door seal inspection",
        "Smoke & CO detector test",
        "Written health report with photos",
      ],
    },
    {
      category: "Spring Visit",
      tasks: [
        "Post-winter exterior inspection",
        "Gutter cleaning & downspout flush",
        "Deck/patio condition check",
        "AC pre-season filter & coil check",
        "Caulking & weatherstripping review",
      ],
    },
    {
      category: "Fall Visit",
      tasks: [
        "Pre-winter exterior prep",
        "Gutter leaf clearing",
        "Heating system pre-season check",
        "Exterior faucet & hose bib winterize",
        "Door & window seal touch-up",
      ],
    },
  ],
  silver: [
    {
      category: "Annual 360° Home Scan",
      tasks: [
        "Full interior & exterior walkthrough",
        "Roof condition & gutter inspection",
        "Foundation & drainage assessment",
        "HVAC filter check & visual inspection",
        "Plumbing supply & drain visual",
        "Electrical panel & GFCI check",
        "Attic & crawlspace moisture check",
        "Window & door seal inspection",
        "Smoke & CO detector test",
        "Written health report with photos",
      ],
    },
    {
      category: "Spring Visit",
      tasks: [
        "Post-winter exterior inspection",
        "Gutter cleaning & downspout flush",
        "Deck/patio condition check",
        "AC pre-season filter & coil check",
        "Caulking & weatherstripping review",
      ],
    },
    {
      category: "Summer Visit",
      tasks: [
        "Mid-season roof & attic heat check",
        "Irrigation & exterior water features",
        "Deck/fence stain & seal assessment",
        "Pest entry point inspection",
        "Dryer vent cleaning",
      ],
    },
    {
      category: "Fall Visit",
      tasks: [
        "Pre-winter exterior prep",
        "Gutter leaf clearing",
        "Heating system pre-season check",
        "Exterior faucet & hose bib winterize",
        "Door & window seal touch-up",
      ],
    },
  ],
  gold: [
    {
      category: "Annual 360° Home Scan",
      tasks: [
        "Full interior & exterior walkthrough",
        "Roof condition & gutter inspection",
        "Foundation & drainage assessment",
        "HVAC filter check & visual inspection",
        "Plumbing supply & drain visual",
        "Electrical panel & GFCI check",
        "Attic & crawlspace moisture check",
        "Window & door seal inspection",
        "Smoke & CO detector test",
        "Written health report with photos",
      ],
    },
    {
      category: "Spring Visit",
      tasks: [
        "Post-winter exterior inspection",
        "Gutter cleaning & downspout flush",
        "Deck/patio condition check",
        "AC pre-season filter & coil check",
        "Caulking & weatherstripping review",
      ],
    },
    {
      category: "Summer Visit",
      tasks: [
        "Mid-season roof & attic heat check",
        "Irrigation & exterior water features",
        "Deck/fence stain & seal assessment",
        "Pest entry point inspection",
        "Dryer vent cleaning",
      ],
    },
    {
      category: "Fall Visit",
      tasks: [
        "Pre-winter exterior prep",
        "Gutter leaf clearing",
        "Heating system pre-season check",
        "Exterior faucet & hose bib winterize",
        "Door & window seal touch-up",
      ],
    },
    {
      category: "Winter Visit",
      tasks: [
        "Pipe freeze risk assessment",
        "Attic insulation & ventilation check",
        "Fireplace & chimney visual",
        "Garage door & weatherstripping",
        "Emergency shut-off location review",
      ],
    },
  ],
};

const TIERS = [
  {
    key: "bronze",
    label: "Bronze",
    tagline: "Protect the basics. Catch problems early.",
    visits: 2,
    seasons: ["Spring", "Fall"],
    laborBank: 0,
    discount: "5%",
    features: [
      "Annual 360° Home Scan (2–3 hr documented assessment)",
      "2 seasonal visits — Spring & Fall",
      "5% off jobs under $1,000 · 3% off $1k–$5k · 1.5% off $5k+",
      "Prioritized repair report with cost estimates",
      "HP direct line — no hold queues",
    ],
    color: "border-amber-300 bg-amber-50",
    badge: "text-amber-700 bg-amber-100",
    cta: "bg-amber-600 hover:bg-amber-700",
  },
  {
    key: "silver",
    label: "Silver",
    tagline: "Four seasons of protection + pre-paid labor.",
    visits: 4,
    seasons: ["Spring", "Summer", "Fall", "Winter"],
    laborBank: 300,
    discount: "8%",
    popular: true,
    features: [
      "Everything in Bronze, plus:",
      "4 seasonal visits — all 4 seasons",
      "$300 labor bank credit (use on any handyman task)",
      "8% off jobs under $1,000 · 5% off $1k–$5k · 2.5% off $5k+",
      "Annual maintenance report for home equity documentation",
    ],
    color: "border-[#1a2e1a] bg-white ring-2 ring-[#1a2e1a]/20",
    badge: "text-[#1a2e1a] bg-[#1a2e1a]/10",
    cta: "bg-[#1a2e1a] hover:bg-[#2d4a2d]",
  },
  {
    key: "gold",
    label: "Gold",
    tagline: "The full system. Priority access. Maximum savings.",
    visits: 4,
    seasons: ["Spring", "Summer", "Fall", "Winter"],
    laborBank: 600,
    discount: "12%",
    features: [
      "Everything in Silver, plus:",
      "4 seasonal visits — all 4 seasons + priority",
      "$600 labor bank credit — you're ahead after month 5",
      "12% off jobs under $1,000 · 8% off $1k–$5k · 4% off $5k+",
      "Priority scheduling — your calls go first",
      "Dedicated HP account manager",
    ],
    color: "border-yellow-400 bg-yellow-50",
    badge: "text-yellow-700 bg-yellow-100",
    cta: "bg-[#c8922a] hover:bg-[#b07a1f]",
  },
];

const FAQ_ITEMS = [
  {
    q: "How does the labor bank work?",
    a: "The labor bank is a pre-loaded credit that covers labor on any handyman task. Silver members get $300 and Gold members get $600. On Monthly billing, the credit becomes available after your first 90 days. Switch to Quarterly or Annual to unlock the full credit on day one. It renews each membership year.",
  },
  {
    q: "What happens during a seasonal visit?",
    a: "Our technician performs a documented walk-through of your home's key systems — roof, gutters, HVAC, plumbing, electrical, and more. We flag anything that needs attention, photograph it, and add it to your home health report. You get a written summary after every visit.",
  },
  {
    q: "What is the Annual 360° Home Scan?",
    a: "It's a comprehensive baseline inspection of your entire property — inside and out. We document the condition of every major system, assign a health score, and create a prioritized action list. This becomes the foundation for your ongoing proactive maintenance plan.",
  },
  {
    q: "Can I cancel my membership?",
    a: "Yes. You can cancel anytime before your next renewal date. There are no cancellation fees. Your labor bank balance and any scheduled visits remain active until your current period ends.",
  },
  {
    q: "How does the member discount work on repairs?",
    a: "Your discount applies automatically to all jobs booked through your portal. Bronze members save 5% on jobs under $1,000, 3% on $1k–$5k, and 1.5% above $5k. Silver saves 8% / 5% / 2.5%. Gold saves 12% / 8% / 4%. Larger jobs already include negotiated sub-contractor pricing — your total cost is lower either way. Discounts stack with labor bank credits.",
  },
];

function NonMemberFunnel() {
  const [cadence, setCadence] = useState<"monthly" | "quarterly" | "annual">("monthly");
  const [selectedTier, setSelectedTier] = useState("silver");
  const [spendSlider, setSpendSlider] = useState(5000);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [taskPopupTier, setTaskPopupTier] = useState<string | null>(null);

  const cadenceLabel = { monthly: "mo", quarterly: "quarter", annual: "yr" };

  // Pricing from TIER_DEFINITIONS
  const getPrice = (tierKey: string) => {
    const def = TIER_DEFINITIONS[tierKey as keyof typeof TIER_DEFINITIONS];
    if (!def) return 0;
    return def.pricing[cadence] / 100;
  };

  // Savings calculator
  const savingsPerTier = useMemo(() => {
    return TIERS.map(t => {
      const discount = calcMemberDiscount(t.key as any, spendSlider * 100);
      const laborBank = t.laborBank;
      const scanValue = 350;
      const visitValue = t.visits * 120;
      const totalValue = discount / 100 + laborBank + scanValue + visitValue;
      const annualCost = (TIER_DEFINITIONS[t.key as keyof typeof TIER_DEFINITIONS]?.pricing.annual ?? 0) / 100;
      return { ...t, discount: discount / 100, totalValue, annualCost, net: totalValue - annualCost };
    });
  }, [spendSlider]);

  const [enrollTier, setEnrollTier] = useState<string | null>(null);
  const { data: meData } = trpc.portal.me.useQuery();
  const portalCustomer = meData?.customer;

  const goToCheckout = (tier: string) => {
    setEnrollTier(tier);
  };

  return (
    <PortalLayout>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="bg-[#1a2e1a] text-white">
        <div className="container py-12 max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-[#c8922a]/20 border border-[#c8922a]/40 rounded-full px-3 py-1 mb-5">
            <Shield className="w-3.5 h-3.5 text-[#c8922a]" />
            <span className="text-xs font-semibold text-[#c8922a] tracking-wide uppercase">360° Home Method</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black leading-tight mb-4">
            Your home deserves a plan,<br />
            <span className="text-[#c8922a]">not a panic.</span>
          </h1>
          <p className="text-base text-white/70 max-w-xl mb-8">
            Most homeowners only call a contractor when something breaks. The 360° Method flips that — we inspect, document, and maintain your home year-round so small issues never become expensive emergencies.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              className="bg-[#c8922a] hover:bg-[#b07a1f] text-white font-bold px-6 py-3 text-base gap-2"
              onClick={() => document.getElementById("tier-cards")?.scrollIntoView({ behavior: "smooth" })}
            >
              See Plans <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              className="border-white/30 text-white hover:bg-white/10 bg-transparent px-6 py-3 text-base"
              onClick={() => document.getElementById("savings-calc")?.scrollIntoView({ behavior: "smooth" })}
            >
              Calculate My Savings
            </Button>
            <a
              href="https://360.handypioneers.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white/90 transition-colors underline-offset-4 hover:underline mt-1"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Full details at 360.handypioneers.com
            </a>
          </div>
        </div>
      </div>

      {/* ── Problem Stats ─────────────────────────────────────────────────── */}
      <div className="bg-white border-b">
        <div className="container py-8 max-w-3xl">
          <div className="grid grid-cols-3 gap-4 text-center">
            {[
              { stat: "$6,200", label: "Average emergency repair cost", sub: "vs. $400 caught early" },
              { stat: "68%", label: "Of homeowners have no maintenance plan", sub: "leaving equity at risk" },
              { stat: "$3,800", label: "Average annual deferred maintenance", sub: "per unmanaged home" },
            ].map((s, i) => (
              <div key={i} className="p-4">
                <p className="text-2xl sm:text-3xl font-black text-[#c8922a] mb-1">{s.stat}</p>
                <p className="text-xs font-semibold text-gray-800 leading-snug">{s.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── What You Get ─────────────────────────────────────────────────── */}
      <div className="bg-gray-50 py-10">
        <div className="container max-w-3xl">
          <div className="text-center mb-6">
            <h2 className="text-xl font-black text-[#1a2e1a] mb-1">Every plan includes</h2>
            <p className="text-sm text-muted-foreground">No hidden fees. No surprise charges. Just proactive care.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: <Home className="w-5 h-5 text-[#c8922a]" />, title: "Annual Home Scan", sub: "$350 value — included" },
              { icon: <CalendarCheck className="w-5 h-5 text-[#1a2e1a]" />, title: "Seasonal Visits", sub: "2–4 per year" },
              { icon: <Coins className="w-5 h-5 text-emerald-600" />, title: "Labor Bank", sub: "Up to $500 credit" },
              { icon: <TrendingUp className="w-5 h-5 text-blue-600" />, title: "Member Discounts", sub: "Up to 15% off repairs" },
            ].map((f, i) => (
              <div key={i} className="bg-white border rounded-xl p-4 text-center">
                <div className="flex justify-center mb-2">{f.icon}</div>
                <p className="text-xs font-bold text-gray-900">{f.title}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{f.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tier Cards ───────────────────────────────────────────────────── */}
      <div id="tier-cards" className="bg-white py-10">
        <div className="container max-w-3xl">
          <div className="text-center mb-6">
            <h2 className="text-xl font-black text-[#1a2e1a] mb-1">Choose your plan</h2>
            <p className="text-sm text-muted-foreground mb-4">All plans include the Annual 360° Home Scan. Upgrade or cancel anytime.</p>
            {/* Cadence toggle */}
            <div className="inline-flex bg-gray-100 rounded-full p-1 gap-1">
              {(["monthly", "quarterly", "annual"] as const).map(c => (
                <button
                  key={c}
                  onClick={() => setCadence(c)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    cadence === c ? "bg-[#1a2e1a] text-white shadow" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                  {c === "annual" && <span className="ml-1 text-[#c8922a]">Save more</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            {TIERS.map(t => (
              <div
                key={t.key}
                onClick={() => setSelectedTier(t.key)}
                className={`relative rounded-2xl border-2 p-5 cursor-pointer transition-all ${t.color} ${
                  selectedTier === t.key ? "shadow-lg scale-[1.02]" : "hover:shadow-md"
                }`}
              >
                {t.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-[#1a2e1a] text-white text-[10px] font-bold px-3 py-1 rounded-full">Most Popular</span>
                  </div>
                )}
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold mb-3 ${t.badge}`}>
                  <Star className="w-3 h-3" /> {t.label}
                </div>
                <p className="text-[11px] text-muted-foreground mb-3 leading-snug">{t.tagline}</p>
                <div className="mb-4">
                  <span className="text-2xl font-black text-gray-900">${getPrice(t.key).toFixed(0)}</span>
                  <span className="text-xs text-muted-foreground">/{cadenceLabel[cadence]}</span>
                  {cadence !== "monthly" && (() => {
                    const def = TIER_DEFINITIONS[t.key as keyof typeof TIER_DEFINITIONS];
                    if (!def) return null;
                    const moEquiv = Math.round(def.pricing[cadence] / 100 / (cadence === "quarterly" ? 3 : 12));
                    return (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        ~${moEquiv}/mo billed {cadence}
                      </p>
                    );
                  })()}
                </div>
                <ul className="space-y-1.5 mb-3">
                  {t.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  className="text-[11px] text-[#1a2e1a] font-semibold underline underline-offset-2 mb-4 hover:text-[#c8922a] transition-colors flex items-center gap-1"
                  onClick={(e) => { e.stopPropagation(); setTaskPopupTier(t.key); }}
                >
                  <ClipboardList className="w-3 h-3" /> Included tasks
                </button>
                <Button
                  className={`w-full text-white font-bold text-sm ${t.cta}`}
                  onClick={(e) => { e.stopPropagation(); goToCheckout(t.key); }}
                >
                  <span className="truncate">Enroll — {t.label}</span> <ArrowRight className="w-3.5 h-3.5 ml-1 shrink-0" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Savings Calculator ────────────────────────────────────────────── */}
      <div id="savings-calc" className="bg-[#1a2e1a]/5 py-10 border-y">
        <div className="container max-w-2xl">
          <div className="text-center mb-6">
            <h2 className="text-xl font-black text-[#1a2e1a] mb-1">Calculate your savings</h2>
            <p className="text-sm text-muted-foreground">Drag the slider to your estimated annual repair spend.</p>
          </div>
          <div className="bg-white rounded-2xl border p-6 shadow-sm">
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold text-gray-700">Estimated annual repair spend</span>
                <span className="text-lg font-black text-[#1a2e1a]">${spendSlider.toLocaleString()}</span>
              </div>
              <input
                type="range" min={500} max={25000} step={500}
                value={spendSlider}
                onChange={e => setSpendSlider(Number(e.target.value))}
                className="w-full accent-[#c8922a]"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>$500</span><span>$25,000</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {savingsPerTier.map(t => {
                const scanValue = 350;
                const visitValue = t.visits * 120;
                const laborBankVal = t.laborBank;
                const discountVal = Math.round(t.discount);
                const totalVal = Math.round(t.totalValue);
                return (
                  <div key={t.key} className={`rounded-xl border-2 p-3 ${t.key === "silver" ? "border-[#1a2e1a] bg-[#1a2e1a]/5" : "border-gray-200"}`}>
                    <p className={`text-xs font-bold mb-2 text-center ${TIER_LABELS[t.key]?.color}`}>{t.label}</p>
                    {/* Itemized breakdown */}
                    <div className="space-y-1 mb-2">
                      <div className="flex justify-between text-[10px] text-gray-600">
                        <span>Home Scan</span>
                        <span className="font-medium">${scanValue}</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-gray-600">
                        <span>{t.visits} seasonal visit{t.visits > 1 ? "s" : ""}</span>
                        <span className="font-medium">${visitValue}</span>
                      </div>
                      {laborBankVal > 0 && (
                        <div className="flex justify-between text-[10px] text-gray-600">
                          <span>Labor bank</span>
                          <span className="font-medium text-emerald-700">${laborBankVal}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-[10px] text-gray-600">
                        <span>Repair discounts</span>
                        <span className="font-medium text-emerald-700">${discountVal}</span>
                      </div>
                    </div>
                    <div className="border-t border-gray-200 pt-2 text-center">
                      <p className="text-[10px] text-gray-500 mb-0.5">Total value</p>
                      <p className="text-lg font-black text-emerald-700">${totalVal.toLocaleString()}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 bg-gray-50 rounded-lg p-3">
              <p className="text-[10px] text-gray-500 font-semibold mb-1 flex items-center gap-1">
                <Info className="w-3 h-3" /> How we calculate this
              </p>
              <ul className="space-y-0.5 text-[10px] text-gray-500">
                <li>• <strong>Home Scan ($350):</strong> Comparable to a home inspection — documented, photographed, prioritized.</li>
                <li>• <strong>Seasonal visits ($120 each):</strong> Based on average handyman visit cost in the Portland/Vancouver area.</li>
                <li>• <strong>Labor bank:</strong> Pre-loaded credit applied directly to repair invoices — no claims, no paperwork.</li>
                <li>• <strong>Repair discounts:</strong> Calculated on your estimated spend of ${spendSlider.toLocaleString()} using each tier's discount brackets.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* ── Testimonials (Elfsight Google Reviews) ──────────────────────── */}
      <ElfsightReviews />

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <div className="bg-gray-50 py-10 border-t">
        <div className="container max-w-2xl">
          <h2 className="text-xl font-black text-[#1a2e1a] text-center mb-6">Common questions</h2>
          <div className="space-y-2">
            {FAQ_ITEMS.map((faq, i) => (
              <div key={i} className="bg-white border rounded-xl overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3.5 text-left"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="text-sm font-semibold text-gray-900">{faq.q}</span>
                  {openFaq === i ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                </button>
                {openFaq === i && (
                  <div className="px-4 pb-4">
                    <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Sticky CTA bar ───────────────────────────────────────────────── */}
      <div className="sticky bottom-0 z-40 bg-[#1a2e1a] border-t border-[#c8922a]/30 shadow-2xl">
        <div className="container py-3 max-w-3xl flex items-center justify-between gap-3">
          <div>
            <p className="text-white text-sm font-bold leading-tight">Ready to protect your home?</p>
            <p className="text-white/60 text-[11px]">Plans from $49/mo · Cancel anytime</p>
          </div>
          <Button
            className="bg-[#c8922a] hover:bg-[#b07a1f] text-white font-bold shrink-0 gap-1.5"
            onClick={() => document.getElementById("tier-cards")?.scrollIntoView({ behavior: "smooth" })}
          >
            See Plans <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Task Popup ───────────────────────────────────────────────────── */}
      {taskPopupTier && (
        <Dialog open={!!taskPopupTier} onOpenChange={() => setTaskPopupTier(null)}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-[#c8922a]" />
                {TIERS.find(t => t.key === taskPopupTier)?.label} — Included Tasks
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-5 pt-2">
              {(TIER_TASKS[taskPopupTier] ?? []).map((group, gi) => (
                <div key={gi}>
                  <p className="text-xs font-bold text-[#1a2e1a] uppercase tracking-wide mb-2 border-b pb-1">{group.category}</p>
                  <ul className="space-y-1.5">
                    {group.tasks.map((task, ti) => (
                      <li key={ti} className="flex items-start gap-2 text-sm text-gray-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        {task}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="pt-4 border-t">
              <Button
                className="w-full bg-[#1a2e1a] hover:bg-[#2d4a2d] text-white font-bold"
                onClick={() => { setTaskPopupTier(null); goToCheckout(taskPopupTier); }}
              >
                Enroll in {TIERS.find(t => t.key === taskPopupTier)?.label} <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Enroll Modal ─────────────────────────────────────────────────── */}
      {enrollTier && portalCustomer && (
        <EnrollModal
          open={!!enrollTier}
          onClose={() => setEnrollTier(null)}
          tier={enrollTier}
          customer={portalCustomer}
        />
      )}
    </PortalLayout>
  );
}
// ─── Elfsight Google Reviews Widget ──────────────────────────────────────────
function ElfsightReviews() {
  useEffect(() => {
    if (document.querySelector('script[src="https://static.elfsight.com/platform/platform.js"]') ||
        document.querySelector('script[src="https://elfsightcdn.com/platform.js"]')) return;
    const script = document.createElement("script");
    script.src = "https://elfsightcdn.com/platform.js";
    script.async = true;
    document.head.appendChild(script);
  }, []);

  return (
    <div className="bg-white py-10">
      <div className="container max-w-3xl">
        <h2 className="text-xl font-black text-[#1a2e1a] text-center mb-6">What our customers say</h2>
        <div
          className="elfsight-app-3439582a-5f81-4ddb-ab1a-54f99c9da7af"
          data-elfsight-app-lazy
        />
      </div>
    </div>
  );
}

// ─── MEMBER DASHBOARD ──────────────────────────────────────────────────────────

export default function Portal360Membership() {
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.portal.getMembership360.useQuery();
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showVisitModal, setShowVisitModal] = useState(false);
  const [enrollUpgradeTier, setEnrollUpgradeTier] = useState<string | null>(null);
  const { data: meData } = trpc.portal.me.useQuery();
  const portalCustomer = meData?.customer;
  const [visitReason, setVisitReason] = useState("");
  const [visitUrgency, setVisitUrgency] = useState<"asap" | "within_week" | "flexible">("flexible");
  const [visitDateRange, setVisitDateRange] = useState("");
  const [visitSubmitted, setVisitSubmitted] = useState(false);

  const requestVisitMutation = trpc.portal.requestOffCycleVisit.useMutation({
    onSuccess: () => { setVisitSubmitted(true); toast.success("Visit request sent! We'll be in touch within 24 hours."); },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="container py-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading your membership…
        </div>
      </PortalLayout>
    );
  }

  // Non-member: show full funnel
  if (!data) return <NonMemberFunnel />;

  // ── Member data ──────────────────────────────────────────────────────────
  const allMemberships = data.allMemberships ?? [{
    membership: data.membership, laborBankBalance: data.laborBankBalance,
    ledger: data.ledger, workOrders: data.workOrders,
  }];
  const safeIdx = Math.min(selectedIdx, allMemberships.length - 1);
  const active = allMemberships[safeIdx];
  const { membership, laborBankBalance, ledger, workOrders } = active;
  const { reports, linkedEstimates } = data;
  const tier = TIER_LABELS[membership.tier ?? "bronze"] ?? TIER_LABELS.bronze;
  const tierDef = membership.tier ? TIER_DEFINITIONS[membership.tier as keyof typeof TIER_DEFINITIONS] : null;
  const maxLaborBank = tierDef?.laborBankCreditCents ?? Math.max(laborBankBalance, 1);

  const upcoming = workOrders.filter(wo => wo.status !== "completed" && wo.status !== "skipped");
  const completed = workOrders.filter(wo => wo.status === "completed");

  const allRecs: Array<{ priority: string; section: string; item: string; estimatedCostLow?: number; estimatedCostHigh?: number; notes?: string }> = [];
  for (const r of reports) {
    const recs = (r.reportData?.recommendations ?? []) as typeof allRecs;
    allRecs.push(...recs);
  }
  const actionRecs = allRecs.filter(r => r.priority === "Critical" || r.priority === "High").slice(0, 6);

  // Savings counter: sum discounts from all completed jobs that have memberDiscount
  const totalSavedCents: number = (data as any).totalMemberSavingsCents ?? 0;

  // Seasonal timeline: which seasons apply to this tier
  const tierSeasons: Record<string, string[]> = {
    bronze: ["spring", "fall"],
    silver: ["spring", "summer", "fall"],
    gold:   ["spring", "summer", "fall", "winter"],
  };
  const mySeasons = tierSeasons[membership.tier ?? "bronze"] ?? ["spring", "fall"];
  const currentYear = new Date().getFullYear();
  const seasonalTimeline = mySeasons.map(season => {
    const wo = workOrders.find(w => w.type === season && w.visitYear === currentYear);
    return { season, wo };
  });

  // Upgrade nudge
  const canUpgrade = membership.tier === "bronze" || membership.tier === "silver";
  const upgradeTier = membership.tier === "bronze" ? "silver" : "gold";
  const upgradeLabel = upgradeTier.charAt(0).toUpperCase() + upgradeTier.slice(1);
  const upgradeBenefit = upgradeTier === "silver"
    ? "Unlock $250 labor bank + 3 seasonal visits"
    : "Unlock $500 labor bank + priority scheduling + all 4 seasons";

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
          <span className={`text-xs px-3 py-1 rounded-full border font-semibold ${tier.bg} ${tier.border} ${tier.color}`}>
            {tier.label} Member
          </span>
        </div>

        {/* Savings counter banner */}
        {totalSavedCents > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-5 flex items-center gap-3">
            <TrendingUp className="w-6 h-6 text-emerald-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-emerald-800">You've saved {fmtMoney(totalSavedCents)} with your membership</p>
              <p className="text-xs text-emerald-700">Member discounts applied to completed jobs</p>
            </div>
          </div>
        )}

        {/* Request Extra Visit button */}
        <div className="flex justify-end mb-3">
          <Button
            size="sm" variant="outline"
            className="gap-1.5 border-[#1a2e1a]/30 text-[#1a2e1a] hover:bg-[#1a2e1a]/5"
            onClick={() => { setShowVisitModal(true); setVisitSubmitted(false); }}
          >
            <CalendarPlus className="w-3.5 h-3.5" /> Request Extra Visit
          </Button>
        </div>

        {/* Property switcher */}
        {allMemberships.length > 1 && (
          <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
            <span className="text-xs text-muted-foreground shrink-0">Property:</span>
            {allMemberships.map((m, i) => {
              const t = TIER_LABELS[m.membership.tier ?? "bronze"] ?? TIER_LABELS.bronze;
              const addr = (m.membership as any).propertyAddress || `Property ${i + 1}`;
              return (
                <button key={m.membership.id} onClick={() => setSelectedIdx(i)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                    i === safeIdx ? `${t.bg} ${t.color} ${t.border}` : "border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  <Home className="w-3 h-3" />
                  <span className="max-w-[140px] truncate">{addr}</span>
                  <span className={`text-[10px] ${t.color}`}>{t.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Summary row */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white border rounded-xl p-3 text-center">
            <CalendarCheck className="w-5 h-5 text-[#c8922a] mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">Renews</p>
            <p className="text-sm font-semibold">{fmtDate(membership.renewalDate)}</p>
          </div>
          <div className="bg-white border rounded-xl p-3 text-center">
            <ClipboardList className="w-5 h-5 text-[#1a2e1a] mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">Visits Left</p>
            <p className="text-sm font-semibold">{upcoming.filter(w => w.status === "open" || w.status === "scheduled").length}</p>
          </div>
          <div className="bg-white border rounded-xl p-3 text-center">
            <Coins className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">Labor Bank</p>
            <p className="text-sm font-semibold text-emerald-700">{fmtMoney(laborBankBalance)}</p>
          </div>
        </div>

        {/* Seasonal Visit Timeline */}
        <Card className="border shadow-sm mb-5">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CalendarCheck className="w-4 h-4 text-[#c8922a]" /> {currentYear} Visit Plan
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(["spring", "summer", "fall", "winter"] as const).map(season => {
                const included = mySeasons.includes(season);
                const timeline = seasonalTimeline.find(s => s.season === season);
                const wo = timeline?.wo;
                const meta = WO_TYPE_META[season];
                const statusMeta = wo ? WO_STATUS_META[wo.status] ?? WO_STATUS_META.open : null;
                return (
                  <div key={season} className={`rounded-xl border p-3 text-center ${included ? "bg-white" : "bg-gray-50 opacity-50"}`}>
                    <div className={`flex justify-center mb-1 ${meta.color}`}>{meta.icon}</div>
                    <p className="text-xs font-semibold capitalize text-gray-800">{season}</p>
                    {included ? (
                      wo ? (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium mt-1 inline-block ${statusMeta?.bg}`}>
                          {statusMeta?.label}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground mt-1 inline-block">Pending</span>
                      )
                    ) : (
                      <span className="text-[10px] text-muted-foreground mt-1 inline-block">Not included</span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

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
                  Covers labor costs on eligible repairs. Use it anytime during your membership year.
                </p>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {ledger.length === 0 && <p className="text-xs text-muted-foreground italic">No transactions yet.</p>}
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

        {/* Annual Home Health Report opt-in */}
        <AnnualValuationOptIn membershipId={membership.id} initialOptIn={!!(membership as any).annualValuationOptIn} />

        {/* Upgrade nudge */}
        {canUpgrade && (
          <div className="bg-gradient-to-r from-[#1a2e1a] to-[#2d4a2d] rounded-xl p-4 mb-5 flex items-center gap-3">
            <Zap className="w-6 h-6 text-[#c8922a] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">Upgrade to {upgradeLabel}</p>
              <p className="text-xs text-white/70">{upgradeBenefit}</p>
            </div>
            <Button
              size="sm"
              className="bg-[#c8922a] hover:bg-[#b07a1f] text-white shrink-0 font-bold text-xs"
              onClick={() => setEnrollUpgradeTier(upgradeTier)}
            >
              Upgrade
            </Button>
          </div>
        )}

        {/* Upcoming Visits */}
        {upcoming.length > 0 && (
          <div className="mb-5">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <CalendarCheck className="w-4 h-4 text-[#c8922a]" /> Upcoming Visits
            </h2>
            <div className="space-y-2">
              {upcoming.map(wo => (
                <WorkOrderCard key={wo.id} wo={wo} onViewReport={(id) => navigate(`/portal/reports/${id}`)} />
              ))}
            </div>
          </div>
        )}

        {/* Action Items */}
        {actionRecs.length > 0 && (
          <div className="mb-5">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-orange-500" /> Action Items
              <span className="text-xs text-muted-foreground font-normal">— from your latest report</span>
            </h2>
            <div className="space-y-2">
              {actionRecs.map((rec, i) => (
                <RecRow key={i} rec={rec} onRequest={() => { navigate("/portal/request"); toast.info(`Requesting estimate for: ${rec.item}`); }} />
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
                <WorkOrderCard key={wo.id} wo={wo} onViewReport={(id) => navigate(`/portal/reports/${id}`)} />
              ))}
            </div>
          </div>
        )}

        {/* Linked Estimates */}
        {linkedEstimates && linkedEstimates.length > 0 && (
          <div className="mb-5">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-[#c8922a]" /> Repair Estimates
              <span className="text-xs text-muted-foreground font-normal">— from your inspection reports</span>
            </h2>
            <div className="space-y-2">
              {linkedEstimates.map((est) => (
                <div key={est.id} className="flex items-center gap-3 p-3 rounded-xl border bg-white hover:shadow-sm transition-shadow">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center bg-amber-50 border border-amber-200">
                    <Wrench className="w-4 h-4 text-amber-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{est.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        est.status === "approved" ? "bg-emerald-100 text-emerald-700" :
                        est.status === "sent" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
                      }`}>
                        {est.status === "approved" ? "Approved" : est.status === "sent" ? "Awaiting Review" : est.status}
                      </span>
                      {est.totalAmount != null && (
                        <span className="text-xs text-muted-foreground">Est. {fmtMoney(est.totalAmount)}</span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm" variant={est.status === "approved" ? "outline" : "default"}
                    className={`text-xs shrink-0 gap-1 ${est.status !== "approved" ? "bg-[#1a2e1a] hover:bg-[#2d4a2d] text-white" : ""}`}
                    onClick={() => navigate(`/portal/estimates/${est.id}`)}
                  >
                    {est.status === "approved" ? "View" : "Review & Approve"}
                    <ChevronRight className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reports shortcut */}
        {reports.length > 0 && (
          <Card className="border border-[#1a2e1a]/20 bg-[#1a2e1a]/5 cursor-pointer hover:shadow-sm transition-shadow mb-4"
            onClick={() => navigate("/portal/reports")}>
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

        {/* Referral shortcut */}
        <Card className="border border-[#c8922a]/30 bg-amber-50 mb-4 cursor-pointer hover:shadow-sm transition-shadow"
          onClick={() => navigate("/portal/referral")}>
          <CardContent className="p-4 flex items-center gap-3">
            <Gift className="w-5 h-5 text-[#c8922a]" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#1a2e1a]">Refer a Friend</p>
              <p className="text-xs text-muted-foreground">Earn rewards when friends join the 360° Method</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </CardContent>
        </Card>

        {/* Service CTA */}
        <Card className="border border-[#c8922a]/30 bg-amber-50">
          <CardContent className="p-4 text-center">
            <h3 className="text-sm font-semibold text-[#1a2e1a] mb-1">Need something fixed?</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Your labor bank can be applied to any eligible repair. Request a free estimate today.
            </p>
            <Button size="sm" className="bg-[#c8922a] hover:bg-[#b07a1f] text-white" onClick={() => navigate("/portal/request")}>
              Request Service
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Off-Cycle Visit Modal */}
      <Dialog open={showVisitModal} onOpenChange={setShowVisitModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#1a2e1a]">
              <CalendarPlus className="w-4 h-4 text-[#c8922a]" /> Request an Extra Visit
            </DialogTitle>
          </DialogHeader>
          {visitSubmitted ? (
            <div className="py-6 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900 mb-1">Request Received!</h3>
              <p className="text-sm text-muted-foreground mb-4">We'll be in touch within 24 hours to schedule your visit.</p>
              <Button size="sm" variant="outline" onClick={() => setShowVisitModal(false)}>Close</Button>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1.5">Reason for Extra Visit</label>
                <Textarea placeholder="e.g. Noticed a leak under the sink..." value={visitReason}
                  onChange={(e) => setVisitReason(e.target.value)} rows={3} className="text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1.5">Urgency</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["asap", "within_week", "flexible"] as const).map((u) => (
                    <button key={u} onClick={() => setVisitUrgency(u)}
                      className={`rounded-lg border px-2 py-2 text-xs font-medium transition-all ${
                        visitUrgency === u ? "border-[#1a2e1a] bg-[#1a2e1a] text-white" : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}>
                      {u === "asap" ? "ASAP" : u === "within_week" ? "Within a Week" : "Flexible"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1.5">Preferred Date Range (optional)</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8922a]"
                  placeholder="e.g. Any weekday after May 5th" value={visitDateRange}
                  onChange={(e) => setVisitDateRange(e.target.value)} />
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowVisitModal(false)}>Cancel</Button>
                <Button size="sm" className="flex-1 bg-[#1a2e1a] hover:bg-[#2d4a2d] text-white"
                  disabled={visitReason.trim().length < 5 || requestVisitMutation.isPending}
                  onClick={() => requestVisitMutation.mutate({ reason: visitReason.trim(), urgency: visitUrgency, preferredDateRange: visitDateRange.trim() || undefined })}>
                  {requestVisitMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Send Request"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Upgrade Enroll Modal ──────────────────────────────────────── */}
      {enrollUpgradeTier && portalCustomer && (
        <EnrollModal
          open={!!enrollUpgradeTier}
          onClose={() => setEnrollUpgradeTier(null)}
          tier={enrollUpgradeTier}
          customer={portalCustomer}
        />
      )}
    </PortalLayout>
  );
}
