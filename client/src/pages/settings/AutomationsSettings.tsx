// ============================================================
// AutomationsSettings — Full automation rules management UI
// Backed by trpc.automationRules (DB-persisted)
// ============================================================

import { useState, useCallback } from 'react';
import { Zap, Plus, Trash2, Edit2, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Loader2, Clock, AlertCircle, CheckCircle2, XCircle, SkipForward, X, Eye, EyeOff, MessageSquare, Mail, Bell, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

// ─── Trigger catalog ──────────────────────────────────────────────────────────
const TRIGGERS = [
  { value: 'lead_created',       label: 'New lead created',              group: 'Leads' },
  { value: 'estimate_sent',      label: 'Estimate sent to customer',     group: 'Estimates' },
  { value: 'estimate_viewed',    label: 'Estimate viewed by customer',   group: 'Estimates' },
  { value: 'estimate_approved',  label: 'Estimate approved / signed',    group: 'Estimates' },
  { value: 'job_created',        label: 'Job created',                   group: 'Jobs' },
  { value: 'job_completed',      label: 'Job completed',                 group: 'Jobs' },
  { value: 'invoice_sent',       label: 'Invoice sent to customer',      group: 'Invoices' },
  { value: 'invoice_overdue',    label: 'Invoice overdue',               group: 'Invoices' },
  { value: 'missed_call',        label: 'Missed inbound call',           group: 'Communications' },
  { value: 'inbound_sms',        label: 'Inbound SMS received',          group: 'Communications' },
  { value: 'new_booking',        label: 'New booking form submission',   group: 'Booking' },
];

// ─── Action catalog ───────────────────────────────────────────────────────────
const ACTIONS = [
  { value: 'send_sms',      label: 'Send SMS to customer',   icon: '💬' },
  { value: 'send_email',    label: 'Send email to customer', icon: '✉️' },
  { value: 'notify_owner',  label: 'Notify the team',        icon: '🔔' },
  { value: 'create_note',   label: 'Create internal note',   icon: '📝' },
];

// ─── Template variable hints ──────────────────────────────────────────────────
const TEMPLATE_VARS = [
  '{{customerName}}', '{{customerFirstName}}', '{{phone}}', '{{email}}',
  '{{referenceNumber}}', '{{amount}}', '{{description}}',
];

// ─── Types ────────────────────────────────────────────────────────────────────
type ActionType = 'send_sms' | 'send_email' | 'notify_owner' | 'create_note';

interface RuleForm {
  name: string;
  trigger: string;
  actionType: ActionType;
  delayMinutes: number;
  enabled: boolean;
  // action payload fields
  messageTemplate: string;
  subject: string;
  bodyTemplate: string;
  title: string;
  contentTemplate: string;
  noteTemplate: string;
}

const EMPTY_FORM: RuleForm = {
  name: '',
  trigger: 'lead_created',
  actionType: 'notify_owner',
  delayMinutes: 0,
  enabled: true,
  messageTemplate: '',
  subject: '',
  bodyTemplate: '',
  title: '',
  contentTemplate: '',
  noteTemplate: '',
};

function buildActionPayload(form: RuleForm): Record<string, string> {
  switch (form.actionType) {
    case 'send_sms':     return { messageTemplate: form.messageTemplate };
    case 'send_email':   return { subject: form.subject, bodyTemplate: form.bodyTemplate };
    case 'notify_owner': return { title: form.title, contentTemplate: form.contentTemplate };
    case 'create_note':  return { noteTemplate: form.noteTemplate };
  }
}

function payloadToFormFields(actionType: ActionType, payload: Record<string, string>): Partial<RuleForm> {
  switch (actionType) {
    case 'send_sms':     return { messageTemplate: payload.messageTemplate ?? '' };
    case 'send_email':   return { subject: payload.subject ?? '', bodyTemplate: payload.bodyTemplate ?? '' };
    case 'notify_owner': return { title: payload.title ?? '', contentTemplate: payload.contentTemplate ?? '' };
    case 'create_note':  return { noteTemplate: payload.noteTemplate ?? '' };
    default:             return {};
  }
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  if (status === 'success') return <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 size={12} /> Success</span>;
  if (status === 'failed')  return <span className="flex items-center gap-1 text-xs text-red-500"><XCircle size={12} /> Failed</span>;
  return <span className="flex items-center gap-1 text-xs text-muted-foreground"><SkipForward size={12} /> Skipped</span>;
}

// ─── Rule log drawer ──────────────────────────────────────────────────────────
function RuleLogs({ ruleId, onClose }: { ruleId: number; onClose: () => void }) {
  const { data: logs, isLoading } = trpc.automationRules.getLogs.useQuery({ ruleId, limit: 20 });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[70vh] overflow-y-auto p-5 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-foreground">Execution Log</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 size={14} className="animate-spin" /> Loading…</div>
        ) : !logs?.length ? (
          <p className="text-sm text-muted-foreground">No executions yet. This rule will log here once it fires.</p>
        ) : (
          <div className="space-y-2">
            {logs.map(log => (
              <div key={log.id} className="border border-border rounded-lg p-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <StatusBadge status={log.status} />
                  <span className="text-muted-foreground">{new Date(log.executedAt).toLocaleString()}</span>
                </div>
                {log.errorMessage && <p className="text-red-500 font-mono">{log.errorMessage}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Rule form modal ──────────────────────────────────────────────────────────
function RuleModal({
  initial,
  onSave,
  onClose,
  isSaving,
}: {
  initial?: RuleForm & { id?: number };
  onSave: (form: RuleForm) => void;
  onClose: () => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<RuleForm>(initial ?? EMPTY_FORM);
  const set = (patch: Partial<RuleForm>) => setForm(f => ({ ...f, ...patch }));

  const insertVar = (field: keyof RuleForm, v: string) => {
    set({ [field]: ((form[field] as string) ?? '') + v });
  };

  const VarChips = ({ field }: { field: keyof RuleForm }) => (
    <div className="flex flex-wrap gap-1 mt-1">
      {TEMPLATE_VARS.map(v => (
        <button
          key={v}
          type="button"
          onClick={() => insertVar(field, v)}
          className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary font-mono"
        >
          {v}
        </button>
      ))}
    </div>
  );

  const triggerLabel = TRIGGERS.find(t => t.value === form.trigger)?.label ?? form.trigger;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="font-bold text-foreground">{initial?.id ? 'Edit Rule' : 'New Automation Rule'}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Name */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rule Name</Label>
            <Input
              value={form.name}
              onChange={e => set({ name: e.target.value })}
              placeholder="e.g. Follow-up SMS after missed call"
              className="mt-1"
            />
          </div>

          {/* Trigger */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">When this happens (Trigger)</Label>
            <select
              value={form.trigger}
              onChange={e => set({ trigger: e.target.value })}
              className="field-input mt-1"
            >
              {TRIGGERS.map(t => (
                <option key={t.value} value={t.value}>{t.group} — {t.label}</option>
              ))}
            </select>
          </div>

          {/* Delay */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Delay before action</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="number"
                min={0}
                value={form.delayMinutes}
                onChange={e => set({ delayMinutes: Math.max(0, Number(e.target.value)) })}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">minutes (0 = immediate)</span>
            </div>
          </div>

          {/* Action type */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Do this (Action)</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {ACTIONS.map(a => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => set({ actionType: a.value as ActionType })}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    form.actionType === a.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-foreground hover:border-primary/50'
                  }`}
                >
                  <span>{a.icon}</span> {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Action payload fields */}
          {form.actionType === 'send_sms' && (
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">SMS Message</Label>
              <Textarea
                value={form.messageTemplate}
                onChange={e => set({ messageTemplate: e.target.value })}
                placeholder="Hi {{customerFirstName}}, we missed your call! We'll be in touch shortly."
                rows={3}
                className="mt-1 resize-none font-mono text-xs"
              />
              <VarChips field="messageTemplate" />
            </div>
          )}

          {form.actionType === 'send_email' && (
            <>
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email Subject</Label>
                <Input
                  value={form.subject}
                  onChange={e => set({ subject: e.target.value })}
                  placeholder="Your estimate {{referenceNumber}} is ready"
                  className="mt-1"
                />
                <VarChips field="subject" />
              </div>
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email Body</Label>
                <Textarea
                  value={form.bodyTemplate}
                  onChange={e => set({ bodyTemplate: e.target.value })}
                  placeholder="Hi {{customerFirstName}},&#10;&#10;Your estimate {{referenceNumber}} for {{amount}} is ready to review."
                  rows={5}
                  className="mt-1 resize-none font-mono text-xs"
                />
                <VarChips field="bodyTemplate" />
              </div>
            </>
          )}

          {form.actionType === 'notify_owner' && (
            <>
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notification Title</Label>
                <Input
                  value={form.title}
                  onChange={e => set({ title: e.target.value })}
                  placeholder="New lead: {{customerName}}"
                  className="mt-1"
                />
                <VarChips field="title" />
              </div>
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notification Body</Label>
                <Textarea
                  value={form.contentTemplate}
                  onChange={e => set({ contentTemplate: e.target.value })}
                  placeholder="{{customerName}} ({{phone}}) submitted a new lead."
                  rows={3}
                  className="mt-1 resize-none font-mono text-xs"
                />
                <VarChips field="contentTemplate" />
              </div>
            </>
          )}

          {form.actionType === 'create_note' && (
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Note Text</Label>
              <Textarea
                value={form.noteTemplate}
                onChange={e => set({ noteTemplate: e.target.value })}
                placeholder="Auto-note: {{customerName}} — {{description}}"
                rows={3}
                className="mt-1 resize-none font-mono text-xs"
              />
              <VarChips field="noteTemplate" />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button
            onClick={() => onSave(form)}
            disabled={isSaving || !form.name.trim()}
          >
            {isSaving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
            {initial?.id ? 'Save Changes' : 'Create Rule'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Sample payload for preview ─────────────────────────────────────────────
const SAMPLE_PAYLOAD: Record<string, string> = {
  customerName: 'Jane Smith',
  customerFirstName: 'Jane',
  phone: '(360) 555-0192',
  email: 'jane@example.com',
  referenceNumber: 'EST-2026-042',
  amount: '$3,200.00',
  description: 'Bathroom remodel — tile, vanity, fixtures',
  googleReviewLink: 'https://g.page/r/YOUR_REVIEW_LINK',
};

function interpolatePreview(template: string): string {
  if (!template) return '';
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => SAMPLE_PAYLOAD[key] ?? `{{${key}}}`);
}

function getPreviewContent(rule: any): { channel: string; icon: React.ReactNode; lines: { label: string; value: string }[] } | null {
  const ap = rule.actionPayload ?? {};
  switch (rule.actionType) {
    case 'send_sms':
      return {
        channel: 'SMS Preview',
        icon: <MessageSquare size={12} />,
        lines: [{ label: 'Message', value: interpolatePreview(ap.messageTemplate ?? '') }],
      };
    case 'send_email':
      return {
        channel: 'Email Preview',
        icon: <Mail size={12} />,
        lines: [
          { label: 'Subject', value: interpolatePreview(ap.subject ?? '') },
          { label: 'Body', value: interpolatePreview(ap.bodyTemplate ?? '') },
        ],
      };
    case 'notify_owner':
      return {
        channel: 'Team Notification Preview',
        icon: <Bell size={12} />,
        lines: [
          { label: 'Title', value: interpolatePreview(ap.title ?? '') },
          { label: 'Content', value: interpolatePreview(ap.contentTemplate ?? '') },
        ],
      };
    case 'create_note':
      return {
        channel: 'Internal Note Preview',
        icon: <FileText size={12} />,
        lines: [{ label: 'Note', value: interpolatePreview(ap.noteTemplate ?? '') }],
      };
    default:
      return null;
  }
}

// ─── Stage config ────────────────────────────────────────────────────────────
const STAGES = [
  { key: 'lead',     label: 'Lead',     emoji: '🎯', description: 'New bookings, inbound calls, and lead creation' },
  { key: 'estimate', label: 'Estimate', emoji: '📋', description: 'Estimate sent, viewed, and approved events' },
  { key: 'job',      label: 'Job',      emoji: '🔨', description: 'Job kickoff, completion, and review requests' },
  { key: 'invoice',  label: 'Invoice',  emoji: '💰', description: 'Invoice sent and overdue payment reminders' },
  { key: 'review',   label: 'Reviews',  emoji: '⭐', description: 'Google review follow-up automations' },
];

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AutomationsSettings() {
  const [showModal, setShowModal] = useState(false);
  const [editRule, setEditRule] = useState<(RuleForm & { id: number }) | null>(null);
  const [logsForRule, setLogsForRule] = useState<number | null>(null);
  const [previewOpenIds, setPreviewOpenIds] = useState<Set<number>>(new Set());

  const togglePreview = useCallback((id: number) => {
    setPreviewOpenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const { data: rules, isLoading } = trpc.automationRules.list.useQuery();
  const utils = trpc.useUtils();

  const createMutation = trpc.automationRules.create.useMutation({
    onSuccess: () => { toast.success('Rule created'); setShowModal(false); utils.automationRules.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.automationRules.update.useMutation({
    onSuccess: () => { toast.success('Rule updated'); setEditRule(null); utils.automationRules.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const toggleMutation = trpc.automationRules.toggle.useMutation({
    onSuccess: () => utils.automationRules.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.automationRules.delete.useMutation({
    onSuccess: () => { toast.success('Rule deleted'); utils.automationRules.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = (form: RuleForm) => {
    const payload = buildActionPayload(form);
    if (editRule) {
      updateMutation.mutate({
        id: editRule.id,
        name: form.name,
        trigger: form.trigger,
        actionType: form.actionType,
        actionPayload: payload as any,
        delayMinutes: form.delayMinutes,
        enabled: form.enabled,
      });
    } else {
      createMutation.mutate({
        name: form.name,
        trigger: form.trigger,
        actionType: form.actionType,
        actionPayload: payload as any,
        delayMinutes: form.delayMinutes,
        enabled: form.enabled,
      });
    }
  };

  const openEdit = (rule: any) => {
    const ap = rule.actionPayload ?? {};
    const formFields = payloadToFormFields(rule.actionType, ap);
    setEditRule({
      id: rule.id,
      name: rule.name,
      trigger: rule.trigger,
      actionType: rule.actionType,
      delayMinutes: rule.delayMinutes,
      enabled: rule.enabled,
      messageTemplate: '',
      subject: '',
      bodyTemplate: '',
      title: '',
      contentTemplate: '',
      noteTemplate: '',
      ...formFields,
    });
  };

  const triggerLabel = (key: string) => TRIGGERS.find(t => t.value === key)?.label ?? key;
  const actionLabel  = (key: string) => ACTIONS.find(a => a.value === key)?.label ?? key;
  const actionIcon   = (key: string) => ACTIONS.find(a => a.value === key)?.icon ?? '⚡';

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Automations</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Create if-this-then-that rules that fire automatically based on customer and job events. Rules are evaluated in order and can run immediately or after a delay.
          </p>
        </div>
        <Button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 shrink-0">
          <Plus size={14} /> New Rule
        </Button>
      </div>

      {/* ── Rule list grouped by stage ── */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 size={14} className="animate-spin" /> Loading rules…
        </div>
      ) : (
        <div className="space-y-6">
          {STAGES.map(stage => {
            const stageRules = (rules ?? []).filter((r: any) => (r.stage ?? 'lead') === stage.key);
            const enabledCount = stageRules.filter((r: any) => r.enabled).length;
            return (
              <div key={stage.key}>
                {/* Stage header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{stage.emoji}</span>
                    <div>
                      <h3 className="font-bold text-foreground text-sm">{stage.label} Stage</h3>
                      <p className="text-[11px] text-muted-foreground">{stage.description}</p>
                    </div>
                  </div>
                  {stageRules.length > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">
                      {enabledCount}/{stageRules.length} active
                    </span>
                  )}
                </div>

                {stageRules.length === 0 ? (
                  <div className="border border-dashed border-border rounded-xl p-4 text-center">
                    <p className="text-xs text-muted-foreground">No rules in this stage yet.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {stageRules.map((rule: any) => (
            <div
              key={rule.id}
              className={`card-section transition-opacity ${rule.enabled ? '' : 'opacity-60'}`}
            >
              <div className="card-section-body">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground text-sm">{rule.name}</span>
                      {rule.enabled ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400 font-semibold uppercase tracking-wider">Active</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold uppercase tracking-wider">Off</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        ⚡ {triggerLabel(rule.trigger)}
                      </span>
                      <span className="text-xs text-muted-foreground">→</span>
                      {rule.delayMinutes > 0 && (
                        <>
                          <span className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Clock size={10} /> {rule.delayMinutes >= 60 ? `${Math.round(rule.delayMinutes / 60)}h` : `${rule.delayMinutes}m`} delay
                          </span>
                          <span className="text-xs text-muted-foreground">→</span>
                        </>
                      )}
                      <span className="text-xs text-muted-foreground bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        {actionIcon(rule.actionType)} {actionLabel(rule.actionType)}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => togglePreview(rule.id)}
                      title={previewOpenIds.has(rule.id) ? 'Hide preview' : 'Preview message'}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {previewOpenIds.has(rule.id) ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button
                      onClick={() => setLogsForRule(rule.id)}
                      title="View execution log"
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <AlertCircle size={14} />
                    </button>
                    <button
                      onClick={() => openEdit(rule)}
                      title="Edit rule"
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => toggleMutation.mutate({ id: rule.id, enabled: !rule.enabled })}
                      title={rule.enabled ? 'Pause rule' : 'Enable rule'}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {rule.enabled ? <ToggleRight size={16} className="text-primary" /> : <ToggleLeft size={16} />}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete rule "${rule.name}"?`)) {
                          deleteMutation.mutate({ id: rule.id });
                        }
                      }}
                      title="Delete rule"
                      className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Inline preview panel ── */}
              {previewOpenIds.has(rule.id) && (() => {
                const preview = getPreviewContent(rule);
                if (!preview) return null;
                return (
                  <div className="border-t border-border bg-muted/30 rounded-b-xl px-4 py-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {preview.icon}
                      {preview.channel}
                      <span className="ml-auto text-[10px] font-normal normal-case">Sample values — not real customer data</span>
                    </div>
                    {preview.lines.map(line => (
                      <div key={line.label}>
                        <p className="text-[10px] text-muted-foreground font-medium mb-0.5">{line.label}</p>
                        <div className="bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                          {line.value || <span className="italic text-muted-foreground">No template set — edit the rule to add a message.</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Template variable reference ── */}
      <section className="card-section">
        <div className="card-section-header">
          <Zap size={13} />
          <span className="text-xs font-bold uppercase tracking-wider">Template Variable Reference</span>
        </div>
        <div className="card-section-body">
          <p className="text-xs text-muted-foreground mb-3">
            Use these variables in your message templates. They are replaced with live values when the rule fires.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { v: '{{customerName}}',      d: 'Full customer name' },
              { v: '{{customerFirstName}}', d: 'First name only' },
              { v: '{{phone}}',             d: 'Customer phone number' },
              { v: '{{email}}',             d: 'Customer email address' },
              { v: '{{referenceNumber}}',   d: 'Estimate / invoice / job #' },
              { v: '{{amount}}',            d: 'Dollar amount (formatted)' },
              { v: '{{description}}',       d: 'Short job description' },
            ].map(({ v, d }) => (
              <div key={v} className="bg-muted rounded-lg p-2">
                <p className="font-mono text-xs text-primary">{v}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Modals ── */}
      {showModal && (
        <RuleModal
          onSave={handleSave}
          onClose={() => setShowModal(false)}
          isSaving={createMutation.isPending}
        />
      )}

      {editRule && (
        <RuleModal
          initial={editRule}
          onSave={handleSave}
          onClose={() => setEditRule(null)}
          isSaving={updateMutation.isPending}
        />
      )}

      {logsForRule !== null && (
        <RuleLogs ruleId={logsForRule} onClose={() => setLogsForRule(null)} />
      )}
    </div>
  );
}
