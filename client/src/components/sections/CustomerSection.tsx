// CustomerSection — HouseCall Pro-style Customer Profile
// Design: HP Industrial — dark slate, amber accents, DM Sans
//
// Layout:
//   Header: Customer name, Call button, Add Card button, Lifetime Value badge
//   Top nav tabs: Profile | Leads | Estimates | Jobs | Invoices | Communication | Attachments | Notes
//   Profile tab:
//     Left sidebar (1/3): Summary, Contact Info, Payment Method,
//                         Communication Prefs, Tags, Lead Source
//     Right main (2/3): Addresses, Private Notes, Activity Feed
//   Leads/Estimates/Jobs tabs: Pipeline tracker with Convert/Archive lifecycle buttons
// ============================================================

import { useState } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { CustomerPrefill } from '@/components/intakes/types';
import NewJobModal from '@/components/intakes/NewJobModal';
import NewRecurringJobModal from '@/components/intakes/NewRecurringJobModal';
import NewEstimateModal from '@/components/intakes/NewEstimateModal';
import NewEventModal from '@/components/intakes/NewEventModal';
import NewIntakeModal from '@/components/intakes/NewIntakeModal';
import NewLeadModal from '@/components/intakes/NewLeadModal';
import {
  JOB_TYPES, LEAD_STAGES, ESTIMATE_STAGES, JOB_STAGES,
  PipelineArea, OpportunityStage, LeadStage, EstimateStage, JobStage,
  CustomerProfileTab, LeadSource,
} from '@/lib/types';
import {
  User, MapPin, Phone, Mail, Calendar, Briefcase, Hash, Building2,
  Plus, Trash2, ChevronDown, ChevronUp, DollarSign, Tag, ArrowRight,
  CreditCard, Bell, MessageSquare, AtSign, Star, Paperclip, FileText,
  Activity, Send, CheckCircle2, XCircle, Clock, PhoneCall, Wallet,
  ExternalLink, Edit3, Save, X, AlertCircle, TrendingUp, Archive,
  RefreshCw, FolderOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';

// ─── Constants ────────────────────────────────────────────────
const LEAD_SOURCES: LeadSource[] = [
  'Google', 'Referral', 'Facebook', 'Instagram', 'Nextdoor',
  'Yelp', 'Direct Mail', 'Repeat Customer', 'Other',
];

const CUSTOMER_TABS: { key: CustomerProfileTab; label: string; icon: React.ReactNode }[] = [
  { key: 'profile', label: 'Profile', icon: <User size={13} /> },
  { key: 'leads', label: 'Leads', icon: <Star size={13} /> },
  { key: 'estimates', label: 'Estimates', icon: <FileText size={13} /> },
  { key: 'jobs', label: 'Jobs', icon: <Briefcase size={13} /> },
  { key: 'invoices', label: 'Invoices', icon: <Wallet size={13} /> },
  { key: 'communication', label: 'Communication', icon: <MessageSquare size={13} /> },
  { key: 'attachments', label: 'Attachments', icon: <Paperclip size={13} /> },
  { key: 'notes', label: 'Notes', icon: <Edit3 size={13} /> },
];

const STAGE_COLORS: Record<string, string> = {
  'New Lead': 'bg-blue-100 text-blue-800 border-blue-200',
  'Return Call Needed': 'bg-amber-100 text-amber-800 border-amber-200',
  'First Contact': 'bg-sky-100 text-sky-800 border-sky-200',
  'Second Contact': 'bg-cyan-100 text-cyan-800 border-cyan-200',
  'Third Contact': 'bg-teal-100 text-teal-800 border-teal-200',
  'On Hold': 'bg-gray-100 text-gray-600 border-gray-200',
  'Won': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Lost': 'bg-red-100 text-red-700 border-red-200',
  'Unscheduled': 'bg-slate-100 text-slate-700 border-slate-200',
  'Scheduled': 'bg-blue-100 text-blue-800 border-blue-200',
  'In Progress': 'bg-amber-100 text-amber-800 border-amber-200',
  'Completed': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Draft': 'bg-gray-100 text-gray-600 border-gray-200',
  'Ready to Send': 'bg-violet-100 text-violet-800 border-violet-200',
  'Created on Job': 'bg-indigo-100 text-indigo-800 border-indigo-200',
  'Sent': 'bg-sky-100 text-sky-800 border-sky-200',
  'Verbal Acceptance': 'bg-lime-100 text-lime-800 border-lime-200',
  'Approved': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Rejected': 'bg-red-100 text-red-700 border-red-200',
  'New Job': 'bg-blue-100 text-blue-800 border-blue-200',
  'Deposit Needed': 'bg-amber-100 text-amber-800 border-amber-200',
  'Deposit Collected': 'bg-lime-100 text-lime-800 border-lime-200',
  'Need to Order Materials': 'bg-orange-100 text-orange-800 border-orange-200',
  'Waiting on Materials': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'Materials Received': 'bg-teal-100 text-teal-800 border-teal-200',
  'Invoice Sent': 'bg-violet-100 text-violet-800 border-violet-200',
  'Invoice Paid': 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

function stageColor(stage: string) {
  return STAGE_COLORS[stage] ?? 'bg-gray-100 text-gray-600 border-gray-200';
}

function fmtDollar(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDate(iso);
}

// ─── Toggle Switch ────────────────────────────────────────────
function Toggle({ checked, onChange, label, sublabel }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  sublabel?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {sublabel && <div className="text-xs text-muted-foreground mt-0.5">{sublabel}</div>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
          checked ? 'bg-primary' : 'bg-muted-foreground/30'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

// ─── Activity Event Icon ──────────────────────────────────────
function ActivityIcon({ type }: { type: string }) {
  const map: Record<string, React.ReactNode> = {
    estimate_created: <FileText size={13} className="text-blue-600" />,
    estimate_sent: <Send size={13} className="text-sky-600" />,
    estimate_approved: <CheckCircle2 size={13} className="text-emerald-600" />,
    job_created: <Briefcase size={13} className="text-violet-600" />,
    note_added: <Edit3 size={13} className="text-amber-600" />,
    call_logged: <PhoneCall size={13} className="text-teal-600" />,
    payment_received: <DollarSign size={13} className="text-emerald-600" />,
    stage_changed: <ArrowRight size={13} className="text-gray-500" />,
  };
  return (
    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
      {map[type] ?? <Activity size={13} className="text-muted-foreground" />}
    </div>
  );
}

// ─── Add Opportunity Form ─────────────────────────────────────
function AddOpportunityForm({
  area, onAdd, onCancel,
}: {
  area: PipelineArea;
  onAdd: (title: string, stage: OpportunityStage, value: number, notes: string) => void;
  onCancel: () => void;
}) {
  const stages = area === 'lead' ? LEAD_STAGES : area === 'estimate' ? ESTIMATE_STAGES : JOB_STAGES;
  const [title, setTitle] = useState('');
  const [stage, setStage] = useState<OpportunityStage>(stages[0]);
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');

  const submit = () => {
    if (!title.trim()) { toast.error('Enter a title for this opportunity'); return; }
    onAdd(title.trim(), stage, parseFloat(value) || 0, notes.trim());
    toast.success('Opportunity added');
  };

  return (
    <div className="border border-primary/30 rounded-xl bg-primary/5 p-4 space-y-3">
      <div className="text-xs font-semibold text-primary uppercase tracking-wider">New Opportunity</div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Title / Description</label>
        <input type="text" value={title} onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Kitchen remodel — Johnson residence"
          className="field-input w-full" autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Stage</label>
          <select value={stage} onChange={e => setStage(e.target.value as OpportunityStage)} className="field-input w-full">
            {stages.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Est. Value ($)</label>
          <input type="number" value={value} onChange={e => setValue(e.target.value)}
            placeholder="0.00" className="field-input w-full" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Notes (optional)</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Any relevant notes..." rows={2} className="field-input w-full resize-none" />
      </div>
      <div className="flex gap-2">
        <button onClick={submit} className="flex-1 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors">
          Add Opportunity
        </button>
        <button onClick={onCancel} className="px-3 py-2 border border-border rounded-lg text-xs hover:bg-muted transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Opportunity Card ─────────────────────────────────────────
function OpportunityCard({
  opp, stages, area, onUpdate, onRemove,
  onConvertToEstimate, onConvertToJob, onArchive, onOpen,
}: {
  opp: {
    id: string; title: string; stage: OpportunityStage; value: number;
    notes: string; createdAt: string; archived: boolean;
    sourceLeadId?: string; sourceEstimateId?: string;
    convertedToEstimateAt?: string; convertedToJobAt?: string;
  };
  stages: OpportunityStage[];
  area: PipelineArea;
  onUpdate: (id: string, payload: Partial<{ stage: OpportunityStage; title: string; value: number; notes: string }>) => void;
  onRemove: (id: string) => void;
  onConvertToEstimate?: (id: string, title: string, value: number) => void;
  onConvertToJob?: (id: string, title: string, value: number) => void;
  onArchive?: (id: string, value: number) => void;
  onOpen?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const isArchived = opp.archived;
  const canConvertToEstimate = area === 'lead' && !opp.convertedToEstimateAt;
  const canConvertToJob = area === 'estimate' && !opp.convertedToJobAt;
  const canArchive = area === 'job' && opp.stage === 'Invoice Paid' && !isArchived;

  return (
    <div className={`bg-white border rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow ${
      isArchived ? 'border-emerald-200 bg-emerald-50/30 opacity-70' : 'border-border'
    }`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="text-sm font-semibold text-foreground truncate">{opp.title}</div>
            {isArchived && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                <Archive size={9} /> ARCHIVED
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${stageColor(opp.stage)}`}>
              {opp.stage}
            </span>
            {opp.value > 0 && <span className="text-xs text-muted-foreground font-medium">{fmtDollar(opp.value)}</span>}
            {opp.sourceLeadId && area !== 'lead' && (
              <span className="text-[9px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-full">from lead</span>
            )}
            {opp.sourceEstimateId && area === 'job' && (
              <span className="text-[9px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-full">from estimate</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Open in estimate builder */}
          {!isArchived && onOpen && (
            <button
              onClick={() => onOpen(opp.id)}
              title="Open in estimate builder"
              className="flex items-center gap-1 px-2 py-1 bg-slate-800 text-white rounded-md text-[11px] font-semibold hover:bg-slate-700 transition-colors"
            >
              <FolderOpen size={11} />
              <span className="hidden sm:inline">Open</span>
            </button>
          )}
          <button onClick={() => setExpanded(e => !e)} className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {!isArchived && (
            <button onClick={() => { if (confirm('Remove this opportunity?')) onRemove(opp.id); }}
              className="p-1 rounded hover:bg-destructive/10 text-destructive/60 hover:text-destructive transition-colors">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── Lifecycle action buttons ── */}
      {!isArchived && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {canConvertToEstimate && onConvertToEstimate && (
            <button
              onClick={() => {
                const title = prompt('Estimate title:', opp.title) ?? opp.title;
                onConvertToEstimate(opp.id, title, opp.value);
                toast.success('Lead converted to Estimate — opening Calculator');
              }}
              className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white rounded-md text-[11px] font-semibold hover:bg-blue-700 transition-colors"
            >
              <RefreshCw size={10} />
              Convert to Estimate
            </button>
          )}
          {opp.convertedToEstimateAt && area === 'lead' && (
            <span className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[11px] font-medium">
              <CheckCircle2 size={10} />
              Converted {fmtDate(opp.convertedToEstimateAt)}
            </span>
          )}
          {canConvertToJob && onConvertToJob && (
            <button
              onClick={() => {
                const title = prompt('Job title:', opp.title) ?? opp.title;
                onConvertToJob(opp.id, title, opp.value);
                toast.success('Estimate converted to Job — opening Jobs tab');
              }}
              className="flex items-center gap-1 px-2.5 py-1 bg-violet-600 text-white rounded-md text-[11px] font-semibold hover:bg-violet-700 transition-colors"
            >
              <RefreshCw size={10} />
              Convert to Job
            </button>
          )}
          {opp.convertedToJobAt && area === 'estimate' && (
            <span className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md text-[11px] font-medium">
              <CheckCircle2 size={10} />
              Converted {fmtDate(opp.convertedToJobAt)}
            </span>
          )}
          {canArchive && onArchive && (
            <button
              onClick={() => {
                if (confirm(`Archive "${opp.title}" and add ${fmtDollar(opp.value)} to lifetime value?`)) {
                  onArchive(opp.id, opp.value);
                  toast.success('Job archived — Lifetime Value updated!');
                }
              }}
              className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white rounded-md text-[11px] font-semibold hover:bg-emerald-700 transition-colors"
            >
              <Archive size={10} />
              Archive (Invoice Paid)
            </button>
          )}
        </div>
      )}

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {!isArchived && (
            <>
              <div>
                <label className="block text-[10px] text-muted-foreground mb-1">Stage</label>
                <select value={opp.stage} onChange={e => onUpdate(opp.id, { stage: e.target.value as OpportunityStage })}
                  className="field-input w-full text-xs py-1.5">
                  {stages.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-muted-foreground mb-1">Est. Value ($)</label>
                <input type="number" value={opp.value || ''} onChange={e => onUpdate(opp.id, { value: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00" className="field-input w-full text-xs py-1.5" />
              </div>
            </>
          )}
          {opp.notes && <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">{opp.notes}</div>}
          <div className="text-[10px] text-muted-foreground">Added {new Date(opp.createdAt).toLocaleDateString()}</div>
        </div>
      )}
    </div>
  );
}
// ─── Pipeline Area Panel ─────────────────────────────────────────
function PipelineAreaPanel({
  area, stages, opportunities, onAdd, onUpdate, onRemove,
  onConvertToEstimate, onConvertToJob, onArchive, onOpen,
}: {
  area: PipelineArea;
  stages: OpportunityStage[];
  opportunities: {
    id: string; area: PipelineArea; stage: OpportunityStage; title: string; value: number;
    notes: string; createdAt: string; updatedAt: string; archived: boolean;
    sourceLeadId?: string; sourceEstimateId?: string;
    convertedToEstimateAt?: string; convertedToJobAt?: string;
  }[];
  onAdd: (title: string, stage: OpportunityStage, value: number, notes: string) => void;
  onUpdate: (id: string, payload: Partial<{ stage: OpportunityStage; title: string; value: number; notes: string }>) => void;
  onRemove: (id: string) => void;
  onConvertToEstimate?: (id: string, title: string, value: number) => void;
  onConvertToJob?: (id: string, title: string, value: number) => void;
  onArchive?: (id: string, value: number) => void;
  onOpen?: (id: string) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const activeOpps = opportunities.filter(o => !o.archived);
  const archivedOpps = opportunities.filter(o => o.archived);

  const byStage: Record<string, typeof activeOpps> = {};
  for (const s of stages) byStage[s] = [];
  for (const opp of activeOpps) {
    if (byStage[opp.stage]) byStage[opp.stage].push(opp);
    else byStage[stages[0]].push(opp);
  }
  const totalValue = activeOpps.reduce((s, o) => s + o.value, 0);
  const activeStages = stages.filter(s => byStage[s].length > 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span><strong className="text-foreground">{activeOpps.length}</strong> active</span>
          {archivedOpps.length > 0 && (
            <span className="text-emerald-700"><strong>{archivedOpps.length}</strong> archived</span>
          )}
          {totalValue > 0 && (
            <span className="flex items-center gap-1">
              <DollarSign size={13} />
              <strong className="text-foreground">{fmtDollar(totalValue)}</strong> pipeline
            </span>
          )}
        </div>
        <button onClick={() => setShowAdd(s => !s)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors">
          <Plus size={13} /> Add
        </button>
      </div>
      {showAdd && (
        <div className="mb-4">
          <AddOpportunityForm area={area}
            onAdd={(title, stage, value, notes) => { onAdd(title, stage, value, notes); setShowAdd(false); }}
            onCancel={() => setShowAdd(false)} />
        </div>
      )}
      {activeOpps.length === 0 && archivedOpps.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm border-2 border-dashed border-border rounded-xl">
          No {area === 'lead' ? 'leads' : area === 'estimate' ? 'estimates' : 'jobs'} yet. Click "Add" to get started.
        </div>
      ) : (
        <div className="space-y-4">
          {activeStages.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {activeStages.map(stage => (
                <div key={stage} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${stageColor(stage)}`}>
                      {stage}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {byStage[stage].length} · {fmtDollar(byStage[stage].reduce((s, o) => s + o.value, 0))}
                    </span>
                  </div>
                  {byStage[stage].map(opp => (
                    <OpportunityCard
                      key={opp.id}
                      opp={opp}
                      stages={stages}
                      area={area}
                      onUpdate={onUpdate}
                      onRemove={onRemove}
                      onConvertToEstimate={onConvertToEstimate}
                      onConvertToJob={onConvertToJob}
                      onArchive={onArchive}
                      onOpen={onOpen}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Archived section */}
          {archivedOpps.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowArchived(s => !s)}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
              >
                <Archive size={12} />
                {showArchived ? 'Hide' : 'Show'} {archivedOpps.length} archived {area === 'job' ? 'job' : area}(s)
                {!showArchived && (
                  <span className="text-emerald-700 font-semibold">
                    · {fmtDollar(archivedOpps.reduce((s, o) => s + o.value, 0))} earned
                  </span>
                )}
              </button>
              {showArchived && (
                <div className="space-y-2 pl-2 border-l-2 border-emerald-200">
                  {archivedOpps.map(opp => (
                    <OpportunityCard
                      key={opp.id}
                      opp={opp}
                      stages={stages}
                      area={area}
                      onUpdate={onUpdate}
                      onRemove={onRemove}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          <details className="mt-2">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              View all {stages.length} stages
            </summary>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {stages.map(stage => (
                <div key={stage} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50 border border-border">
                  <span className="text-xs text-foreground truncate">{stage}</span>
                  <span className="text-xs font-semibold text-muted-foreground ml-2 shrink-0">{byStage[stage]?.length ?? 0}</span>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

// ─── Main CustomerSection ─────────────────────────────────────
export default function CustomerSection() {
  const {
    state, setJobInfo, setCustomerProfile, addActivityEvent, setCustomerTab,
    addOpportunity, updateOpportunity, removeOpportunity, setPipelineArea,
    convertLeadToEstimate, convertEstimateToJob, archiveJob,
    setActiveOpportunity, setSection,
  } = useEstimator();
  const { jobInfo, customerProfile, activityFeed, activeCustomerTab, opportunities, activePipelineArea } = state;

  const [newTag, setNewTag] = useState('');
  const [editingContact, setEditingContact] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [activeIntake, setActiveIntake] = useState<'job' | 'recurring-job' | 'estimate' | 'event' | 'intake' | 'lead' | null>(null);

  // Build prefill from current customer's jobInfo
  const customerPrefill: CustomerPrefill = {
    displayName: jobInfo.client || '',
    firstName: (jobInfo.client || '').split(' ')[0] || '',
    lastName: (jobInfo.client || '').split(' ').slice(1).join(' ') || '',
    mobilePhone: jobInfo.phone || '',
    homePhone: '',
    workPhone: '',
    email: jobInfo.email || '',
    street: jobInfo.address || '',
    unit: '',
    city: jobInfo.city || '',
    state: jobInfo.state || '',
    zip: jobInfo.zip || '',
    company: jobInfo.companyName || '',
  };

  // ── Derived ──
  const displayName = jobInfo.client || 'New Customer';
  const areaMap: Record<CustomerProfileTab, PipelineArea | null> = {
    profile: null, leads: 'lead', estimates: 'estimate', jobs: 'job',
    invoices: null, communication: null, attachments: null, notes: null,
  };

  const handleTabClick = (tab: CustomerProfileTab) => {
    setCustomerTab(tab);
    const area = areaMap[tab];
    if (area) setPipelineArea(area);
  };

  const addTag = () => {
    const t = newTag.trim();
    if (!t) return;
    if (customerProfile.tags.includes(t)) { toast.error('Tag already added'); return; }
    setCustomerProfile({ tags: [...customerProfile.tags, t] });
    setNewTag('');
  };

  const removeTag = (tag: string) => {
    setCustomerProfile({ tags: customerProfile.tags.filter(t => t !== tag) });
  };

  const sendPortalInvite = () => {
    if (!jobInfo.email) { toast.error('Add an email address first'); return; }
    setCustomerProfile({ portalInviteSent: true, portalInvitedAt: new Date().toISOString() });
    addActivityEvent({ type: 'note_added', title: 'Portal invite sent', description: `Invite sent to ${jobInfo.email}` });
    toast.success('Portal invite sent!');
  };

  const logCall = () => {
    if (!jobInfo.phone) { toast.error('Add a phone number first'); return; }
    addActivityEvent({ type: 'call_logged', title: 'Call logged', description: `Called ${jobInfo.client || 'customer'} at ${jobInfo.phone}` });
    toast.success('Call logged');
  };

  const addNote = () => {
    const n = newNote.trim();
    if (!n) return;
    addActivityEvent({ type: 'note_added', title: 'Note added', description: n });
    setNewNote('');
    toast.success('Note added to activity feed');
  };

  // ── Profile tab content ──
  const ProfileTab = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

      {/* ── Left Sidebar ── */}
      <div className="space-y-4">

        {/* Summary */}
        <div className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <Activity size={13} />
            <span>Summary</span>
          </div>
          <div className="card-section-body space-y-3">
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Created</div>
              <div className="text-sm font-medium">{fmtDate(customerProfile.createdAt)}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Lifetime Value</div>
              <div className="text-sm font-semibold text-emerald-700">{fmtDollar(customerProfile.lifetimeValue)}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Outstanding Balance</div>
              <div className={`text-sm font-semibold ${customerProfile.outstandingBalance > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                {fmtDollar(customerProfile.outstandingBalance)}
              </div>
            </div>
            {/* Pipeline summary */}
            <div className="pt-2 border-t border-border space-y-1">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Pipeline</div>
              {(['lead', 'estimate', 'job'] as PipelineArea[]).map(area => {
                const count = opportunities.filter(o => o.area === area && !o.archived).length;
                const val = opportunities.filter(o => o.area === area && !o.archived).reduce((s, o) => s + o.value, 0);
                return count > 0 ? (
                  <div key={area} className="flex items-center justify-between text-xs">
                    <span className="capitalize text-muted-foreground">{area}s</span>
                    <span className="font-medium">{count} · {fmtDollar(val)}</span>
                  </div>
                ) : null;
              })}
            </div>
          </div>
        </div>

        {/* Contact Info */}
        <div className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <User size={13} />
            <span>Contact Info</span>
            <button onClick={() => setEditingContact(e => !e)} className="ml-auto p-1 rounded hover:bg-muted transition-colors text-muted-foreground">
              {editingContact ? <Save size={13} /> : <Edit3 size={13} />}
            </button>
          </div>
          <div className="card-section-body space-y-3">
            {editingContact ? (
              <div className="space-y-2">
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">Name</label>
                  <input type="text" value={jobInfo.client} onChange={e => setJobInfo({ client: e.target.value })}
                    placeholder="Jane Smith" className="field-input w-full text-sm" />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">Company</label>
                  <input type="text" value={jobInfo.companyName} onChange={e => setJobInfo({ companyName: e.target.value })}
                    placeholder="Acme Corp" className="field-input w-full text-sm" />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">Phone</label>
                  <input type="tel" value={jobInfo.phone} onChange={e => setJobInfo({ phone: e.target.value })}
                    placeholder="(360) 555-0100" className="field-input w-full text-sm" />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">Email</label>
                  <input type="email" value={jobInfo.email} onChange={e => setJobInfo({ email: e.target.value })}
                    placeholder="jane@example.com" className="field-input w-full text-sm" />
                </div>
                <button onClick={() => setEditingContact(false)}
                  className="w-full px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors">
                  Save Contact
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <User size={13} className="text-muted-foreground shrink-0" />
                  <span className="font-medium">{jobInfo.client || <span className="text-muted-foreground italic">No name</span>}</span>
                </div>
                {jobInfo.companyName && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 size={13} className="text-muted-foreground shrink-0" />
                    <span>{jobInfo.companyName}</span>
                  </div>
                )}
                {jobInfo.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone size={13} className="text-muted-foreground shrink-0" />
                    <a href={`tel:${jobInfo.phone}`} className="text-primary hover:underline">{jobInfo.phone}</a>
                  </div>
                )}
                {jobInfo.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail size={13} className="text-muted-foreground shrink-0" />
                    <a href={`mailto:${jobInfo.email}`} className="text-primary hover:underline truncate">{jobInfo.email}</a>
                  </div>
                )}
                {/* Customer portal invite */}
                <div className="pt-2 border-t border-border">
                  {customerProfile.portalInviteSent ? (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-700">
                      <CheckCircle2 size={12} />
                      <span>Portal invite sent {customerProfile.portalInvitedAt ? fmtDate(customerProfile.portalInvitedAt) : ''}</span>
                    </div>
                  ) : (
                    <button onClick={sendPortalInvite}
                      className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                      <ExternalLink size={12} />
                      Invite to customer portal
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Payment Method */}
        <div className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <CreditCard size={13} />
            <span>Payment Method</span>
          </div>
          <div className="card-section-body space-y-2">
            {customerProfile.paymentMethodOnFile ? (
              <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                <CreditCard size={14} className="text-emerald-700" />
                <div>
                  <div className="text-xs font-semibold text-emerald-800">Card on file</div>
                  {customerProfile.paymentMethodLast4 && (
                    <div className="text-[10px] text-emerald-700">···· {customerProfile.paymentMethodLast4}</div>
                  )}
                </div>
                <button onClick={() => setCustomerProfile({ paymentMethodOnFile: false, paymentMethodLast4: '' })}
                  className="ml-auto p-1 rounded hover:bg-emerald-100 text-emerald-700 transition-colors">
                  <X size={12} />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <button onClick={() => {
                  const last4 = prompt('Enter last 4 digits of card (or leave blank):') ?? '';
                  setCustomerProfile({ paymentMethodOnFile: true, paymentMethodLast4: last4.slice(-4) });
                  toast.success('Payment method saved');
                }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                  <Plus size={13} /> Add credit card
                </button>
                <button onClick={() => toast.info('Request card on file feature coming soon')}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                  <Send size={13} /> Request card on file
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Communication Preferences */}
        <div className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <Bell size={13} />
            <span>Communication Preferences</span>
          </div>
          <div className="card-section-body divide-y divide-border">
            <Toggle
              checked={customerProfile.notificationsEnabled}
              onChange={v => setCustomerProfile({ notificationsEnabled: v })}
              label="Notifications enabled"
            />
            <Toggle
              checked={customerProfile.smsConsent}
              onChange={v => setCustomerProfile({ smsConsent: v })}
              label="Text message consent"
              sublabel="Customer consents to receive service texts"
            />
            <Toggle
              checked={customerProfile.smsMarketingConsent}
              onChange={v => setCustomerProfile({ smsMarketingConsent: v })}
              label="SMS marketing consent"
              sublabel="Promotional texts and offers"
            />
            <Toggle
              checked={customerProfile.emailMarketingConsent}
              onChange={v => setCustomerProfile({ emailMarketingConsent: v })}
              label="Email marketing consent"
              sublabel="Newsletters and promotions"
            />
          </div>
        </div>

        {/* Customer Tags */}
        <div className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <Tag size={13} />
            <span>Customer Tags</span>
          </div>
          <div className="card-section-body space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {customerProfile.tags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium">
                  {tag}
                  <button onClick={() => removeTag(tag)} className="hover:text-destructive transition-colors">
                    <X size={10} />
                  </button>
                </span>
              ))}
              {customerProfile.tags.length === 0 && (
                <span className="text-xs text-muted-foreground italic">No tags yet</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTag()}
                placeholder="Add tag..."
                className="field-input flex-1 text-xs py-1.5"
              />
              <button onClick={addTag} className="px-2 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs hover:bg-primary/90 transition-colors">
                <Plus size={13} />
              </button>
            </div>
          </div>
        </div>

        {/* Lead Source */}
        <div className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <AtSign size={13} />
            <span>Lead Source</span>
          </div>
          <div className="card-section-body">
            <select
              value={customerProfile.leadSource}
              onChange={e => setCustomerProfile({ leadSource: e.target.value as LeadSource | '' })}
              className="field-input w-full"
            >
              <option value="">Select lead source...</option>
              {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Right Main ── */}
      <div className="lg:col-span-2 space-y-4">

        {/* Job Details — only shown when inside an open opportunity */}
        {state.activeOpportunityId && (
        <div className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <Briefcase size={13} />
            <span>Job Details</span>
          </div>
          <div className="card-section-body grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Job Type</label>
              <select value={jobInfo.jobType} onChange={e => setJobInfo({ jobType: e.target.value })} className="field-input w-full">
                {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Estimator</label>
              <input type="text" value={jobInfo.estimator} onChange={e => setJobInfo({ estimator: e.target.value })}
                placeholder="e.g. Mike, Sarah" className="field-input w-full" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Estimate Date</label>
              <input type="date" value={jobInfo.date} onChange={e => setJobInfo({ date: e.target.value })} className="field-input w-full" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Expires Date</label>
              <input type="date" value={jobInfo.expiresDate} onChange={e => setJobInfo({ expiresDate: e.target.value })} className="field-input w-full" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Service Date</label>
              <input type="date" value={jobInfo.servicedDate} onChange={e => setJobInfo({ servicedDate: e.target.value })} className="field-input w-full" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Job Number</label>
              <input type="text" value={jobInfo.jobNumber} onChange={e => setJobInfo({ jobNumber: e.target.value })} className="field-input w-full" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Scope of Work</label>
              <textarea value={jobInfo.scope} onChange={e => setJobInfo({ scope: e.target.value })}
                placeholder="e.g. Full trim package — install new baseboard, door casing, and window casing throughout main floor."
                rows={3} className="field-input w-full resize-none" />
            </div>
          </div>
        </div>
        )}

        {/* Addresses */}
        <div className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <MapPin size={13} />
            <span>Address</span>
          </div>
          <div className="card-section-body space-y-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Street Address</label>
              <div className="relative">
                <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="text" value={jobInfo.address} onChange={e => setJobInfo({ address: e.target.value })}
                  placeholder="1234 Main St" className="field-input w-full pl-9" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">City</label>
                <input type="text" value={jobInfo.city} onChange={e => setJobInfo({ city: e.target.value })}
                  placeholder="Vancouver" className="field-input w-full" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">State</label>
                <input type="text" value={jobInfo.state} onChange={e => setJobInfo({ state: e.target.value })}
                  placeholder="WA" className="field-input w-full" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Zip</label>
                <input type="text" value={jobInfo.zip} onChange={e => setJobInfo({ zip: e.target.value })}
                  placeholder="98683" className="field-input w-full" />
              </div>
            </div>
            {jobInfo.address && (
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent([jobInfo.address, jobInfo.city, jobInfo.state, jobInfo.zip].filter(Boolean).join(', '))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-1"
              >
                <ExternalLink size={11} />
                Open in Google Maps
              </a>
            )}
          </div>
        </div>

        {/* Private Notes */}
        <div className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <Edit3 size={13} />
            <span>Private Notes</span>
            <span className="ml-auto text-[10px] text-muted-foreground font-normal">Internal only — not visible to customer</span>
          </div>
          <div className="card-section-body">
            <textarea
              value={customerProfile.privateNotes}
              onChange={e => setCustomerProfile({ privateNotes: e.target.value })}
              placeholder="Add private notes about this customer — preferences, special instructions, history..."
              rows={4}
              className="field-input w-full resize-none"
            />
          </div>
        </div>

        {/* Activity Feed */}
        <div className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <Activity size={13} />
            <span>Activity Feed</span>
          </div>
          <div className="card-section-body space-y-3">
            {/* Quick note input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addNote()}
                placeholder="Add a note to the activity feed..."
                className="field-input flex-1 text-sm"
              />
              <button onClick={addNote} className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors shrink-0">
                Add
              </button>
            </div>

            {/* Feed */}
            {activityFeed.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm border-2 border-dashed border-border rounded-xl">
                No activity yet. Actions like sending an estimate or logging a call will appear here.
              </div>
            ) : (
              <div className="space-y-3">
                {activityFeed.map(event => (
                  <div key={event.id} className="flex items-start gap-3">
                    <ActivityIcon type={event.type} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground">{event.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{event.description}</div>
                    </div>
                    <div className="text-[10px] text-muted-foreground shrink-0">{fmtRelative(event.timestamp)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // ── Pipeline tab content ──
  const PipelineTab = () => {
    const area = areaMap[activeCustomerTab] as PipelineArea;
    const areaStages: OpportunityStage[] =
      area === 'lead' ? LEAD_STAGES :
      area === 'estimate' ? ESTIMATE_STAGES :
      JOB_STAGES;
    const areaOpps = opportunities.filter(o => o.area === area);
    return (
      <PipelineAreaPanel
        area={area}
        stages={areaStages}
        opportunities={areaOpps as any}
        onAdd={(title, stage, value, notes) => addOpportunity({ area, stage, title, value, notes, archived: false })}
        onUpdate={updateOpportunity}
        onRemove={removeOpportunity}
        onConvertToEstimate={area === 'lead' ? convertLeadToEstimate : undefined}
        onConvertToJob={area === 'estimate' ? convertEstimateToJob : undefined}
        onArchive={area === 'job' ? archiveJob : undefined}
        onOpen={(id) => {
          setActiveOpportunity(id);
          // Navigate to the appropriate section based on area
          if (area === 'lead' || area === 'estimate') {
            setSection('sales');
          } else {
            setSection('calculator');
          }
        }}
      />
    );
  };

  // ── Placeholder tab ──
  const PlaceholderTab = ({ label }: { label: string }) => (
    <div className="text-center py-16 text-muted-foreground border-2 border-dashed border-border rounded-xl">
      <div className="text-lg font-semibold mb-2">{label}</div>
      <div className="text-sm">This section is coming soon.</div>
    </div>
  );

  return (
    <div className="space-y-0">

      {/* ── Customer Header ── */}
      <div className="bg-white border-b border-border px-4 py-4">
        <div className="max-w-6xl mx-auto">
          {/* Breadcrumb */}
          <div className="text-xs text-muted-foreground mb-1">
            Customers / <span className="text-foreground">{displayName}</span>
          </div>
          {/* Name + actions */}
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">{displayName}</h1>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {/* Lifetime value badge */}
              {customerProfile.lifetimeValue > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-800">
                  <TrendingUp size={13} />
                  <span className="hidden sm:inline">LTV:</span>
                  {fmtDollar(customerProfile.lifetimeValue)}
                </div>
              )}
              {/* Payment method indicator */}
              {customerProfile.paymentMethodOnFile ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-medium text-emerald-800">
                  <CreditCard size={13} />
                  <span className="hidden sm:inline">Card on file</span>
                </div>
              ) : (
                <button
                  onClick={() => {
                    const last4 = prompt('Enter last 4 digits of card:') ?? '';
                    if (last4) {
                      setCustomerProfile({ paymentMethodOnFile: true, paymentMethodLast4: last4.slice(-4) });
                      toast.success('Payment method saved');
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  <CreditCard size={13} />
                  <span className="hidden sm:inline">Add card</span>
                </button>
              )}
              {/* Quick intake buttons */}
              <button onClick={() => setActiveIntake('lead')}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                <Star size={13} /><span className="hidden sm:inline">New Lead</span>
              </button>
              <button onClick={() => setActiveIntake('estimate')}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                <FileText size={13} /><span className="hidden sm:inline">New Estimate</span>
              </button>
              <button onClick={() => setActiveIntake('job')}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                <Briefcase size={13} /><span className="hidden sm:inline">New Job</span>
              </button>
              {/* Call button */}
              <a
                href={jobInfo.phone ? `tel:${jobInfo.phone}` : '#'}
                onClick={e => { if (!jobInfo.phone) { e.preventDefault(); toast.error('Add a phone number first'); } else { logCall(); } }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors"
              >
                <PhoneCall size={13} />
                <span className="hidden sm:inline">Call</span>
              </a>
            </div>
          </div>
          {/* Sub-info */}
          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
            {jobInfo.companyName && <span className="flex items-center gap-1"><Building2 size={11} />{jobInfo.companyName}</span>}
            {jobInfo.phone && <span className="flex items-center gap-1"><Phone size={11} />{jobInfo.phone}</span>}
            {jobInfo.email && <span className="flex items-center gap-1"><Mail size={11} />{jobInfo.email}</span>}
            {jobInfo.address && <span className="flex items-center gap-1"><MapPin size={11} />{jobInfo.address}{jobInfo.city ? `, ${jobInfo.city}` : ''}</span>}
          </div>
        </div>
      </div>

      {/* ── Tab Nav ── */}
      <div className="bg-white border-b border-border sticky top-[var(--header-h,112px)] z-10">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex overflow-x-auto scrollbar-hide -mb-px">
            {CUSTOMER_TABS.map(tab => {
              const count = tab.key === 'leads' ? opportunities.filter(o => o.area === 'lead' && !o.archived).length
                : tab.key === 'estimates' ? opportunities.filter(o => o.area === 'estimate' && !o.archived).length
                : tab.key === 'jobs' ? opportunities.filter(o => o.area === 'job' && !o.archived).length
                : 0;
              return (
                <button
                  key={tab.key}
                  onClick={() => handleTabClick(tab.key)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                    activeCustomerTab === tab.key
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                  {count > 0 && (
                    <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${
                      activeCustomerTab === tab.key ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {activeCustomerTab === 'profile' && <ProfileTab />}
        {(activeCustomerTab === 'leads' || activeCustomerTab === 'estimates' || activeCustomerTab === 'jobs') && <PipelineTab />}
        {activeCustomerTab === 'invoices' && <PlaceholderTab label="Invoices" />}
        {activeCustomerTab === 'communication' && <PlaceholderTab label="Communication" />}
        {activeCustomerTab === 'attachments' && <PlaceholderTab label="Attachments" />}
        {activeCustomerTab === 'notes' && (
          <div className="card-section">
            <div className="card-section-header">
              <Edit3 size={15} />
              <span>Notes</span>
            </div>
            <div className="card-section-body space-y-3">
              <div className="flex gap-2">
                <input type="text" value={newNote} onChange={e => setNewNote(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addNote()}
                  placeholder="Add a note..." className="field-input flex-1" />
                <button onClick={addNote} className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors">
                  Add
                </button>
              </div>
              <textarea value={customerProfile.privateNotes} onChange={e => setCustomerProfile({ privateNotes: e.target.value })}
                placeholder="Private notes about this customer..." rows={6} className="field-input w-full resize-none" />
            </div>
          </div>
        )}
      </div>

      {/* ── Customer-context intake modals (pre-filled) ── */}
      {activeIntake === 'job'           && <NewJobModal           onClose={() => setActiveIntake(null)} prefill={customerPrefill} />}
      {activeIntake === 'recurring-job' && <NewRecurringJobModal  onClose={() => setActiveIntake(null)} prefill={customerPrefill} />}
      {activeIntake === 'estimate'      && <NewEstimateModal      onClose={() => setActiveIntake(null)} prefill={customerPrefill} />}
      {activeIntake === 'event'         && <NewEventModal         onClose={() => setActiveIntake(null)} prefill={customerPrefill} />}
      {activeIntake === 'intake'        && <NewIntakeModal        onClose={() => setActiveIntake(null)} prefill={customerPrefill} />}
      {activeIntake === 'lead'          && <NewLeadModal          onClose={() => setActiveIntake(null)} prefill={customerPrefill} />}
    </div>
  );
}
