import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import PortalLayout from "@/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, Circle, Clock, Flag, ChevronLeft, Briefcase, ClipboardCheck, RefreshCw } from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(ts: number | Date | string | null | undefined) {
  if (!ts) return null;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(ts: number | Date | string | null | undefined) {
  if (!ts) return null;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const STATUS_CONFIG = {
  pending:     { label: "Upcoming",    icon: Circle,       color: "text-slate-400",   bar: "bg-slate-200",    ring: "ring-slate-200" },
  in_progress: { label: "In Progress", icon: Clock,        color: "text-sky-500",     bar: "bg-sky-400",      ring: "ring-sky-300" },
  complete:    { label: "Complete",    icon: CheckCircle2, color: "text-emerald-500", bar: "bg-emerald-500",  ring: "ring-emerald-300" },
} as const;

// ── Component ─────────────────────────────────────────────────────────────────
export default function PortalJobDetail() {
  const [, params] = useRoute("/portal/job/:hpOpportunityId");
  const [, navigate] = useLocation();
  const hpOpportunityId = params?.hpOpportunityId ?? "";

  const { data, isLoading, error } = trpc.portal.getCustomerJobProgress.useQuery(
    { hpOpportunityId },
    { enabled: !!hpOpportunityId, staleTime: 30_000, refetchInterval: 60_000, refetchOnWindowFocus: true }
  );

  const milestones = data?.milestones ?? [];
  const updates = data?.updates ?? [];
  const membershipId = data?.membershipId ?? null;
  const membershipTier = data?.membershipTier ?? null;

  // Compute overall progress
  const total = milestones.length;
  const done = milestones.filter((m) => m.status === "complete").length;
  const inProgress = milestones.filter((m) => m.status === "in_progress").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const currentMilestone = milestones.find((m) => m.status === "in_progress") ?? milestones.find((m) => m.status === "pending");
  const allComplete = total > 0 && milestones.every((m) => m.status === "complete");
  // Also show sign-off CTA if HP has marked the job as Awaiting Sign-Off (even with no milestones)
  const awaitingSignOff = data?.stage === 'Awaiting Sign-Off';

  // Check if customer has already signed off
  const { data: signOff } = trpc.portal.getJobSignOff.useQuery(
    { hpOpportunityId },
    { enabled: !!hpOpportunityId, staleTime: 60_000, refetchInterval: 120_000, refetchOnWindowFocus: true }
  );

  return (
    <PortalLayout>
      <div className="p-6 max-w-3xl mx-auto">
        {/* Breadcrumb */}
        <button
          onClick={() => navigate("/portal/home")}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-4 transition-colors"
        >
          <ChevronLeft className="w-3 h-3" /> Back to Home
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-full bg-[#2d4a2d] flex items-center justify-center">
            <Briefcase className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-light text-gray-900">Job Progress</h1>
            <p className="text-xs text-gray-400 mt-0.5">Track your project milestones and updates</p>
          </div>
        </div>

        {/* 360° Membership banner */}
        {membershipId && (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 mb-4">
            <RefreshCw className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-800">360° Membership Job</p>
              <p className="text-xs text-emerald-700 mt-0.5 capitalize">{membershipTier ?? 'Member'} Plan — This job is part of your home membership.</p>
            </div>
            <button
              onClick={() => navigate('/portal/360-membership')}
              className="text-xs text-emerald-700 underline underline-offset-2 hover:text-emerald-900 shrink-0"
            >
              View membership →
            </button>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-[#2d4a2d]" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Unable to load job progress. Please try again later.
          </div>
        )}

        {!isLoading && !error && (
          <>
            {/* ── Overall progress card ── */}
            {total > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6 shadow-sm">
                <div className="flex items-end justify-between mb-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-0.5">Overall Progress</p>
                    <p className="text-3xl font-light text-gray-900">{pct}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">{done} of {total} milestones complete</p>
                    {inProgress > 0 && (
                      <p className="text-xs text-sky-600 font-medium mt-0.5">{inProgress} in progress</p>
                    )}
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#2d4a2d] rounded-full transition-all duration-700"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {currentMilestone && (
                  <p className="text-xs text-gray-500 mt-2">
                    <span className="font-medium text-gray-700">Currently: </span>
                    {currentMilestone.title}
                    {currentMilestone.scheduledDate && (
                      <span className="text-gray-400"> · {fmtDate(currentMilestone.scheduledDate)}</span>
                    )}
                  </p>
                )}
                {/* Sign-off CTA — shown when all milestones complete OR job is Awaiting Sign-Off */}
                {(allComplete || awaitingSignOff) && !signOff && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <Button
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => navigate(`/portal/job/${hpOpportunityId}/complete`)}
                    >
                      <ClipboardCheck className="w-4 h-4 mr-2" />
                      Sign Off on Completed Work
                    </Button>
                  </div>
                )}
                {/* Already signed badge */}
                {signOff && (
                  <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <p className="text-xs text-emerald-700 font-medium">
                      Signed off on {fmtDate(signOff.signedAt)} by {signOff.signerName}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── Milestones timeline ── */}
            {milestones.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center mb-6">
                <Briefcase className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">Your project milestones will appear here once your job is scheduled.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6 shadow-sm">
                <div className="px-5 py-3 border-b border-gray-100">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Milestones</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {milestones.map((m, idx) => {
                    const cfg = STATUS_CONFIG[m.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
                    const Icon = cfg.icon;
                    const isLast = idx === milestones.length - 1;
                    return (
                      <div key={m.id} className="flex gap-4 px-5 py-4 relative">
                        {/* Connector line */}
                        {!isLast && (
                          <div className="absolute left-[28px] top-10 bottom-0 w-px bg-gray-100" />
                        )}
                        {/* Icon */}
                        <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ring-2 ${cfg.ring} bg-white z-10`}>
                          <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                        </div>
                        {/* Content */}
                        <div className="flex-1 min-w-0 pb-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-sm font-medium leading-snug ${m.status === "complete" ? "text-gray-400 line-through" : "text-gray-900"}`}>
                              {m.title}
                            </p>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${
                              m.status === "complete" ? "bg-emerald-50 text-emerald-600" :
                              m.status === "in_progress" ? "bg-sky-50 text-sky-600" :
                              "bg-gray-50 text-gray-400"
                            }`}>
                              {cfg.label}
                            </span>
                          </div>
                          {m.description && (
                            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{m.description}</p>
                          )}
                          {m.scheduledDate && (
                            <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Scheduled: {fmtDate(m.scheduledDate)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Progress updates feed ── */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Updates from Handy Pioneers</p>
              </div>
              {updates.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <Flag className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">No updates posted yet. Check back soon!</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {updates.map((u) => (
                    <div key={u.id} className="flex gap-3 px-5 py-4">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#c8922a]/10 flex items-center justify-center mt-0.5">
                        <Flag className="w-3 h-3 text-[#c8922a]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 leading-relaxed">{u.message}</p>
                        <p className="text-[11px] text-gray-400 mt-1">
                          {u.postedBy ?? "Handy Pioneers"} · {fmtDateTime(u.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </PortalLayout>
  );
}
