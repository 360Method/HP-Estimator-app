import { Fragment, useEffect, useMemo, useState, type MouseEvent } from "react";
import { useLocation } from "wouter";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { AdminShell } from "./AdminShell";
import { departmentLabel } from "./constants";

type TaskRow = {
  id: number;
  agentId: number;
  seatName: string;
  agentDepartment: string | null;
  agentRole: string | null;
  agentStatus: string | null;
  triggerType: string;
  triggerPayload: string | null;
  status: string;
  createdAt: string | Date;
  latestRunId: number | null;
  latestRunInput: string | null;
  latestRunOutput: string | null;
  latestRunToolCalls: string | null;
  latestRunStatus: string | null;
  latestRunErrorMessage: string | null;
  latestRunCreatedAt: string | Date | null;
  latestRunCostUsd: string | number | null;
  latestRunDurationMs: number | null;
};

type ToolCall = {
  key?: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
};

function parseJsonField(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function formatReviewValue(value: unknown): string {
  if (value == null || value === "") return "None";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function toolCallsFrom(value: string | null): ToolCall[] {
  const parsed = parseJsonField(value);
  return Array.isArray(parsed) ? parsed : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function formatInlineValue(value: unknown): string {
  if (value == null || value === "") return "None";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function contextItemsFrom(value: unknown): Array<{ label: string; value: string }> {
  if (!isRecord(value)) return [];
  const candidates: Array<[string, string]> = [
    ["Customer", "customerName"],
    ["Customer ID", "customerId"],
    ["Caller", "callerNumber"],
    ["Phone", "phone"],
    ["Event", "event"],
    ["Opportunity", "opportunityId"],
    ["Duration", "durationSecs"],
    ["Transcript", "transcription"],
    ["Recording", "recordingUrl"],
  ];
  return candidates
    .filter(([, key]) => value[key] != null && value[key] !== "")
    .map(([label, key]) => ({
      label,
      value: key === "durationSecs" ? `${formatInlineValue(value[key])} sec` : formatInlineValue(value[key]),
    }));
}

function summarizeToolCall(call: ToolCall): string {
  if (!isRecord(call.input)) return "No input payload recorded.";
  const target = call.input.customerName ?? call.input.to ?? call.input.phone ?? call.input.email ?? call.input.customerId;
  const subject = call.input.subject ?? call.input.title ?? call.input.summary ?? call.input.message;
  return [target ? `Target: ${formatInlineValue(target)}` : null, subject ? `Content: ${formatInlineValue(subject)}` : null]
    .filter(Boolean)
    .join(" / ") || "Review the input payload before approving.";
}

function compactDate(value: string | Date | null): string {
  if (!value) return "None";
  return new Date(value as never).toLocaleString();
}

export default function AiAgentTasks() {
  const [location] = useLocation();
  const focusedTaskId = useMemo(() => {
    const id = Number(new URLSearchParams(window.location.search).get("taskId") ?? 0);
    return Number.isFinite(id) && id > 0 ? id : null;
  }, [location]);
  const [filter, setFilter] = useState<"awaiting_approval" | "all">(
    focusedTaskId ? "all" : "awaiting_approval",
  );
  const [expandedId, setExpandedId] = useState<number | null>(focusedTaskId);
  const [feedbackByTask, setFeedbackByTask] = useState<Record<number, string>>({});
  const utils = trpc.useUtils();
  const tasksQ = trpc.aiAgents.listTasks.useQuery({
    status: filter === "all" ? undefined : "awaiting_approval",
    limit: 100,
  });
  const approve = trpc.aiAgents.approveTask.useMutation({
    onSuccess: (res) => {
      utils.aiAgents.listTasks.invalidate();
      toast.success(
        `Approved. Executed ${res.executed} tool call${res.executed === 1 ? "" : "s"}.${
          res.errors.length ? ` Errors: ${res.errors.join("; ")}` : ""
        }`
      );
    },
    onError: (err) => toast.error(err.message),
  });
  const reject = trpc.aiAgents.rejectTask.useMutation({
    onSuccess: () => {
      utils.aiAgents.listTasks.invalidate();
      toast.success("Rejected.");
    },
    onError: (err) => toast.error(err.message),
  });
  const requestRevision = trpc.aiAgents.requestRevision.useMutation({
    onSuccess: (res) => {
      utils.aiAgents.listTasks.invalidate();
      toast.success(`Revision requested. New task #${res.taskId} created.`);
    },
    onError: (err) => toast.error(err.message),
  });

  const tasks = (tasksQ.data ?? []) as TaskRow[];

  useEffect(() => {
    if (focusedTaskId) {
      setFilter("all");
      setExpandedId(focusedTaskId);
    }
  }, [focusedTaskId]);

  useEffect(() => {
    if (!focusedTaskId || tasksQ.isLoading) return;
    window.setTimeout(() => {
      document.getElementById(`ai-task-${focusedTaskId}`)?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }, 150);
  }, [focusedTaskId, tasks.length, tasksQ.isLoading]);

  const toggleTask = (id: number) => {
    setExpandedId((current) => (current === id ? null : id));
  };

  return (
    <AdminShell>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold">Approval Queue</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Review parked agent work before anything customer-facing runs.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:flex gap-2 text-sm">
            <Button
              variant={filter === "awaiting_approval" ? "default" : "outline"}
              className="min-h-[40px]"
              onClick={() => setFilter("awaiting_approval")}
            >
              Awaiting
            </Button>
            <Button
              variant={filter === "all" ? "default" : "outline"}
              className="min-h-[40px]"
              onClick={() => setFilter("all")}
            >
              All tasks
            </Button>
          </div>
        </div>

        {tasks.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">Nothing pending.</Card>
        ) : (
          <>
            <div className="sm:hidden space-y-3">
              {tasks.map((t) => (
                <Card
                  key={t.id}
                  id={`ai-task-${t.id}`}
                  className={`p-4 space-y-3 ${
                    focusedTaskId === t.id ? "ring-2 ring-primary border-primary" : ""
                  } ${expandedId === t.id ? "bg-primary/5" : ""}`}
                >
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-2 text-left"
                    aria-expanded={expandedId === t.id}
                    onClick={() => toggleTask(t.id)}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 text-sm font-semibold">
                        {expandedId === t.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        <span className="truncate">{t.seatName}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        #{t.id} / {t.triggerType} / {departmentLabel(t.agentDepartment ?? "")}
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0">{t.status}</Badge>
                  </button>
                  <div className="text-xs text-muted-foreground">{compactDate(t.createdAt)}</div>
                  {expandedId === t.id && (
                    <TaskReviewPanel
                      task={t}
                      feedback={feedbackByTask[t.id] ?? ""}
                      isBusy={approve.isPending || reject.isPending || requestRevision.isPending}
                      onFeedbackChange={(value) =>
                        setFeedbackByTask((current) => ({ ...current, [t.id]: value }))
                      }
                      onApprove={(event) => {
                        event.stopPropagation();
                        approve.mutate({ taskId: t.id });
                      }}
                      onReject={(event) => {
                        event.stopPropagation();
                        reject.mutate({ taskId: t.id, reason: feedbackByTask[t.id] || undefined });
                      }}
                      onRequestRevision={(event) => {
                        event.stopPropagation();
                        requestRevision.mutate({ taskId: t.id, feedback: feedbackByTask[t.id] ?? "" });
                      }}
                    />
                  )}
                </Card>
              ))}
            </div>

            <Card className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="text-left p-3 font-medium">Task</th>
                    <th className="text-left p-3 font-medium">Seat</th>
                    <th className="text-left p-3 font-medium">Role</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    <th className="text-left p-3 font-medium">Created</th>
                    <th className="text-right p-3 font-medium">Review</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => (
                    <Fragment key={t.id}>
                      <tr
                        id={`ai-task-${t.id}`}
                        className={`border-b cursor-pointer hover:bg-muted/40 ${
                          focusedTaskId === t.id ? "bg-primary/10 ring-2 ring-primary" : ""
                        } ${expandedId === t.id ? "bg-primary/5" : ""}`}
                        onClick={() => toggleTask(t.id)}
                      >
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            {expandedId === t.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            <span>#{t.id}</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="font-medium">{t.seatName}</div>
                          <div className="text-xs text-muted-foreground">
                            {departmentLabel(t.agentDepartment ?? "")}
                          </div>
                        </td>
                        <td className="p-3 text-xs max-w-[260px] truncate">
                          {t.agentRole ?? t.triggerType}
                        </td>
                        <td className="p-3">
                          <Badge variant="outline">{t.status}</Badge>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">{compactDate(t.createdAt)}</td>
                        <td className="p-3 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleTask(t.id);
                            }}
                          >
                            Review
                          </Button>
                        </td>
                      </tr>
                      {expandedId === t.id && (
                        <tr className="border-b bg-muted/20">
                          <td colSpan={6} className="p-3">
                            <TaskReviewPanel
                              task={t}
                              feedback={feedbackByTask[t.id] ?? ""}
                              isBusy={approve.isPending || reject.isPending || requestRevision.isPending}
                              onFeedbackChange={(value) =>
                                setFeedbackByTask((current) => ({ ...current, [t.id]: value }))
                              }
                              onApprove={(event) => {
                                event.stopPropagation();
                                approve.mutate({ taskId: t.id });
                              }}
                              onReject={(event) => {
                                event.stopPropagation();
                                reject.mutate({ taskId: t.id, reason: feedbackByTask[t.id] || undefined });
                              }}
                              onRequestRevision={(event) => {
                                event.stopPropagation();
                                requestRevision.mutate({ taskId: t.id, feedback: feedbackByTask[t.id] ?? "" });
                              }}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </div>
    </AdminShell>
  );
}

function TaskReviewPanel({
  task,
  feedback,
  isBusy,
  onFeedbackChange,
  onApprove,
  onReject,
  onRequestRevision,
}: {
  task: TaskRow;
  feedback: string;
  isBusy: boolean;
  onFeedbackChange: (value: string) => void;
  onApprove: (event: MouseEvent) => void;
  onReject: (event: MouseEvent) => void;
  onRequestRevision: (event: MouseEvent) => void;
}) {
  const triggerPayload = parseJsonField(task.triggerPayload);
  const latestInput = parseJsonField(task.latestRunInput);
  const toolCalls = toolCallsFrom(task.latestRunToolCalls);
  const seatUrl = `/admin/ai-agents/${task.agentId}`;
  const runsUrl = `/admin/agents/runs?seat=${encodeURIComponent(task.seatName)}`;
  const contextItems = contextItemsFrom(triggerPayload);
  const hasOutput = Boolean(task.latestRunOutput?.trim());
  const hasRun = Boolean(task.latestRunId);
  const hasExecutableProposal = toolCalls.length > 0;
  const decision = !hasRun
    ? {
        label: "Request revision",
        tone: "bg-amber-50 text-amber-800 border-amber-200",
        reason: "No run exists, so there is no AI proposal.",
      }
    : !hasOutput
      ? {
          label: "Request revision",
          tone: "bg-amber-50 text-amber-800 border-amber-200",
          reason: "No agent output was recorded for review.",
        }
      : !hasExecutableProposal
        ? {
            label: "Reject or request revision",
            tone: "bg-amber-50 text-amber-800 border-amber-200",
            reason: "No executable action was proposed.",
          }
        : {
            label: "Review proposed action",
            tone: "bg-green-50 text-green-800 border-green-200",
            reason: `${toolCalls.length} action${toolCalls.length === 1 ? "" : "s"} ready for approval.`,
          };

  return (
    <div className="space-y-4 rounded-md border bg-background p-3 sm:p-4">
      <div className={`rounded-md border p-3 ${decision.tone}`}>
        <div className="text-xs font-semibold uppercase tracking-wide">Approver decision</div>
        <div className="mt-1 text-base font-semibold">{decision.label}</div>
        <p className="mt-1 text-sm">{decision.reason}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <ReviewStat label="Seat" value={task.seatName} />
        <ReviewStat label="Department" value={departmentLabel(task.agentDepartment ?? "")} />
        <ReviewStat label="Run" value={task.latestRunId ? `#${task.latestRunId}` : "None"} />
        <ReviewStat label="Run status" value={task.latestRunStatus ?? "None"} />
      </div>

      {contextItems.length > 0 && (
        <div className="rounded-md border p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Source context
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {contextItems.map((item) => (
              <div key={item.label} className="rounded-md bg-muted px-3 py-2">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{item.label}</div>
                <div className="mt-1 break-words text-sm font-medium">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={seatUrl} onClick={(event) => event.stopPropagation()}>
            Open seat <ExternalLink size={14} />
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={runsUrl} onClick={(event) => event.stopPropagation()}>
            View runs <ExternalLink size={14} />
          </a>
        </Button>
        {task.status === "awaiting_approval" && (
          <div className="grid grid-cols-2 gap-2 sm:ml-auto sm:min-w-[220px]">
            <Button
              size="sm"
              className="min-h-[40px]"
              onClick={onApprove}
              disabled={isBusy || !hasExecutableProposal}
            >
              Approve
            </Button>
            <Button size="sm" variant="outline" className="min-h-[40px]" onClick={onReject} disabled={isBusy}>
              Reject
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <ReviewBlock title="Agent output" value={task.latestRunOutput ?? task.latestRunErrorMessage ?? "No output recorded."} />
        <ReviewBlock title="Trigger payload" value={formatReviewValue(triggerPayload)} />
        <ReviewBlock title="Run input" value={formatReviewValue(latestInput)} />
        <div className="rounded-md border p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pending actions
          </div>
          {toolCalls.length === 0 ? (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              No executable action is recorded. Approval is disabled because it would not send,
              create, update, or notify anything.
            </div>
          ) : (
            <div className="mt-2 space-y-3">
              {toolCalls.map((call, index) => (
                <div key={`${call.key ?? "tool"}-${index}`} className="rounded-md bg-muted p-3">
                  <div className="text-sm font-medium">{call.key ?? `Tool ${index + 1}`}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{summarizeToolCall(call)}</div>
                  <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs">
                    {formatReviewValue(call.input)}
                  </pre>
                  {call.error != null && (
                    <div className="mt-2 text-xs text-destructive">{formatReviewValue(call.error)}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {task.status === "awaiting_approval" && (
        <div className="rounded-md border p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Feedback / requested output
          </div>
          <Textarea
            value={feedback}
            onChange={(event) => onFeedbackChange(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            rows={3}
            placeholder="Example: Draft a concise callback task for the Lead Desk and include the voicemail recording link."
            className="mt-2"
          />
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              className="min-h-[40px]"
              disabled={isBusy || feedback.trim().length < 5}
              onClick={onRequestRevision}
            >
              Request revision
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="min-h-[40px]"
              disabled={isBusy}
              onClick={onReject}
            >
              Reject with feedback
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium break-words">{value}</div>
    </div>
  );
}

function ReviewBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed">
        {value}
      </pre>
    </div>
  );
}
