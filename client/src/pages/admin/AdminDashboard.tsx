import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { AdminShell } from "./AdminShell";
import { DEPARTMENTS, TILE_GROUPS, formatUsd } from "./constants";

function formatMetric(value: number, unit: string): string {
  if (unit === "usd") return formatUsd(value);
  if (unit === "pct") return `${value.toFixed(1)}%`;
  if (unit === "days") return `${value.toFixed(1)} d`;
  return value.toLocaleString();
}

export default function AdminDashboard() {
  const companyQ = trpc.kpis.company.useQuery();
  const agentsQ = trpc.aiAgents.list.useQuery();

  const metrics = companyQ.data ?? [];

  // Bucket metrics into the 8 tile groups. Without seed agents, most will be
  // empty; surface an empty-state message per group so the scaffolding is
  // legible from day one.
  const grouped: Record<string, typeof metrics> = {};
  for (const g of TILE_GROUPS) grouped[g] = [];
  for (const m of metrics) {
    // Simple heuristic: match on metric key prefix → group. Refine once real
    // metrics exist.
    const k = m.key.toLowerCase();
    if (k.startsWith("mrr") || k.startsWith("arr") || k.includes("revenue")) grouped["Revenue"].push(m);
    else if (k.startsWith("lead") || k.startsWith("pipeline") || k.includes("opportunit")) grouped["Pipeline"].push(m);
    else if (k.startsWith("member") || k.includes("360")) grouped["Members"].push(m);
    else if (k.startsWith("ops") || k.includes("jobs")) grouped["Operations"].push(m);
    else if (k.startsWith("ad_") || k.includes("marketing") || k.includes("campaign")) grouped["Marketing"].push(m);
    else if (k.startsWith("cash") || k.includes("invoice") || k.includes("ar_") || k.includes("gross")) grouped["Finance"].push(m);
    else if (k.includes("nps") || k.includes("csat") || k.includes("referral")) grouped["CX"].push(m);
    else grouped["Agent Health"].push(m);
  }

  const agents = agentsQ.data ?? [];
  const agentHealth = {
    total: agents.length,
    autonomous: agents.filter((a) => a.status === "autonomous").length,
    paused: agents.filter((a) => a.status === "paused").length,
    spendToday: agents.reduce((sum, a) => sum + (a.costTodayUsd ?? 0), 0),
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Visionary Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Company-level view. Eight KPI groups aggregated from department rollups. Click a tile to
            drill into its department.
          </p>
        </div>

        {/* Agent runtime health */}
        <Card className="p-4">
          <div className="text-sm font-medium mb-3">Agent runtime</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricTile label="Seats total" value={agentHealth.total.toString()} />
            <MetricTile label="Autonomous" value={agentHealth.autonomous.toString()} />
            <MetricTile label="Paused" value={agentHealth.paused.toString()} />
            <MetricTile label="Spend (24h)" value={formatUsd(agentHealth.spendToday)} />
          </div>
        </Card>

        {/* 8 KPI tile groups */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {TILE_GROUPS.map((g) => (
            <Card key={g} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium">{g}</div>
                <DepartmentLinks group={g} />
              </div>
              {grouped[g].length === 0 ? (
                <div className="text-xs text-muted-foreground italic">
                  No metrics recorded yet — agents will populate once live.
                </div>
              ) : (
                <div className="space-y-2">
                  {grouped[g].slice(0, 6).map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{m.key}</span>
                      <span className="font-medium tabular-nums">
                        {formatMetric(Number(m.value), m.unit)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1 tabular-nums">{value}</div>
    </div>
  );
}

function DepartmentLinks({ group }: { group: string }) {
  const depts = DEPARTMENTS.filter((d) => d.tileGroup === group);
  if (depts.length === 0) return null;
  return (
    <div className="flex gap-2 text-xs">
      {depts.map((d) => (
        <Link key={d.slug} href={`/admin/departments/${d.slug}`}>
          <span className="text-muted-foreground hover:text-foreground cursor-pointer underline-offset-2 hover:underline">
            {d.label}
          </span>
        </Link>
      ))}
    </div>
  );
}
