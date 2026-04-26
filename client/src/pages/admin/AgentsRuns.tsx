import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminShell } from "./AdminShell";
import { departmentLabel, formatUsd } from "./constants";

/**
 * /admin/agents/runs — live observability table for every agent run.
 *
 * Filters: seat, status, free-text search across output. Sorted newest-first.
 * Click a row to expand the full output, tool calls, and error message —
 * keeps the surface area small but lets Marcin diagnose without leaving the
 * admin.
 *
 * Reads run rows via aiAgents.runsFeed (server-side filter on status, client
 * filter on seat substring + free-text). Pull-to-refresh is the browser
 * refresh, keep it boring.
 */
const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "success", label: "Success", className: "bg-green-100 text-green-700" },
  { value: "failed", label: "Failed", className: "bg-red-100 text-red-700" },
  { value: "tool_error", label: "Tool err", className: "bg-amber-100 text-amber-700" },
  { value: "cost_exceeded", label: "Cost cap", className: "bg-rose-100 text-rose-700" },
  { value: "timed_out", label: "Timed out", className: "bg-slate-100 text-slate-700" },
] as const;

type RunStatus = Exclude<(typeof STATUS_FILTERS)[number]["value"], "">;

export default function AgentsRuns() {
  const [location] = useLocation();
  // Initial seat filter from ?seat= query param so the System Integrity flag
  // links pre-filter for the admin.
  const initialSeat = useMemo(() => {
    if (typeof window === "undefined") return "";
    const sp = new URLSearchParams(window.location.search);
    return sp.get("seat") ?? "";
  }, [location]);

  const [statusFilter, setStatusFilter] = useState<RunStatus | "">("");
  const [seatFilter, setSeatFilter] = useState<string>(initialSeat);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const runsQ = trpc.aiAgents.runsFeed.useQuery({
    seat: seatFilter || undefined,
    status: (statusFilter || undefined) as RunStatus | undefined,
    limit: 200,
  });
  const costQ = trpc.aiAgents.costSummary.useQuery();

  const rows = (runsQ.data ?? []).filter((r) => {
    if (!search.trim()) return true;
    const needle = search.toLowerCase();
    return (
      (r.output ?? "").toLowerCase().includes(needle) ||
      r.seatName.toLowerCase().includes(needle) ||
      (r.errorMessage ?? "").toLowerCase().includes(needle)
    );
  });

  const cost = costQ.data;

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Agent runs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every model call by every seat. Filter by status or seat name. Click a row to expand.
          </p>
        </div>

        {/* Cost roll-up */}
        <Card className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Spend (24h)" value={formatUsd(cost?.totalCost24hUsd ?? 0)} />
            <Stat label="Runs (24h)" value={cost?.totalRuns24h ?? 0} />
            <Stat label="Spend (7d)" value={formatUsd(cost?.totalCost7dUsd ?? 0)} />
            <Stat label="Runs (7d)" value={cost?.totalRuns7d ?? 0} />
          </div>
        </Card>

        {/* Filters */}
        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              {STATUS_FILTERS.map((f) => (
                <Button
                  key={f.value}
                  size="sm"
                  variant={statusFilter === f.value ? "default" : "outline"}
                  onClick={() => setStatusFilter(f.value as RunStatus | "")}
                >
                  {f.label}
                </Button>
              ))}
            </div>
            <Input
              placeholder="Filter seatName"
              value={seatFilter}
              onChange={(e) => setSeatFilter(e.target.value)}
              className="w-44"
            />
            <Input
              placeholder="Search output / error"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-[200px]"
            />
            <Button size="sm" variant="ghost" onClick={() => runsQ.refetch()}>
              Refresh
            </Button>
          </div>
        </Card>

        {/* Runs table */}
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="text-left p-2 font-medium">When</th>
                <th className="text-left p-2 font-medium">Seat</th>
                <th className="text-left p-2 font-medium">Status</th>
                <th className="text-right p-2 font-medium">Tokens</th>
                <th className="text-right p-2 font-medium">Cost</th>
                <th className="text-right p-2 font-medium">Tools</th>
                <th className="text-left p-2 font-medium">Output preview</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-sm text-muted-foreground italic">
                    {runsQ.isLoading ? "Loading…" : "No runs match these filters."}
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const tools: Array<{ key: string; output?: unknown; error?: string }> = (() => {
                    try {
                      return JSON.parse(r.toolCalls ?? "[]");
                    } catch {
                      return [];
                    }
                  })();
                  const isExpanded = expanded === r.id;
                  return (
                    <>
                      <tr
                        key={r.id}
                        className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                        onClick={() => setExpanded(isExpanded ? null : r.id)}
                      >
                        <td className="p-2 text-xs text-muted-foreground tabular-nums">
                          {formatRelative(r.createdAt)}
                        </td>
                        <td className="p-2">
                          <div className="font-medium">{r.seatName}</div>
                          <div className="text-xs text-muted-foreground">
                            {departmentLabel(r.department)}
                          </div>
                        </td>
                        <td className="p-2">
                          <Badge variant="outline" className={statusClass(r.status)}>
                            {r.status}
                          </Badge>
                        </td>
                        <td className="p-2 text-right tabular-nums text-xs">
                          {r.inputTokens + r.outputTokens}
                        </td>
                        <td className="p-2 text-right tabular-nums text-xs">
                          {formatUsd(Number(r.costUsd))}
                        </td>
                        <td className="p-2 text-right tabular-nums text-xs">{tools.length}</td>
                        <td className="p-2 text-xs text-muted-foreground max-w-[420px] truncate">
                          {r.errorMessage ? (
                            <span className="text-red-700">{r.errorMessage}</span>
                          ) : (
                            (r.output ?? "").slice(0, 200)
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${r.id}-x`} className="bg-muted/20">
                          <td colSpan={7} className="p-3 text-xs">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <div className="font-medium mb-1">Output</div>
                                <pre className="whitespace-pre-wrap font-sans bg-background border rounded p-2 max-h-64 overflow-auto">
                                  {r.output || "—"}
                                </pre>
                              </div>
                              <div>
                                <div className="font-medium mb-1">Tool calls</div>
                                {tools.length === 0 ? (
                                  <div className="text-muted-foreground italic">No tool calls.</div>
                                ) : (
                                  <pre className="whitespace-pre-wrap font-mono bg-background border rounded p-2 max-h-64 overflow-auto text-[11px]">
                                    {JSON.stringify(tools, null, 2)}
                                  </pre>
                                )}
                                {r.errorMessage && (
                                  <div className="mt-2">
                                    <div className="font-medium mb-1">Error</div>
                                    <pre className="whitespace-pre-wrap text-red-700 bg-red-50 border border-red-200 rounded p-2 max-h-32 overflow-auto">
                                      {r.errorMessage}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </AdminShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1 tabular-nums">{value}</div>
    </div>
  );
}

function formatRelative(ts: Date | string): string {
  const t = typeof ts === "string" ? new Date(ts) : ts;
  const seconds = Math.max(0, Math.floor((Date.now() - t.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function statusClass(status: string): string {
  switch (status) {
    case "success":
      return "bg-green-100 text-green-700 border-green-200";
    case "failed":
      return "bg-red-100 text-red-700 border-red-200";
    case "tool_error":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "cost_exceeded":
      return "bg-rose-100 text-rose-700 border-rose-200";
    case "timed_out":
      return "bg-slate-100 text-slate-700 border-slate-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}
