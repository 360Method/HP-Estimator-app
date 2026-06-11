/**
 * AgentsHubPage — THE one place for the AI agent system.
 * Replaces the old 10-page sprawl (agents list/detail, tasks, control, runs,
 * teams, visionary console, drafts, playbooks) with a single hub:
 *
 *   Today      — master on/off switch, spend vs cap, latest activity
 *   Approvals  — ONE merged inbox: parked agent actions + nurturer drafts
 *   Scheduled  — queued nurturer drafts + upcoming SOP crons
 *   Runs       — the audit trail, filterable
 *   Library    — the SOP library (markdown files in the repo, read-only here)
 *
 * Styled in the portal-parity parchment/serif-ink/gold language.
 */

import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Bot, Power, CheckCircle2, XCircle, Clock, Inbox, CalendarClock,
  BookOpen, Activity, ChevronDown, ChevronRight, MessageSquareText,
  AlertTriangle, Mail, MessageSquare, Wrench, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'wouter';

type HubTab = 'today' | 'approvals' | 'scheduled' | 'runs' | 'library';

const TABS: { id: HubTab; label: string; icon: React.ElementType }[] = [
  { id: 'today', label: 'Today', icon: Activity },
  { id: 'approvals', label: 'Approvals', icon: Inbox },
  { id: 'scheduled', label: 'Scheduled', icon: CalendarClock },
  { id: 'runs', label: 'Runs', icon: Clock },
  { id: 'library', label: 'Library', icon: BookOpen },
];

const RUN_STATUS_COLORS: Record<string, string> = {
  success: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-700',
  tool_error: 'bg-amber-100 text-amber-800',
  cost_exceeded: 'bg-red-100 text-red-700',
  timed_out: 'bg-gray-100 text-gray-600',
};

const fmtUsd = (n: number) => `$${n.toFixed(2)}`;
const fmtWhen = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

export default function AgentsHubPage() {
  const [tab, setTab] = useState<HubTab>('today');
  const utils = trpc.useUtils();

  // ── Shared data ─────────────────────────────────────────────
  const { data: dispatcher, isLoading: dispatcherLoading } = trpc.agentOps.dispatcherStatus.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const { data: awaitingTasks } = trpc.aiAgents.listTasks.useQuery(
    { status: 'awaiting_approval', limit: 50 },
    { refetchInterval: 30_000 },
  );
  const { data: readyDrafts } = trpc.agentDrafts.listReady.useQuery(undefined, { refetchInterval: 30_000 });
  const { data: scheduledDrafts } = trpc.agentDrafts.listScheduled.useQuery(undefined, { refetchInterval: 60_000 });
  const { data: sops } = trpc.agentOps.listSops.useQuery(undefined, { staleTime: 60_000 });

  const setStatus = trpc.agentOps.setDispatcherStatus.useMutation({
    onSuccess: (res) => {
      utils.agentOps.dispatcherStatus.invalidate();
      toast.success(res.status === 'autonomous' ? 'Agents are ON.' : 'Agents paused — nothing will run.');
    },
    onError: (e) => toast.error(e.message),
  });

  const approvalsCount = (awaitingTasks?.length ?? 0) + (readyDrafts?.length ?? 0);
  const isOn = dispatcher?.status === 'autonomous';

  return (
    <div className="min-h-screen" style={{ background: 'var(--hp-cream)' }}>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="px-6 py-7" style={{ background: 'var(--hp-ink)', color: 'white' }}>
        <div className="max-w-5xl mx-auto flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="hp-eyebrow" style={{ color: 'var(--hp-gold-soft)' }}>The Back Office</p>
            <h1 className="hp-serif mt-1 flex items-center gap-2" style={{ fontSize: '1.85rem', color: 'white' }}>
              <Bot className="w-7 h-7" style={{ color: 'var(--hp-gold-soft)' }} /> Agents
            </h1>
            <p className="text-white/60 text-sm mt-1">
              One dispatcher, a folder of SOPs, and an approvals inbox. Everything it does is logged below.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Link
              href="/os/chat"
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-white/20 text-white/80 hover:bg-white/10 transition-colors"
            >
              <MessageSquareText className="w-3.5 h-3.5" /> Ask the OS
            </Link>
            {dispatcherLoading ? (
              <Skeleton className="h-10 w-36 rounded-lg" />
            ) : (
              <button
                onClick={() => setStatus.mutate({ status: isOn ? 'paused' : 'autonomous' })}
                disabled={setStatus.isPending}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm transition-colors ${
                  isOn
                    ? 'bg-red-500/90 hover:bg-red-500 text-white'
                    : 'hp-button-gold'
                }`}
                style={isOn ? undefined : { minHeight: 0 }}
              >
                <Power className="w-4 h-4" />
                {setStatus.isPending ? 'Switching…' : isOn ? 'Pause everything' : 'Turn agents on'}
              </button>
            )}
          </div>
        </div>
        {/* status strip */}
        <div className="max-w-5xl mx-auto mt-4 flex items-center gap-5 flex-wrap text-xs text-white/70">
          <span className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isOn ? 'bg-emerald-400' : 'bg-red-400'}`} />
            {isOn ? 'Running' : 'Paused'}
          </span>
          {dispatcher && !dispatcher.engineEnabled && (
            <span className="flex items-center gap-1 text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5" /> Engine flag off on this server (AGENTS_ENABLED)
            </span>
          )}
          {dispatcher && (
            <span>
              Today: <span className="font-mono">{fmtUsd(dispatcher.cost24hUsd)}</span> of {fmtUsd(dispatcher.costCapDailyUsd)} cap
              · {dispatcher.runs24h} of {dispatcher.runLimitDaily} runs
            </span>
          )}
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <div className="border-b bg-white sticky top-0 z-10" style={{ borderColor: 'var(--hp-hairline)' }}>
        <div className="max-w-5xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3.5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === t.id
                  ? 'border-current'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
              style={tab === t.id ? { color: 'var(--hp-gold-deep)' } : undefined}
            >
              <t.icon className="w-4 h-4" /> {t.label}
              {t.id === 'approvals' && approvalsCount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(200,146,42,0.18)', color: 'var(--hp-gold-deep)' }}>
                  {approvalsCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {tab === 'today' && <TodayTab approvalsCount={approvalsCount} onGoApprovals={() => setTab('approvals')} sops={sops} />}
        {tab === 'approvals' && <ApprovalsTab awaitingTasks={awaitingTasks} readyDrafts={readyDrafts} />}
        {tab === 'scheduled' && <ScheduledTab scheduledDrafts={scheduledDrafts} sops={sops} />}
        {tab === 'runs' && <RunsTab />}
        {tab === 'library' && <LibraryTab sops={sops} />}
      </div>
    </div>
  );
}

// ─── Today ────────────────────────────────────────────────────
function TodayTab({ approvalsCount, onGoApprovals, sops }: { approvalsCount: number; onGoApprovals: () => void; sops: any[] | undefined }) {
  const { data: runs, isLoading } = trpc.aiAgents.runsFeed.useQuery({ limit: 12 }, { refetchInterval: 30_000 });
  const cronSops = (sops ?? []).filter(s => s.cron && s.enabled && s.kind === 'agent');

  return (
    <div className="space-y-4">
      {approvalsCount > 0 && (
        <button onClick={onGoApprovals} className="w-full hp-card-warm rounded-xl px-4 py-3 flex items-center gap-3 text-left hover:shadow-md transition-shadow">
          <Inbox className="w-5 h-5 shrink-0" style={{ color: 'var(--hp-gold-deep)' }} />
          <div className="flex-1">
            <div className="text-sm font-medium">{approvalsCount} item{approvalsCount !== 1 ? 's' : ''} waiting for your yes or no</div>
            <div className="text-xs text-muted-foreground">Nothing customer-facing goes out without you.</div>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      )}

      <div className="bg-white rounded-xl border p-5" style={{ borderColor: 'var(--hp-hairline)' }}>
        <h2 className="hp-serif text-lg mb-3" style={{ color: 'var(--hp-ink)' }}>Latest activity</h2>
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
        ) : !runs || runs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No runs yet. When an SOP fires, every model call lands here with its cost.
          </p>
        ) : (
          <div className="space-y-1">
            {runs.map((r: any) => (
              <div key={r.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/40">
                <Badge className={`text-[10px] px-1.5 shrink-0 ${RUN_STATUS_COLORS[r.status] ?? ''}`}>{r.status}</Badge>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{r.sopPath ?? r.seatName}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.output?.slice(0, 120) || r.errorMessage || '—'}</div>
                </div>
                <span className="text-xs text-muted-foreground font-mono shrink-0">{fmtUsd(Number(r.costUsd))}</span>
                <span className="text-xs text-muted-foreground shrink-0">{fmtWhen(r.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {cronSops.length > 0 && (
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: 'var(--hp-hairline)' }}>
          <h2 className="hp-serif text-lg mb-3" style={{ color: 'var(--hp-ink)' }}>On a schedule</h2>
          <div className="space-y-2">
            {cronSops.map((s: any) => (
              <div key={s.sopPath} className="flex items-center gap-3 text-sm">
                <CalendarClock className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="flex-1">{s.title}</span>
                <span className="text-xs text-muted-foreground font-mono">{s.cron} ({s.timezone.split('/')[1]?.replace('_', ' ')})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Approvals (merged inbox) ─────────────────────────────────
// Exported: the HP-OS /os/approvals surface reuses this inbox as-is.
export function ApprovalsTab({ awaitingTasks, readyDrafts }: { awaitingTasks: any[] | undefined; readyDrafts: any[] | undefined }) {
  const utils = trpc.useUtils();
  const [expanded, setExpanded] = useState<string | null>(null);

  const approveAgentTask = trpc.aiAgents.approveTask.useMutation({
    onSuccess: () => { utils.aiAgents.listTasks.invalidate(); toast.success('Approved — action executed.'); },
    onError: (e) => toast.error(e.message),
  });
  const rejectAgentTask = trpc.aiAgents.rejectTask.useMutation({
    onSuccess: () => { utils.aiAgents.listTasks.invalidate(); toast.success('Rejected — nothing was sent.'); },
    onError: (e) => toast.error(e.message),
  });
  const approveDraft = trpc.agentDrafts.approve.useMutation({
    onSuccess: () => { utils.agentDrafts.listReady.invalidate(); toast.success('Draft approved for send.'); },
    onError: (e) => toast.error(e.message),
  });
  const cancelDraft = trpc.agentDrafts.cancel.useMutation({
    onSuccess: () => { utils.agentDrafts.listReady.invalidate(); toast.success('Draft cancelled.'); },
    onError: (e) => toast.error(e.message),
  });

  // Merge into one chronological list (oldest first — clear the queue top-down).
  const items = useMemo(() => {
    const fromTasks = (awaitingTasks ?? []).map((t: any) => ({
      key: `task-${t.id}`,
      kind: 'agent-action' as const,
      at: t.createdAt,
      title: t.sopPath ?? t.seatName,
      preview: t.latestRunOutput ?? '',
      detail: t.latestRunToolCalls,
      raw: t,
    }));
    const fromDrafts = (readyDrafts ?? []).map((d: any) => ({
      key: `draft-${d.id}`,
      kind: 'nurturer-draft' as const,
      at: d.generatedAt,
      title: `${d.channel === 'sms' ? 'SMS' : 'Email'} to ${d.customerName ?? d.customerId}${d.subject ? ` — ${d.subject}` : ''}`,
      preview: d.body ?? '',
      detail: null,
      raw: d,
    }));
    return [...fromTasks, ...fromDrafts].sort(
      (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
    );
  }, [awaitingTasks, readyDrafts]);

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-emerald-500 opacity-60" />
        <p className="hp-serif text-lg" style={{ color: 'var(--hp-ink)' }}>Inbox zero.</p>
        <p className="text-sm text-muted-foreground mt-1">Approvals land here before anything reaches a customer.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map(item => {
        const isOpen = expanded === item.key;
        return (
          <div key={item.key} className="bg-white rounded-xl border" style={{ borderColor: 'var(--hp-hairline)' }}>
            <div className="px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(200,146,42,0.12)' }}>
                {item.kind === 'nurturer-draft'
                  ? (item.raw.channel === 'sms' ? <MessageSquare className="w-4 h-4" style={{ color: 'var(--hp-gold-deep)' }} /> : <Mail className="w-4 h-4" style={{ color: 'var(--hp-gold-deep)' }} />)
                  : <Wrench className="w-4 h-4" style={{ color: 'var(--hp-gold-deep)' }} />}
              </div>
              <button className="flex-1 min-w-0 text-left" onClick={() => setExpanded(isOpen ? null : item.key)}>
                <div className="text-sm font-medium truncate">{item.title}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {item.kind === 'agent-action' ? 'Agent action awaiting approval' : 'Follow-up draft ready to send'} · {fmtWhen(item.at)}
                </div>
              </button>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  className="hp-button-gold text-xs"
                  style={{ padding: '6px 12px', minHeight: 0 }}
                  onClick={() =>
                    item.kind === 'agent-action'
                      ? approveAgentTask.mutate({ taskId: item.raw.id })
                      : approveDraft.mutate({ id: item.raw.id })
                  }
                >
                  Approve
                </button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-8"
                  onClick={() =>
                    item.kind === 'agent-action'
                      ? rejectAgentTask.mutate({ taskId: item.raw.id })
                      : cancelDraft.mutate({ id: item.raw.id })
                  }
                >
                  <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                </Button>
                <button className="p-1.5 text-muted-foreground" onClick={() => setExpanded(isOpen ? null : item.key)}>
                  <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>
            {isOpen && (
              <div className="border-t px-4 py-3 space-y-2" style={{ borderColor: 'var(--hp-hairline)' }}>
                {item.preview && (
                  <pre className="text-xs whitespace-pre-wrap font-sans bg-muted/40 rounded-lg p-3 max-h-64 overflow-y-auto">{item.preview}</pre>
                )}
                {item.detail && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Proposed tool calls</summary>
                    <pre className="whitespace-pre-wrap mt-1 max-h-48 overflow-y-auto">{typeof item.detail === 'string' ? item.detail : JSON.stringify(item.detail, null, 2)}</pre>
                  </details>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Scheduled ────────────────────────────────────────────────
function ScheduledTab({ scheduledDrafts, sops }: { scheduledDrafts: any[] | undefined; sops: any[] | undefined }) {
  const utils = trpc.useUtils();
  const cancelDraft = trpc.agentDrafts.cancel.useMutation({
    onSuccess: () => { utils.agentDrafts.listScheduled.invalidate(); toast.success('Cancelled.'); },
    onError: (e) => toast.error(e.message),
  });
  const cronSops = (sops ?? []).filter(s => s.cron && s.enabled && s.kind === 'agent');

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border p-5" style={{ borderColor: 'var(--hp-hairline)' }}>
        <h2 className="hp-serif text-lg mb-1" style={{ color: 'var(--hp-ink)' }}>Queued follow-ups</h2>
        <p className="text-xs text-muted-foreground mb-3">Drafts the Lead Nurturer will surface for approval when their time comes.</p>
        {!scheduledDrafts || scheduledDrafts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Nothing queued.</p>
        ) : (
          <div className="space-y-1.5">
            {scheduledDrafts.map((d: any) => (
              <div key={d.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/40">
                {d.channel === 'sms' ? <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0" /> : <Mail className="w-4 h-4 text-muted-foreground shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{d.customerName ?? d.customerId}{d.subject ? ` — ${d.subject}` : ''}</div>
                  <div className="text-xs text-muted-foreground">due {fmtWhen(d.scheduledFor)}</div>
                </div>
                <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground" onClick={() => cancelDraft.mutate({ id: d.id })}>
                  Cancel
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border p-5" style={{ borderColor: 'var(--hp-hairline)' }}>
        <h2 className="hp-serif text-lg mb-3" style={{ color: 'var(--hp-ink)' }}>Standing schedules</h2>
        {cronSops.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No SOPs run on a clock yet.</p>
        ) : (
          <div className="space-y-2">
            {cronSops.map((s: any) => (
              <div key={s.sopPath} className="flex items-center gap-3 text-sm">
                <CalendarClock className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="flex-1">{s.title}</span>
                <span className="text-xs text-muted-foreground font-mono">{s.cron}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Runs ─────────────────────────────────────────────────────
function RunsTab() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [expanded, setExpanded] = useState<number | null>(null);
  const { data: runs, isLoading } = trpc.aiAgents.runsFeed.useQuery(
    { limit: 100, status: statusFilter as any },
    { refetchInterval: 30_000 },
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        {[undefined, 'success', 'failed', 'tool_error', 'cost_exceeded'].map(s => (
          <button
            key={s ?? 'all'}
            onClick={() => setStatusFilter(s)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              statusFilter === s ? 'bg-foreground text-background border-foreground' : 'hover:bg-muted/40'
            }`}
            style={{ borderColor: statusFilter === s ? undefined : 'var(--hp-hairline)' }}
          >
            {s ?? 'All'}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
      ) : !runs || runs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">No runs match.</p>
      ) : (
        <div className="space-y-1.5">
          {runs.map((r: any) => (
            <div key={r.id} className="bg-white rounded-lg border" style={{ borderColor: 'var(--hp-hairline)' }}>
              <button className="w-full px-3 py-2.5 flex items-center gap-3 text-left" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                <Badge className={`text-[10px] px-1.5 shrink-0 ${RUN_STATUS_COLORS[r.status] ?? ''}`}>{r.status}</Badge>
                <span className="text-sm flex-1 min-w-0 truncate">{r.sopPath ?? r.seatName}</span>
                <span className="text-xs text-muted-foreground font-mono shrink-0">{fmtUsd(Number(r.costUsd))} · {r.durationMs}ms</span>
                <span className="text-xs text-muted-foreground shrink-0">{fmtWhen(r.createdAt)}</span>
                <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${expanded === r.id ? 'rotate-180' : ''}`} />
              </button>
              {expanded === r.id && (
                <div className="border-t px-3 py-3 space-y-2 text-xs" style={{ borderColor: 'var(--hp-hairline)' }}>
                  {r.errorMessage && <p className="text-red-600">{r.errorMessage}</p>}
                  {r.output && <pre className="whitespace-pre-wrap font-sans bg-muted/40 rounded-lg p-3 max-h-64 overflow-y-auto">{r.output}</pre>}
                  {r.toolCalls && r.toolCalls !== '[]' && (
                    <details className="text-muted-foreground">
                      <summary className="cursor-pointer">Tool calls</summary>
                      <pre className="whitespace-pre-wrap mt-1 max-h-48 overflow-y-auto">{r.toolCalls}</pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Library ──────────────────────────────────────────────────
function LibraryTab({ sops }: { sops: any[] | undefined }) {
  const [openSop, setOpenSop] = useState<string | null>(null);

  if (!sops) {
    return <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>;
  }

  // Group by top-level folder (the business function).
  const groups = new Map<string, any[]>();
  for (const s of sops) {
    const folder = s.sopPath.split('/')[0];
    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder)!.push(s);
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        SOPs are markdown files in the repo under <code>server/agents/sops/</code> — edit them there and deploy; this view is read-only.
      </p>
      {Array.from(groups.entries()).map(([folder, items]) => (
        <div key={folder}>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 px-1">{folder.replace('-', ' ')}</p>
          <div className="space-y-2">
            {items.map((s: any) => {
              const isOpen = openSop === s.sopPath;
              return (
                <div key={s.sopPath} className={`rounded-xl border bg-white ${!s.enabled ? 'opacity-60' : ''}`} style={{ borderColor: 'var(--hp-hairline)' }}>
                  <button className="w-full px-4 py-3 flex items-center gap-3 text-left" onClick={() => setOpenSop(isOpen ? null : s.sopPath)}>
                    <BookOpen className="w-4 h-4 shrink-0" style={{ color: 'var(--hp-gold-deep)' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                        {s.title}
                        {s.kind === 'external-worker' && <Badge variant="secondary" className="text-[10px]">runs elsewhere</Badge>}
                        {!s.enabled && <Badge variant="secondary" className="text-[10px]">off</Badge>}
                        {s.unknownTools.length > 0 && (
                          <Badge variant="destructive" className="text-[10px]">unknown tools: {s.unknownTools.join(', ')}</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {s.events.length > 0 && <>on {s.events.join(', ')} · </>}
                        {s.cron && <>cron {s.cron} · </>}
                        approval: {s.approval}
                        {s.runs7d > 0 && <> · {s.runs7d} runs / {fmtUsd(s.cost7dUsd)} this week</>}
                      </div>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="border-t px-4 py-3 space-y-3" style={{ borderColor: 'var(--hp-hairline)' }}>
                      <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
                        <span className="font-mono">{s.sopPath}.md</span>
                        {s.model && <span>model: {s.model}</span>}
                        <span>max {s.maxTurns} turns</span>
                        <span>limit {s.runLimitDaily}/day</span>
                        {s.tools.length > 0 && <span>tools: {s.tools.join(', ')}</span>}
                      </div>
                      {s.sopPath === 'leads/roadmap-followup' && (
                        <Link href="/admin/agents/playbooks" className="inline-flex items-center gap-1 text-xs font-medium hover:underline" style={{ color: 'var(--hp-gold-deep)' }}>
                          Edit the cadence in the playbook editor <ExternalLink className="w-3 h-3" />
                        </Link>
                      )}
                      <pre className="whitespace-pre-wrap font-sans text-xs bg-muted/40 rounded-lg p-3 max-h-96 overflow-y-auto">{s.body}</pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
