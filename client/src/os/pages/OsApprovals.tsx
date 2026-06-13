/**
 * OsApprovals — the one approvals inbox inside the OS shell. Reuses the
 * merged inbox (parked agent actions + nurturer drafts) from the Agents Hub.
 */
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ChevronRight, Map } from "lucide-react";
import { OsShell } from "../OsShell";
import { ApprovalsTab } from "@/pages/admin/AgentsHubPage";

export default function OsApprovals() {
  const utils = trpc.useUtils();
  const { data: awaitingTasks } = trpc.aiAgents.listTasks.useQuery(
    { status: "awaiting_approval", limit: 50 },
    { refetchInterval: 30_000 },
  );
  const { data: readyDrafts } = trpc.agentDrafts.listReady.useQuery(undefined, { refetchInterval: 30_000 });
  const { data: awaitingRoadmaps } = trpc.priorityTranslation.listAwaitingReview.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const clearApprovals = trpc.os.maintenance.clearApprovals.useMutation({
    onSuccess: (res) => {
      utils.invalidate();
      toast.success(`Declined ${res.counts.drafts} draft${res.counts.drafts === 1 ? "" : "s"} and ${res.counts.tasks} agent task${res.counts.tasks === 1 ? "" : "s"}.`);
    },
    onError: (e) => toast.error(e.message),
  });

  const pendingCount = (awaitingTasks?.length ?? 0) + (readyDrafts?.length ?? 0);

  return (
    <OsShell active="/os/approvals">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="hp-serif text-2xl" style={{ color: "var(--hp-ink)" }}>
            Approvals
          </h1>
          <p className="text-sm text-muted-foreground mt-1 mb-5">
            Nothing reaches a customer without landing here first.
          </p>
        </div>
        {pendingCount > 0 && (
          <button
            type="button"
            disabled={clearApprovals.isPending}
            onClick={() => {
              if (window.confirm(`Decline all ${pendingCount} waiting item${pendingCount === 1 ? "" : "s"}? Nothing is deleted, but none of them will send.`)) {
                clearApprovals.mutate();
              }
            }}
            className="text-xs px-3 py-2 rounded-lg font-semibold border hover:shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-shadow shrink-0"
            style={{ borderColor: "var(--hp-hairline)", color: "var(--hp-ink)" }}
          >
            {clearApprovals.isPending ? "Declining..." : "Decline all"}
          </button>
        )}
      </div>
      {(awaitingRoadmaps?.length ?? 0) > 0 && (
        <section className="mb-6">
          <h2 className="hp-eyebrow text-xs mb-2 flex items-center gap-1.5" style={{ color: "var(--hp-gold-deep)" }}>
            <Map className="w-3.5 h-3.5" /> Roadmaps awaiting review
          </h2>
          <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: "var(--hp-hairline)" }}>
            {awaitingRoadmaps!.map((r) => (
              <Link
                key={r.id}
                href={r.source === "spot_inspection" ? `/os/spot/${r.id}` : `/os/roadmap-review/${r.id}`}
              >
                <div
                  className="flex items-center justify-between gap-3 px-4 py-3 border-b last:border-0 text-sm cursor-pointer hover:bg-black/[0.02]"
                  style={{ borderColor: "var(--hp-hairline)", color: "var(--hp-ink)" }}
                >
                  <div className="min-w-0">
                    <p className="font-semibold truncate">
                      {r.customerName || r.email}
                      <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        {r.source === "spot_inspection" ? "Spot inspection" : "Roadmap funnel"}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {[r.propertyAddress, `${r.findingCount} finding${r.findingCount === 1 ? "" : "s"}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
      <ApprovalsTab awaitingTasks={awaitingTasks} readyDrafts={readyDrafts} />
    </OsShell>
  );
}
