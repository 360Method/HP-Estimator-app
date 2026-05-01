// ============================================================
// AgentDraftsPage — Admin inbox for the Lead Nurturer.
// Tabs: Scheduled | Ready to send | Sent | Cancelled
// Backed by trpc.agentDrafts.* — all drafts are approval-gated.
// ============================================================

import { useState } from "react";
import { Calendar, CheckCircle2, Clock, Info, Loader2, Mail, MessageSquare, Send, Trash2, User, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEstimator } from "@/contexts/EstimatorContext";
import { useLocation } from "wouter";

type Tab = "scheduled" | "ready" | "sent" | "cancelled";

const TABS: Array<{ key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "scheduled", label: "Scheduled", icon: Clock },
  { key: "ready", label: "Ready to send", icon: CheckCircle2 },
  { key: "sent", label: "Sent", icon: Send },
  { key: "cancelled", label: "Cancelled", icon: X },
];

export default function AgentDraftsPage() {
  const [tab, setTab] = useState<Tab>("ready");

  const counts = trpc.agentDrafts.counts.useQuery(undefined, { refetchInterval: 30_000 });

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 flex items-start gap-2">
        <Info className="w-4 h-4 text-sky-700 mt-0.5 shrink-0" />
        <div className="text-xs text-sky-900 leading-relaxed">
          <span className="font-semibold">Drafts now live inside the customer profile.</span>{" "}
          Each row below deep-links to the customer's opportunity-level AI drafts so you can edit, approve, or reject in the right lead, estimate, or job context. This page remains the cross-customer operations dashboard.
        </div>
      </div>

      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Lead Nurturer</p>
        <h1 className="mt-2 text-3xl font-semibold text-stone-900">Agent drafts</h1>
        <p className="mt-2 max-w-2xl text-sm text-stone-600">
          Every post-Roadmap follow-up is drafted here by opportunity. General nurture can move fast; pricing, scope, payment, and job-specific messages stay approval-gated.
        </p>
      </header>

      <nav className="mb-6 flex gap-2 border-b border-stone-200">
        {TABS.map((t) => {
          const Icon = t.icon;
          const count = counts.data?.[t.key === "scheduled" ? "pending" : t.key === "ready" ? "ready" : t.key === "sent" ? "sent" : "failed"] ?? 0;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition ${
                active
                  ? "border-b-2 border-stone-900 text-stone-900"
                  : "text-stone-500 hover:text-stone-800"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              {count > 0 && (
                <span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-stone-900 text-white" : "bg-stone-200 text-stone-700"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {tab === "scheduled" && <ScheduledTab />}
      {tab === "ready" && <ReadyTab />}
      {tab === "sent" && <RecentTab status="sent" />}
      {tab === "cancelled" && <RecentTab status="cancelled" />}
    </div>
  );
}

// ─── Scheduled (pending) drafts ──────────────────────────────────────────────

function ScheduledTab() {
  const { data, isLoading, refetch } = trpc.agentDrafts.listScheduled.useQuery();
  const cancel = trpc.agentDrafts.cancel.useMutation({
    onSuccess: () => {
      toast.success("Draft cancelled");
      refetch();
    },
  });
  const reschedule = trpc.agentDrafts.reschedule.useMutation({
    onSuccess: () => {
      toast.success("Rescheduled");
      refetch();
    },
  });
  const generateNow = trpc.agentDrafts.generateNow.useMutation({
    onSuccess: () => {
      toast.success("Generation started — check Ready tab in a moment");
      refetch();
    },
  });

  if (isLoading) return <Spinner label="Loading scheduled drafts…" />;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="No drafts scheduled."
        description="When a Roadmap is delivered, the Lead Nurturer queues five touchpoints over the next two weeks. They'll appear here."
      />
    );
  }

  return (
    <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
      {data.map((d) => (
        <li key={d.id} className="px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ChannelIcon channel={d.channel} />
                <p className="text-sm font-medium text-stone-900">{d.customerName ?? "(unknown customer)"}</p>
                <StepLabel stepKey={d.stepKey} />
              </div>
              <p className="mt-1 text-xs text-stone-500">
                Scheduled for {fmtDateTime(d.scheduledFor)} · {timeFromNow(d.scheduledFor)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => generateNow.mutate({ id: d.id })}
                disabled={generateNow.isPending}
              >
                <Zap className="mr-1 h-3 w-3" />
                Generate now
              </Button>
              <RescheduleButton draftId={d.id} current={d.scheduledFor} onSubmit={(when) => reschedule.mutate({ id: d.id, scheduledFor: when })} />
              <ViewInProfileButton customerId={d.customerId} />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (confirm("Cancel this draft?")) cancel.mutate({ id: d.id });
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ViewInProfileButton({ customerId }: { customerId: string }) {
  const { setActiveCustomer } = useEstimator();
  const [, navigate] = useLocation();
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        setActiveCustomer(customerId, "direct", "pending-review");
        navigate("/");
      }}
      title="View in customer profile"
    >
      <User className="h-3 w-3 mr-1" />
      In profile
    </Button>
  );
}

// ─── Ready drafts — operator approval ────────────────────────────────────────

function ReadyTab() {
  const { data, isLoading, refetch } = trpc.agentDrafts.listReady.useQuery();
  const approve = trpc.agentDrafts.approve.useMutation({
    onSuccess: () => {
      toast.success("Sent");
      refetch();
    },
    onError: (err) => toast.error(`Send failed: ${err.message}`),
  });
  const cancel = trpc.agentDrafts.cancel.useMutation({
    onSuccess: () => {
      toast.success("Draft cancelled");
      refetch();
    },
  });
  const update = trpc.agentDrafts.updateDraft.useMutation({
    onSuccess: () => {
      toast.success("Draft updated");
      refetch();
    },
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [edits, setEdits] = useState<{ subject: string; body: string }>({ subject: "", body: "" });

  if (isLoading) return <Spinner label="Loading drafts…" />;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Inbox zero."
        description="The Lead Nurturer hasn't generated any drafts yet — or you've sent them all."
      />
    );
  }

  return (
    <ul className="space-y-4">
      {data.map((d) => {
        const isEditing = editingId === d.id;
        return (
          <li key={d.id} className="rounded-lg border border-stone-200 bg-white px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <ChannelIcon channel={d.channel} />
                  <p className="text-sm font-medium text-stone-900">{d.customerName ?? "(unknown)"}</p>
                  <StepLabel stepKey={d.stepKey} />
                </div>
                <p className="mt-1 text-xs text-stone-500">
                  Generated {d.generatedAt ? timeFromNow(d.generatedAt) : "moments ago"} ·{" "}
                  {d.channel === "email" ? d.recipientEmail : d.recipientPhone}
                </p>

                {isEditing ? (
                  <div className="mt-4 space-y-3">
                    {d.channel === "email" && (
                      <div>
                        <Label htmlFor={`subj-${d.id}`}>Subject</Label>
                        <Input
                          id={`subj-${d.id}`}
                          value={edits.subject}
                          onChange={(e) => setEdits((s) => ({ ...s, subject: e.target.value }))}
                        />
                      </div>
                    )}
                    <div>
                      <Label htmlFor={`body-${d.id}`}>Body</Label>
                      <Textarea
                        id={`body-${d.id}`}
                        value={edits.body}
                        onChange={(e) => setEdits((s) => ({ ...s, body: e.target.value }))}
                        rows={d.channel === "sms" ? 4 : 10}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          update.mutate(
                            { id: d.id, subject: d.channel === "email" ? edits.subject : undefined, body: edits.body },
                            { onSuccess: () => setEditingId(null) },
                          );
                        }}
                      >
                        Save edits
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {d.subject && <p className="mt-3 text-sm font-medium text-stone-800">{d.subject}</p>}
                    <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-stone-700">
                      {d.body}
                    </pre>
                  </>
                )}
              </div>

              {!isEditing && (
                <div className="flex flex-col gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      if (confirm(`Send this ${d.channel} to ${d.customerName}?`)) approve.mutate({ id: d.id });
                    }}
                    disabled={approve.isPending}
                  >
                    <Send className="mr-1 h-3 w-3" />
                    Approve & send
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEdits({ subject: d.subject ?? "", body: d.body ?? "" });
                      setEditingId(d.id);
                    }}
                  >
                    Edit
                  </Button>
                  <ViewInProfileButton customerId={d.customerId} />
                  <Button size="sm" variant="ghost" onClick={() => cancel.mutate({ id: d.id })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Recent (sent or cancelled) ──────────────────────────────────────────────

function RecentTab({ status }: { status: "sent" | "cancelled" }) {
  const { data, isLoading } = trpc.agentDrafts.listRecent.useQuery({ status });
  if (isLoading) return <Spinner label="Loading…" />;
  if (!data || data.length === 0) {
    return <EmptyState icon={status === "sent" ? Send : X} title={status === "sent" ? "Nothing sent yet." : "Nothing cancelled."} description="" />;
  }
  return (
    <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
      {data.map((d) => (
        <li key={d.id} className="px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ChannelIcon channel={d.channel} />
              <p className="text-sm text-stone-900">{d.customerName ?? "(unknown)"}</p>
              <StepLabel stepKey={d.stepKey} />
            </div>
            <p className="text-xs text-stone-500">
              {status === "sent" && d.sentAt ? `Sent ${fmtDateTime(d.sentAt)}` : null}
              {status === "cancelled" ? `Cancelled — ${d.cancelReason ?? "unknown"}` : null}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── Bits ────────────────────────────────────────────────────────────────────

function RescheduleButton({
  draftId,
  current,
  onSubmit,
}: {
  draftId: number;
  current: Date | string;
  onSubmit: (when: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(() => toDatetimeLocal(current));
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Calendar className="mr-1 h-3 w-3" />
        Reschedule
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-80 rounded-lg bg-white p-5 shadow-xl">
            <h3 className="mb-3 text-sm font-medium">Reschedule draft #{draftId}</h3>
            <Input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} />
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  onSubmit(new Date(value));
                  setOpen(false);
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ChannelIcon({ channel }: { channel: string }) {
  if (channel === "email") return <Mail className="h-4 w-4 text-stone-400" />;
  if (channel === "sms") return <MessageSquare className="h-4 w-4 text-stone-400" />;
  return null;
}

function StepLabel({ stepKey }: { stepKey: string }) {
  const map: Record<string, string> = {
    t_plus_4h_sms: "T+4h Concierge SMS",
    t_plus_24h_email: "T+24h email",
    t_plus_72h_sms: "T+72h check-in",
    t_plus_7d_email_360: "T+7d 360° intro",
    t_plus_14d_handoff: "T+14d nurture handoff",
  };
  return (
    <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-600">
      {map[stepKey] ?? stepKey}
    </span>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-12 text-stone-500">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-6 py-12 text-center">
      <Icon className="mx-auto h-10 w-10 text-stone-300" />
      <p className="mt-4 text-base font-medium text-stone-700">{title}</p>
      {description && <p className="mt-2 text-sm text-stone-500">{description}</p>}
    </div>
  );
}

function fmtDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function timeFromNow(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const ms = date.getTime() - Date.now();
  const future = ms > 0;
  const abs = Math.abs(ms);
  const min = Math.round(abs / 60_000);
  if (min < 60) return future ? `in ${min}m` : `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return future ? `in ${hr}h` : `${hr}h ago`;
  const day = Math.round(hr / 24);
  return future ? `in ${day}d` : `${day}d ago`;
}

function toDatetimeLocal(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

