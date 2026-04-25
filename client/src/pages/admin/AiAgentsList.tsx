import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AdminShell } from "./AdminShell";
import { DEPARTMENTS, STATUS_CLASS, STATUS_LABEL, departmentLabel, formatUsd } from "./constants";

type Agent = {
  id: number;
  seatName: string;
  department: string;
  role: string;
  systemPrompt: string;
  model: string;
  status: string;
  reportsToSeatId: number | null;
  isDepartmentHead: boolean;
  costCapDailyUsd: string;
  runLimitDaily: number;
  costTodayUsd: number;
  runsToday: number;
  queuedTasks: number;
  lastRunAt: Date | string | null;
};

export default function AiAgentsList() {
  const agentsQ = trpc.aiAgents.list.useQuery();
  const agents = (agentsQ.data ?? []) as Agent[];

  // Build hierarchy: Integrator (top) → Department Heads → Sub-agents
  const integrator = agents.filter((a) => a.department === "integrator");
  const heads = agents.filter((a) => a.isDepartmentHead && a.department !== "integrator");
  const subs = agents.filter((a) => !a.isDepartmentHead && a.department !== "integrator");

  const subsByHead = new Map<number, Agent[]>();
  for (const s of subs) {
    if (s.reportsToSeatId != null) {
      const arr = subsByHead.get(s.reportsToSeatId) ?? [];
      arr.push(s);
      subsByHead.set(s.reportsToSeatId, arr);
    }
  }
  const orphanSubs = subs.filter((s) => s.reportsToSeatId == null);

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">AI Agents</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Visionary → Integrator → 8 Department Heads → sub-agents + humans. No agents seeded yet —
              Phase 3 will populate the table.
            </p>
          </div>
          <CreateAgentDialog />
        </div>

        {/* Integrator tier */}
        <TierSection
          title="Integrator"
          subtitle="The main AI. Reports to Visionary (Marcin); coordinates across all Department Heads."
          agents={integrator}
        />

        {/* Department Heads tier */}
        <TierSection
          title="Department Heads"
          subtitle="Eight AI Heads — one per department. Each owns their KPIs and coordinates sub-agents + humans."
          agents={heads}
          renderExtra={(h) => {
            const s = subsByHead.get(h.id) ?? [];
            return s.length > 0 ? (
              <span className="text-xs text-muted-foreground">
                {s.length} sub-agent{s.length === 1 ? "" : "s"}
              </span>
            ) : null;
          }}
        />

        {/* Sub-agents grouped under their Head */}
        {heads.map((h) => {
          const subs = subsByHead.get(h.id) ?? [];
          if (subs.length === 0) return null;
          return (
            <div key={h.id}>
              <div className="text-sm font-medium text-muted-foreground mb-2">
                Sub-agents under {h.seatName}
              </div>
              <AgentTable agents={subs} />
            </div>
          );
        })}

        {orphanSubs.length > 0 && (
          <TierSection
            title="Unassigned sub-agents"
            subtitle="No reportsToSeatId set — assign to a Department Head."
            agents={orphanSubs}
          />
        )}

        {agents.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">
            No agents defined yet. Click <span className="font-medium">New Agent</span> to create a draft,
            or wait for Phase 3 to seed the roster.
          </Card>
        )}
      </div>
    </AdminShell>
  );
}

function TierSection({
  title,
  subtitle,
  agents,
  renderExtra,
}: {
  title: string;
  subtitle: string;
  agents: Agent[];
  renderExtra?: (a: Agent) => React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </div>
      {agents.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground italic">— empty —</Card>
      ) : (
        <AgentTable agents={agents} renderExtra={renderExtra} />
      )}
    </div>
  );
}

function AgentTable({
  agents,
  renderExtra,
}: {
  agents: Agent[];
  renderExtra?: (a: Agent) => React.ReactNode;
}) {
  return (
    <Card>
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40">
          <tr>
            <th className="text-left p-3 font-medium">Seat</th>
            <th className="text-left p-3 font-medium">Department</th>
            <th className="text-left p-3 font-medium">Status</th>
            <th className="text-right p-3 font-medium">Cost (24h)</th>
            <th className="text-right p-3 font-medium">Runs (24h)</th>
            <th className="text-right p-3 font-medium">Queued</th>
            <th className="text-right p-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => (
            <tr key={a.id} className="border-b last:border-0">
              <td className="p-3">
                <Link href={`/admin/ai-agents/${a.id}`}>
                  <span className="font-medium cursor-pointer hover:underline">{a.seatName}</span>
                </Link>
                <div className="text-xs text-muted-foreground">{a.role}</div>
              </td>
              <td className="p-3">{departmentLabel(a.department)}</td>
              <td className="p-3">
                <Badge variant="outline" className={STATUS_CLASS[a.status]}>
                  {STATUS_LABEL[a.status] ?? a.status}
                </Badge>
              </td>
              <td className="p-3 text-right tabular-nums">{formatUsd(a.costTodayUsd)}</td>
              <td className="p-3 text-right tabular-nums">{a.runsToday}</td>
              <td className="p-3 text-right tabular-nums">{a.queuedTasks}</td>
              <td className="p-3 text-right">{renderExtra?.(a)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function CreateAgentDialog() {
  const utils = trpc.useUtils();
  const agentsQ = trpc.aiAgents.list.useQuery();
  const create = trpc.aiAgents.create.useMutation({
    onSuccess: () => {
      utils.aiAgents.list.invalidate();
      toast.success("Agent created in draft queue.");
      setOpen(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const [open, setOpen] = useState(false);
  const [seatName, setSeatName] = useState("");
  const [department, setDepartment] = useState<string>("sales");
  const [isDepartmentHead, setIsDepartmentHead] = useState(false);
  const [role, setRole] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [reportsToSeatId, setReportsToSeatId] = useState<string>("");

  const roster = agentsQ.data ?? [];
  // Valid parents depend on the role:
  //   - Integrator: no parent allowed.
  //   - Department Head: must report to the Integrator seat.
  //   - Sub-agent: must report to a Head in the same department.
  const validParents = (() => {
    if (department === "integrator") return [];
    if (isDepartmentHead) return roster.filter((r) => r.department === "integrator");
    return roster.filter((r) => r.isDepartmentHead && r.department === department);
  })();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New Agent</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create AI agent (draft)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Seat name</label>
            <Input value={seatName} onChange={(e) => setSeatName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Department</label>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map((d) => (
                  <SelectItem key={d.slug} value={d.slug}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isDepartmentHead}
              onChange={(e) => {
                setIsDepartmentHead(e.target.checked);
                setReportsToSeatId("");
              }}
              disabled={department === "integrator"}
            />
            This is a Department Head (reports to Integrator)
          </label>
          {department !== "integrator" && (
            <div>
              <label className="text-sm font-medium">Reports to</label>
              <Select value={reportsToSeatId} onValueChange={setReportsToSeatId}>
                <SelectTrigger>
                  <SelectValue placeholder={validParents.length ? "Select parent seat" : "No valid parent available"} />
                </SelectTrigger>
                <SelectContent>
                  {validParents.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.seatName} ({p.department})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {validParents.length === 0 && (
                <p className="text-xs text-amber-700 mt-1">
                  {isDepartmentHead
                    ? "Create the Integrator seat first."
                    : "Create the Department Head for this department first."}
                </p>
              )}
            </div>
          )}
          <div>
            <label className="text-sm font-medium">Role</label>
            <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="One-line role description" />
          </div>
          <div>
            <label className="text-sm font-medium">System prompt</label>
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={6}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!seatName || !role || !systemPrompt || create.isPending}
            onClick={() =>
              create.mutate({
                seatName,
                department: department as never,
                role,
                systemPrompt,
                isDepartmentHead,
                reportsToSeatId: reportsToSeatId ? Number(reportsToSeatId) : null,
              })
            }
          >
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
