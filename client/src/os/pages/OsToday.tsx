/**
 * OsToday — the OS home: "what the OS needs from you today."
 * Approvals strip + the human task queue + quick add. The scorecard strip
 * lands in Phase 4.
 */
import { FormEvent, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  CheckCircle2, Circle, Inbox, Plus, ExternalLink, BookOpen, X,
} from "lucide-react";
import { OsShell } from "../OsShell";
import { SCORECARD_METRICS_BY_KEY } from "@shared/scorecard";
import { useAuth } from "@/_core/hooks/useAuth";

const fmtDue = (d: string | Date | null | undefined): { label: string; overdue: boolean } => {
  if (!d) return { label: "", overdue: false };
  const due = new Date(d);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const days = Math.ceil((due.getTime() - Date.now()) / 86400000);
  if (due.getTime() < Date.now() - 86400000) return { label: "overdue", overdue: true };
  if (due <= today) return { label: "due today", overdue: false };
  if (days === 1) return { label: "due tomorrow", overdue: false };
  return {
    label: `due ${due.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`,
    overdue: false,
  };
};

function taskLink(t: { linkType: string | null; linkId: string | null }): string | null {
  if (!t.linkType || !t.linkId) return null;
  switch (t.linkType) {
    case "customer":
      return `/admin/clients/${t.linkId}`;
    case "opportunity":
      return `/os/pipeline`;
    case "doc":
      return `/os/d/${t.linkId}`;
    case "vendor":
      return `/admin/vendors/${t.linkId}`;
    default:
      return null;
  }
}

export default function OsToday() {
  const utils = trpc.useUtils();
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const { data: tasks, isLoading } = trpc.os.tasks.list.useQuery({}, { refetchInterval: 30_000 });
  const { data: awaitingTasks } = trpc.aiAgents.listTasks.useQuery(
    { status: "awaiting_approval", limit: 50 },
    { refetchInterval: 30_000 },
  );
  const { data: readyDrafts } = trpc.agentDrafts.listReady.useQuery(undefined, { refetchInterval: 30_000 });
  const { data: signals } = trpc.scorecard.liveSignals.useQuery(undefined, { staleTime: 120_000 });

  const createTask = trpc.os.tasks.create.useMutation({
    onSuccess: () => {
      utils.os.tasks.list.invalidate();
      setNewTitle("");
      setAdding(false);
      toast.success("On the list.");
    },
    onError: (e) => toast.error(e.message),
  });
  const setStatus = trpc.os.tasks.setStatus.useMutation({
    onSuccess: () => utils.os.tasks.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const { user } = useAuth();
  const approvalsCount = (awaitingTasks?.length ?? 0) + (readyDrafts?.length ?? 0);
  const open = tasks ?? [];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = (user?.name ?? "").split(" ")[0] || "there";
  const needs = approvalsCount + open.length;

  function submitNew(e: FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createTask.mutate({ title: newTitle.trim() });
  }

  return (
    <OsShell active="/os">
      <h1 className="hp-serif text-2xl" style={{ color: "var(--hp-ink)" }}>
        {greeting}, {firstName}.
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        {needs === 0
          ? "Nothing waiting on you. The OS is watching."
          : `The OS needs ${needs} thing${needs === 1 ? "" : "s"} from you today.`}
      </p>

      {/* ── Approvals strip ─────────────────────────────────────── */}
      {approvalsCount > 0 && (
        <Link href="/os/approvals">
          <div
            className="mt-5 flex items-center gap-3 bg-white rounded-xl border px-4 py-3 cursor-pointer hover:shadow-sm transition-shadow"
            style={{ borderColor: "var(--hp-gold-soft)" }}
          >
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(200,146,42,0.12)" }}>
              <Inbox className="w-4.5 h-4.5" style={{ color: "var(--hp-gold-deep)" }} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold" style={{ color: "var(--hp-ink)" }}>
                Needs approval ({approvalsCount})
              </div>
              <div className="text-xs text-muted-foreground">Drafts and agent actions parked for your yes or no.</div>
            </div>
            <ExternalLink className="w-4 h-4 text-muted-foreground" />
          </div>
        </Link>
      )}

      {/* ── Task queue ──────────────────────────────────────────── */}
      <div className="mt-6 flex items-center justify-between">
        <h2 className="hp-eyebrow" style={{ color: "var(--hp-gold-deep)" }}>
          Your tasks
        </h2>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border hover:bg-black/5 transition-colors"
          style={{ borderColor: "var(--hp-hairline)" }}
        >
          {adding ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {adding ? "Cancel" : "Add task"}
        </button>
      </div>

      {adding && (
        <form onSubmit={submitNew} className="mt-2 flex gap-2">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="What needs doing?"
            className="flex-1 text-sm px-3 py-2 rounded-lg border bg-white"
            style={{ borderColor: "var(--hp-hairline)" }}
          />
          <button type="submit" className="hp-button-gold text-xs" style={{ padding: "8px 16px", minHeight: 0 }} disabled={createTask.isPending}>
            Add
          </button>
        </form>
      )}

      <div className="mt-3 space-y-2">
        {isLoading ? (
          <div className="h-16 rounded-xl bg-white border animate-pulse" style={{ borderColor: "var(--hp-hairline)" }} />
        ) : open.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border" style={{ borderColor: "var(--hp-hairline)" }}>
            <CheckCircle2 className="w-9 h-9 mx-auto mb-2 text-emerald-500 opacity-60" />
            <p className="hp-serif" style={{ color: "var(--hp-ink)" }}>
              Clear list.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Tasks land here when SOPs fire, the chat creates them, or you add one.
            </p>
          </div>
        ) : (
          open.map((t) => {
            const due = fmtDue(t.dueAt);
            const href = taskLink(t);
            return (
              <div
                key={t.id}
                className="bg-white rounded-xl border px-4 py-3 flex items-start gap-3"
                style={{ borderColor: "var(--hp-hairline)" }}
              >
                <button
                  type="button"
                  className="mt-0.5 shrink-0"
                  title="Mark done"
                  onClick={() => setStatus.mutate({ id: t.id, status: "done" })}
                >
                  <Circle className="w-5 h-5 text-muted-foreground hover:text-emerald-600 transition-colors" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium" style={{ color: "var(--hp-ink)" }}>
                    {t.title}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                    {due.label && (
                      <span className={due.overdue ? "text-red-600 font-semibold" : due.label === "due today" ? "font-semibold" : ""}>
                        {due.label}
                      </span>
                    )}
                    {t.sourceDocId && (
                      <Link href={`/os/d/${t.sourceDocId}`}>
                        <span className="inline-flex items-center gap-1 cursor-pointer hover:underline">
                          <BookOpen className="w-3 h-3" /> from {t.sourceDocId}
                        </span>
                      </Link>
                    )}
                    {href && (
                      <Link href={href}>
                        <span className="inline-flex items-center gap-1 cursor-pointer hover:underline" style={{ color: "var(--hp-gold-deep)" }}>
                          open {t.linkType} <ExternalLink className="w-3 h-3" />
                        </span>
                      </Link>
                    )}
                  </div>
                  {t.detail && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{t.detail}</p>}
                </div>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground shrink-0"
                  onClick={() => setStatus.mutate({ id: t.id, status: "dismissed" })}
                >
                  Dismiss
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* ── Scorecard strip ─────────────────────────────────────── */}
      {signals && Object.values(signals).some((s) => s.value !== null) && (
        <>
          <h2 className="hp-eyebrow mt-7 mb-2" style={{ color: "var(--hp-gold-deep)" }}>
            Health
          </h2>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(signals)
              .filter(([, s]) => s.value !== null)
              .map(([key, s]) => {
                const metric = SCORECARD_METRICS_BY_KEY[key];
                const unit = metric?.unit;
                const display =
                  s.value === null
                    ? "?"
                    : unit === "cents"
                      ? `$${(s.value / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                      : unit === "ratio"
                        ? `${Math.round(s.value * 100)}%`
                        : String(s.value);
                const dot =
                  s.status === "green" ? "bg-emerald-500" : s.status === "yellow" ? "bg-amber-400" : s.status === "red" ? "bg-red-500" : "bg-gray-300";
                return (
                  <div
                    key={key}
                    className="bg-white rounded-lg border px-3 py-2 flex items-center gap-2 text-xs"
                    style={{ borderColor: "var(--hp-hairline)" }}
                  >
                    <span className={`w-2 h-2 rounded-full ${dot}`} />
                    <span className="text-muted-foreground">{metric?.label ?? key}</span>
                    <span className="font-semibold" style={{ color: "var(--hp-ink)" }}>
                      {display}
                    </span>
                  </div>
                );
              })}
          </div>
        </>
      )}
    </OsShell>
  );
}
