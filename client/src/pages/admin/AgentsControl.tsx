import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AdminShell } from "./AdminShell";
import { DEPARTMENTS, STATUS_CLASS, STATUS_LABEL, departmentLabel, formatUsd } from "./constants";

/**
 * /admin/agents/control — engine control plane.
 *
 * One screen for Marcin to:
 *   - Flip every AI seat to autonomous in one click (the "let it run" button).
 *   - Pause every agent in one click (emergency kill switch).
 *   - Toggle a single seat or a whole department to autonomous/paused/draft.
 *   - Watch the live cost roll-up — what's been spent in the last 24h vs cap.
 *   - Trigger an on-demand System Integrity scan when something feels off.
 *
 * The UI deliberately doesn't let you delete an agent or rewrite their prompt
 * here — that's the AI Agents page. This page is about turning the engine on
 * and off, and the smallest set of safe controls Marcin needs day-to-day.
 */
export default function AgentsControl() {
  const utils = trpc.useUtils();
  const agentsQ = trpc.aiAgents.list.useQuery();
  const costQ = trpc.aiAgents.costSummary.useQuery();
  const optimizationsQ = trpc.aiAgents.listOptimizationTasks.useQuery({ status: "open" });
  const [confirmKill, setConfirmKill] = useState(false);

  const activate = trpc.aiAgents.activateAll.useMutation({
    onSuccess: (res) => {
      utils.aiAgents.list.invalidate();
      utils.aiAgents.costSummary.invalidate();
      toast.success(`Activated ${res.updated} of ${res.total} seats — engine running.`);
    },
    onError: (err) => toast.error(err.message),
  });

  const pauseAll = trpc.aiAgents.pauseAll.useMutation({
    onSuccess: (res) => {
      utils.aiAgents.list.invalidate();
      utils.aiAgents.costSummary.invalidate();
      toast.success(`Paused ${res.paused} live seats. Engine off.`);
      setConfirmKill(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const setStatus = trpc.aiAgents.setStatus.useMutation({
    onSuccess: () => {
      utils.aiAgents.list.invalidate();
      utils.aiAgents.costSummary.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const bulkSet = trpc.aiAgents.bulkSetStatus.useMutation({
    onSuccess: (res) => {
      utils.aiAgents.list.invalidate();
      utils.aiAgents.costSummary.invalidate();
      toast.success(`Updated ${res.updated} seat${res.updated === 1 ? "" : "s"}.`);
    },
    onError: (err) => toast.error(err.message),
  });

  const runScan = trpc.aiAgents.runSystemIntegrityScanNow.useMutation({
    onSuccess: (res) => {
      utils.aiAgents.listOptimizationTasks.invalidate();
      toast.success(`Scan complete. ${res.flagsRaised} flag${res.flagsRaised === 1 ? "" : "s"} raised.`);
    },
    onError: (err) => toast.error(err.message),
  });

  const reviewOpt = trpc.aiAgents.reviewOptimizationTask.useMutation({
    onSuccess: () => utils.aiAgents.listOptimizationTasks.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const agents = agentsQ.data ?? [];
  const cost = costQ.data;
  const optimizations = optimizationsQ.data ?? [];

  const counts = {
    total: agents.length,
    autonomous: agents.filter((a) => a.status === "autonomous").length,
    draft: agents.filter((a) => a.status === "draft_queue").length,
    paused: agents.filter((a) => a.status === "paused").length,
    disabled: agents.filter((a) => a.status === "disabled").length,
  };

  // Group by department for the per-department control rows.
  const grouped = DEPARTMENTS.map((d) => ({
    ...d,
    agents: agents.filter((a) => a.department === d.slug),
  })).filter((g) => g.agents.length > 0);

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Agent engine control</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Turn the AI org on, pause it, or steer department by department. Cost ceilings, approval
            gating, and the System Integrity feedback loop run regardless of what you set here.
          </p>
        </div>

        {/* ─── Big buttons ─── */}
        <Card className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 sm:gap-4">
            <Button
              size="lg"
              className="w-full sm:w-auto min-h-[48px] text-base"
              disabled={activate.isPending || counts.draft + counts.paused === 0}
              onClick={() => activate.mutate({})}
            >
              {activate.isPending ? "Activating…" : `Activate all (${counts.draft + counts.paused} ready)`}
            </Button>
            {confirmKill ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                <span className="text-sm text-red-700 font-medium">
                  This pauses {counts.autonomous} live seat{counts.autonomous === 1 ? "" : "s"}. Sure?
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    className="flex-1 sm:flex-none min-h-[44px]"
                    disabled={pauseAll.isPending}
                    onClick={() => pauseAll.mutate()}
                  >
                    Yes, pause everything
                  </Button>
                  <Button variant="outline" className="flex-1 sm:flex-none min-h-[44px]" onClick={() => setConfirmKill(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="lg"
                variant="destructive"
                className="w-full sm:w-auto min-h-[44px]"
                disabled={counts.autonomous === 0}
                onClick={() => setConfirmKill(true)}
              >
                Emergency: pause all
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full sm:w-auto min-h-[44px]"
              disabled={runScan.isPending}
              onClick={() => runScan.mutate()}
            >
              {runScan.isPending ? "Scanning…" : "Run System Integrity scan"}
            </Button>
          </div>

          {/* Status snapshot */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-5 pt-4 border-t">
            <Stat label="Total seats" value={counts.total} />
            <Stat label="Autonomous" value={counts.autonomous} valueClass="text-green-700" />
            <Stat label="Draft" value={counts.draft} valueClass="text-amber-700" />
            <Stat label="Paused" value={counts.paused} valueClass="text-slate-700" />
            <Stat label="Spend (24h)" value={formatUsd(cost?.totalCost24hUsd ?? 0)} />
          </div>
        </Card>

        {/* ─── System Integrity flags ─── */}
        {optimizations.length > 0 && (
          <Card className="p-4">
            <div className="text-sm font-medium mb-3">
              System Integrity flags ({optimizations.length} open)
            </div>
            <div className="space-y-2">
              {optimizations.slice(0, 8).map((o) => (
                <div key={o.id} className="border rounded p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="font-medium">
                        <Badge
                          variant="outline"
                          className={
                            o.severity === "critical"
                              ? "bg-red-100 text-red-700 border-red-200 mr-2"
                              : o.severity === "warn"
                              ? "bg-amber-100 text-amber-700 border-amber-200 mr-2"
                              : "bg-slate-100 text-slate-700 border-slate-200 mr-2"
                          }
                        >
                          {o.severity}
                        </Badge>
                        {o.title}
                      </div>
                      <pre className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap font-sans">
                        {o.details}
                      </pre>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => reviewOpt.mutate({ id: o.id, status: "acknowledged" })}
                      >
                        Acknowledge
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => reviewOpt.mutate({ id: o.id, status: "dismissed" })}
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ─── Per-department control ─── */}
        <div className="space-y-3">
          {grouped.map((g) => {
            const ids = g.agents.map((a) => a.id);
            const live = g.agents.filter((a) => a.status === "autonomous").length;
            const draft = g.agents.filter((a) => a.status === "draft_queue").length;
            const dept24h = (cost?.perSeat ?? [])
              .filter((p) => p.department === g.slug)
              .reduce((s, p) => s + p.cost24hUsd, 0);
            return (
              <Card key={g.slug} className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                  <div>
                    <div className="text-sm font-medium">{g.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {g.agents.length} seat{g.agents.length === 1 ? "" : "s"} · {live} live · {draft} draft · {formatUsd(dept24h)} (24h)
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 sm:flex-none min-h-[40px] text-xs sm:text-sm"
                      onClick={() => bulkSet.mutate({ ids, status: "autonomous" })}
                    >
                      All autonomous
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 sm:flex-none min-h-[40px] text-xs sm:text-sm"
                      onClick={() => bulkSet.mutate({ ids, status: "paused" })}
                    >
                      All paused
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {g.agents.map((a) => {
                    const seatCost = (cost?.perSeat ?? []).find((p) => p.agentId === a.id);
                    return (
                      <div
                        key={a.id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between border rounded px-3 py-3 text-sm gap-2"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{a.seatName}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatUsd(seatCost?.cost24hUsd ?? 0)} / {formatUsd(Number(a.costCapDailyUsd))} cap
                            · {a.runsToday} runs · {a.queuedTasks} queued
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:shrink-0">
                          <Badge variant="outline" className={STATUS_CLASS[a.status]}>
                            {STATUS_LABEL[a.status] ?? a.status}
                          </Badge>
                          <select
                            className="border rounded px-2 py-2 text-sm bg-background min-h-[40px] flex-1 sm:flex-none"
                            value={a.status}
                            onChange={(e) =>
                              setStatus.mutate({ id: a.id, status: e.target.value as never })
                            }
                          >
                            <option value="autonomous">Autonomous</option>
                            <option value="draft_queue">Draft</option>
                            <option value="paused">Paused</option>
                            <option value="disabled">Disabled</option>
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </AdminShell>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: string | number; valueClass?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold mt-1 tabular-nums ${valueClass ?? ""}`}>{value}</div>
    </div>
  );
}

// Shared formatter (defined here to avoid an extra import; mirrors AdminDashboard's heuristic).
// Also exported for convenience if other files want it later.
export { departmentLabel };
