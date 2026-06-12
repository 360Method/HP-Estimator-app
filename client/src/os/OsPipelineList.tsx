/**
 * OsPipelineList — the simple flow that replaced the kanban board:
 * Lead -> Quote sent -> Won -> Done, one list, grouped. Tap anything to
 * open the client; tap a quote to price it. Internal values only; nothing
 * here is customer-facing.
 */
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useEstimator } from "@/contexts/EstimatorContext";
import { FileText, Plus, User } from "lucide-react";

const GROUPS = [
  { key: "lead", label: "Leads", hint: "New interest; call them." },
  { key: "quote", label: "Quotes sent", hint: "Waiting on a yes." },
  { key: "won", label: "Won", hint: "Scheduled or in progress." },
  { key: "done", label: "Done", hint: "Last 10 finished." },
] as const;

type GroupKey = (typeof GROUPS)[number]["key"];

function groupOf(o: { area: string | null; stage: string | null; archived?: boolean | null }): GroupKey {
  const stage = (o.stage ?? "").toLowerCase();
  if (stage.includes("done") || stage.includes("complete") || stage.includes("paid")) return "done";
  // Portal approval marks the internal opportunity stage "Won" even while
  // its area is still "estimate"; both count as won here.
  if (o.area === "job" || stage.includes("won")) return "won";
  if (o.area === "estimate") return "quote";
  return "lead";
}

const fmtMoney = (n: number | null | undefined) =>
  n == null || Number(n) === 0 ? "" : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const fmtAge = (d: string | Date | null | undefined) => {
  if (!d) return "";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
};

export default function OsPipelineList() {
  const { setActiveOpportunity, setActiveCustomer } = useEstimator();
  const { data: opps, isLoading } = trpc.opportunities.list.useQuery(
    { archived: false, limit: 500 },
    { refetchInterval: 60_000 },
  );

  const grouped = new Map<GroupKey, any[]>(GROUPS.map((g) => [g.key, []]));
  for (const o of (opps as any[]) ?? []) {
    grouped.get(groupOf(o))!.push(o);
  }
  for (const [key, list] of grouped) {
    list.sort((a, b) => new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() - new Date(a.updatedAt ?? a.createdAt ?? 0).getTime());
    if (key === "done") grouped.set(key, list.slice(0, 10));
  }

  return (
    <div className="container max-w-3xl py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="hp-serif text-2xl" style={{ color: "var(--hp-ink)" }}>
            Pipeline
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Lead, quote, won, done. Use + New up top to start anything.
          </p>
        </div>
        <Link href="/os/estimate/new">
          <span className="shrink-0 inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-semibold text-white cursor-pointer" style={{ background: "var(--hp-ink)" }}>
            <Plus className="w-3.5 h-3.5" /> New estimate
          </span>
        </Link>
      </div>

      {isLoading ? (
        <div className="mt-5 h-32 rounded-xl bg-white border animate-pulse" style={{ borderColor: "var(--hp-hairline)" }} />
      ) : (
        GROUPS.map((g) => {
          const list = grouped.get(g.key) ?? [];
          return (
            <div key={g.key} className="mt-6">
              <div className="flex items-baseline gap-2">
                <h2 className="hp-eyebrow" style={{ color: "var(--hp-gold-deep)" }}>
                  {g.label} {list.length > 0 && <span className="text-muted-foreground">({list.length})</span>}
                </h2>
                <span className="text-[11px] text-muted-foreground">{g.hint}</span>
              </div>
              <div className="mt-2 space-y-1.5">
                {list.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">Empty.</p>
                ) : (
                  list.map((o: any) => (
                    <div
                      key={o.id}
                      className="bg-white rounded-xl border px-4 py-2.5 flex items-center gap-3"
                      style={{ borderColor: "var(--hp-hairline)" }}
                    >
                      <button
                        type="button"
                        className="flex-1 min-w-0 text-left"
                        onClick={() => setActiveOpportunity(o.id)}
                        title="Open and price it"
                      >
                        <div className="text-sm font-medium truncate flex items-center gap-1.5" style={{ color: "var(--hp-ink)" }}>
                          <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                          {o.title || "Untitled"}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {o.customerName ?? ""} · {fmtAge(o.updatedAt ?? o.createdAt)} old
                        </div>
                      </button>
                      {fmtMoney(o.value) && (
                        <span className="text-sm font-semibold shrink-0" style={{ color: "var(--hp-ink)" }}>
                          {fmtMoney(o.value)}
                        </span>
                      )}
                      {o.customerId && (
                        <button
                          type="button"
                          className="p-1.5 text-muted-foreground hover:text-foreground shrink-0"
                          title="Open client"
                          onClick={() => setActiveCustomer(o.customerId, "direct")}
                        >
                          <User className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
