/**
 * OsApprovals — the one approvals inbox inside the OS shell. Reuses the
 * merged inbox (parked agent actions + nurturer drafts) from the Agents Hub.
 */
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { OsShell } from "../OsShell";
import { ApprovalsTab } from "@/pages/admin/AgentsHubPage";

export default function OsApprovals() {
  const utils = trpc.useUtils();
  const { data: awaitingTasks } = trpc.aiAgents.listTasks.useQuery(
    { status: "awaiting_approval", limit: 50 },
    { refetchInterval: 30_000 },
  );
  const { data: readyDrafts } = trpc.agentDrafts.listReady.useQuery(undefined, { refetchInterval: 30_000 });

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
      <ApprovalsTab awaitingTasks={awaitingTasks} readyDrafts={readyDrafts} />
    </OsShell>
  );
}
