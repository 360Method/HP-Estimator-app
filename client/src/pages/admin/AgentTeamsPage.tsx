/**
 * AgentTeamsPage — admin surface to view + manage the 8 agent teams.
 * Phase 1: read-only overview + member add/remove. Tasks and messages
 * are visible per team but mutations route through the Visionary Console
 * Integrator chat, not direct buttons (that's the Phase 1 vibe — the
 * console is the one place to coordinate work).
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Compass, Plus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminShell } from "./AdminShell";
import { departmentLabel } from "./constants";

type MemberRole = "frontend" | "backend" | "qa" | "lead";

type TeamDetailData = {
  team: { id: number; name: string; department: string; status: string; teamLeadSeatId: number | null };
  members: Array<{
    id: number;
    seatId: number;
    role: MemberRole;
    joinedAt: Date | string;
    seatName: string | null;
    seatStatus: string | null;
    seatDepartment: string | null;
  }>;
  tasks: Array<{ id: number; title: string; status: string; createdAt: Date | string }>;
  messages: Array<{ id: number; body: string; createdAt: Date | string }>;
};

type AgentRow = {
  id: number;
  seatName: string;
  department: string;
  status: string;
};

export default function AgentTeamsPage() {
  const utils = trpc.useUtils();
  const teamsQ = trpc.agentTeams.listTeams.useQuery();
  const agentsQ = trpc.aiAgents.list.useQuery();

  const [openTeamId, setOpenTeamId] = useState<number | null>(null);
  const teamDetailQ = trpc.agentTeams.getTeam.useQuery(
    { id: openTeamId ?? 0 },
    { enabled: openTeamId !== null }
  );

  const addMember = trpc.agentTeams.addMember.useMutation({
    onSuccess: () => {
      utils.agentTeams.listTeams.invalidate();
      utils.agentTeams.getTeam.invalidate();
      toast.success("Member added");
    },
    onError: (e) => toast.error(e.message),
  });
  const removeMember = trpc.agentTeams.removeMember.useMutation({
    onSuccess: () => {
      utils.agentTeams.listTeams.invalidate();
      utils.agentTeams.getTeam.invalidate();
      toast.success("Member removed");
    },
    onError: (e) => toast.error(e.message),
  });
  const setStatus = trpc.agentTeams.setTeamStatus.useMutation({
    onSuccess: () => {
      utils.agentTeams.listTeams.invalidate();
      utils.agentTeams.getTeam.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const teams = teamsQ.data ?? [];
  const agents = agentsQ.data ?? [];

  return (
    <AdminShell>
      <div className="space-y-4">
        <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Agent Teams
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              One team per department. Members are seats from{" "}
              <Link href="/admin/ai-agents" className="underline">/admin/ai-agents</Link>.
              Coordinate cross-team work from{" "}
              <Link href="/admin/visionary" className="underline">/admin/visionary</Link>.
            </p>
          </div>
          <Link href="/admin/visionary">
            <Button variant="outline" size="sm" className="min-h-[44px]">
              <Compass className="w-4 h-4 mr-1" /> Open console
            </Button>
          </Link>
        </div>

        {teamsQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading teams…</p>
        ) : teams.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No teams yet. The boot guard seeds 8 teams (one per department) on first start —
              if you're seeing this on prod, restart the server.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {teams.map((t) => {
              const isOpen = openTeamId === t.id;
              return (
                <Card key={t.id} className="p-4 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">{t.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {departmentLabel(t.department)}
                      </div>
                    </div>
                    <Badge variant={t.status === "active" ? "default" : "secondary"}>
                      {t.status}
                    </Badge>
                  </div>
                  {t.purpose && (
                    <p className="text-xs text-muted-foreground line-clamp-3">{t.purpose}</p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    <span>{t.memberCount} member{t.memberCount === 1 ? "" : "s"}</span>
                    <span>·</span>
                    <span>{t.openTaskCount} open task{t.openTaskCount === 1 ? "" : "s"}</span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setOpenTeamId(isOpen ? null : t.id)}
                      className="min-h-[40px]"
                    >
                      {isOpen ? "Close" : "Manage"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setStatus.mutate({
                          id: t.id,
                          status: t.status === "active" ? "paused" : "active",
                        })
                      }
                      disabled={setStatus.isPending}
                      className="min-h-[40px]"
                    >
                      {t.status === "active" ? "Pause" : "Resume"}
                    </Button>
                  </div>
                  {isOpen && teamDetailQ.data && (teamDetailQ.data as unknown as TeamDetailData).team.id === t.id && (
                    <TeamDetail
                      detail={teamDetailQ.data as unknown as TeamDetailData}
                      agents={agents as unknown as AgentRow[]}
                      onAdd={(seatId, role) =>
                        addMember.mutate({ teamId: t.id, seatId, role })
                      }
                      onRemove={(seatId) => removeMember.mutate({ teamId: t.id, seatId })}
                      pendingAdd={addMember.isPending}
                      pendingRemove={removeMember.isPending}
                    />
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function TeamDetail({
  detail,
  agents,
  onAdd,
  onRemove,
  pendingAdd,
  pendingRemove,
}: {
  detail: TeamDetailData;
  agents: AgentRow[];
  onAdd: (seatId: number, role: MemberRole) => void;
  onRemove: (seatId: number) => void;
  pendingAdd: boolean;
  pendingRemove: boolean;
}) {
  const memberSeatIds = useMemo(
    () => new Set(detail.members.map((m) => m.seatId)),
    [detail.members]
  );
  const candidates = useMemo(
    () => agents.filter((a) => !memberSeatIds.has(a.id)),
    [agents, memberSeatIds]
  );
  const [pickSeatId, setPickSeatId] = useState<number | null>(null);
  const [pickRole, setPickRole] = useState<MemberRole>("backend");

  return (
    <div className="border-t pt-3 mt-2 space-y-3">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
          Members ({detail.members.length})
        </div>
        {detail.members.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No members yet. Add a seat from your bench below.
          </p>
        ) : (
          <ul className="space-y-1">
            {detail.members.map((m) => (
              <li key={m.id} className="flex items-center justify-between text-xs gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{m.seatName ?? `Seat #${m.seatId}`}</div>
                  <div className="text-[10px] text-muted-foreground">{m.role}</div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(m.seatId)}
                  disabled={pendingRemove}
                  className="text-muted-foreground hover:text-destructive p-1 min-h-[36px] min-w-[36px] flex items-center justify-center"
                  aria-label="Remove member"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {candidates.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Add member
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            <select
              className="text-xs border rounded px-2 py-1.5 min-h-[36px]"
              value={pickSeatId ?? ""}
              onChange={(e) => setPickSeatId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Pick a seat…</option>
              {candidates.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.seatName} ({departmentLabel(a.department)})
                </option>
              ))}
            </select>
            <select
              className="text-xs border rounded px-2 py-1.5 min-h-[36px]"
              value={pickRole}
              onChange={(e) => setPickRole(e.target.value as MemberRole)}
            >
              <option value="lead">lead</option>
              <option value="frontend">frontend</option>
              <option value="backend">backend</option>
              <option value="qa">qa</option>
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={pickSeatId === null || pendingAdd}
              onClick={() => {
                if (pickSeatId !== null) {
                  onAdd(pickSeatId, pickRole);
                  setPickSeatId(null);
                }
              }}
              className="min-h-[36px]"
            >
              <Plus className="w-3 h-3 mr-1" /> Add
            </Button>
          </div>
        </div>
      )}

      {detail.tasks.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Recent tasks ({detail.tasks.length})
          </div>
          <ul className="space-y-1 max-h-40 overflow-y-auto">
            {detail.tasks.slice(0, 8).map((t) => (
              <li key={t.id} className="text-xs">
                <span className="font-medium">{t.title}</span>
                <span className="text-muted-foreground"> · {t.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
