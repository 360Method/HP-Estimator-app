import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AdminShell } from "./AdminShell";
import { STATUS_CLASS, STATUS_LABEL, departmentLabel, formatUsd } from "./constants";

export default function AiAgentDetail() {
  const [, params] = useRoute("/admin/ai-agents/:id");
  const id = Number(params?.id);

  const utils = trpc.useUtils();
  const agentQ = trpc.aiAgents.get.useQuery({ id }, { enabled: !!id });
  const toolKeysQ = trpc.aiAgents.availableToolKeys.useQuery();
  const seatKpisQ = trpc.kpis.seat.useQuery({ agentId: id }, { enabled: !!id });

  const update = trpc.aiAgents.update.useMutation({
    onSuccess: () => {
      utils.aiAgents.get.invalidate({ id });
      toast.success("Saved.");
    },
    onError: (err) => toast.error(err.message),
  });
  const setStatus = trpc.aiAgents.setStatus.useMutation({
    onSuccess: () => utils.aiAgents.get.invalidate({ id }),
  });
  const promote = trpc.aiAgents.promoteToAutonomous.useMutation({
    onSuccess: () => utils.aiAgents.get.invalidate({ id }),
  });
  const triggerRun = trpc.aiAgents.triggerManualRun.useMutation({
    onSuccess: (res) => {
      utils.aiAgents.get.invalidate({ id });
      toast.success(`Run ${res.runId} · ${res.status}`);
    },
    onError: (err) => toast.error(err.message),
  });
  const setTools = trpc.aiAgents.setTools.useMutation({
    onSuccess: () => utils.aiAgents.get.invalidate({ id }),
  });

  const [systemPrompt, setSystemPrompt] = useState("");
  const [model, setModel] = useState("");
  const [costCap, setCostCap] = useState("5.00");
  const [runLimit, setRunLimit] = useState(200);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (agentQ.data) {
      setSystemPrompt(agentQ.data.agent.systemPrompt);
      setModel(agentQ.data.agent.model);
      setCostCap(String(agentQ.data.agent.costCapDailyUsd));
      setRunLimit(agentQ.data.agent.runLimitDaily);
      setSelectedTools(new Set(agentQ.data.tools.map((t) => t.toolKey)));
    }
  }, [agentQ.data]);

  if (!id || agentQ.isLoading) {
    return <AdminShell><div>Loading…</div></AdminShell>;
  }
  if (!agentQ.data) {
    return <AdminShell><div>Not found.</div></AdminShell>;
  }

  const { agent, recentRuns } = agentQ.data;

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold">{agent.seatName}</h1>
              <Badge variant="outline" className={STATUS_CLASS[agent.status]}>
                {STATUS_LABEL[agent.status] ?? agent.status}
              </Badge>
              {agent.isDepartmentHead && <Badge variant="outline">Department Head</Badge>}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {departmentLabel(agent.department)} · {agent.role}
            </div>
          </div>
          <div className="flex gap-2">
            {agent.status !== "autonomous" && (
              <Button variant="outline" onClick={() => promote.mutate({ id })}>
                Promote to autonomous
              </Button>
            )}
            {agent.status === "autonomous" ? (
              <Button variant="outline" onClick={() => setStatus.mutate({ id, status: "paused" })}>
                Pause
              </Button>
            ) : agent.status === "paused" ? (
              <Button variant="outline" onClick={() => setStatus.mutate({ id, status: "autonomous" })}>
                Resume
              </Button>
            ) : null}
            <Button onClick={() => triggerRun.mutate({ id, payload: { source: "manual_test" } })}>
              Trigger run
            </Button>
          </div>
        </div>

        <Card className="p-4 space-y-3">
          <h2 className="font-medium">System prompt</h2>
          <Textarea rows={10} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Model</label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="claude-haiku-4-5-20251001">Haiku 4.5</SelectItem>
                  <SelectItem value="claude-sonnet-4-6">Sonnet 4.6</SelectItem>
                  <SelectItem value="claude-opus-4-7">Opus 4.7</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Daily cost cap (USD)</label>
              <Input value={costCap} onChange={(e) => setCostCap(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Run limit (daily)</label>
              <Input
                type="number"
                value={runLimit}
                onChange={(e) => setRunLimit(Number(e.target.value) || 0)}
              />
            </div>
          </div>
          <Button
            onClick={() =>
              update.mutate({
                id,
                systemPrompt,
                model,
                costCapDailyUsd: Number(costCap),
                runLimitDaily: runLimit,
              })
            }
          >
            Save config
          </Button>
        </Card>

        <Card className="p-4">
          <h2 className="font-medium mb-3">Authorized tools</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            {(toolKeysQ.data ?? []).map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedTools.has(k)}
                  onChange={(e) => {
                    const next = new Set(selectedTools);
                    if (e.target.checked) next.add(k); else next.delete(k);
                    setSelectedTools(next);
                  }}
                />
                <code className="text-xs">{k}</code>
              </label>
            ))}
            {(toolKeysQ.data ?? []).length === 0 && (
              <div className="text-xs text-muted-foreground italic col-span-3">
                No tools registered yet — Phase 2 will populate the registry.
              </div>
            )}
          </div>
          <Button
            className="mt-3"
            onClick={() => setTools.mutate({ agentId: id, toolKeys: Array.from(selectedTools) })}
          >
            Save tools
          </Button>
        </Card>

        <Card className="p-4">
          <h2 className="font-medium mb-3">Seat KPIs</h2>
          {(seatKpisQ.data ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground italic">
              No metrics recorded. Agents write KPIs via the <code>kpis.record</code> tool.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="text-left p-2 font-medium">Key</th>
                  <th className="text-right p-2 font-medium">Value</th>
                  <th className="text-left p-2 font-medium">Unit</th>
                  <th className="text-left p-2 font-medium">Period</th>
                  <th className="text-right p-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {(seatKpisQ.data ?? []).slice(0, 20).map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="p-2">{m.key}</td>
                    <td className="p-2 text-right tabular-nums">{Number(m.value).toFixed(2)}</td>
                    <td className="p-2">{m.unit}</td>
                    <td className="p-2">{m.period}</td>
                    <td className="p-2 text-right text-xs text-muted-foreground">
                      {new Date(m.computedAt as never).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="font-medium mb-3">Run history</h2>
          {recentRuns.length === 0 ? (
            <div className="text-sm text-muted-foreground italic">No runs yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="text-left p-2 font-medium">When</th>
                  <th className="text-left p-2 font-medium">Status</th>
                  <th className="text-right p-2 font-medium">Cost</th>
                  <th className="text-right p-2 font-medium">Tokens (in/out)</th>
                  <th className="text-right p-2 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="p-2 text-xs text-muted-foreground">
                      {new Date(r.createdAt as never).toLocaleString()}
                    </td>
                    <td className="p-2">
                      <Badge variant="outline">{r.status}</Badge>
                    </td>
                    <td className="p-2 text-right tabular-nums">{formatUsd(Number(r.costUsd))}</td>
                    <td className="p-2 text-right text-xs tabular-nums">
                      {r.inputTokens}/{r.outputTokens}
                    </td>
                    <td className="p-2 text-right text-xs tabular-nums">{r.durationMs} ms</td>
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
