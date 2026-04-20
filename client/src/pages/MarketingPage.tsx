/**
 * MarketingPage — Customer retention & lifecycle command center.
 *
 * Sections:
 *  1. Lifecycle segments — counts by stage with drill-down list
 *  2. Automation log — last 50 triggers fired
 *  3. Broadcast — one-off SMS/email to a segment
 */

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import {
  Megaphone, Users, Zap, Send, RefreshCw, ChevronDown, ChevronUp,
  MessageSquare, Mail, Check, AlertCircle, Clock, Loader2,
} from 'lucide-react';
import type { LifeCycleStage } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type AutomationTrigger =
  | 'review_request'
  | 'enrollment_offer'
  | 'estimate_followup_d3'
  | 'estimate_followup_d7'
  | 'winback'
  | 'labor_bank_low';

interface AutomationLog {
  id: number;
  customerId: string;
  trigger: AutomationTrigger;
  referenceId: string | null;
  channel: string;
  status: string;
  error: string | null;
  firedAt: Date | string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STAGE_META: Record<LifeCycleStage, { label: string; desc: string; color: string; dot: string }> = {
  prospect:  { label: 'Prospects',    desc: 'Leads with no completed job',                color: 'bg-slate-50 border-slate-200',   dot: 'bg-slate-400' },
  active:    { label: 'Active',       desc: 'Completed job < 90 days ago, no membership', color: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  member:    { label: '360° Members', desc: 'Active 360° membership',                     color: 'bg-amber-50 border-amber-200',    dot: 'bg-amber-500' },
  at_risk:   { label: 'At Risk',      desc: 'Last job 90–180 days ago, no membership',    color: 'bg-orange-50 border-orange-200',  dot: 'bg-orange-500' },
  churned:   { label: 'Churned',      desc: 'Last job > 180 days ago, no membership',     color: 'bg-red-50 border-red-200',        dot: 'bg-red-400' },
};

const TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  review_request:       'Review Request',
  enrollment_offer:     '360° Enrollment Offer',
  estimate_followup_d3: 'Estimate Follow-Up (Day 3)',
  estimate_followup_d7: 'Estimate Follow-Up (Day 7)',
  winback:              'Win-Back',
  labor_bank_low:       'Labor Bank Low',
};

function fmtDate(ts: Date | string | null | undefined) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Segment Card ─────────────────────────────────────────────────────────────

function SegmentCard({
  stage,
  customers,
}: {
  stage: LifeCycleStage;
  customers: { id: string; displayName: string; firstName: string; lastName: string; email: string; mobilePhone: string; sendMarketingOptIn: boolean }[];
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = STAGE_META[stage];

  return (
    <div className={`rounded-xl border ${meta.color} overflow-hidden`}>
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:opacity-80 transition-opacity"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${meta.dot}`} />
          <div className="text-left">
            <p className="text-sm font-bold text-gray-800">{meta.label}</p>
            <p className="text-xs text-gray-500">{meta.desc}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-gray-800">{customers.length}</span>
          {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </button>

      {expanded && customers.length > 0 && (
        <div className="border-t border-inherit divide-y divide-inherit">
          {customers.slice(0, 20).map(c => {
            const name = c.displayName || `${c.firstName} ${c.lastName}`.trim() || c.email || c.id;
            return (
              <div key={c.id} className="flex items-center justify-between px-5 py-2.5">
                <div>
                  <p className="text-sm font-medium text-gray-800">{name}</p>
                  <p className="text-xs text-gray-400">{c.email || c.mobilePhone || '—'}</p>
                </div>
                {c.sendMarketingOptIn && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Opted in</span>
                )}
              </div>
            );
          })}
          {customers.length > 20 && (
            <p className="px-5 py-2.5 text-xs text-gray-400">+ {customers.length - 20} more</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function MarketingPage() {
  // Segments
  const { data: segments, isLoading: loadingSegments, refetch: refetchSegments } = trpc.automations.segments.useQuery();

  // Automation logs
  const { data: logs, isLoading: loadingLogs, refetch: refetchLogs } = trpc.automations.logs.useQuery();

  // Manual engine trigger
  const runNow = trpc.automations.runNow.useMutation({
    onSuccess: () => {
      toast.success('Automation engine queued');
      setTimeout(() => { refetchSegments(); refetchLogs(); }, 3000);
    },
    onError: () => toast.error('Failed to trigger engine'),
  });

  // Broadcast
  const [broadcastStage, setBroadcastStage] = useState<LifeCycleStage>('at_risk');
  const [broadcastChannel, setBroadcastChannel] = useState<'sms' | 'email'>('sms');
  const [broadcastSubject, setBroadcastSubject] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const broadcast = trpc.automations.broadcast.useMutation({
    onSuccess: (r) => {
      toast.success(`Sent to ${r.sent} customer${r.sent !== 1 ? 's' : ''}${r.failed > 0 ? ` (${r.failed} failed)` : ''}`);
      setBroadcastMessage('');
      setBroadcastSubject('');
    },
    onError: () => toast.error('Broadcast failed'),
  });

  const handleBroadcast = () => {
    if (!broadcastMessage.trim()) { toast.error('Message is required'); return; }
    const count = segments?.[broadcastStage]?.length ?? 0;
    if (!confirm(`Send to ${count} ${STAGE_META[broadcastStage].label} customers via ${broadcastChannel.toUpperCase()}?`)) return;
    broadcast.mutate({ stage: broadcastStage, channel: broadcastChannel, subject: broadcastSubject || undefined, message: broadcastMessage });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Marketing & Retention</h1>
              <p className="text-xs text-muted-foreground">Lifecycle segments, automations, and broadcasts</p>
            </div>
          </div>
          <button
            onClick={() => runNow.mutate()}
            disabled={runNow.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {runNow.isPending ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            Run Automations
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">

        {/* ── 1. Lifecycle Segments ─────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-muted-foreground" />
              <h2 className="text-sm font-bold text-foreground">Lifecycle Segments</h2>
            </div>
            <button onClick={() => refetchSegments()} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <RefreshCw size={12} /> Refresh
            </button>
          </div>

          {loadingSegments ? (
            <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="grid gap-3">
              {(Object.keys(STAGE_META) as LifeCycleStage[]).map(stage => (
                <SegmentCard
                  key={stage}
                  stage={stage}
                  customers={segments?.[stage] ?? []}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── 2. Automation Log ─────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-muted-foreground" />
              <h2 className="text-sm font-bold text-foreground">Automation Log</h2>
            </div>
            <button onClick={() => refetchLogs()} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <RefreshCw size={12} /> Refresh
            </button>
          </div>

          {loadingLogs ? (
            <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
          ) : !logs?.length ? (
            <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              No automations fired yet. Run the engine or wait for the hourly tick.
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
              {(logs as AutomationLog[]).slice(0, 50).map(log => (
                <div key={log.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="shrink-0">
                    {log.status === 'sent' ? (
                      <div className="w-7 h-7 rounded-full bg-emerald-50 flex items-center justify-center">
                        <Check size={13} className="text-emerald-600" />
                      </div>
                    ) : log.status === 'failed' ? (
                      <div className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center">
                        <AlertCircle size={13} className="text-red-500" />
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
                        <Clock size={13} className="text-slate-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {TRIGGER_LABELS[log.trigger as AutomationTrigger] ?? log.trigger}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      Customer {log.customerId.slice(0, 8)}… · via {log.channel.toUpperCase()}
                      {log.error && <span className="text-red-400 ml-1">— {log.error}</span>}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {log.channel === 'sms' ? <MessageSquare size={13} className="text-muted-foreground" /> : <Mail size={13} className="text-muted-foreground" />}
                    <span className="text-xs text-muted-foreground">{fmtDate(log.firedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── 3. Broadcast ─────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Send size={16} className="text-muted-foreground" />
            <h2 className="text-sm font-bold text-foreground">Broadcast Message</h2>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Segment</label>
                <select
                  value={broadcastStage}
                  onChange={e => setBroadcastStage(e.target.value as LifeCycleStage)}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  {(Object.keys(STAGE_META) as LifeCycleStage[]).map(s => (
                    <option key={s} value={s}>
                      {STAGE_META[s].label} ({segments?.[s]?.length ?? 0})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Channel</label>
                <select
                  value={broadcastChannel}
                  onChange={e => setBroadcastChannel(e.target.value as 'sms' | 'email')}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                </select>
              </div>
            </div>

            {broadcastChannel === 'email' && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Subject</label>
                <input
                  type="text"
                  value={broadcastSubject}
                  onChange={e => setBroadcastSubject(e.target.value)}
                  placeholder="Email subject line…"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Message</label>
              <textarea
                value={broadcastMessage}
                onChange={e => setBroadcastMessage(e.target.value)}
                rows={4}
                placeholder="Type your message…"
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
              />
              <p className="text-xs text-muted-foreground mt-1">{broadcastMessage.length} characters</p>
            </div>

            {broadcastChannel === 'email' && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Email broadcasts only send to customers who have opted in to marketing emails.
              </p>
            )}

            <button
              onClick={handleBroadcast}
              disabled={broadcast.isPending || !broadcastMessage.trim()}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {broadcast.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Send to {segments?.[broadcastStage]?.length ?? 0} {STAGE_META[broadcastStage].label}
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}
