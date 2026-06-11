/**
 * OsApprovals — the one approvals inbox inside the OS shell. Reuses the
 * merged inbox (parked agent actions + nurturer drafts) from the Agents Hub.
 */
import { trpc } from "@/lib/trpc";
import { OsShell } from "../OsShell";
import { ApprovalsTab } from "@/pages/admin/AgentsHubPage";

export default function OsApprovals() {
  const { data: awaitingTasks } = trpc.aiAgents.listTasks.useQuery(
    { status: "awaiting_approval", limit: 50 },
    { refetchInterval: 30_000 },
  );
  const { data: readyDrafts } = trpc.agentDrafts.listReady.useQuery(undefined, { refetchInterval: 30_000 });

  return (
    <OsShell active="/os/approvals">
      <h1 className="hp-serif text-2xl" style={{ color: "var(--hp-ink)" }}>
        Approvals
      </h1>
      <p className="text-sm text-muted-foreground mt-1 mb-5">
        Nothing reaches a customer without landing here first.
      </p>
      <ApprovalsTab awaitingTasks={awaitingTasks} readyDrafts={readyDrafts} />
    </OsShell>
  );
}
