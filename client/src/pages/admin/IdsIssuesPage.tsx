/**
 * IDS Issues Log (audit Rec 2) — admin view of the BOS Identify/Discuss/Solve
 * list. Auto-created issues (margin floor, estimate variance, visit slip) and
 * manual entries; status workflow + solve action.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { AdminShell } from "./AdminShell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle } from "lucide-react";

type StatusFilter = "open" | "discussing" | "solved" | "dropped" | "all";

const STATUS_STYLES: Record<string, string> = {
  open: "bg-red-100 text-red-800",
  discussing: "bg-amber-100 text-amber-800",
  solved: "bg-green-100 text-green-800",
  dropped: "bg-gray-100 text-gray-600",
};
const PRIORITY_STYLES: Record<string, string> = {
  high: "bg-red-100 text-red-800",
  normal: "bg-slate-100 text-slate-700",
  low: "bg-slate-50 text-slate-500",
};
const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  margin_floor: "Margin floor",
  estimate_variance: "Est. variance",
  visit_slip: "Visit slip",
  scorecard_red: "Scorecard",
};

export default function IdsIssuesPage() {
  const [status, setStatus] = useState<StatusFilter>("open");
  const utils = trpc.useUtils();
  const issuesQ = trpc.ids.list.useQuery({ status: status === "all" ? undefined : status, limit: 500 });
  const statsQ = trpc.ids.stats.useQuery();
  const categoriesQ = trpc.ids.categories.useQuery();
  const categories = categoriesQ.data ?? {};

  const invalidate = () => {
    utils.ids.list.invalidate();
    utils.ids.stats.invalidate();
  };
  const updateM = trpc.ids.update.useMutation({ onSuccess: invalidate });
  const solveM = trpc.ids.solve.useMutation({ onSuccess: invalidate });

  const issues = issuesQ.data ?? [];

  const handleSolve = (id: string) => {
    const action = window.prompt("Solve — what is the one action / owner / due date?");
    if (action && action.trim()) solveM.mutate({ id, action: action.trim() });
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-amber-600" /> IDS Issues Log
            </h1>
            <p className="text-sm text-muted-foreground">Identify · Discuss · Solve — worked at the weekly L10.</p>
          </div>
          <div className="flex gap-1">
            {(["open", "discussing", "solved", "dropped", "all"] as StatusFilter[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`px-3 py-1.5 rounded text-sm capitalize ${status === s ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <Card className="p-4">
          <div className="flex items-center gap-6 flex-wrap">
            <div>
              <div className="text-2xl font-bold">{statsQ.data?.openCount ?? "—"}</div>
              <div className="text-xs text-muted-foreground">open issues</div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(statsQ.data?.byCategory ?? {}).map(([cat, n]) => (
                <Badge key={cat} variant="outline" title={categories[cat as keyof typeof categories]}>
                  {cat}: {n as number}
                </Badge>
              ))}
            </div>
          </div>
        </Card>

        {/* Table */}
        <Card>
          {issuesQ.isLoading ? (
            <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /> Loading…</div>
          ) : issues.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No {status === "all" ? "" : status} issues.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="text-left p-3 font-medium">Cat</th>
                  <th className="text-left p-3 font-medium">Issue</th>
                  <th className="text-left p-3 font-medium">Source</th>
                  <th className="text-left p-3 font-medium">Priority</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((iss) => (
                  <tr key={iss.id} className="border-b last:border-0 hover:bg-muted/40 align-top">
                    <td className="p-3"><Badge variant="outline" title={categories[iss.category as keyof typeof categories]}>{iss.category}</Badge></td>
                    <td className="p-3 max-w-md">
                      <div>{iss.title}</div>
                      {iss.action && <div className="text-xs text-muted-foreground mt-1">→ {iss.action}</div>}
                    </td>
                    <td className="p-3 whitespace-nowrap">{SOURCE_LABELS[iss.source] ?? iss.source}</td>
                    <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs ${PRIORITY_STYLES[iss.priority] ?? ""}`}>{iss.priority}</span></td>
                    <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs capitalize ${STATUS_STYLES[iss.status] ?? ""}`}>{iss.status}</span></td>
                    <td className="p-3 whitespace-nowrap">
                      {iss.status !== "solved" && iss.status !== "dropped" && (
                        <div className="flex gap-1">
                          {iss.status === "open" && (
                            <Button size="sm" variant="outline" onClick={() => updateM.mutate({ id: iss.id, status: "discussing" })}>Discuss</Button>
                          )}
                          <Button size="sm" onClick={() => handleSolve(iss.id)}>Solve</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}
