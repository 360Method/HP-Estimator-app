/**
 * /admin/org-chart — live, data-driven Handy Pioneers AI org chart.
 *
 * The canonical "is the org running?" view. Visual style mirrors the static
 * reference (gold = AI, blue = human, orange = Visionary, gradient = hybrid;
 * green/amber/muted status dots). Mobile-responsive, dark theme isolated to
 * this page so it reads as a dashboard rather than another admin form.
 *
 * Data:
 *   - aiAgents.list — seat roster + status + cost (24h) + runs (24h) +
 *     queued tasks + pending drafts + tool count
 *   - aiAgents.costSummary — total spend rollup for the header strip
 *   - aiAgents.listOptimizationTasks — System Integrity flag count
 *
 * Interactions:
 *   - Click a seat card → opens detail dialog with charter excerpt + KPIs +
 *     authorized tools + recent runs + status toggle
 *   - Per-seat status toggle inline (autonomous / draft / paused / disabled)
 *   - Top: "Activate all" + "Pause all" + "System Integrity scan now"
 *   - Department row: roll-up cost + active count + "All autonomous" / "All
 *     paused" department-level switches
 *
 * Doesn't gold-plate. Functional first.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { AdminShell } from "./AdminShell";
import { DEPARTMENTS, departmentLabel, formatUsd } from "./constants";

type Agent = {
  id: number;
  seatName: string;
  department: string;
  role: string;
  status: string;
  reportsToSeatId: number | null;
  isDepartmentHead: boolean;
  model: string;
  costCapDailyUsd: string;
  runLimitDaily: number;
  costTodayUsd: number;
  runsToday: number;
  queuedTasks: number;
  pendingDrafts: number;
  toolCount: number;
  lastRunAt: Date | string | null;
  charterLoaded: boolean;
  kpiCount: number;
  playbookCount: number;
  systemPrompt: string;
};

/** Seat-name → "ai" / "human" / "hybrid". Heuristic from the seed roster. */
function seatType(a: Agent): "ai" | "human" | "hybrid" {
  if (a.seatName.startsWith("ai_")) return "ai";
  if (a.department === "integrator") return "ai";
  // The 'external_contractor_network' seat is hybrid in the seed; keep that
  // signal even though 'ai_' prefix isn't there.
  if (a.seatName === "external_contractor_network") return "hybrid";
  return "human";
}

/** Status → green/amber/muted dot color. */
function statusDotColor(status: string): string {
  if (status === "autonomous") return "#10b981"; // green
  if (status === "draft_queue") return "#f59e0b"; // amber
  if (status === "paused") return "#94a3b8"; // muted
  return "#64748b"; // disabled / unknown
}

function statusLabel(s: string): string {
  return s === "autonomous"
    ? "Autonomous"
    : s === "draft_queue"
    ? "Draft"
    : s === "paused"
    ? "Paused"
    : s === "disabled"
    ? "Disabled"
    : s;
}

export default function OrgChart() {
  const utils = trpc.useUtils();
  const agentsQ = trpc.aiAgents.list.useQuery();
  const costQ = trpc.aiAgents.costSummary.useQuery();
  const flagsQ = trpc.aiAgents.listOptimizationTasks.useQuery({ status: "open" });
  const teamsQ = trpc.agentTeams.listForOrgChart.useQuery();

  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [confirmKill, setConfirmKill] = useState(false);
  // Mobile-only accordion state — collapsed dept slugs.
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(() => new Set());
  const toggleDept = (slug: string) =>
    setCollapsedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  const activate = trpc.aiAgents.activateAll.useMutation({
    onSuccess: (res) => {
      utils.aiAgents.list.invalidate();
      utils.aiAgents.costSummary.invalidate();
      toast.success(`Activated ${res.updated} of ${res.total} seats — engine running.`);
    },
    onError: (e) => toast.error(e.message),
  });
  const pauseAll = trpc.aiAgents.pauseAll.useMutation({
    onSuccess: (res) => {
      utils.aiAgents.list.invalidate();
      utils.aiAgents.costSummary.invalidate();
      toast.success(`Paused ${res.paused} seats. Engine off.`);
      setConfirmKill(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const setStatus = trpc.aiAgents.setStatus.useMutation({
    onSuccess: () => {
      utils.aiAgents.list.invalidate();
      utils.aiAgents.costSummary.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const bulkSet = trpc.aiAgents.bulkSetStatus.useMutation({
    onSuccess: (res) => {
      utils.aiAgents.list.invalidate();
      utils.aiAgents.costSummary.invalidate();
      toast.success(`Updated ${res.updated} seat${res.updated === 1 ? "" : "s"}.`);
    },
    onError: (e) => toast.error(e.message),
  });
  const runScan = trpc.aiAgents.runSystemIntegrityScanNow.useMutation({
    onSuccess: (res) => {
      utils.aiAgents.listOptimizationTasks.invalidate();
      toast.success(`Scan: ${res.flagsRaised} flag${res.flagsRaised === 1 ? "" : "s"}.`);
    },
    onError: (e) => toast.error(e.message),
  });

  const agents = (agentsQ.data ?? []) as Agent[];
  const cost = costQ.data;
  const flagCount = flagsQ.data?.length ?? 0;

  // Build hierarchy.
  const integrator = agents.find((a) => a.department === "integrator");
  const heads = agents.filter((a) => a.isDepartmentHead && a.department !== "integrator");
  const subsByHead = useMemo(() => {
    const map = new Map<number, Agent[]>();
    for (const a of agents) {
      if (a.isDepartmentHead || a.department === "integrator") continue;
      const parent = a.reportsToSeatId;
      if (parent != null) {
        const arr = map.get(parent) ?? [];
        arr.push(a);
        map.set(parent, arr);
      }
    }
    return map;
  }, [agents]);

  // Phase 2 — sub-team grouping. Each department (Sales, Marketing, …) can
  // host multiple sub-teams (Lead Nurturer, Project Estimator, etc.), and each
  // sub-team has 3 seats (frontend / backend / qa) joined via agent_team_members.
  // We compute:
  //   - teamsByDept: dept slug → sub-teams (skipping the umbrella dept-level team)
  //   - seatToTeam: seatId → its sub-team id (so we can exclude already-grouped
  //     seats from the "flat sub-agents" list rendered after the teams)
  type SubTeam = {
    id: number;
    department: string;
    name: string;
    purpose: string | null;
    members: Array<{ seat: Agent; role: string }>;
  };
  const { teamsByDept, seatToTeam } = useMemo(() => {
    const teamsByDept = new Map<string, SubTeam[]>();
    const seatToTeam = new Map<number, number>();
    const apiTeams = teamsQ.data?.teams ?? [];
    const apiMembers = teamsQ.data?.members ?? [];
    const agentById = new Map<number, Agent>();
    for (const a of agents) agentById.set(a.id, a);
    const membersByTeam = new Map<number, typeof apiMembers>();
    for (const m of apiMembers) {
      const arr = membersByTeam.get(m.teamId) ?? [];
      arr.push(m);
      membersByTeam.set(m.teamId, arr);
    }
    for (const t of apiTeams) {
      // Skip the umbrella dept-level team — it's named exactly the same as the
      // department label (e.g. department='sales', name='Sales'), and its
      // purpose mentions "Umbrella for the …". Phase 2 sub-teams have distinct
      // names like "Lead Nurturer", "Project Estimator", etc.
      const isUmbrella =
        t.name.toLowerCase() === departmentLabel(t.department).toLowerCase() ||
        (t.purpose ?? "").toLowerCase().startsWith("umbrella ");
      if (isUmbrella) continue;
      const memberRows = membersByTeam.get(t.id) ?? [];
      const members = memberRows
        .map((m) => ({ seat: agentById.get(m.seatId), role: m.role as string }))
        .filter((x): x is { seat: Agent; role: string } => Boolean(x.seat));
      // Render team only once it has at least one resolved member — avoids a
      // ghost card when the seeds haven't run yet.
      if (members.length === 0) continue;
      // Order members frontend → backend → qa → other.
      const ROLE_ORDER: Record<string, number> = { frontend: 0, backend: 1, qa: 2, lead: 3 };
      members.sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9));
      for (const m of members) seatToTeam.set(m.seat.id, t.id);
      const arr = teamsByDept.get(t.department) ?? [];
      arr.push({ id: t.id, department: t.department, name: t.name, purpose: t.purpose, members });
      teamsByDept.set(t.department, arr);
    }
    return { teamsByDept, seatToTeam };
  }, [teamsQ.data, agents]);

  const byDept = useMemo(() => {
    const m = new Map<string, Agent[]>();
    for (const a of agents) {
      const arr = m.get(a.department) ?? [];
      arr.push(a);
      m.set(a.department, arr);
    }
    return m;
  }, [agents]);

  const counts = {
    total: agents.length,
    autonomous: agents.filter((a) => a.status === "autonomous").length,
    draft: agents.filter((a) => a.status === "draft_queue").length,
    paused: agents.filter((a) => a.status === "paused").length,
  };

  const selected = selectedAgentId != null ? agents.find((a) => a.id === selectedAgentId) ?? null : null;

  return (
    <AdminShell>
      {/*
        Dark theme is scoped to this single block so it doesn't leak into
        sibling admin pages. All colors come from inline style + Tailwind
        arbitrary values to keep the visual close to the static reference.
      */}
      <div
        className="rounded-xl px-4 py-6 md:px-6 md:py-8 -mx-2 md:-mx-4"
        style={{
          background: "#07080c",
          color: "#e2e8f0",
          fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        }}
      >
        {/* HEADER */}
        <div className="text-center max-w-3xl mx-auto mb-6">
          <div
            className="text-[10px] font-bold tracking-[3px] uppercase mb-2"
            style={{ color: "#c9913a" }}
          >
            Live Operations
          </div>
          <h1 className="text-xl md:text-2xl font-extrabold text-white tracking-tight mb-2">
            Handy Pioneers — AI Accountability Chart
          </h1>
          <p className="text-xs" style={{ color: "#94a3b8" }}>
            Live data from the engine. Click any seat to see charter, KPIs, tools, and recent runs.
            Toggles flip status in one click.
          </p>
        </div>

        {/* CONTROL STRIP */}
        <div
          className="max-w-5xl mx-auto rounded-xl border p-3 sm:p-4 mb-6 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3"
          style={{ background: "rgba(255,255,255,0.02)", borderColor: "#1a2235" }}
        >
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button
              className="w-full sm:w-auto min-h-[48px] text-base font-semibold"
              disabled={activate.isPending || counts.draft + counts.paused === 0}
              onClick={() => activate.mutate({})}
              style={{ background: "#c9913a", color: "#1a1000", borderColor: "#c9913a" }}
            >
              {activate.isPending
                ? "Activating…"
                : `Activate all (${counts.draft + counts.paused})`}
            </Button>
            {confirmKill ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                <span className="text-xs" style={{ color: "#fca5a5" }}>
                  Pause {counts.autonomous} live seat{counts.autonomous === 1 ? "" : "s"}?
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    className="flex-1 sm:flex-none min-h-[44px]"
                    disabled={pauseAll.isPending}
                    onClick={() => pauseAll.mutate()}
                  >
                    Yes, pause all
                  </Button>
                  <Button variant="ghost" className="flex-1 sm:flex-none min-h-[44px]" onClick={() => setConfirmKill(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="destructive"
                className="w-full sm:w-auto min-h-[44px]"
                disabled={counts.autonomous === 0}
                onClick={() => setConfirmKill(true)}
              >
                Pause all
              </Button>
            )}
            <Button variant="outline" className="w-full sm:w-auto min-h-[44px]" onClick={() => runScan.mutate()} disabled={runScan.isPending}>
              {runScan.isPending ? "Scanning…" : "System Integrity scan"}
            </Button>
          </div>
          <div className="hidden sm:block flex-1" />
          <div className="grid grid-cols-3 sm:flex sm:items-center gap-3 sm:gap-4 text-xs w-full sm:w-auto" style={{ color: "#94a3b8" }}>
            <Stat label="Seats" value={counts.total} />
            <Stat label="Live" value={counts.autonomous} color="#10b981" />
            <Stat label="Draft" value={counts.draft} color="#f59e0b" />
            <Stat label="Paused" value={counts.paused} color="#94a3b8" />
            <Stat label="24h spend" value={formatUsd(cost?.totalCost24hUsd ?? 0)} />
            <Stat label="Flags" value={flagCount} color={flagCount > 0 ? "#f59e0b" : "#94a3b8"} />
          </div>
        </div>

        {/* LEGEND */}
        <div className="max-w-5xl mx-auto flex flex-wrap gap-3 justify-center mb-6 text-[11px]" style={{ color: "#94a3b8" }}>
          <Swatch label="AI" border="#c9913a" bg="rgba(201,145,58,0.12)" />
          <Swatch label="Human" border="#3b82f6" bg="rgba(59,130,246,0.12)" />
          <Swatch
            label="Hybrid"
            border="#c9913a"
            bg="linear-gradient(135deg, rgba(201,145,58,0.12) 50%, rgba(59,130,246,0.12) 50%)"
          />
          <Swatch label="Visionary" border="#f97316" bg="rgba(249,115,22,0.12)" />
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#10b981" }} />
            Autonomous
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#f59e0b" }} />
            Draft
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: "#94a3b8" }} />
            Paused
          </span>
        </div>

        {/* TREE */}
        <div className="max-w-7xl mx-auto flex flex-col items-center gap-1">
          {/* VISIONARY (Marcin) */}
          <SeatCard
            kind="visionary"
            agentLike={{
              id: -1,
              seatName: "Marcin Micek",
              role: "Founder · Visionary · Final accountability",
              status: "autonomous",
            }}
            onClick={() => null}
            disabled
          />
          <Connector color="#f97316" />

          {/* INTEGRATOR */}
          {integrator ? (
            <>
              <SeatCard
                kind="integrator"
                agent={integrator}
                onClick={() => setSelectedAgentId(integrator.id)}
                onStatusChange={(s) => setStatus.mutate({ id: integrator.id, status: s as never })}
              />
              <Connector color="#c9913a" />
            </>
          ) : null}

          {/* DEPARTMENTS GRID */}
          <div className="w-full grid gap-4 mt-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            {DEPARTMENTS.filter((d) => d.slug !== "integrator").map((dept) => {
              const head = heads.find((h) => h.department === dept.slug);
              const subs = head ? subsByHead.get(head.id) ?? [] : (byDept.get(dept.slug) ?? []).filter((a) => !a.isDepartmentHead);
              const deptAgents = byDept.get(dept.slug) ?? [];
              const deptIds = deptAgents.map((a) => a.id);
              const liveCount = deptAgents.filter((a) => a.status === "autonomous").length;
              const dept24h = deptAgents.reduce((s, a) => s + (a.costTodayUsd ?? 0), 0);
              return (
                <div
                  key={dept.slug}
                  className="rounded-xl border p-4 flex flex-col gap-2"
                  style={{
                    background: "rgba(255,255,255,0.015)",
                    borderColor: dept.slug === "strategy" ? "#f97316" : "#1a2235",
                  }}
                >
                  <div className="flex items-start justify-between pb-2 border-b mb-1 gap-3" style={{ borderColor: "#1a2235" }}>
                    <button
                      type="button"
                      className="flex-1 text-left min-h-[44px] flex items-start gap-2"
                      onClick={() => toggleDept(dept.slug)}
                      aria-label={`Toggle ${dept.label}`}
                    >
                      <span
                        className="md:hidden mt-0.5 text-[12px] select-none"
                        style={{ color: "#94a3b8" }}
                      >
                        {collapsedDepts.has(dept.slug) ? "▸" : "▾"}
                      </span>
                      <span className="flex-1">
                        <span className="block text-[10px] font-bold tracking-[2px]" style={{ color: dept.slug === "strategy" ? "#f97316" : "#64748b" }}>
                          DEPT
                        </span>
                        <span className="block text-sm font-extrabold text-white">{dept.label}</span>
                        <span className="block text-[10px]" style={{ color: "#94a3b8" }}>
                          {deptAgents.length} seat{deptAgents.length === 1 ? "" : "s"} · {liveCount} live · {formatUsd(dept24h)} (24h)
                          {!head && <span style={{ color: "#ef4444" }}> · no head</span>}
                        </span>
                      </span>
                    </button>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button
                        className="text-xs px-3 py-2 min-h-[36px] rounded border hover:opacity-80"
                        style={{ borderColor: "#10b981", color: "#10b981" }}
                        onClick={(e) => { e.stopPropagation(); bulkSet.mutate({ ids: deptIds, status: "autonomous" }); }}
                        disabled={deptIds.length === 0}
                      >
                        All on
                      </button>
                      <button
                        className="text-xs px-3 py-2 min-h-[36px] rounded border hover:opacity-80"
                        style={{ borderColor: "#94a3b8", color: "#94a3b8" }}
                        onClick={(e) => { e.stopPropagation(); bulkSet.mutate({ ids: deptIds, status: "paused" }); }}
                        disabled={deptIds.length === 0}
                      >
                        All off
                      </button>
                    </div>
                  </div>
                  {/* Head + sub-teams + flat sub-agents — hidden on mobile when collapsed; always visible on md+ */}
                  <div className={(collapsedDepts.has(dept.slug) ? "hidden " : "") + "md:!flex md:flex-col gap-2"}>
                    {head && (
                      <SeatCard
                        kind={seatType(head)}
                        agent={head}
                        isHead
                        deptLabel={dept.label}
                        onClick={() => setSelectedAgentId(head.id)}
                        onStatusChange={(s) => setStatus.mutate({ id: head.id, status: s as never })}
                      />
                    )}
                    {/* Phase 2 — sub-teams in this department */}
                    {(teamsByDept.get(dept.slug) ?? []).map((team) => (
                      <SubTeamGroup
                        key={team.id}
                        team={team}
                        seatType={seatType}
                        onSeatClick={(id) => setSelectedAgentId(id)}
                        onStatusChange={(id, s) => setStatus.mutate({ id, status: s as never })}
                      />
                    ))}
                    {/* Flat sub-agents not part of any sub-team (legacy single-seat sub-agents). */}
                    {subs
                      .filter((s) => !seatToTeam.has(s.id))
                      .map((s) => (
                        <SeatCard
                          key={s.id}
                          kind={seatType(s)}
                          agent={s}
                          onClick={() => setSelectedAgentId(s.id)}
                          onStatusChange={(st) => setStatus.mutate({ id: s.id, status: st as never })}
                        />
                      ))}
                    {!head && subs.length === 0 && (teamsByDept.get(dept.slug) ?? []).length === 0 && (
                      <div className="text-[11px] italic" style={{ color: "#64748b" }}>
                        No seats in this department yet.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <footer className="text-center text-[11px] mt-12" style={{ color: "#64748b" }}>
          Live from the engine — refresh the page to re-pull the latest run rows.{" "}
          <Link href="/admin/agents/runs">
            <span className="cursor-pointer underline">Open the run feed →</span>
          </Link>
        </footer>
      </div>

      {/* SEAT DETAIL DIALOG */}
      <SeatDetailDialog
        agent={selected}
        open={selected != null}
        onClose={() => setSelectedAgentId(null)}
        onStatusChange={(s) =>
          selected && setStatus.mutate({ id: selected.id, status: s as never })
        }
      />
    </AdminShell>
  );
}

// ─── SEAT CARD ───────────────────────────────────────────────────────────────

type SeatCardProps =
  | {
      kind: "visionary";
      agentLike: { id: number; seatName: string; role: string; status: string };
      onClick: () => void;
      disabled?: boolean;
      isHead?: boolean;
      deptLabel?: string;
      agent?: undefined;
      onStatusChange?: undefined;
    }
  | {
      kind: "ai" | "human" | "hybrid" | "integrator";
      agent: Agent;
      onClick: () => void;
      onStatusChange?: (s: string) => void;
      disabled?: boolean;
      isHead?: boolean;
      deptLabel?: string;
      agentLike?: undefined;
    };

function SeatCard(props: SeatCardProps) {
  const isVisionary = props.kind === "visionary";
  const a = isVisionary ? null : props.agent;
  const seatName = isVisionary ? props.agentLike.seatName : a!.seatName;
  const role = isVisionary ? props.agentLike.role : a!.role;
  const status = isVisionary ? props.agentLike.status : a!.status;

  let borderColor = "#1a2235";
  let badgeBg = "#1a2235";
  let badgeText = "#e2e8f0";
  let badgeLabel: string = props.kind.toUpperCase();
  let cardBg = "#111520";

  if (props.kind === "ai") {
    borderColor = "#c9913a";
    badgeBg = "#c9913a";
    badgeText = "#1a1000";
    badgeLabel = "AI";
  } else if (props.kind === "human") {
    borderColor = "#3b82f6";
    badgeBg = "#3b82f6";
    badgeText = "#fff";
    badgeLabel = "HUMAN";
  } else if (props.kind === "hybrid") {
    borderColor = "#c9913a";
    badgeBg = "linear-gradient(90deg,#c9913a,#3b82f6)";
    badgeText = "#fff";
    badgeLabel = "HYBRID";
  } else if (props.kind === "visionary") {
    borderColor = "#f97316";
    badgeBg = "#f97316";
    badgeText = "#1a0f00";
    badgeLabel = "VISIONARY";
    cardBg = "linear-gradient(135deg, #1a0f00, #1f1508)";
  } else if (props.kind === "integrator") {
    borderColor = "#c9913a";
    badgeBg = "#c9913a";
    badgeText = "#1a1000";
    badgeLabel = "INTEGRATOR";
    cardBg = "linear-gradient(135deg, #1a1000, #221700)";
  }

  return (
    <button
      type="button"
      onClick={props.disabled ? undefined : props.onClick}
      className={`relative rounded-lg p-3 border-2 text-left w-full ${
        props.disabled ? "" : "cursor-pointer hover:-translate-y-0.5 transition-transform"
      } ${props.isHead ? "shadow-lg" : ""}`}
      style={{
        background: cardBg,
        borderColor,
        boxShadow: props.isHead ? "0 6px 18px rgba(201,145,58,0.15)" : undefined,
      }}
    >
      {/* badge */}
      <span
        className="absolute -top-2 left-2 text-[10px] font-extrabold tracking-[1.5px] px-2 py-0.5 rounded uppercase"
        style={{
          background: props.isHead ? "linear-gradient(90deg, #f5c26b, #c9913a)" : badgeBg,
          color: props.isHead ? "#1a1000" : badgeText,
          boxShadow: props.isHead ? "0 2px 6px rgba(245,194,107,0.3)" : undefined,
        }}
      >
        {props.isHead && props.deptLabel
          ? `Head · ${props.deptLabel}`
          : props.isHead
          ? "Department Head"
          : badgeLabel}
      </span>

      <div className="flex items-start gap-2">
        <span
          className="inline-block w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
          style={{
            background: statusDotColor(status),
            boxShadow: status === "autonomous" ? "0 0 6px #10b981" : undefined,
          }}
        />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-bold text-white leading-tight truncate">{seatName}</div>
          <div className="text-[10px] mt-0.5 italic truncate" style={{ color: "#94a3b8" }}>
            {role}
          </div>
        </div>
      </div>

      {/* live metrics row — agents only */}
      {a && (
        <div className="mt-2 pt-2 border-t flex flex-wrap items-center gap-2 text-[10px]" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <Pill label="status" value={statusLabel(status)} color={statusDotColor(status)} />
          <Pill label="cost" value={formatUsd(a.costTodayUsd)} color="#94a3b8" />
          <Pill label="runs" value={a.runsToday.toString()} color="#94a3b8" />
          {a.queuedTasks > 0 && <Pill label="queued" value={a.queuedTasks.toString()} color="#3b82f6" />}
          {a.pendingDrafts > 0 && (
            <Pill label="drafts" value={a.pendingDrafts.toString()} color="#f59e0b" />
          )}
          {a.toolCount > 0 && <Pill label="tools" value={a.toolCount.toString()} color="#94a3b8" />}
          {a.lastRunAt && (
            <span style={{ color: "#64748b" }} className="text-[10px]">
              · {formatRelativeTime(a.lastRunAt)}
            </span>
          )}
        </div>
      )}

      {/* per-seat status toggle — only if onStatusChange provided */}
      {props.kind !== "visionary" && props.onStatusChange && (
        <div
          className="mt-2 pt-2 border-t"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <select
            className="text-[10px] rounded px-1 py-0.5 w-full"
            style={{
              background: "#0d1018",
              color: "#e2e8f0",
              borderColor,
              border: "1px solid",
            }}
            value={status}
            onChange={(e) => props.onStatusChange?.(e.target.value)}
          >
            <option value="autonomous">Autonomous</option>
            <option value="draft_queue">Draft</option>
            <option value="paused">Paused</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      )}
    </button>
  );
}

function Pill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span className="text-[10px] tabular-nums" style={{ color }}>
      <span style={{ color: "#64748b" }}>{label} </span>
      {value}
    </span>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase tracking-wider" style={{ color: "#64748b" }}>
        {label}
      </div>
      <div className="text-sm font-bold tabular-nums" style={{ color: color ?? "#fff" }}>
        {value}
      </div>
    </div>
  );
}

function Swatch({ label, border, bg }: { label: string; border: string; bg: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block w-3 h-3 rounded border-2"
        style={{ borderColor: border, background: bg }}
      />
      {label}
    </span>
  );
}

function Connector({ color }: { color: string }) {
  return (
    <div className="w-0.5 h-6" style={{ background: color, opacity: 0.6 }} />
  );
}

function formatRelativeTime(ts: Date | string): string {
  const t = typeof ts === "string" ? new Date(ts) : ts;
  const seconds = Math.max(0, Math.floor((Date.now() - t.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ─── DETAIL DIALOG ───────────────────────────────────────────────────────────

function SeatDetailDialog({
  agent,
  open,
  onClose,
  onStatusChange,
}: {
  agent: Agent | null;
  open: boolean;
  onClose: () => void;
  onStatusChange: (s: string) => void;
}) {
  const charterQ = trpc.agents.getCharter.useQuery(
    { department: agent?.department ?? "" },
    { enabled: !!agent }
  );
  const kpisQ = trpc.agents.listKpis.useQuery(
    { scopeId: agent?.seatName ?? "", scopeType: "seat" },
    { enabled: !!agent }
  );
  const detailQ = trpc.aiAgents.get.useQuery(
    { id: agent?.id ?? -1 },
    { enabled: !!agent && agent.id > 0 }
  );
  const triggerRun = trpc.aiAgents.triggerManualRun.useMutation({
    onSuccess: (res) => {
      toast.success(`Manual run done: ${res.status} ($${res.costUsd.toFixed(4)})`);
    },
    onError: (e) => toast.error(e.message),
  });

  if (!agent) return null;
  const charter = charterQ.data;
  const kpis = kpisQ.data ?? [];
  const detail = detailQ.data;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ background: statusDotColor(agent.status) }}
            />
            {agent.seatName}
            <span className="text-xs text-muted-foreground font-normal">
              · {departmentLabel(agent.department)} · {agent.model}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground italic">{agent.role}</p>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span>Status:</span>
            <select
              className="border rounded px-2 py-1"
              value={agent.status}
              onChange={(e) => onStatusChange(e.target.value)}
            >
              <option value="autonomous">Autonomous</option>
              <option value="draft_queue">Draft</option>
              <option value="paused">Paused</option>
              <option value="disabled">Disabled</option>
            </select>
            <span className="ml-3">
              Cap ${agent.costCapDailyUsd}/day · {agent.runLimitDaily} runs/day
            </span>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              disabled={triggerRun.isPending}
              onClick={() =>
                triggerRun.mutate({ id: agent.id, payload: { source: "org-chart-manual" } })
              }
            >
              {triggerRun.isPending ? "Running…" : "Test run"}
            </Button>
          </div>

          {/* 24h activity */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            <Metric label="Cost (24h)" value={formatUsd(agent.costTodayUsd)} />
            <Metric label="Runs (24h)" value={agent.runsToday} />
            <Metric label="Queued" value={agent.queuedTasks} />
            <Metric label="Drafts" value={agent.pendingDrafts} />
            <Metric label="Tools" value={agent.toolCount} />
          </div>

          {/* KPIs */}
          {kpis.length > 0 && (
            <Section title="KPIs">
              <ul className="text-xs space-y-1">
                {kpis.map((k) => (
                  <li key={k.id} className="flex items-center justify-between border-b py-1 last:border-0">
                    <span>{k.label}</span>
                    <span className="text-muted-foreground tabular-nums">
                      target {k.targetMin ?? "—"}–{k.targetMax ?? "—"} {k.unit} · {k.period}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Authorized tools */}
          {detail?.tools && detail.tools.length > 0 && (
            <Section title="Authorized tools">
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {detail.tools.map((t) => (
                  <span
                    key={t.id}
                    className="px-2 py-0.5 rounded border"
                    style={{
                      background: t.authorized ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
                      borderColor: t.authorized ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)",
                      color: t.authorized ? "#10b981" : "#ef4444",
                    }}
                  >
                    {t.toolKey}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Recent runs */}
          {detail?.recentRuns && detail.recentRuns.length > 0 && (
            <Section title="Recent runs">
              <ul className="text-xs space-y-1 max-h-40 overflow-y-auto">
                {detail.recentRuns.slice(0, 8).map((r) => (
                  <li key={r.id} className="flex items-center justify-between text-[11px] border-b py-1 last:border-0">
                    <span>
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full mr-1.5"
                        style={{
                          background:
                            r.status === "success" ? "#10b981" : r.status === "failed" || r.status === "tool_error" ? "#ef4444" : "#f59e0b",
                        }}
                      />
                      #{r.id} {r.status} · {formatRelativeTime(r.createdAt)}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      ${Number(r.costUsd).toFixed(4)} · {r.inputTokens + r.outputTokens} tok
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 text-[11px]">
                <Link href={`/admin/agents/runs?seat=${encodeURIComponent(agent.seatName)}`}>
                  <span className="text-blue-600 underline cursor-pointer">Open full run feed for this seat →</span>
                </Link>
              </div>
            </Section>
          )}

          {/* Charter excerpt */}
          {charter ? (
            <Section title={`Charter (v${charter.version})`}>
              <pre className="text-[11px] whitespace-pre-wrap font-sans bg-muted/30 border rounded p-2 max-h-48 overflow-y-auto">
                {charter.markdownContent.slice(0, 2000)}
                {charter.markdownContent.length > 2000 && "\n\n… (truncated — open AI Agents page for full edit)"}
              </pre>
            </Section>
          ) : (
            <Section title="Charter">
              <p className="text-xs text-muted-foreground italic">
                No charter loaded for this department.
              </p>
            </Section>
          )}

          <div className="flex justify-between pt-3 border-t text-xs">
            <Link href={`/admin/ai-agents/${agent.id}`}>
              <span className="text-blue-600 underline cursor-pointer">Edit prompt + tools →</span>
            </Link>
            <Link href={`/admin/departments/${agent.department}`}>
              <span className="text-blue-600 underline cursor-pointer">View department dashboard →</span>
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold tracking-[1.5px] uppercase text-muted-foreground mb-1.5">
        {title}
      </div>
      {children}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border rounded px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

// ─── PHASE 2 SUB-TEAM GROUP ──────────────────────────────────────────────────
// Renders a 3-teammate sub-team (Lead Nurturer, Project Estimator, etc.) as a
// nested card under its department head. The team header shows the team's
// purpose; the body lists frontend / backend / qa cards inline.

function SubTeamGroup(props: {
  team: {
    id: number;
    department: string;
    name: string;
    purpose: string | null;
    members: Array<{ seat: Agent; role: string }>;
  };
  seatType: (a: Agent) => "ai" | "human" | "hybrid";
  onSeatClick: (seatId: number) => void;
  onStatusChange: (seatId: number, status: string) => void;
}) {
  const { team } = props;
  const liveCount = team.members.filter((m) => m.seat.status === "autonomous").length;
  return (
    <div
      className="rounded-lg border p-2.5 ml-2"
      style={{
        background: "rgba(201,145,58,0.04)",
        borderColor: "#3a2f1a",
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div>
          <div
            className="text-[9px] font-bold tracking-[2px] uppercase"
            style={{ color: "#c9913a" }}
          >
            Team · {team.name}
          </div>
          {team.purpose && (
            <div className="text-[10px] mt-0.5 leading-tight" style={{ color: "#94a3b8" }}>
              {team.purpose.slice(0, 110)}
              {team.purpose.length > 110 ? "…" : ""}
            </div>
          )}
        </div>
        <div className="text-[10px] tabular-nums shrink-0" style={{ color: "#94a3b8" }}>
          {team.members.length}/3 · {liveCount} live
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {team.members.map((m) => (
          <div key={m.seat.id} className="flex items-stretch gap-2">
            <span
              className="text-[9px] font-bold tracking-[1.5px] px-1.5 py-0.5 rounded uppercase shrink-0 self-start"
              style={{
                background:
                  m.role === "frontend"
                    ? "#3b82f6"
                    : m.role === "backend"
                    ? "#10b981"
                    : m.role === "qa"
                    ? "#a78bfa"
                    : "#64748b",
                color: "#fff",
                marginTop: "10px",
              }}
              title={`Territory: ${
                m.role === "frontend" ? "drafts/" : m.role === "backend" ? "data/" : m.role === "qa" ? "audits/" : "—"
              }`}
            >
              {m.role.toUpperCase()}
            </span>
            <div className="flex-1 min-w-0">
              <SeatCard
                kind={props.seatType(m.seat)}
                agent={m.seat}
                onClick={() => props.onSeatClick(m.seat.id)}
                onStatusChange={(s) => props.onStatusChange(m.seat.id, s)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
