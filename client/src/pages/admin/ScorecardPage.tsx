/**
 * Weekly Scorecard (audit Rec 3) — the BOS L10 scorecard. Shows the metric
 * catalog grouped by area with targets and G/Y/R status. Live signals
 * (jobs-below-floor, open IDS) are computed now; other rows show their target
 * with the rollup still pending.
 */
import { trpc } from "@/lib/trpc";
import { AdminShell } from "./AdminShell";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

const GROUP_LABELS: Record<string, string> = {
  pp_sales: "Proactive Path & Sales",
  delivery: "Delivery / Ops",
  finance: "Finance",
  marketing: "Marketing",
  ids: "IDS",
};

const STATUS_DOT: Record<string, string> = {
  green: "bg-green-500",
  yellow: "bg-amber-400",
  red: "bg-red-500",
  unknown: "bg-slate-300",
};

function fmt(value: number | null | undefined, unit: string): string {
  if (value == null) return "—";
  if (unit === "ratio") return `${Math.round(value * 100)}%`;
  if (unit === "cents") return `$${(value / 100).toLocaleString("en-US")}`;
  return value.toLocaleString("en-US");
}

export default function ScorecardPage() {
  const catalogQ = trpc.scorecard.catalog.useQuery();
  const liveQ = trpc.scorecard.liveSignals.useQuery();
  const catalog = catalogQ.data ?? [];
  const live = liveQ.data ?? {};

  const groups = Array.from(new Set(catalog.map((m) => m.group)));

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Weekly Scorecard</h1>
          <p className="text-sm text-muted-foreground">
            L10 metrics. 2026 target: $20K+ ARR / 20 PP clients. Live signals are computed now; remaining rows await rollup wiring.
          </p>
        </div>

        {catalogQ.isLoading ? (
          <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /> Loading…</div>
        ) : (
          groups.map((group) => (
            <Card key={group}>
              <div className="px-4 py-2 border-b bg-muted/40 font-medium text-sm">{GROUP_LABELS[group] ?? group}</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left p-3 font-medium">Metric</th>
                    <th className="text-right p-3 font-medium">Target</th>
                    <th className="text-right p-3 font-medium">Actual</th>
                    <th className="text-left p-3 font-medium w-24">Status</th>
                    <th className="text-left p-3 font-medium">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.filter((m) => m.group === group).map((m) => {
                    const signal = live[m.key];
                    const hasLive = signal && signal.value != null;
                    const statusKey = signal?.status ?? "unknown";
                    return (
                      <tr key={m.key} className="border-t hover:bg-muted/40">
                        <td className="p-3">{m.label}</td>
                        <td className="p-3 text-right tabular-nums">{fmt(m.target, m.unit)}</td>
                        <td className="p-3 text-right tabular-nums">
                          {hasLive ? fmt(signal!.value, m.unit) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="p-3">
                          <span className="inline-flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[statusKey]}`} />
                            <span className="text-xs capitalize text-muted-foreground">{hasLive ? statusKey : "rollup pending"}</span>
                          </span>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">{m.ownerRole}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          ))
        )}
      </div>
    </AdminShell>
  );
}
