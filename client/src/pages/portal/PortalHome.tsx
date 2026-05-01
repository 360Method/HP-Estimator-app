/**
 * PortalHome — Customer portal dashboard.
 * Shows: profile summary, pending estimates, open invoices, upcoming appointments.
 * Mobile-first, HP brand colors (forest green / warm gold).
 */
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { deriveThreeSixtyOperatingStatus } from "@/lib/threeSixtyMethod";
import PortalLayout from "@/components/PortalLayout";
import OnboardingModal from "@/components/OnboardingModal";
import { Button } from "@/components/ui/button";
import ProjectCompleteNudge from "@/components/portal/continuity/ProjectCompleteNudge";
import HomeHealthScoreWidget from "@/components/portal/continuity/HomeHealthScoreWidget";
import PortalWhatsNext from "@/components/portal/PortalWhatsNext";
import PortalProperty360Plan from "@/components/portal/PortalProperty360Plan";
import { toast } from "sonner";
import {
  Loader2,
  ClipboardList,
  FileText,
  Calendar,
  MessageSquare,
  ChevronRight,
  User,
  Phone,
  MapPin,
  Mail,
  Edit2,
  Check,
  X,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  CreditCard,
  Briefcase,
  RefreshCw,
  Wrench,
  Star,
} from "lucide-react";

function fmtMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDate(ts: number | Date | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateShort(ts: number | Date | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function EstimateStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; icon: React.ReactNode; label: string }> = {
    sent: { bg: "bg-blue-100 text-blue-700", icon: <Clock className="w-3 h-3" />, label: "Awaiting Review" },
    viewed: { bg: "bg-yellow-100 text-yellow-700", icon: <Clock className="w-3 h-3" />, label: "Viewed" },
    approved: { bg: "bg-green-100 text-green-700", icon: <CheckCircle className="w-3 h-3" />, label: "Approved" },
    declined: { bg: "bg-red-100 text-red-700", icon: <X className="w-3 h-3" />, label: "Declined" },
    expired: { bg: "bg-gray-100 text-gray-500", icon: <AlertCircle className="w-3 h-3" />, label: "Expired" },
  };
  const s = map[status] ?? { bg: "bg-gray-100 text-gray-500", icon: null, label: status };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${s.bg}`}>
      {s.icon}
      {s.label}
    </span>
  );
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; label: string }> = {
    sent: { bg: "bg-orange-100 text-orange-700", label: "Due" },
    due: { bg: "bg-orange-100 text-orange-700", label: "Due" },
    paid: { bg: "bg-green-100 text-green-700", label: "Paid" },
    partial: { bg: "bg-yellow-100 text-yellow-700", label: "Partial" },
    overdue: { bg: "bg-red-100 text-red-700", label: "Overdue" },
  };
  const s = map[status] ?? { bg: "bg-gray-100 text-gray-500", label: status };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.bg}`}>
      {s.label}
    </span>
  );
}

// ─── Profile Edit Card ────────────────────────────────────────────────────────
function ProfileCard({ customer, onUpdated }: {
  customer: { name: string; email: string; phone?: string | null; address?: string | null };
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [address, setAddress] = useState(customer.address ?? "");

  const updateMutation = trpc.portal.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile updated");
      setEditing(false);
      onUpdated();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = () => {
    updateMutation.mutate({ name, phone, address });
  };

  const handleCancel = () => {
    setName(customer.name);
    setPhone(customer.phone ?? "");
    setAddress(customer.address ?? "");
    setEditing(false);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-[#1a2e1a] flex items-center justify-center text-white font-bold text-sm">
            {customer.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">{customer.name}</p>
            <p className="text-xs text-gray-500">{customer.email}</p>
          </div>
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Name</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8922a]"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Phone</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8922a]"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(360) 000-0000"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Address</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8922a]"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St, Vancouver, WA"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="bg-[#c8922a] hover:bg-[#b07d24] text-white text-xs"
              onClick={handleSave}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save
            </Button>
            <Button size="sm" variant="outline" className="text-xs" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span>{customer.email}</span>
          </div>
          {customer.phone && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <a href={`tel:${customer.phone}`} className="hover:text-[#c8922a]">{customer.phone}</a>
            </div>
          )}
          {customer.address && (
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
              <span>{customer.address}</span>
            </div>
          )}
          {!customer.phone && !customer.address && (
            <p className="text-xs text-gray-400 italic">
              Add your phone and address for faster service.{" "}
              <button onClick={() => setEditing(true)} className="text-[#c8922a] underline">Update now</button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function PortalHome() {
  const [, navigate] = useLocation();
  const [autoLoginDone, setAutoLoginDone] = useState(false);
  const autoLogin = trpc.portal.autoLoginFromStripeSession.useMutation({
    onSuccess: () => {
      // Strip session_id from URL without reload
      const url = new URL(window.location.href);
      url.searchParams.delete("session_id");
      window.history.replaceState({}, "", url.toString());
      setAutoLoginDone(true);
    },
    onError: () => setAutoLoginDone(true),
  });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (sessionId && !autoLogin.isPending && !autoLogin.isSuccess && !autoLogin.isError) {
      autoLogin.mutate({ sessionId });
    } else {
      setAutoLoginDone(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { data, isLoading, refetch } = trpc.portal.getDashboard.useQuery(undefined, {
    refetchOnWindowFocus: true,
  });
  // Must be declared before any early returns to avoid React error #310 (hooks order)
  const { data: membershipData } = trpc.portal.getMembership360.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const { data: teamInfo } = trpc.portal.getTeamInfo.useQuery();
  const { data: recentCompletion } = trpc.portal.getRecentProjectCompletion.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  if (!autoLoginDone || autoLogin.isPending) {
    return (
      <PortalLayout>
        <div className="flex flex-col justify-center items-center py-24 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#c8922a]" />
          {autoLogin.isPending && (
            <p className="hp-serif italic text-sm" style={{ color: "var(--hp-slate)" }}>
              Preparing your concierge desk…
            </p>
          )}
        </div>
      </PortalLayout>
    );
  }
  if (isLoading) {
    return (
      <PortalLayout>
        <div className="flex flex-col justify-center items-center py-24 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-[#c8922a]" />
          <p className="hp-serif italic text-sm" style={{ color: "var(--hp-slate)" }}>
            Tending to your records…
          </p>
        </div>
      </PortalLayout>
    );
  }

  const customer = data?.customer;
  const estimates = data?.estimates ?? [];
  const invoices = data?.invoices ?? [];
  const appointments = data?.appointments ?? [];
  const unreadMessages = data?.unreadMessages ?? 0;

  const pendingEstimates = estimates.filter((e) => e.status === "sent" || e.status === "viewed");
  const openInvoices = invoices.filter((i) => i.status !== "paid");
  const overdueInvoices = openInvoices.filter(
    (i) => i.dueDate && new Date(i.dueDate) < new Date()
  );
  const upcomingAppts = appointments.filter(
    (a) => new Date(a.scheduledAt).getTime() >= Date.now() && a.status === "scheduled"
  );
  const totalDue = openInvoices.reduce((sum, inv) => sum + ((inv.amountDue ?? 0) - (inv.amountPaid ?? 0)), 0);
  // Approved estimates with a linked HP opportunity = active jobs
  const activeJobs = estimates.filter((e) => e.status === "approved" && e.hpOpportunityId);
  const threeSixtyStatus = deriveThreeSixtyOperatingStatus({ membershipData });
  const methodPhaseLabel = {
    aware: "Aware",
    act: "Act",
    advance: "Advance",
  }[threeSixtyStatus.currentPhase];

  return (
    <PortalLayout>
      {/* Onboarding modal — shown only on first login */}
      {customer && !customer.onboardingCompletedAt && (
        <OnboardingModal customer={customer} onComplete={() => refetch()} />
      )}
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
        {/* Breadcrumb */}
        <p className="text-xs text-gray-400">Customer Portal &rsaquo; Home</p>

        {/* Welcome banner — concierge greeting, serif headline */}
        <div
          className="rounded-xl p-6 text-white"
          style={{ background: "linear-gradient(135deg,#1a2e1a 0%,#2d4a2d 100%)" }}
        >
          <p className="text-[11px] uppercase tracking-[0.18em] mb-2" style={{ color: "#e2b96a" }}>
            Your Concierge Desk
          </p>
          <h1
            className="hp-serif"
            style={{ fontSize: "1.85rem", lineHeight: 1.1, color: "white" }}
          >
            Welcome back, {customer?.name?.split(" ")[0] ?? "friend"}.
          </h1>
          <p className="text-sm mt-2 text-white/75">
            Your home's care, gathered in one place. Reach out anytime — we're here.
          </p>
          {totalDue > 0 && (
            <p className="text-sm mt-3" style={{ color: "rgba(255,255,255,0.85)" }}>
              An invoice of{" "}
              <span className="font-bold" style={{ color: "#e2b96a" }}>
                {fmtMoney(totalDue)}
              </span>{" "}
              is ready for your review.{" "}
              <button
                onClick={() => navigate("/portal/invoices")}
                className="underline underline-offset-2 hover:text-white"
              >
                View invoices →
              </button>
            </p>
          )}
        </div>

        <PortalWhatsNext
          estimates={estimates}
          invoices={invoices}
          appointments={appointments}
          activeJobs={activeJobs}
          membershipData={membershipData}
          onNavigate={navigate}
        />

        <PortalProperty360Plan
          propertyLabel="Primary home"
          propertyAddress={customer?.address}
          membershipData={membershipData}
          estimates={estimates}
          invoices={invoices}
          appointments={appointments}
          activeJobs={activeJobs}
          onNavigate={navigate}
        />

        {/* ── Continuity: Recent project wrap-up (Path A → B nudge) ── */}
        {recentCompletion && (
          <ProjectCompleteNudge
            customerFirstName={customer?.name?.split(" ")[0] ?? "there"}
            projectTitle={recentCompletion.projectTitle}
            completionNotes={recentCompletion.completionNotes}
            isMember={!!membershipData}
          />
        )}

        {/* ── Continuity: Home Health Score (per-customer, THIS home only) ── */}
        <HomeHealthScoreWidget customerFirstName={customer?.name?.split(" ")[0] ?? "there"} />

        {/* 360° Membership — teaser for non-members */}
        {!membershipData && (
          <div
            className="rounded-xl border-2 border-dashed border-[#1a2e1a]/30 bg-gradient-to-r from-[#1a2e1a]/5 to-amber-50/50 p-5 cursor-pointer hover:border-[#1a2e1a]/50 hover:shadow-sm transition-all"
            onClick={() => navigate('/portal/360-membership')}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#1a2e1a] flex items-center justify-center shrink-0">
                <RefreshCw className="w-5 h-5 text-[#c8922a]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#c8922a] font-bold uppercase tracking-wide mb-0.5">360° Home Method</p>
                <p className="text-sm font-bold text-[#1a2e1a] leading-snug">Protect your home proactively — stop paying emergency rates</p>
                <p className="text-xs text-muted-foreground mt-1">Seasonal visits · Labor bank · Member discounts · Home health reports</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { stat: "$6,200", label: "Avg emergency repair" },
                { stat: "$250–$500", label: "Labor bank credit" },
                { stat: "Up to 15%", label: "Off all repairs" },
              ].map((s, i) => (
                <div key={i} className="bg-white rounded-lg border border-[#1a2e1a]/10 px-2 py-2 text-center">
                  <p className="text-sm font-black text-[#c8922a]">{s.stat}</p>
                  <p className="text-[10px] text-gray-500 leading-tight">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#1a2e1a] text-white text-xs font-bold">
              See Plans &amp; Pricing →
            </div>
          </div>
        )}

        {/* 360° Membership card — shown only if enrolled */}
        {membershipData && (
          <div
            className="rounded-xl p-5 border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0">
                  <RefreshCw className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-xs text-emerald-700 font-semibold uppercase tracking-wide">360° Home Membership</p>
                  <p className="text-base font-bold text-gray-900 capitalize">{membershipData.membership.tier} Plan</p>
                  {(membershipData as any).totalMemberSavingsCents > 0 && (
                    <p className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                      You've saved ${Math.round((membershipData as any).totalMemberSavingsCents / 100)} with your membership
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => navigate('/portal/360-membership')}
                className="text-xs text-emerald-700 underline underline-offset-2 hover:text-emerald-900 shrink-0 mt-1"
              >
                View details →
              </button>
            </div>
            {/* Property address row */}
            {membershipData.membership.propertyAddressId && (
              <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-800">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{customer?.address ?? 'Property on file'}</span>
              </div>
            )}
            <div className="mt-4 rounded-xl border border-emerald-100 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Your 360 Method</p>
                  <p className="mt-0.5 text-sm font-bold text-gray-900">
                    Step {threeSixtyStatus.currentStep.number}: {threeSixtyStatus.currentStep.customerLabel}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-gray-600">{threeSixtyStatus.nextCustomerAction}</p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
                  {methodPhaseLabel}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {threeSixtyStatus.seasonalVisits.map((visit) => (
                  <div key={visit.season} className="rounded-lg border border-gray-100 bg-gray-50 px-1.5 py-1.5 text-center">
                    <p className="text-[10px] font-semibold text-gray-800">{visit.label}</p>
                    <p className={`mt-0.5 text-[9px] capitalize ${
                      visit.status === 'completed' ? 'text-emerald-700' :
                      visit.status === 'scheduled' ? 'text-blue-700' :
                      visit.status === 'due' ? 'text-amber-700' :
                      'text-gray-400'
                    }`}>
                      {visit.status.replace('_', ' ')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2">
              <div className="bg-white rounded-lg border border-emerald-100 px-2 py-2 text-center">
                <p className="text-lg font-bold text-emerald-700">${(membershipData.laborBankBalance / 100).toFixed(0)}</p>
                <p className="text-[10px] text-gray-500">Labor Bank</p>
              </div>
              <div className="bg-white rounded-lg border border-emerald-100 px-2 py-2 text-center">
                <p className="text-lg font-bold text-gray-900">{membershipData.workOrders.filter((w: any) => w.status !== 'completed').length}</p>
                <p className="text-[10px] text-gray-500">Upcoming Visits</p>
              </div>
              <div className="bg-white rounded-lg border border-emerald-100 px-2 py-2 text-center">
                <p className="text-lg font-bold text-amber-600">{membershipData.linkedEstimates.filter((e: any) => e.status === 'sent' || e.status === 'viewed').length}</p>
                <p className="text-[10px] text-gray-500">Repair Estimates</p>
              </div>
              {/* Health score from latest report */}
              {membershipData.reports.length > 0 && (membershipData.reports[0] as any).healthScore != null ? (
                <div className="bg-white rounded-lg border border-emerald-100 px-2 py-2 text-center">
                  <p className={`text-lg font-bold ${
                    (membershipData.reports[0] as any).healthScore >= 80 ? 'text-emerald-600' :
                    (membershipData.reports[0] as any).healthScore >= 60 ? 'text-amber-600' : 'text-red-600'
                  }`}>{(membershipData.reports[0] as any).healthScore}</p>
                  <p className="text-[10px] text-gray-500">Home Score</p>
                </div>
              ) : null}
            </div>
            {membershipData.linkedEstimates.filter((e: any) => e.status === 'sent' || e.status === 'viewed').length > 0 && (
              <button
                onClick={() => navigate('/portal/360-membership')}
                className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors"
              >
                <Wrench className="w-3.5 h-3.5" />
                Review flagged repair estimates
              </button>
            )}
          </div>
        )}

        {/* Quick stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              label: "Pending Estimates",
              value: pendingEstimates.length,
              icon: <ClipboardList className="w-5 h-5" />,
              color: "text-blue-600",
              bg: "bg-blue-50",
              path: "/portal/estimates",
            },
            {
              label: "Open Invoices",
              value: openInvoices.length,
              icon: <FileText className="w-5 h-5" />,
              color: "text-orange-600",
              bg: "bg-orange-50",
              path: "/portal/invoices",
            },
            {
              label: "Upcoming Appts",
              value: upcomingAppts.length,
              icon: <Calendar className="w-5 h-5" />,
              color: "text-green-600",
              bg: "bg-green-50",
              path: "/portal/appointments",
            },
            {
              label: "Messages",
              value: unreadMessages,
              icon: <MessageSquare className="w-5 h-5" />,
              color: "text-purple-600",
              bg: "bg-purple-50",
              path: "/portal/messages",
            },
            {
              label: "360° Reports",
              value: "View",
              icon: <ClipboardList className="w-5 h-5" />,
              color: "text-emerald-600",
              bg: "bg-emerald-50",
              path: "/portal/reports",
            },
          ].map((stat) => (
            <button
              key={stat.label}
              onClick={() => navigate(stat.path)}
              className="bg-white rounded-xl border border-gray-200 p-4 text-left hover:shadow-md transition-shadow"
            >
              <div className={`w-9 h-9 rounded-lg ${stat.bg} ${stat.color} flex items-center justify-center mb-2`}>
                {stat.icon}
              </div>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
            </button>
          ))}
        </div>

        {/* Two-column layout on desktop */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: Profile */}
          {customer && (
            <ProfileCard customer={customer} onUpdated={() => refetch()} />
          )}

          {/* Right: Upcoming appointment */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 text-sm">Upcoming Appointments</h3>
              <button
                onClick={() => navigate("/portal/appointments")}
                className="text-xs text-[#c8922a] hover:underline"
              >
                View all
              </button>
            </div>
            {upcomingAppts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                <Calendar className="w-10 h-10 mb-2 text-gray-200" />
                <p className="text-sm">No upcoming appointments</p>
                <button
                  onClick={() => navigate("/portal/messages")}
                  className="mt-2 text-xs text-[#c8922a] hover:underline"
                >
                  Message us to schedule →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingAppts.slice(0, 3).map((appt) => (
                  <div key={appt.id} className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-green-50 text-green-600 flex items-center justify-center shrink-0">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{appt.title}</p>
                      <p className="text-xs text-gray-500">{fmtDateShort(appt.scheduledAt)}</p>
                      {appt.techName && (
                        <p className="text-xs text-gray-400">Tech: {appt.techName}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pending Estimates */}
        {pendingEstimates.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 text-sm">Estimates Awaiting Your Review</h3>
              <button
                onClick={() => navigate("/portal/estimates")}
                className="text-xs text-[#c8922a] hover:underline"
              >
                View all
              </button>
            </div>
            <div className="divide-y divide-gray-100">
              {pendingEstimates.slice(0, 5).map((est) => (
                <button
                  key={est.id}
                  onClick={() => navigate(`/portal/estimates/${est.id}`)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                >
                  <ClipboardList className="w-4 h-4 text-blue-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {est.estimateNumber} — {est.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      Sent {fmtDate(est.sentAt)} · {fmtMoney(est.totalAmount)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <EstimateStatusBadge status={est.status} />
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Active Jobs */}
        {activeJobs.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 text-sm">Active Jobs</h3>
            </div>
            <div className="divide-y divide-gray-100">
              {activeJobs.map((est) => (
                <button
                  key={est.id}
                  onClick={() => navigate(`/portal/job/${est.hpOpportunityId}`)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="w-7 h-7 rounded-full bg-[#2d4a2d] flex items-center justify-center shrink-0">
                    <Briefcase className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{est.title}</p>
                    <p className="text-xs text-gray-500">Approved {fmtDate(est.approvedAt ?? est.sentAt)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600">In Progress</span>
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Open Invoices */}
        {/* Overdue alert banner */}
        {overdueInvoices.length > 0 && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-700">
                {overdueInvoices.length === 1 ? '1 invoice is overdue' : `${overdueInvoices.length} invoices are overdue`}
              </p>
              <p className="text-xs text-red-600 mt-0.5">
                Please pay the outstanding balance to avoid service interruptions.
              </p>
            </div>
            <button
              onClick={() => navigate('/portal/invoices')}
              className="text-xs font-semibold text-red-700 underline shrink-0"
            >
              View
            </button>
          </div>
        )}

        {openInvoices.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 text-sm">Outstanding Invoices</h3>
              <button
                onClick={() => navigate("/portal/invoices")}
                className="text-xs text-[#c8922a] hover:underline"
              >
                View all
              </button>
            </div>
            <div className="divide-y divide-gray-100">
              {openInvoices.slice(0, 5).map((inv) => {
                const balance = (inv.amountDue ?? 0) - (inv.amountPaid ?? 0);
                return (
                  <div
                    key={inv.id}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
                  >
                    {inv.dueDate && new Date(inv.dueDate) < new Date() ? (
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 text-orange-500 shrink-0" />
                    )}
                    <button
                      className="flex-1 min-w-0 text-left"
                      onClick={() => navigate(`/portal/invoices/${inv.id}`)}
                    >
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {inv.invoiceNumber} — {inv.jobTitle ?? inv.type}
                      </p>
                      <p className="text-xs text-gray-500">
                        Due {fmtDate(inv.dueDate)} · Balance {fmtMoney(balance)}
                      </p>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <InvoiceStatusBadge
                        status={inv.dueDate && new Date(inv.dueDate) < new Date() ? "overdue" : inv.status}
                      />
                      <Button
                        size="sm"
                        className="bg-[#2D5016] hover:bg-[#1a2e0d] text-white text-xs h-7 px-2 gap-1"
                        onClick={() => navigate(`/portal/invoices/${inv.id}`)}
                      >
                        <CreditCard className="w-3 h-3" /> Pay
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Your Team card */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 text-sm mb-4">Your Team</h3>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[#1a2e1a] flex items-center justify-center shrink-0">
              <User className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{teamInfo?.name ?? 'Handy Pioneers Team'}</p>
              <p className="text-xs text-gray-500">Your Account Manager</p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {teamInfo?.phone && (
              <a
                href={`tel:${teamInfo.phone}`}
                className="flex items-center gap-2 text-sm text-gray-700 hover:text-[#1a2e1a] transition-colors"
              >
                <Phone className="w-4 h-4 text-[#c8922a] shrink-0" />
                {teamInfo.phone}
              </a>
            )}
            <a
              href={`mailto:${teamInfo?.email ?? 'help@handypioneers.com'}`}
              className="flex items-center gap-2 text-sm text-gray-700 hover:text-[#1a2e1a] transition-colors"
            >
              <Mail className="w-4 h-4 text-[#c8922a] shrink-0" />
              {teamInfo?.email ?? 'help@handypioneers.com'}
            </a>
          </div>
          <button
            onClick={() => navigate('/portal/messages')}
            className="mt-4 w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-[#1a2e1a] text-white text-sm font-semibold hover:bg-[#2d4a2d] transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            Send a Message
          </button>
        </div>

        {/* Empty state: no activity */}
        {estimates.length === 0 && invoices.length === 0 && appointments.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
              style={{ background: "rgba(200,146,42,0.1)" }}
            >
              <User className="w-7 h-7" style={{ color: "#c8922a" }} />
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">Welcome to Your Portal</h3>
            <p className="text-sm text-gray-500 mb-4">
              Your estimates, invoices, and appointments will appear here once your project is underway.
            </p>
            <Button
              onClick={() => navigate("/portal/messages")}
              className="bg-[#c8922a] hover:bg-[#b07d24] text-white"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Send a Message
            </Button>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
