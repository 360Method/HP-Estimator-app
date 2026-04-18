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

import { useState, useRef, useEffect, useCallback } from 'react';
import { ConvertToEstimateModal, ConvertToJobModal } from '@/components/ConversionModal';
import NewLeadModal from '@/components/intakes/NewLeadModal';
import NewEstimateModal from '@/components/intakes/NewEstimateModal';
import NewJobModal from '@/components/intakes/NewJobModal';
import { trpc } from '@/lib/trpc';
import { useEstimator } from '@/contexts/EstimatorContext';
import {
  JOB_TYPES, LEAD_STAGES, ESTIMATE_STAGES, JOB_STAGES,
  PipelineArea, OpportunityStage, LeadStage, EstimateStage, JobStage,
  CustomerProfileTab, LeadSource, LeadNote, JobAttachment, Opportunity,
} from '@/lib/types';
import {
  User, MapPin, Phone, Mail, Calendar, Briefcase, Hash, Building2,
  Plus, Trash2, ChevronDown, ChevronUp, DollarSign, Tag, ArrowRight,
  CreditCard, Bell, MessageSquare, AtSign, Star, Paperclip, FileText,
  Activity, Send, CheckCircle2, XCircle, Clock, PhoneCall, Wallet,
  ExternalLink, Edit3, Save, X, AlertCircle, TrendingUp, Archive,
  RefreshCw, FolderOpen, Download, Wrench, Trophy, FileUp, Camera, CalendarPlus,
  GitMerge, Search, Receipt, ShieldCheck, ChevronRight, Volume2, Voicemail,
  Inbox, ArrowUpRight, ArrowDownLeft, StickyNote,
} from 'lucide-react';
import PropertySelectorGrid from '@/components/PropertySelectorGrid';
import { Badge } from '@/components/ui/badge';
import PipelineBoard from '@/components/PipelineBoard';
import AddressAutocomplete, { ParsedAddress } from '@/components/AddressAutocomplete';
import AddressMapPreview from '@/components/AddressMapPreview';
import InvoiceSection from '@/components/sections/InvoiceSection';
import CustomerExpensesTab from '@/components/CustomerExpensesTab';
import VoiceCallPanel from '@/components/VoiceCallPanel';
import CustomerActivityFeed from '@/components/CustomerActivityFeed';
import ManualMergeFlow from '@/components/ManualMergeFlow';
import { useInboxSSE } from '@/hooks/useInboxSSE';
import DuplicateSuggestionBanner from '@/components/DuplicateSuggestionBanner';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import CustomerMembershipPanel from '@/components/CustomerMembershipPanel';

// ─── Constants ────────────────────────────────────────────────
const LEAD_SOURCES: LeadSource[] = [
  'Google', 'Referral', 'Facebook', 'Instagram', 'Nextdoor',
  'Yelp', 'Direct Mail', 'Repeat Customer', 'Other',
];

const CUSTOMER_TABS: { key: CustomerProfileTab; label: string; icon: React.ReactNode }[] = [
  { key: 'profile', label: 'Profile', icon: <User size={13} /> },
  { key: 'properties', label: 'Properties', icon: <Building2 size={13} /> },
  { key: 'membership360', label: '360°', icon: <RefreshCw size={13} /> },
  { key: 'leads', label: 'Leads', icon: <Star size={13} /> },
  { key: 'estimates', label: 'Estimates', icon: <FileText size={13} /> },
  { key: 'jobs', label: 'Jobs', icon: <Briefcase size={13} /> },
  { key: 'invoices', label: 'Invoices', icon: <Wallet size={13} /> },
  { key: 'expenses', label: 'Expenses', icon: <Receipt size={13} /> },
  { key: 'communication', label: 'Communication', icon: <MessageSquare size={13} /> },
  { key: 'attachments', label: 'Attachments', icon: <Paperclip size={13} /> },
  { key: 'notes', label: 'Notes', icon: <Edit3 size={13} /> },
  { key: 'portal', label: 'Portal', icon: <ExternalLink size={13} /> },
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
  opp: Opportunity;
  stages: OpportunityStage[];
  area: PipelineArea;
  onUpdate: (id: string, payload: Partial<{ stage: OpportunityStage; title: string; value: number; notes: string }>) => void;
  onRemove: (id: string) => void;
  onConvertToEstimate?: (id: string, title: string, value: number, transferNotes?: LeadNote[], transferAttachments?: JobAttachment[]) => void;
  onConvertToJob?: (id: string, title: string, value: number) => void;
  onArchive?: (id: string, value: number) => void;
  onOpen?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showConvertToEstimateModal, setShowConvertToEstimateModal] = useState(false);
  const [showConvertToJobModal, setShowConvertToJobModal] = useState(false);

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
              onClick={() => setShowConvertToEstimateModal(true)}
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
              onClick={() => setShowConvertToJobModal(true)}
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

      {/* Conversion modals */}
      {showConvertToEstimateModal && onConvertToEstimate && (
        <ConvertToEstimateModal
          lead={opp}
          onConfirm={(title, value, transferNotes, transferAttachments) => {
            onConvertToEstimate(opp.id, title, value, transferNotes, transferAttachments);
            setShowConvertToEstimateModal(false);
            toast.success('Lead converted to Estimate');
          }}
          onClose={() => setShowConvertToEstimateModal(false)}
        />
      )}
      {showConvertToJobModal && onConvertToJob && (
        <ConvertToJobModal
          estimate={opp as any}
          onConfirm={(title, value) => {
            onConvertToJob(opp.id, title, value);
            setShowConvertToJobModal(false);
            toast.success('Estimate approved — Job created');
          }}
          onClose={() => setShowConvertToJobModal(false)}
        />
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
  onConvertToEstimate?: (id: string, title: string, value: number, transferNotes?: LeadNote[], transferAttachments?: JobAttachment[]) => void;
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

// ─── Stub Merge Dialog ────────────────────────────────────────────────────────────────
interface StubMergeDialogProps {
  stubId: string;
  customers: any[];
  onClose: () => void;
  onMerge: (targetId: string) => void;
  isPending: boolean;
}
function StubMergeDialog({ stubId, customers, onClose, onMerge, isPending }: StubMergeDialogProps) {
  const [query, setQuery] = useState('');
  const realCustomers = customers.filter(c =>
    c.id !== stubId &&
    !(c as any).mergedIntoId &&
    c.leadSource !== 'inbound_call'
  );
  const filtered = realCustomers.filter(c => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      (c.displayName ?? '').toLowerCase().includes(q) ||
      (c.firstName ?? '').toLowerCase().includes(q) ||
      (c.lastName ?? '').toLowerCase().includes(q) ||
      (c.mobilePhone ?? '').includes(q) ||
      (c.email ?? '').toLowerCase().includes(q)
    );
  }).slice(0, 40);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="font-semibold text-foreground">Merge into existing customer</p>
            <p className="text-xs text-muted-foreground mt-0.5">All calls and messages will move to the selected profile.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>
        <div className="px-5 py-3 border-b border-border">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name, phone, or email…"
              className="field-input w-full pl-8"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto divide-y divide-border">
          {filtered.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">No matching customers found</div>
          )}
          {filtered.map(c => (
            <button
              key={c.id}
              onClick={() => onMerge(c.id)}
              disabled={isPending}
              className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
            >
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User size={14} className="text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {[c.firstName, c.lastName].filter(Boolean).join(' ') || c.displayName || c.company || 'Unknown'}
                </p>
                <p className="text-xs text-muted-foreground truncate">{c.mobilePhone || c.email || ''}</p>
              </div>
            </button>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-border">
          <button onClick={onClose} className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main CustomerSection ────────────────────────────────────────────────────────────────
export default function CustomerSection() {
  const {
    state, setJobInfo, setCustomerProfile, addActivityEvent, setCustomerTab,
    addOpportunity, updateOpportunity, removeOpportunity, setPipelineArea,
    convertLeadToEstimate, convertEstimateToJob, archiveJob,
    setActiveOpportunity, setSection, setInboxCustomer, setInboxConversation,
    addCustomerAddress, updateCustomerAddress, removeCustomerAddress, setPrimaryAddress, setBillingAddress,
    updateCustomer: updateCustomerLocal,
    removeCustomer,
  } = useEstimator();
  const { jobInfo, customerProfile, activityFeed, activeCustomerTab, opportunities, activePipelineArea, activeCustomerId, customers } = state;
  const activeCustomer = customers.find(c => c.id === activeCustomerId);

  const [newTag, setNewTag] = useState('');
  const [editingContact, setEditingContact] = useState(false);
  // Intake modal state — opened from PipelineTab Add button
  const [intakeModal, setIntakeModal] = useState<'lead' | 'estimate' | 'job' | null>(null);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState<{ area: 'lead' | 'estimate' | 'job'; existing: string } | null>(null);
  // Local draft for contact info — prevents global dispatch on every keystroke
  const [contactDraft, setContactDraft] = useState<{
    client: string; companyName: string; phone: string; email: string;
    additionalPhones: { label: string; number: string }[];
    additionalEmails: { label: string; address: string }[];
  }>({ client: '', companyName: '', phone: '', email: '', additionalPhones: [], additionalEmails: [] });
  // Sync draft from global state when entering edit mode
  useEffect(() => {
    if (editingContact) {
      const safeParseArr = (v: unknown) => { try { const r = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(r) ? r : []; } catch { return []; } };
      setContactDraft({
        client: jobInfo.client, companyName: jobInfo.companyName, phone: jobInfo.phone, email: jobInfo.email,
        additionalPhones: safeParseArr((activeCustomer as any)?.additionalPhones),
        additionalEmails: safeParseArr((activeCustomer as any)?.additionalEmails),
      });
    }
  }, [editingContact]); // eslint-disable-line react-hooks/exhaustive-deps
  // Local draft for Job Details text fields — flush to global onBlur to avoid keystroke dispatches
  const [jobDetailsDraft, setJobDetailsDraft] = useState({ estimator: '', jobNumber: '', scope: '' });
  // Sync job details draft whenever the active opportunity changes or jobInfo changes externally
  const prevOpportunityId = useRef(state.activeOpportunityId);
  useEffect(() => {
    if (state.activeOpportunityId !== prevOpportunityId.current || !editingContact) {
      prevOpportunityId.current = state.activeOpportunityId;
      setJobDetailsDraft({ estimator: jobInfo.estimator, jobNumber: jobInfo.jobNumber, scope: jobInfo.scope });
    }
  }, [state.activeOpportunityId, jobInfo.estimator, jobInfo.jobNumber, jobInfo.scope, editingContact]); // eslint-disable-line react-hooks/exhaustive-deps
  const [newNote, setNewNote] = useState('');
  // Multi-address state
  const [addingAddress, setAddingAddress] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addrForm, setAddrForm] = useState({ label: 'Home', street: '', unit: '', city: 'Vancouver', state: 'WA', zip: '', lat: undefined as number | undefined, lng: undefined as number | undefined, propertyNotes: '' });
  const [addrLatLng, setAddrLatLng] = useState<{ lat?: number; lng?: number }>({}); // for map preview in form
  // Merge dialog state
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  // Stub merge dialog state (for unknown-caller auto-created customers)
  const [showStubMergeDialog, setShowStubMergeDialog] = useState(false);
  // Quick-action bar state
  const [showCallPanel, setShowCallPanel] = useState(false);
  const [quickAction, setQuickAction] = useState<'sms' | 'email' | 'note' | null>(null);
  const [quickActionBody, setQuickActionBody] = useState('');
  const [quickActionSubject, setQuickActionSubject] = useState('');
  const [quickActionSending, setQuickActionSending] = useState(false);
  const mergeStubMutation = trpc.customers.mergeStub.useMutation({
    onSuccess: (_data, vars) => {
      removeCustomer(vars.stubId);
      setShowStubMergeDialog(false);
      toast.success('Caller linked to customer profile');
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Derived ──
  // Prefer the customer record's name fields so DB-synced customers always show
  // the correct name, even when jobInfo.client hasn't been populated yet.
  const customerFullName = activeCustomer
    ? ([activeCustomer.firstName, activeCustomer.lastName].filter(Boolean).join(' ') ||
       activeCustomer.displayName ||
       activeCustomer.company ||
       '')
    : '';
  const displayName = customerFullName || jobInfo.client || 'New Customer';
  const areaMap: Record<CustomerProfileTab, PipelineArea | null> = {
    profile: null, properties: null, leads: 'lead', estimates: 'estimate', jobs: 'job',
    invoices: null, expenses: null, communication: null, attachments: null, notes: null, portal: null,
    membership360: null,
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

  // ── 360° latest scan (for health score badge in header) ──
  const { data: latestScan } = trpc.threeSixty.scansLatest.getLatestByCustomer.useQuery(
    { customerId: activeCustomerId! },
    { enabled: !!activeCustomerId }
  );

  // ── Unified feed (server-backed, replaces local activityFeed) ────────────
  const utils = trpc.useUtils();
  const { data: unifiedFeedData, isLoading: feedLoading } = trpc.inbox.unifiedFeed.getByCustomer.useQuery(
    { customerId: activeCustomerId! },
    { enabled: !!activeCustomerId, staleTime: 30_000 }
  );
  const unifiedFeed = unifiedFeedData?.feed ?? [];
  const feedConversationId = unifiedFeedData?.conversationId ?? null;
  const feedContactPhone = unifiedFeedData?.contactPhone ?? null;
  const feedContactEmail = unifiedFeedData?.contactEmail ?? null;
  // Unread count for the badge in the profile header
  const unreadBadgeCount = unifiedFeedData?.unreadCount ?? 0;

  // Auto-refresh unified feed on SSE new_message events
  useInboxSSE({
    onNewMessage: () => {
      if (activeCustomerId) utils.inbox.unifiedFeed.getByCustomer.invalidate({ customerId: activeCustomerId });
    },
    onPortalMessage: () => {
      if (activeCustomerId) utils.inbox.unifiedFeed.getByCustomer.invalidate({ customerId: activeCustomerId });
    },
  });

  // ── Quick-action mutations ────────────────────────────────────────────────
  const findOrCreateConvMutation = trpc.inbox.conversations.findOrCreateByCustomer.useMutation();
  const sendMessageMutation = trpc.inbox.messages.send.useMutation({
    onSuccess: () => {
      if (activeCustomerId) utils.inbox.unifiedFeed.getByCustomer.invalidate({ customerId: activeCustomerId });
      setQuickAction(null);
      setQuickActionBody('');
      setQuickActionSubject('');
      setQuickActionSending(false);
      toast.success('Message sent');
    },
    onError: (err) => { setQuickActionSending(false); toast.error(err.message); },
  });
  const sendSmsMutation = trpc.inbox.twilio.sendSms.useMutation({
    onSuccess: () => {
      if (activeCustomerId) utils.inbox.unifiedFeed.getByCustomer.invalidate({ customerId: activeCustomerId });
      setQuickAction(null);
      setQuickActionBody('');
      setQuickActionSending(false);
      toast.success('SMS sent');
    },
    onError: (err) => { setQuickActionSending(false); toast.error(err.message); },
  });
  const sendEmailMutation = trpc.gmail.sendEmail.useMutation({
    onSuccess: () => {
      if (activeCustomerId) utils.inbox.unifiedFeed.getByCustomer.invalidate({ customerId: activeCustomerId });
      setQuickAction(null);
      setQuickActionBody('');
      setQuickActionSubject('');
      setQuickActionSending(false);
      toast.success('Email sent');
    },
    onError: (err) => { setQuickActionSending(false); toast.error(err.message); },
  });

  const handleQuickSend = async () => {
    if (!quickAction || !quickActionBody.trim()) return;
    if (!activeCustomerId) { toast.error('No active customer'); return; }
    setQuickActionSending(true);
    try {
      // Ensure we have a conversation to post into
      const phone = activeCustomer?.mobilePhone ?? jobInfo.phone;
      const email = activeCustomer?.email ?? jobInfo.email;
      const name = customerFullName || jobInfo.client;
      let convId = feedConversationId;
      if (!convId) {
        const result = await findOrCreateConvMutation.mutateAsync({
          customerId: activeCustomerId,
          phone: phone || undefined,
          email: email || undefined,
          name: name || undefined,
          channel: quickAction === 'email' ? 'email' : quickAction === 'sms' ? 'sms' : 'note',
        });
        convId = result.conversationId;
      }
      if (!convId) { toast.error('Could not find or create conversation'); setQuickActionSending(false); return; }

      if (quickAction === 'sms') {
        if (!phone) { toast.error('No phone number on file'); setQuickActionSending(false); return; }
        await sendSmsMutation.mutateAsync({ conversationId: convId, to: phone, body: quickActionBody.trim() });
      } else if (quickAction === 'email') {
        if (!email) { toast.error('No email on file'); setQuickActionSending(false); return; }
        await sendEmailMutation.mutateAsync({ conversationId: convId, to: email, subject: quickActionSubject.trim() || `Message from Handy Pioneers`, body: quickActionBody.trim() });
      } else if (quickAction === 'note') {
        await sendMessageMutation.mutateAsync({ conversationId: convId, channel: 'note', body: quickActionBody.trim(), isInternal: true });
      }
    } catch {
      setQuickActionSending(false);
    }
  };

  // isSilentSaveRef: true = auto-save (no toast), false = manual save (shows toast)
  const isSilentSaveRef = useRef(false);
  const syncToDbMutation = trpc.customers.update.useMutation({
    onSuccess: (updated) => {
      if (updated && activeCustomerId) {
        updateCustomerLocal(activeCustomerId, {
          firstName: updated.firstName,
          lastName: updated.lastName,
          displayName: updated.displayName,
          company: updated.company,
          mobilePhone: updated.mobilePhone,
          homePhone: updated.homePhone,
          workPhone: updated.workPhone,
          email: updated.email,
          street: updated.street,
          unit: updated.unit,
          city: updated.city,
          state: updated.state,
          zip: updated.zip,
          tags: updated.tags ? JSON.parse(updated.tags as unknown as string) : [],
          leadSource: (updated.leadSource ?? '') as any,
          customerNotes: updated.customerNotes ?? '',
          sendNotifications: updated.sendNotifications,
          sendMarketingOptIn: updated.sendMarketingOptIn,
        });
      }
      if (!isSilentSaveRef.current) toast.success('Customer saved');
      isSilentSaveRef.current = false;
    },
    onError: (err) => { isSilentSaveRef.current = false; toast.error(`Save failed: ${err.message}`); },
  });
  const handleSyncToDb = () => {
    if (!activeCustomerId || !activeCustomer) { toast.error('No active customer'); return; }
    isSilentSaveRef.current = false;
    syncToDbMutation.mutate({
      id: activeCustomerId,
      firstName: activeCustomer.firstName || jobInfo.client.split(' ')[0] || '',
      lastName: activeCustomer.lastName || jobInfo.client.split(' ').slice(1).join(' ') || '',
      displayName: activeCustomer.displayName || jobInfo.client || '',
      company: activeCustomer.company || jobInfo.companyName || '',
      mobilePhone: activeCustomer.mobilePhone || jobInfo.phone || '',
      email: activeCustomer.email || jobInfo.email || '',
      street: activeCustomer.street || jobInfo.address || '',
      city: activeCustomer.city || jobInfo.city || '',
      state: activeCustomer.state || jobInfo.state || '',
      zip: activeCustomer.zip || jobInfo.zip || '',
      tags: activeCustomer.tags ?? customerProfile.tags ?? [],
      leadSource: (activeCustomer.leadSource || customerProfile.leadSource || '') as any,
      customerNotes: activeCustomer.customerNotes || '',
      sendNotifications: activeCustomer.sendNotifications ?? customerProfile.notificationsEnabled,
      sendMarketingOptIn: activeCustomer.sendMarketingOptIn ?? customerProfile.emailMarketingConsent,
    });
  };

  // ── Auto-save profile changes to DB (debounced 1.5s) ─────────────────────
  // Watches: tags, leadSource, customerNotes, sendNotifications, sendMarketingOptIn, defaultTaxCode
  // These are the fields that setCustomerProfile updates but don't have their own save button.
  // NOTE: tags is an array — we compare by JSON string to avoid infinite loops from new array
  // references created in onSuccess (JSON.parse always returns a new array ref).
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTagsKey = JSON.stringify(activeCustomer?.tags ?? []);
  const profileTagsKey = JSON.stringify(customerProfile.tags ?? []);
  useEffect(() => {
    if (!activeCustomerId || !activeCustomer) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      isSilentSaveRef.current = true;
      syncToDbMutation.mutate({
        id: activeCustomerId,
        firstName: activeCustomer.firstName || jobInfo.client.split(' ')[0] || '',
        lastName: activeCustomer.lastName || jobInfo.client.split(' ').slice(1).join(' ') || '',
        displayName: activeCustomer.displayName || jobInfo.client || '',
        company: activeCustomer.company || jobInfo.companyName || '',
        mobilePhone: activeCustomer.mobilePhone || jobInfo.phone || '',
        email: activeCustomer.email || jobInfo.email || '',
        street: activeCustomer.street || jobInfo.address || '',
        city: activeCustomer.city || jobInfo.city || '',
        state: activeCustomer.state || jobInfo.state || '',
        zip: activeCustomer.zip || jobInfo.zip || '',
        tags: activeCustomer.tags ?? customerProfile.tags ?? [],
        leadSource: (activeCustomer.leadSource || customerProfile.leadSource || '') as any,
        customerNotes: activeCustomer.customerNotes || customerProfile.privateNotes || '',
        sendNotifications: activeCustomer.sendNotifications ?? customerProfile.notificationsEnabled,
        sendMarketingOptIn: activeCustomer.sendMarketingOptIn ?? customerProfile.emailMarketingConsent,
        defaultTaxCode: customerProfile.defaultTaxCode,
      });
    }, 1500);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeCustomerId,
    activeTagsKey,
    activeCustomer?.leadSource,
    activeCustomer?.customerNotes,
    activeCustomer?.sendNotifications,
    activeCustomer?.sendMarketingOptIn,
    profileTagsKey,
    customerProfile.leadSource,
    customerProfile.privateNotes,
    customerProfile.notificationsEnabled,
    customerProfile.emailMarketingConsent,
    customerProfile.defaultTaxCode,
  ]);
  // ── Address DB mutations ──────────────────────────────────────────────────
  const addAddressMutation = trpc.customers.addAddress.useMutation({
    onError: (err) => toast.error(`Failed to add address: ${err.message}`),
  });
  const updateAddressMutation = trpc.customers.updateAddress.useMutation({
    onError: (err) => toast.error(`Failed to update address: ${err.message}`),
  });
  const removeAddressMutation = trpc.customers.removeAddress.useMutation({
    onError: (err) => toast.error(`Failed to remove address: ${err.message}`),
  });
  const setPrimaryAddressMutation = trpc.customers.setPrimaryAddress.useMutation({
    onError: (err) => toast.error(`Failed to set primary: ${err.message}`),
  });
  const setBillingAddressMutation = trpc.customers.setBillingAddress.useMutation({
    onError: (err) => toast.error(`Failed to set billing: ${err.message}`),
  });
  const createOpportunityMutation = trpc.opportunities.create.useMutation({
    onError: (err) => console.warn('[CustomerSection] DB opportunity create failed (local state preserved):', err.message),
  });

  // Wrapped address helpers that update both context and DB
  const handleAddAddress = (customerId: string, addr: Parameters<typeof addCustomerAddress>[1]) => {
    addCustomerAddress(customerId, addr);
    addAddressMutation.mutate({
      customerId,
      label: addr.label,
      street: addr.street,
      unit: addr.unit ?? '',
      city: addr.city,
      state: addr.state,
      zip: addr.zip,
      isPrimary: addr.isPrimary ?? false,
      isBilling: (addr as any).isBilling ?? false,
      propertyNotes: (addr as any).propertyNotes ?? '',
    });
  };
  const handleUpdateAddress = (customerId: string, addrId: string, patch: Parameters<typeof updateCustomerAddress>[2]) => {
    updateCustomerAddress(customerId, addrId, patch);
    updateAddressMutation.mutate({ id: addrId, ...patch } as any);
  };
  const handleRemoveAddress = (customerId: string, addrId: string) => {
    removeCustomerAddress(customerId, addrId);
    removeAddressMutation.mutate({ id: addrId });
  };
  const handleSetPrimary = (customerId: string, addrId: string) => {
    setPrimaryAddress(customerId, addrId);
    setPrimaryAddressMutation.mutate({ customerId, addressId: addrId });
  };
  const handleSetBilling = (customerId: string, addrId: string) => {
    setBillingAddress(customerId, addrId);
    setBillingAddressMutation.mutate({ customerId, addressId: addrId });
  };

  const inviteToPortalMutation = trpc.portal.inviteCustomerToPortal.useMutation({
    onSuccess: () => {
      setCustomerProfile({ portalInviteSent: true, portalInvitedAt: new Date().toISOString() });
      addActivityEvent({ type: 'note_added', title: 'Portal invite sent', description: `Invite sent to ${jobInfo.email}` });
      toast.success('Portal invite sent! Customer will receive a login email.');
    },
    onError: (err) => {
      toast.error(`Failed to send invite: ${err.message}`);
    },
  });

  const sendPortalInvite = () => {
    if (!jobInfo.email) { toast.error('Add an email address first'); return; }
    if (!jobInfo.client) { toast.error('Add a customer name first'); return; }
    inviteToPortalMutation.mutate({
      customerEmail: jobInfo.email,
      customerName: jobInfo.client,
      customerPhone: jobInfo.phone || undefined,
      hpCustomerId: activeCustomerId || undefined,
      origin: window.location.origin,
    });
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
                  <input type="text" value={contactDraft.client} onChange={e => setContactDraft(d => ({ ...d, client: e.target.value }))}
                    placeholder="Jane Smith" className="field-input w-full text-sm" />
                </div>
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">Company</label>
                  <input type="text" value={contactDraft.companyName} onChange={e => setContactDraft(d => ({ ...d, companyName: e.target.value }))}
                    placeholder="Acme Corp" className="field-input w-full text-sm" />
                </div>
                {/* Primary phone + additional phones */}
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">Primary Phone</label>
                  <input type="tel" value={contactDraft.phone} onChange={e => setContactDraft(d => ({ ...d, phone: e.target.value }))}
                    placeholder="(360) 555-0100" className="field-input w-full text-sm" />
                </div>
                {contactDraft.additionalPhones.map((p, i) => (
                  <div key={i} className="flex gap-1">
                    <input value={p.label} onChange={e => setContactDraft(d => ({ ...d, additionalPhones: d.additionalPhones.map((x, j) => j === i ? { ...x, label: e.target.value } : x) }))}
                      placeholder="Label" className="field-input text-xs w-20 shrink-0" />
                    <input type="tel" value={p.number} onChange={e => setContactDraft(d => ({ ...d, additionalPhones: d.additionalPhones.map((x, j) => j === i ? { ...x, number: e.target.value } : x) }))}
                      placeholder="(360) 555-0101" className="field-input text-xs flex-1" />
                    <button onClick={() => setContactDraft(d => ({ ...d, additionalPhones: d.additionalPhones.filter((_, j) => j !== i) }))} className="p-1 text-muted-foreground hover:text-destructive"><X size={12} /></button>
                  </div>
                ))}
                <button onClick={() => setContactDraft(d => ({ ...d, additionalPhones: [...d.additionalPhones, { label: 'Alt', number: '' }] }))}
                  className="text-[11px] text-primary hover:underline flex items-center gap-1"><Plus size={11} /> Add phone</button>

                {/* Primary email + additional emails */}
                <div>
                  <label className="block text-[10px] text-muted-foreground mb-1">Primary Email</label>
                  <input type="email" value={contactDraft.email} onChange={e => setContactDraft(d => ({ ...d, email: e.target.value }))}
                    placeholder="jane@example.com" className="field-input w-full text-sm" />
                </div>
                {contactDraft.additionalEmails.map((em, i) => (
                  <div key={i} className="flex gap-1">
                    <input value={em.label} onChange={e => setContactDraft(d => ({ ...d, additionalEmails: d.additionalEmails.map((x, j) => j === i ? { ...x, label: e.target.value } : x) }))}
                      placeholder="Label" className="field-input text-xs w-20 shrink-0" />
                    <input type="email" value={em.address} onChange={e => setContactDraft(d => ({ ...d, additionalEmails: d.additionalEmails.map((x, j) => j === i ? { ...x, address: e.target.value } : x) }))}
                      placeholder="alt@example.com" className="field-input text-xs flex-1" />
                    <button onClick={() => setContactDraft(d => ({ ...d, additionalEmails: d.additionalEmails.filter((_, j) => j !== i) }))} className="p-1 text-muted-foreground hover:text-destructive"><X size={12} /></button>
                  </div>
                ))}
                <button onClick={() => setContactDraft(d => ({ ...d, additionalEmails: [...d.additionalEmails, { label: 'Alt', address: '' }] }))}
                  className="text-[11px] text-primary hover:underline flex items-center gap-1"><Plus size={11} /> Add email</button>

                <button onClick={() => {
                  if (contactDraft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactDraft.email)) {
                    toast.error('Invalid email — check for missing @ or typos');
                    return;
                  }
                  setJobInfo(contactDraft);
                  // Persist additional phones/emails to DB
                  if (activeCustomerId) {
                    syncToDbMutation.mutate({
                      id: activeCustomerId,
                      firstName: activeCustomer?.firstName || contactDraft.client.split(' ')[0] || '',
                      lastName: activeCustomer?.lastName || contactDraft.client.split(' ').slice(1).join(' ') || '',
                      displayName: contactDraft.client,
                      company: contactDraft.companyName,
                      mobilePhone: contactDraft.phone,
                      email: contactDraft.email,
                      street: activeCustomer?.street || '',
                      city: activeCustomer?.city || '',
                      state: activeCustomer?.state || '',
                      zip: activeCustomer?.zip || '',
                      tags: activeCustomer?.tags ?? [],
                      leadSource: (activeCustomer?.leadSource || '') as any,
                      customerNotes: activeCustomer?.customerNotes || '',
                      sendNotifications: activeCustomer?.sendNotifications ?? true,
                      sendMarketingOptIn: activeCustomer?.sendMarketingOptIn ?? false,
                      additionalPhones: JSON.stringify(contactDraft.additionalPhones),
                      additionalEmails: JSON.stringify(contactDraft.additionalEmails),
                    });
                  }
                  setEditingContact(false);
                }}
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
                {/* Additional phones */}
                {((): { label: string; number: string }[] => { try { const v = (activeCustomer as any)?.additionalPhones; const r = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(r) ? r : []; } catch { return []; } })().filter(p => p.number).map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Phone size={13} className="text-muted-foreground shrink-0" />
                    <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded">{p.label}</span>
                    <a href={`tel:${p.number}`} className="text-primary hover:underline">{p.number}</a>
                  </div>
                ))}
                {jobInfo.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail size={13} className="text-muted-foreground shrink-0" />
                    <a href={`mailto:${jobInfo.email}`} className="text-primary hover:underline truncate">{jobInfo.email}</a>
                  </div>
                )}
                {/* Additional emails */}
                {((): { label: string; address: string }[] => { try { const v = (activeCustomer as any)?.additionalEmails; const r = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(r) ? r : []; } catch { return []; } })().filter(em => em.address).map((em, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Mail size={13} className="text-muted-foreground shrink-0" />
                    <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded">{em.label}</span>
                    <a href={`mailto:${em.address}`} className="text-primary hover:underline truncate">{em.address}</a>
                  </div>
                ))}
                {/* Customer portal invite */}
                <div className="pt-2 border-t border-border">
                  {customerProfile.portalInviteSent ? (
                    <div className="flex items-center gap-2 text-xs">
                      <div className="flex items-center gap-1.5 text-emerald-700">
                        <CheckCircle2 size={12} />
                        <span>Portal invite sent {customerProfile.portalInvitedAt ? fmtDate(customerProfile.portalInvitedAt) : ''}</span>
                      </div>
                      <button
                        onClick={sendPortalInvite}
                        disabled={inviteToPortalMutation.isPending}
                        className="text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {inviteToPortalMutation.isPending ? 'Sending…' : 'Resend'}
                      </button>
                    </div>
                  ) : (
                    <button onClick={sendPortalInvite}
                      disabled={inviteToPortalMutation.isPending}
                      className="flex items-center gap-1.5 text-xs text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed">
                      <ExternalLink size={12} />
                      {inviteToPortalMutation.isPending ? 'Sending invite…' : 'Invite to customer portal'}
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

        {/* Default Tax Rate */}
        <div className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <DollarSign size={13} />
            <span>Default Tax Rate</span>
          </div>
          <div className="card-section-body">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Tax jurisdiction for invoices</label>
              <select
                value={customerProfile.defaultTaxCode || '0603'}
                onChange={e => setCustomerProfile({ defaultTaxCode: e.target.value })}
                className="w-full px-2 py-1.5 text-xs border border-border rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
              >
                <option value="none">No Tax (0%)</option>
                <option value="0600">Clark County Unincorp. Areas (8.0%)</option>
                <option value="0666">Clark County Unincorp. PTBA (8.7%)</option>
                <option value="0601">Battle Ground (8.9%)</option>
                <option value="0602">Camas (8.8%)</option>
                <option value="0611">La Center (8.8%)</option>
                <option value="0604">Ridgefield (8.8%)</option>
                <option value="0603">Vancouver (8.9%) — Default</option>
                <option value="0605">Washougal (8.6%)</option>
                <option value="0607">Woodland (7.9%)</option>
                <option value="0606">Yacolt (8.5%)</option>
                <option value="custom">Custom rate…</option>
              </select>
              <p className="text-xs text-muted-foreground">Pre-fills the tax selector when creating invoices for this customer.</p>
            </div>
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
              <input type="text" value={jobDetailsDraft.estimator} onChange={e => setJobDetailsDraft(d => ({ ...d, estimator: e.target.value }))} onBlur={() => setJobInfo({ estimator: jobDetailsDraft.estimator })}
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
              <input type="text" value={jobDetailsDraft.jobNumber} onChange={e => setJobDetailsDraft(d => ({ ...d, jobNumber: e.target.value }))} onBlur={() => setJobInfo({ jobNumber: jobDetailsDraft.jobNumber })} className="field-input w-full" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Scope of Work</label>
              <textarea value={jobDetailsDraft.scope} onChange={e => setJobDetailsDraft(d => ({ ...d, scope: e.target.value }))} onBlur={() => setJobInfo({ scope: jobDetailsDraft.scope })}
                placeholder="e.g. Full trim package — install new baseboard, door casing, and window casing throughout main floor."
                rows={3} className="field-input w-full resize-none" />
            </div>
          </div>
        </div>
        )}

        {/* Addresses — multi-address */}
        <div className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <MapPin size={13} />
            <span>Addresses</span>
            <button
              onClick={() => { setAddingAddress(true); setEditingAddressId(null); setAddrForm({ label: 'Home', street: '', unit: '', city: 'Vancouver', state: 'WA', zip: '', lat: undefined, lng: undefined, propertyNotes: '' }); setAddrLatLng({}); }}
              className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
            >
              <Plus size={11} /> Add Address
            </button>
          </div>
          <div className="card-section-body space-y-4">
            {/* Existing addresses */}
            {(activeCustomer?.addresses ?? []).length === 0 && !addingAddress && (
              <p className="text-xs text-muted-foreground">No addresses on file.</p>
            )}
            {(activeCustomer?.addresses ?? []).map(addr => (
              <div key={addr.id} className="rounded-lg border border-border overflow-hidden">
                {/* Address row header */}
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border">
                  <span className="text-xs font-semibold text-foreground">{addr.label}</span>
                  {addr.isPrimary && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">Primary</span>
                  )}
                  {(addr as any).isBilling && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600">Billing</span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    {!addr.isPrimary && (
                      <button
                        onClick={() => activeCustomerId && handleSetPrimary(activeCustomerId, addr.id)}
                        className="text-[11px] text-muted-foreground hover:text-primary"
                      >Set Primary</button>
                    )}
                    {!addr.isBilling && (
                      <button
                        onClick={() => activeCustomerId && handleSetBilling(activeCustomerId, addr.id)}
                        className="text-[11px] text-muted-foreground hover:text-blue-500"
                      >Set Billing</button>
                    )}
                    <button
                      onClick={() => {
                        setEditingAddressId(addr.id);
                        setAddingAddress(false);
                        setAddrForm({ label: addr.label, street: addr.street, unit: addr.unit, city: addr.city, state: addr.state, zip: addr.zip, lat: addr.lat, lng: addr.lng, propertyNotes: (addr as any).propertyNotes ?? '' });
                        setAddrLatLng({ lat: addr.lat, lng: addr.lng });
                      }}
                      className="text-[11px] text-muted-foreground hover:text-foreground"
                    ><Edit3 size={11} /></button>
                    <button
                      onClick={() => activeCustomerId && handleRemoveAddress(activeCustomerId, addr.id)}
                      className="text-[11px] text-muted-foreground hover:text-destructive"
                    ><Trash2 size={11} /></button>
                  </div>
                </div>
                {/* Address details + map */}
                {editingAddressId === addr.id ? (
                  <div className="p-3 space-y-2">
                    <input value={addrForm.label} onChange={e => setAddrForm(f => ({ ...f, label: e.target.value }))} placeholder="Label (Home, Rental…)" className="field-input w-full text-xs" />
                    <AddressAutocomplete
                      value={addrForm.street}
                      onChange={v => setAddrForm(f => ({ ...f, street: v }))}
                      onAddressSelect={(p: ParsedAddress) => {
                        setAddrForm(f => ({ ...f, street: p.street, unit: p.unit || f.unit, city: p.city || f.city, state: p.state || f.state, zip: p.zip || f.zip, lat: p.lat, lng: p.lng }));
                        setAddrLatLng({ lat: p.lat, lng: p.lng });
                      }}
                      placeholder="Street"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <input value={addrForm.city} onChange={e => setAddrForm(f => ({ ...f, city: e.target.value }))} placeholder="City" className="field-input text-xs" />
                      <input value={addrForm.state} onChange={e => setAddrForm(f => ({ ...f, state: e.target.value }))} placeholder="State" className="field-input text-xs" />
                      <input value={addrForm.zip} onChange={e => setAddrForm(f => ({ ...f, zip: e.target.value }))} placeholder="Zip" className="field-input text-xs" />
                    </div>
                    {addrForm.street && <AddressMapPreview street={addrForm.street} city={addrForm.city} state={addrForm.state} zip={addrForm.zip} lat={addrLatLng.lat} lng={addrLatLng.lng} height="120px" showLink={false} />}
                    <textarea value={(addrForm as any).propertyNotes ?? ''} onChange={e => setAddrForm(f => ({ ...f, propertyNotes: e.target.value }))} placeholder="Property notes (gate code, parking, access instructions…)" rows={2} className="field-input w-full text-xs resize-none" />
                    <div className="flex gap-2">
                      <button onClick={() => {
                        if (!activeCustomerId) return;
                        handleUpdateAddress(activeCustomerId, addr.id, { label: addrForm.label, street: addrForm.street, unit: addrForm.unit, city: addrForm.city, state: addrForm.state, zip: addrForm.zip, lat: addrForm.lat, lng: addrForm.lng, propertyNotes: addrForm.propertyNotes });
                        // Sync jobInfo if this is primary
                        if (addr.isPrimary) setJobInfo({ address: addrForm.street, city: addrForm.city, state: addrForm.state, zip: addrForm.zip });
                        setEditingAddressId(null);
                      }} className="flex-1 text-xs bg-primary text-primary-foreground rounded px-2 py-1.5">Save</button>
                      <button onClick={() => setEditingAddressId(null)} className="text-xs text-muted-foreground hover:text-foreground px-2">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 space-y-2">
                    <div className="text-sm">
                      {[addr.street, addr.unit].filter(Boolean).join(' ')}
                      {(addr.city || addr.state || addr.zip) && <div className="text-xs text-muted-foreground">{[addr.city, addr.state, addr.zip].filter(Boolean).join(', ')}</div>}
                    </div>
                    <AddressMapPreview street={addr.street} city={addr.city} state={addr.state} zip={addr.zip} lat={addr.lat} lng={addr.lng} height="140px" showLink />
                  </div>
                )}
              </div>
            ))}

            {/* Add address form */}
            {addingAddress && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="text-xs font-semibold text-foreground mb-1">New Address</div>
                <input value={addrForm.label} onChange={e => setAddrForm(f => ({ ...f, label: e.target.value }))} placeholder="Label (Home, Rental, Office…)" className="field-input w-full text-xs" />
                <AddressAutocomplete
                  value={addrForm.street}
                  onChange={v => setAddrForm(f => ({ ...f, street: v }))}
                  onAddressSelect={(p: ParsedAddress) => {
                    setAddrForm(f => ({ ...f, street: p.street, unit: p.unit || f.unit, city: p.city || f.city, state: p.state || f.state, zip: p.zip || f.zip, lat: p.lat, lng: p.lng }));
                    setAddrLatLng({ lat: p.lat, lng: p.lng });
                  }}
                  placeholder="Street"
                />
                <div className="grid grid-cols-3 gap-2">
                  <input value={addrForm.city} onChange={e => setAddrForm(f => ({ ...f, city: e.target.value }))} placeholder="City" className="field-input text-xs" />
                  <input value={addrForm.state} onChange={e => setAddrForm(f => ({ ...f, state: e.target.value }))} placeholder="State" className="field-input text-xs" />
                  <input value={addrForm.zip} onChange={e => setAddrForm(f => ({ ...f, zip: e.target.value }))} placeholder="Zip" className="field-input text-xs" />
                </div>
                {addrForm.street && <AddressMapPreview street={addrForm.street} city={addrForm.city} state={addrForm.state} zip={addrForm.zip} lat={addrLatLng.lat} lng={addrLatLng.lng} height="120px" showLink={false} />}
                <textarea value={(addrForm as any).propertyNotes ?? ''} onChange={e => setAddrForm(f => ({ ...f, propertyNotes: e.target.value }))} placeholder="Property notes (gate code, parking, access instructions…)" rows={2} className="field-input w-full text-xs resize-none" />
                <div className="flex gap-2">
                  <button onClick={() => {
                    if (!activeCustomerId || !addrForm.street) { toast.error('Street is required'); return; }
                    const isFirst = (activeCustomer?.addresses ?? []).length === 0;
                    handleAddAddress(activeCustomerId, { id: nanoid(), label: addrForm.label || 'Home', street: addrForm.street, unit: addrForm.unit, city: addrForm.city, state: addrForm.state, zip: addrForm.zip, isPrimary: isFirst, lat: addrForm.lat, lng: addrForm.lng, propertyNotes: (addrForm as any).propertyNotes });
                    if (isFirst) setJobInfo({ address: addrForm.street, city: addrForm.city, state: addrForm.state, zip: addrForm.zip });
                    setAddingAddress(false);
                  }} className="flex-1 text-xs bg-primary text-primary-foreground rounded px-2 py-1.5">Add Address</button>
                  <button onClick={() => setAddingAddress(false)} className="text-xs text-muted-foreground hover:text-foreground px-2">Cancel</button>
                </div>
              </div>
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

        {/* Activity Feed — server-backed unified feed */}
        <div className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <Activity size={13} />
            <span>Activity Feed</span>
            <span className="ml-auto text-[10px] text-muted-foreground font-normal">All channels — live</span>
          </div>
          <div className="card-section-body space-y-3">
            {/* Quick note shortcut */}
            <div className="flex gap-2">
              <button
                onClick={() => { setQuickAction('note'); setShowCallPanel(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="flex-1 text-left field-input text-sm text-muted-foreground hover:text-foreground cursor-text"
              >
                Add an internal note…
              </button>
              <button
                onClick={() => { setQuickAction('sms'); setShowCallPanel(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="px-3 py-2 border border-border rounded-lg text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                title="Send SMS"
              ><MessageSquare size={13} /></button>
              <button
                onClick={() => { setQuickAction('email'); setShowCallPanel(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="px-3 py-2 border border-border rounded-lg text-xs text-muted-foreground hover:border-sky-500 hover:text-sky-600 transition-colors"
                title="Send Email"
              ><Mail size={13} /></button>
              <button
                onClick={() => { setShowCallPanel(true); setQuickAction(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="px-3 py-2 border border-border rounded-lg text-xs text-muted-foreground hover:border-emerald-500 hover:text-emerald-600 transition-colors"
                title="Call"
              ><Phone size={13} /></button>
            </div>

            {/* Feed — shared CustomerActivityFeed component */}
            {activeCustomerId && (
              <CustomerActivityFeed customerId={activeCustomerId} />
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // ── Pipeline tab content ──
  // Build prefill object from the active customer for intake modals
  const intakePrefill = activeCustomer ? {
    id: activeCustomer.id,
    displayName: customerFullName || activeCustomer.displayName,
    phone: activeCustomer.mobilePhone || activeCustomer.homePhone || activeCustomer.workPhone,
    email: activeCustomer.email,
    address: activeCustomer.street,
    city: activeCustomer.city,
    state: activeCustomer.state,
    zip: activeCustomer.zip,
  } : undefined;

  const PipelineTab = () => {
    const area = areaMap[activeCustomerTab] as PipelineArea;
    const areaStages: OpportunityStage[] =
      area === 'lead' ? LEAD_STAGES :
      area === 'estimate' ? ESTIMATE_STAGES :
      JOB_STAGES;
    const areaOpps = opportunities.filter(o => o.area === area);
    return (
      <PipelineBoard
        area={area}
        stages={areaStages}
        opportunities={areaOpps}
        onAdd={(title, stage, value, notes) => {
          addOpportunity({ area, stage, title, value, notes, archived: false });
          if (activeCustomerId) {
            createOpportunityMutation.mutate({ customerId: activeCustomerId, area, stage, title, value, notes, archived: false });
          }
        }}
        onUpdate={updateOpportunity}
        onRemove={removeOpportunity}
        onConvertToEstimate={area === 'lead' ? convertLeadToEstimate : undefined}
        onConvertToJob={area === 'estimate' ? convertEstimateToJob : undefined}
        onArchive={area === 'job' ? archiveJob : undefined}
        onOpen={(id) => {
          setActiveOpportunity(id);
          setSection('opp-details');
        }}
        customerName={displayName}
        onOpenIntakeModal={() => {
          const targetArea = area === 'lead' ? 'lead' : area === 'estimate' ? 'estimate' : 'job';
          // Check for existing open (non-archived) opportunities in this area for this customer
          const existing = opportunities.find(o =>
            o.area === targetArea &&
            !o.archived &&
            (o.clientSnapshot?.client === (customerFullName || activeCustomer?.displayName) ||
             (activeCustomer && o.clientSnapshot?.client === (activeCustomer.displayName || [activeCustomer.firstName, activeCustomer.lastName].filter(Boolean).join(' '))))
          );
          if (existing) {
            setShowDuplicateWarning({ area: targetArea, existing: existing.title });
          } else {
            setIntakeModal(targetArea);
          }
        }}
        compact
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

  // (CommunicationTab and CustomerAttachmentsTab are defined as top-level components below CustomerSection)

  return (
    <>
    <div className="space-y-0">

      {/* ── Customer Header ── */}
      <div className="bg-white border-b border-border px-4 py-4">
        <div className="max-w-6xl mx-auto">
          {/* Breadcrumb */}
          <div className="text-xs text-muted-foreground mb-1">
            Customers / <span className="text-foreground">{displayName}</span>
          </div>
          {/* Name + actions */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">{displayName}</h1>
              {/* Unread badge */}
              {unreadBadgeCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none" title={`${unreadBadgeCount} unread message${unreadBadgeCount > 1 ? 's' : ''}`}>
                  {unreadBadgeCount > 99 ? '99+' : unreadBadgeCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {/* 360° Health Score badge */}
              {latestScan && latestScan.healthScore !== null && (
                <div
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
                  style={{
                    background: (latestScan.healthScore ?? 0) >= 75 ? '#f0fdf4' : (latestScan.healthScore ?? 0) >= 50 ? '#fffbeb' : '#fef2f2',
                    borderColor: (latestScan.healthScore ?? 0) >= 75 ? '#bbf7d0' : (latestScan.healthScore ?? 0) >= 50 ? '#fde68a' : '#fecaca',
                    color: (latestScan.healthScore ?? 0) >= 75 ? '#166534' : (latestScan.healthScore ?? 0) >= 50 ? '#92400e' : '#991b1b',
                  }}
                  title={`360° Home Health — Last scan: ${latestScan.scanDate ? new Date(latestScan.scanDate).toLocaleDateString() : 'N/A'}`}
                >
                  <Star size={12} />
                  <span>360° {latestScan.healthScore}/100</span>
                </div>
              )}
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
              {/* Quick-action buttons */}
              <button
                onClick={() => { setQuickAction(q => q === 'sms' ? null : 'sms'); setShowCallPanel(false); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                  quickAction === 'sms' ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary hover:text-primary'
                }`}
                title="Send SMS"
              >
                <MessageSquare size={13} />
                <span className="hidden sm:inline">SMS</span>
              </button>
              <button
                onClick={() => { setQuickAction(q => q === 'email' ? null : 'email'); setShowCallPanel(false); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                  quickAction === 'email' ? 'bg-sky-600 text-white border-sky-600' : 'border-border text-muted-foreground hover:border-sky-500 hover:text-sky-600'
                }`}
                title="Send Email"
              >
                <Mail size={13} />
                <span className="hidden sm:inline">Email</span>
              </button>
              <button
                onClick={() => { setQuickAction(q => q === 'note' ? null : 'note'); setShowCallPanel(false); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                  quickAction === 'note' ? 'bg-amber-500 text-white border-amber-500' : 'border-border text-muted-foreground hover:border-amber-500 hover:text-amber-600'
                }`}
                title="Add internal note"
              >
                <StickyNote size={13} />
                <span className="hidden sm:inline">Note</span>
              </button>
              {/* Call button — opens in-app VoiceCallPanel */}
              <button
                onClick={() => { setShowCallPanel(v => !v); setQuickAction(null); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  showCallPanel ? 'bg-emerald-600 text-white' : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
                title="In-app call"
              >
                <PhoneCall size={13} />
                <span className="hidden sm:inline">Call</span>
              </button>
              {/* Merge button */}
              {activeCustomerId && (
                <button
                  onClick={() => setShowMergeDialog(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  title="Merge this customer with another"
                >
                  <GitMerge size={13} />
                  <span className="hidden sm:inline">Merge</span>
                </button>
              )}
              {/* Sync to DB button */}
              {activeCustomerId && (
                <button
                  onClick={handleSyncToDb}
                  disabled={syncToDbMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                  title="Save current customer data to the database"
                >
                  <Save size={13} />
                  <span className="hidden sm:inline">{syncToDbMutation.isPending ? 'Saving…' : 'Save'}</span>
                </button>
              )}
            </div>
          </div>
          {/* Sub-info */}
          {(() => {
            const addrs: any[] = (activeCustomer as any)?.addresses ?? [];
            const billingAddr = addrs.find(a => a.isBilling) ?? addrs.find(a => a.isPrimary) ?? addrs[0];
            const addrStr = billingAddr ? [billingAddr.street, billingAddr.city].filter(Boolean).join(', ') : (jobInfo.address ? `${jobInfo.address}${jobInfo.city ? `, ${jobInfo.city}` : ''}` : null);
            return (
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
                {jobInfo.companyName && <span className="flex items-center gap-1"><Building2 size={11} />{jobInfo.companyName}</span>}
                {jobInfo.phone && <span className="flex items-center gap-1"><Phone size={11} />{jobInfo.phone}</span>}
                {jobInfo.email && <span className="flex items-center gap-1"><Mail size={11} />{jobInfo.email}</span>}
                {addrStr && (
                  <span className="flex items-center gap-1">
                    <MapPin size={11} />{addrStr}
                    {billingAddr?.isBilling && <span className="text-[9px] font-semibold px-1 py-0.5 rounded bg-blue-500/10 text-blue-600">Billing</span>}
                  </span>
                )}
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── Inline Quick-Action Compose Panel ── */}
      {(quickAction || showCallPanel) && (
        <div className="bg-muted/30 border-b border-border px-4 py-3">
          <div className="max-w-6xl mx-auto">
            {showCallPanel && (
              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <PhoneCall size={12} /> In-Browser Call — {customerFullName || jobInfo.client}
                  </span>
                  <button onClick={() => setShowCallPanel(false)} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
                </div>
                <div className="p-4">
                  <VoiceCallPanel
                    toNumber={activeCustomer?.mobilePhone ?? jobInfo.phone}
                    toName={customerFullName || jobInfo.client}
                    onCallEnd={() => {
                      setShowCallPanel(false);
                      if (activeCustomerId) utils.inbox.unifiedFeed.getByCustomer.invalidate({ customerId: activeCustomerId });
                    }}
                  />
                </div>
              </div>
            )}
            {quickAction && (
              <div className="rounded-xl border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    {quickAction === 'sms' && <><MessageSquare size={12} /> New SMS to {activeCustomer?.mobilePhone || jobInfo.phone || 'customer'}</>}
                    {quickAction === 'email' && <><Mail size={12} /> New Email to {activeCustomer?.email || jobInfo.email || 'customer'}</>}
                    {quickAction === 'note' && <><StickyNote size={12} /> Add Internal Note</>}
                  </span>
                  <button onClick={() => { setQuickAction(null); setQuickActionBody(''); setQuickActionSubject(''); }} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
                </div>
                <div className="p-4 space-y-2">
                  {quickAction === 'email' && (
                    <input
                      type="text"
                      value={quickActionSubject}
                      onChange={e => setQuickActionSubject(e.target.value)}
                      placeholder="Subject…"
                      className="field-input w-full text-sm"
                    />
                  )}
                  <textarea
                    value={quickActionBody}
                    onChange={e => setQuickActionBody(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleQuickSend(); }}
                    placeholder={
                      quickAction === 'sms' ? 'Type your SMS message… (Ctrl+Enter to send)' :
                      quickAction === 'email' ? 'Type your email body… (Ctrl+Enter to send)' :
                      'Add an internal note… (Ctrl+Enter to save)'
                    }
                    rows={3}
                    className="field-input w-full resize-none text-sm"
                    autoFocus
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {quickAction === 'note' ? 'Internal only — not visible to customer' : 'Ctrl+Enter to send'}
                    </span>
                    <button
                      onClick={handleQuickSend}
                      disabled={quickActionSending || !quickActionBody.trim()}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {quickActionSending ? 'Sending…' : quickAction === 'note' ? 'Save Note' : 'Send'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Stub Merge Banner ── */}
      {activeCustomer?.leadSource === 'inbound_call' && !activeCustomer?.firstName && !activeCustomer?.email && activeCustomerId && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <PhoneCall size={14} className="shrink-0 text-amber-600" />
            <span><strong>Unknown caller</strong> — identify this caller and merge their history into the correct customer profile.</span>
          </div>
          <button
            onClick={() => setShowStubMergeDialog(true)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-semibold hover:bg-amber-700 transition-colors"
          >
            <GitMerge size={12} />
            Merge into customer
          </button>
        </div>
      )}

      {/* ── Tab Nav ── */}
      <div className="bg-white border-b border-border sticky top-[var(--header-h,112px)] z-10">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex overflow-x-auto scrollbar-hide -mb-px gap-0">
            {CUSTOMER_TABS.map(tab => {
              const count = tab.key === 'leads' ? opportunities.filter(o => o.area === 'lead' && !o.archived).length
                : tab.key === 'estimates' ? opportunities.filter(o => o.area === 'estimate' && !o.archived).length
                : tab.key === 'jobs' ? opportunities.filter(o => o.area === 'job' && !o.archived).length
                : 0;
              return (
                <button
                  key={tab.key}
                  data-tab={tab.key}
                  onClick={() => handleTabClick(tab.key)}
                  className={`shrink-0 flex items-center gap-1 px-3 sm:px-4 py-3 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                    activeCustomerTab === tab.key
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  }`}
                >
                  <span className="hidden sm:inline-flex">{tab.icon}</span>
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
        {activeCustomerTab === 'profile' && ProfileTab()}
        {activeCustomerTab === 'properties' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold">Properties</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Each property can have its own 360° membership, jobs, invoices, and expenses.
                </p>
              </div>
            </div>
            <PropertySelectorGrid
              customerId={activeCustomerId ?? ''}
              activePropertyId={null}
              onSelectProperty={(prop) => {
                toast.success(`Viewing ${prop.label} — ${prop.street || prop.city || 'property'}`);
              }}
              customerAddress={{
                street: activeCustomer?.street ?? (jobInfo as any).street ?? '',
                unit: activeCustomer?.unit ?? (jobInfo as any).unit ?? '',
                city: activeCustomer?.city ?? jobInfo.city ?? '',
                state: activeCustomer?.state ?? jobInfo.state ?? '',
                zip: activeCustomer?.zip ?? jobInfo.zip ?? '',
                addressNotes: activeCustomer?.addressNotes,
              }}
            />
          </div>
        )}
        {(activeCustomerTab === 'leads' || activeCustomerTab === 'estimates' || activeCustomerTab === 'jobs') && PipelineTab()}
        {activeCustomerTab === 'invoices' && <InvoiceSection />}
        {activeCustomerTab === 'expenses' && (
          <CustomerExpensesTab
            customerId={activeCustomerId ?? ''}
            opportunityOptions={opportunities
              .filter(o => o.area === 'job' && !o.archived)
              .map(o => ({ id: o.id, title: o.title || o.coNumber || o.id }))}
          />
        )}
        {activeCustomerTab === 'communication' && (
          <CommunicationTab
            customerId={activeCustomerId ?? ''}
            customerPhone={activeCustomer?.mobilePhone ?? jobInfo.phone}
            customerEmail={activeCustomer?.email ?? jobInfo.email}
            customerName={activeCustomer?.displayName ?? jobInfo.client}
            onOpenInbox={() => { setInboxCustomer(activeCustomerId); setSection('inbox' as any); }}
            onOpenInboxWithConversation={(conversationId, channel) => {
              setInboxConversation(conversationId, channel);
              setInboxCustomer(activeCustomerId);
              setSection('inbox' as any);
            }}
            onOpenInboxPortal={() => {
              setInboxCustomer(activeCustomerId);
              setSection('inbox' as any);
            }}
          />
        )}
        {activeCustomerTab === 'attachments' && (
          <CustomerAttachmentsTab customerId={activeCustomerId ?? ''} />
        )}
        {activeCustomerTab === 'portal' && (
          <CustomerPortalTab customerId={activeCustomerId ?? ''} />
        )}
        {activeCustomerTab === 'membership360' && (
          <CustomerMembershipPanel customerId={activeCustomerId ?? ''} />
        )}
        {(activeCustomerTab as any) === 'attachments_LEGACY_UNUSED' && (
          <div className="space-y-4">
            {/* Signed Estimate Copies */}
            {(() => {
              const signedEstimates = opportunities.filter(
                o => o.area === 'estimate' && (o.wonAt || o.signedEstimateDataUrl)
              );
              if (signedEstimates.length === 0) {
                return (
                  <div className="text-center py-16 text-muted-foreground border-2 border-dashed border-border rounded-xl">
                    <Paperclip className="w-8 h-8 mx-auto mb-3 opacity-30" />
                    <div className="text-base font-semibold mb-1">No Attachments Yet</div>
                    <div className="text-sm">Signed estimate copies will appear here once an estimate is approved.</div>
                  </div>
                );
              }
              return (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Signed Estimates</h3>
                  {signedEstimates.map(est => (
                    <div key={est.id} className="rounded-xl border bg-card p-4 flex items-start gap-4">
                      {/* Thumbnail or icon */}
                      <div className="w-12 h-14 rounded border bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                        {est.signedEstimateDataUrl ? (
                          <img src={est.signedEstimateDataUrl} alt="Signed estimate" className="w-full h-full object-cover" />
                        ) : (
                          <FileText className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm truncate">{est.signedEstimateFilename ?? `Estimate-${est.id}-Signed.pdf`}</span>
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 text-xs">Approved</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Signed {est.wonAt ? new Date(est.wonAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'recently'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Contract value: {est.value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })}
                        </p>
                      </div>
                      {est.signedEstimateDataUrl && (
                        <button
                          type="button"
                          className="shrink-0 text-xs text-primary hover:underline flex items-center gap-1"
                          onClick={async () => {
                            try {
                              const { jsPDF } = await import('jspdf');
                              const img = new Image();
                              img.src = est.signedEstimateDataUrl!;
                              await new Promise<void>((res, rej) => {
                                img.onload = () => res();
                                img.onerror = rej;
                              });
                              const imgW = img.naturalWidth || 1240;
                              const imgH = img.naturalHeight || 1754;
                              // Fit image to A4 page (210 x 297 mm)
                              const pageW = 210;
                              const pageH = 297;
                              const ratio = Math.min(pageW / imgW, pageH / imgH);
                              const drawW = imgW * ratio;
                              const drawH = imgH * ratio;
                              const offsetX = (pageW - drawW) / 2;
                              const offsetY = (pageH - drawH) / 2;
                              const orientation = drawH > drawW ? 'portrait' : 'landscape';
                              const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
                              pdf.addImage(est.signedEstimateDataUrl!, 'PNG', offsetX, offsetY, drawW, drawH);
                              const base = (est.signedEstimateFilename ?? `Estimate-${est.id}-Signed`).replace(/\.png$/i, '');
                              pdf.save(base + '.pdf');
                            } catch (err) {
                              console.error('PDF generation failed', err);
                              toast.error('Could not generate PDF');
                            }
                          }}
                        >
                          <Download className="w-3.5 h-3.5" /> Download PDF
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
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
    </div>

    {/* ── Intake modals opened from customer profile Add button ── */}
    {intakeModal === 'lead' && intakePrefill && (
      <NewLeadModal
        onClose={() => setIntakeModal(null)}
        prefill={intakePrefill}
        onSaved={(oppId) => { setIntakeModal(null); setActiveOpportunity(oppId); setSection('opp-details'); }}
      />
    )}
    {intakeModal === 'estimate' && intakePrefill && (
      <NewEstimateModal
        onClose={() => setIntakeModal(null)}
        prefill={intakePrefill}
        onSaved={(oppId) => { setIntakeModal(null); setActiveOpportunity(oppId); setSection('opp-details'); }}
      />
    )}
    {intakeModal === 'job' && intakePrefill && (
      <NewJobModal
        onClose={() => setIntakeModal(null)}
        prefill={intakePrefill}
        onSaved={(oppId) => { setIntakeModal(null); setActiveOpportunity(oppId); setSection('opp-details'); }}
      />
    )}

    {/* Manual Merge Dialog — two-step: pick customer, then compare & confirm */}
    {showMergeDialog && activeCustomer && (
      <ManualMergeFlow
        currentCustomer={activeCustomer}
        allCustomers={customers.filter(c => c.id !== activeCustomerId && !(c as any).mergedIntoId)}
        onClose={() => setShowMergeDialog(false)}
        onMerged={(sourceId, targetId) => {
          removeCustomer(sourceId);
          setShowMergeDialog(false);
        }}
      />
    )}

    {/* Stub Merge Dialog — pick a real customer to absorb this unknown-caller stub */}
    {showStubMergeDialog && activeCustomerId && (
      <StubMergeDialog
        stubId={activeCustomerId}
        customers={customers}
        onClose={() => setShowStubMergeDialog(false)}
        onMerge={(targetId) => mergeStubMutation.mutate({ stubId: activeCustomerId, targetId })}
        isPending={mergeStubMutation.isPending}
      />
    )}

    {/* Duplicate opportunity warning */}
    {showDuplicateWarning && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-background border border-border rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
              <span className="text-amber-600 text-lg">⚠</span>
            </div>
            <div>
              <p className="font-semibold text-foreground">Existing {showDuplicateWarning.area} found</p>
              <p className="text-sm text-muted-foreground mt-1">
                <span className="font-medium text-foreground">&ldquo;{showDuplicateWarning.existing}&rdquo;</span> is already open for this customer. Create another anyway?
              </p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowDuplicateWarning(null)}
              className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const area = showDuplicateWarning.area;
                setShowDuplicateWarning(null);
                setIntakeModal(area);
              }}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Create Anyway
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ─── Top-level tab components (must NOT be defined inside CustomerSection) ────
// These use hooks (useQuery, useMutation, useRef) so React requires them to be
// stable function references — i.e., defined at module scope, not inside a render.

function CommunicationTab({
  customerId,
  customerPhone,
  customerEmail,
  customerName,
  onOpenInbox,
  onOpenInboxWithConversation,
  onOpenInboxPortal,
}: {
  customerId: string;
  customerPhone?: string;
  customerEmail?: string;
  customerName?: string;
  onOpenInbox: () => void;
  onOpenInboxWithConversation: (conversationId: number, channel: 'sms' | 'email' | 'note') => void;
  onOpenInboxPortal: () => void;
}) {
  const [showCall, setShowCall] = useState(false);
  const findOrCreate = trpc.inbox.conversations.findOrCreateByCustomer.useMutation();

  const { data: convos, isLoading } = trpc.inbox.conversations.listByCustomer.useQuery(
    { customerId },
    { enabled: !!customerId }
  );

  const handleSms = async () => {
    if (!customerPhone) { toast.error('No phone number on file for this customer'); return; }
    try {
      const { conversationId } = await findOrCreate.mutateAsync({
        customerId,
        phone: customerPhone,
        email: customerEmail,
        name: customerName,
        channel: 'sms',
      });
      onOpenInboxWithConversation(conversationId, 'sms');
    } catch { toast.error('Could not open SMS thread'); }
  };

  const handleEmail = async () => {
    if (!customerEmail) { toast.error('No email address on file for this customer'); return; }
    try {
      const { conversationId } = await findOrCreate.mutateAsync({
        customerId,
        phone: customerPhone,
        email: customerEmail,
        name: customerName,
        channel: 'email',
      });
      onOpenInboxWithConversation(conversationId, 'email');
    } catch { toast.error('Could not open email thread'); }
  };

  const handlePortalChat = () => {
    onOpenInboxPortal();
  };

  const handleCall = () => {
    if (!customerPhone) { toast.error('No phone number on file for this customer'); return; }
    setShowCall(true);
  };

  return (
    <div className="space-y-5">
      {/* ── Action Bar ── */}
      <div className="rounded-xl border bg-card p-4">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Reach Out</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={handleSms}
            disabled={findOrCreate.isPending}
            className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-background hover:bg-muted/60 active:scale-95 transition-all py-3 px-2 disabled:opacity-50"
          >
            <MessageSquare size={18} className="text-primary" />
            <span className="text-xs font-medium">SMS</span>
          </button>
          <button
            type="button"
            onClick={handleEmail}
            disabled={findOrCreate.isPending}
            className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-background hover:bg-muted/60 active:scale-95 transition-all py-3 px-2 disabled:opacity-50"
          >
            <Mail size={18} className="text-sky-500" />
            <span className="text-xs font-medium">Email</span>
          </button>
          <button
            type="button"
            onClick={handlePortalChat}
            className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-background hover:bg-muted/60 active:scale-95 transition-all py-3 px-2"
          >
            <AtSign size={18} className="text-violet-500" />
            <span className="text-xs font-medium">Portal Chat</span>
          </button>
          <button
            type="button"
            onClick={handleCall}
            className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-background hover:bg-muted/60 active:scale-95 transition-all py-3 px-2"
          >
            <Phone size={18} className="text-emerald-500" />
            <span className="text-xs font-medium">Call</span>
          </button>
        </div>
        {customerPhone && (
          <p className="text-xs text-muted-foreground mt-2 text-center">{customerPhone}</p>
        )}
      </div>

      {/* ── Inline Voice Call Panel ── */}
      {showCall && customerPhone && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">In-Browser Call</span>
            <button type="button" onClick={() => setShowCall(false)} className="text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          </div>
          <div className="p-4">
            <VoiceCallPanel
              toNumber={customerPhone}
              toName={customerName}
              onCallEnd={() => setShowCall(false)}
            />
          </div>
        </div>
      )}

      {/* ── Conversations List ── */}
      {isLoading ? (
        <div className="py-8 text-center text-muted-foreground text-sm">Loading conversations...</div>
      ) : !convos || convos.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-border rounded-xl">
          <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <div className="text-base font-semibold mb-1">No Conversations Yet</div>
          <div className="text-sm">Use the buttons above to start a conversation.</div>
        </div>
      ) : (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Conversations</h3>
          {convos.map(conv => (
            <div key={conv.id} className="rounded-xl border bg-card p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <MessageSquare size={15} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{conv.contactName ?? conv.contactPhone ?? conv.contactEmail ?? 'Unknown'}</span>
                  {conv.channels && <Badge variant="outline" className="text-xs capitalize">{conv.channels}</Badge>}
                  {(conv.unreadCount ?? 0) > 0 && (
                    <Badge className="bg-primary text-primary-foreground text-xs">{conv.unreadCount} unread</Badge>
                  )}
                </div>
                {conv.lastMessagePreview && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{conv.lastMessagePreview}</p>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">
                  {conv.lastMessageAt ? new Date(conv.lastMessageAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'No messages'}
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 text-xs text-primary hover:underline"
                onClick={() => {
                  if (conv.id) onOpenInboxWithConversation(conv.id, (conv.channels as 'sms' | 'email' | 'note') ?? 'sms');
                  else onOpenInbox();
                }}
              >
                Open
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomerAttachmentsTab({ customerId }: { customerId: string }) {
  const attachFileRef = useRef<HTMLInputElement>(null);
  const { state, addCustomerAttachment, removeCustomerAttachment } = useEstimator();
  const uploadFile = trpc.uploads.uploadFile.useMutation();
  const customer = state.customers.find(c => c.id === customerId);
  const files = customer?.attachments ?? [];

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (attachFileRef.current) attachFileRef.current.value = '';
    for (const file of picked) {
      if (file.size > 16 * 1024 * 1024) { toast.error(`"${file.name}" exceeds 16 MB`); continue; }
      try {
        const base64 = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = ev => res(ev.target?.result as string);
          r.onerror = rej;
          r.readAsDataURL(file);
        });
        toast.loading(`Uploading "${file.name}"...`, { id: file.name });
        const result = await uploadFile.mutateAsync({ filename: file.name, mimeType: file.type || 'application/octet-stream', base64, folder: 'customer-attachments' });
        addCustomerAttachment(customerId, { id: nanoid(8), name: file.name, url: result.url, mimeType: file.type, size: file.size, uploadedAt: new Date().toISOString() });
        toast.success(`"${file.name}" uploaded`, { id: file.name });
      } catch { toast.error(`Failed to upload "${file.name}"`, { id: file.name }); }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Files & Photos</h3>
        <button type="button" onClick={() => attachFileRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors">
          <Plus size={13} /> Upload File
        </button>
        <input ref={attachFileRef} type="file" multiple className="hidden" onChange={handleUpload} />
      </div>
      {files.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border-2 border-dashed border-border rounded-xl">
          <Paperclip className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <div className="text-base font-semibold mb-1">No Files Yet</div>
          <div className="text-sm">Upload photos, contracts, or any customer documents.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map(f => (
            <div key={f.id} className="rounded-xl border bg-card p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded border bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                {f.mimeType.startsWith('image/') ? (
                  <img src={f.url} alt={f.name} className="w-full h-full object-cover" />
                ) : (
                  <FileText className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{f.name}</p>
                <p className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(1)} KB · {new Date(f.uploadedAt).toLocaleDateString()}</p>
              </div>
              <a href={f.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-primary hover:underline flex items-center gap-1">
                <Download size={12} /> View
              </a>
              <button type="button" onClick={() => removeCustomerAttachment(customerId, f.id)}
                className="shrink-0 text-xs text-destructive hover:underline flex items-center gap-1">
                <Trash2 size={12} /> Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Customer Portal Tab ──────────────────────────────────────
function CustomerPortalTab({ customerId }: { customerId: string }) {
  const utils = trpc.useUtils();
  const { approveEstimate, updateOpportunity, state } = useEstimator();
  const uploadFile = trpc.uploads.uploadFile.useMutation();
  // Share Document modal
  const [showShareDoc, setShowShareDoc] = useState(false);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docName, setDocName] = useState('');
  const [docUploading, setDocUploading] = useState(false);
  const docFileRef = useRef<HTMLInputElement>(null);
  // Add Photo modal
  const [showAddPhoto, setShowAddPhoto] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoCaption, setPhotoCaption] = useState('');
  const [photoPhase, setPhotoPhase] = useState<'before' | 'during' | 'after'>('after');
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoFileRef = useRef<HTMLInputElement>(null);
  // Schedule Appointment modal
  const [showScheduleAppt, setShowScheduleAppt] = useState(false);
  const [apptTitle, setApptTitle] = useState('');
  const [apptDate, setApptDate] = useState('');
  const [apptTime, setApptTime] = useState('09:00');
  const [apptEndTime, setApptEndTime] = useState('11:00');
  const [apptAddress, setApptAddress] = useState('');
  const [apptTech, setApptTech] = useState('');
  const [apptNotes, setApptNotes] = useState('');
  const addDocumentMutation = trpc.portal.addDocument.useMutation({
    onSuccess: () => {
      toast.success('Document shared with customer!');
      setShowShareDoc(false);
      setDocFile(null);
      setDocName('');
      utils.portal.getCustomerPortalData.invalidate({ hpCustomerId: customerId });
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });
  const addGalleryPhotoMutation = trpc.portal.addGalleryPhoto.useMutation({
    onSuccess: () => {
      toast.success('Photo added to customer gallery!');
      setShowAddPhoto(false);
      setPhotoFile(null);
      setPhotoCaption('');
      utils.portal.getCustomerPortalData.invalidate({ hpCustomerId: customerId });
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });
  const addAppointmentMutation = trpc.portal.addAppointment.useMutation({
    onSuccess: () => {
      toast.success('Appointment scheduled for customer!');
      setShowScheduleAppt(false);
      setApptTitle('');
      setApptDate('');
      utils.portal.getCustomerPortalData.invalidate({ hpCustomerId: customerId });
    },
    onError: (err) => toast.error(`Failed: ${err.message}`),
  });
  const handleShareDoc = async () => {
    if (!docFile || !docName.trim()) { toast.error('Select a file and enter a name'); return; }
    if (!data?.customer?.email) { toast.error('No portal customer email'); return; }
    setDocUploading(true);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = ev => res(ev.target?.result as string);
        r.onerror = rej;
        r.readAsDataURL(docFile);
      });
      const uploaded = await uploadFile.mutateAsync({ filename: docFile.name, mimeType: docFile.type || 'application/octet-stream', base64, folder: 'portal-documents' });
      await addDocumentMutation.mutateAsync({ customerEmail: data.customer.email, name: docName.trim(), url: uploaded.url, fileKey: uploaded.key ?? uploaded.url, mimeType: docFile.type });
    } catch (e: any) { toast.error(e.message ?? 'Upload failed'); }
    setDocUploading(false);
  };
  const handleAddPhoto = async () => {
    if (!photoFile) { toast.error('Select a photo'); return; }
    if (!data?.customer?.email) { toast.error('No portal customer email'); return; }
    setPhotoUploading(true);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = ev => res(ev.target?.result as string);
        r.onerror = rej;
        r.readAsDataURL(photoFile);
      });
      const uploaded = await uploadFile.mutateAsync({ filename: photoFile.name, mimeType: photoFile.type || 'image/jpeg', base64, folder: 'portal-gallery' });
      await addGalleryPhotoMutation.mutateAsync({ customerEmail: data.customer.email, imageUrl: uploaded.url, caption: photoCaption || undefined, phase: photoPhase });
    } catch (e: any) { toast.error(e.message ?? 'Upload failed'); }
    setPhotoUploading(false);
  };
  const handleScheduleAppt = () => {
    if (!apptTitle.trim() || !apptDate) { toast.error('Enter title and date'); return; }
    if (!data?.customer?.email) { toast.error('No portal customer email'); return; }
    const scheduledAt = new Date(`${apptDate}T${apptTime}:00`);
    const scheduledEndAt = apptEndTime ? new Date(`${apptDate}T${apptEndTime}:00`) : undefined;
    addAppointmentMutation.mutate({ customerEmail: data.customer.email, title: apptTitle.trim(), scheduledAt, scheduledEndAt, address: apptAddress || undefined, techName: apptTech || undefined, notes: apptNotes || undefined });
  };
  const { data, isLoading } = trpc.portal.getCustomerPortalData.useQuery(
    { hpCustomerId: customerId },
    { enabled: !!customerId }
  );
  const { data: allPortalMsgs = [] } = trpc.portal.getAllPortalMessages.useQuery();
  const { data: allServiceReqs = [] } = trpc.portal.getAllServiceRequests.useQuery();
  const reviewServiceRequest = trpc.portal.reviewServiceRequest.useMutation({
    onSuccess: () => {
      toast.success('Request updated!');
      utils.portal.getCustomerPortalData.invalidate({ hpCustomerId: customerId });
    },
    onError: (err) => toast.error(err.message),
  });
  const resendEstimate = trpc.portal.resendEstimate.useMutation({
    onSuccess: () => {
      toast.success('Estimate email resent!');
      utils.portal.getCustomerPortalData.invalidate({ hpCustomerId: customerId });
    },
    onError: (err) => toast.error(`Resend failed: ${err.message}`),
  });
  const resendInvoice = trpc.portal.resendInvoice.useMutation({
    onSuccess: () => {
      toast.success('Invoice email resent!');
      utils.portal.getCustomerPortalData.invalidate({ hpCustomerId: customerId });
    },
    onError: (err) => toast.error(`Resend failed: ${err.message}`),
  });

  if (isLoading) {
    return <div className="py-16 text-center text-muted-foreground text-sm">Loading portal data…</div>;
  }

  if (!data?.customer) {
    return (
      <div className="text-center py-16 text-muted-foreground border-2 border-dashed border-border rounded-xl">
        <ExternalLink className="w-8 h-8 mx-auto mb-3 opacity-30" />
        <div className="text-base font-semibold mb-1">No Portal Account Yet</div>
        <div className="text-sm">Send an estimate or invoice to this customer to create their portal.</div>
      </div>
    );
  }

  const { customer, estimates, invoices, appointments } = data;
  // Filter messages and service requests to this portal customer
  const customerMsgs = (allPortalMsgs as any[]).filter(
    (m: any) => m.customerId === customer.id
  );
  const customerServiceReqs = (allServiceReqs as any[]).filter(
    (r: any) => r.customerId === customer.id
  );
  const portalBase = 'https://client.handypioneers.com';

  return (
    <div className="space-y-5">
      {/* Portal customer header */}
      <div className="rounded-xl border bg-card p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <User size={18} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{customer.name}</p>
          <p className="text-xs text-muted-foreground truncate">{customer.email}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Portal ID: #{customer.id}
            {customer.createdAt && (
              <span className="ml-2 text-emerald-600">Active since {new Date(customer.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
            )}
          </p>
        </div>
        <a
          href={`${portalBase}/portal/home`}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors"
        >
          <ExternalLink size={12} /> View in Portal
        </a>
      </div>

      {/* Estimates */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Estimates ({estimates.length})
        </h3>
        {estimates.length === 0 ? (
          <p className="text-xs text-muted-foreground">No estimates sent to portal yet.</p>
        ) : (
          <div className="space-y-2">
            {estimates.map((est: any) => (
              <div key={est.id} className="rounded-xl border bg-card p-3 flex flex-col gap-2">
                <div className="flex items-start gap-3">
                  <FileText size={16} className="text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{est.estimateNumber} — {est.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Sent {est.sentAt ? fmtDate(new Date(est.sentAt).toISOString()) : '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {est.viewedAt && (
                      <span
                        title={`Viewed ${fmtDate(new Date(est.viewedAt).toISOString())}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold"
                      >
                        <CheckCircle2 size={11} /> Viewed
                      </span>
                    )}
                    <Badge className={
                      est.status === 'approved' ? 'bg-emerald-100 text-emerald-800' :
                      est.status === 'declined' ? 'bg-red-100 text-red-700' :
                      'bg-sky-100 text-sky-700'
                    }>
                      {est.status}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center justify-between pl-7">
                  {est.viewedAt ? (
                    <p className="text-xs text-emerald-600">Viewed {fmtRelative(new Date(est.viewedAt).toISOString())}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Not yet viewed</p>
                  )}
                  <div className="flex items-center gap-1.5">
                    {est.status === 'approved' && (() => {
                      // Check if the linked opportunity is already marked Won
                      const linkedOpp = est.hpOpportunityId
                        ? state.opportunities.find((o: any) => o.id === est.hpOpportunityId)
                        : null;
                      const alreadyWon = linkedOpp?.wonAt || linkedOpp?.stage === 'Won' || linkedOpp?.stage === 'Approved';
                      if (alreadyWon) return (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">
                          <Trophy size={10} /> Won
                        </span>
                      );
                      return (
                        <button
                          onClick={() => {
                            if (!est.hpOpportunityId) {
                              toast.error('No linked opportunity — re-send the estimate to link it.');
                              return;
                            }
                            approveEstimate({
                              estimateId: est.hpOpportunityId,
                              jobMode: 'new',
                              newJobTitle: est.title,
                              totalPrice: (est.totalAmount ?? 0) / 100,
                              depositAmount: (est.depositAmount ?? 0) / 100,
                              depositLabel: `Deposit (${est.depositPercent ?? 50}%)`,
                              balanceAmount: ((est.totalAmount ?? 0) - (est.depositAmount ?? 0)) / 100,
                              signedEstimateDataUrl: est.signatureDataUrl ?? undefined,
                            });
                            toast.success('Estimate marked Won — job created!');
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
                        >
                          <Trophy size={11} /> Mark Won
                        </button>
                      );
                    })()}
                    <button
                      onClick={() => resendEstimate.mutate({ estimateId: est.id })}
                      disabled={resendEstimate.isPending}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      <RefreshCw size={11} className={resendEstimate.isPending ? 'animate-spin' : ''} />
                      Resend
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invoices */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Invoices ({invoices.length})
        </h3>
        {invoices.length === 0 ? (
          <p className="text-xs text-muted-foreground">No invoices sent to portal yet.</p>
        ) : (
          <div className="space-y-2">
            {invoices.map((inv: any) => (
              <div key={inv.id} className="rounded-xl border bg-card p-3 flex flex-col gap-2">
                <div className="flex items-start gap-3">
                  <DollarSign size={16} className="text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{inv.invoiceNumber} — {inv.jobTitle ?? inv.type}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDollar((inv.amountDue ?? 0) / 100)} · Due {inv.dueDate ? fmtDate(new Date(inv.dueDate).toISOString()) : '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {inv.viewedAt && (
                      <span
                        title={`Viewed ${fmtDate(new Date(inv.viewedAt).toISOString())}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold"
                      >
                        <CheckCircle2 size={11} /> Viewed
                      </span>
                    )}
                    {inv.status === 'paid' && (
                      <Badge className="bg-emerald-100 text-emerald-800 flex items-center gap-1">
                        <CheckCircle2 size={10} /> Paid via Portal
                      </Badge>
                    )}
                    {inv.status !== 'paid' && inv.dueDate && new Date(inv.dueDate) < new Date() && (
                      <Badge className="bg-red-100 text-red-700 border-red-300">Overdue</Badge>
                    )}
                    {inv.status !== 'paid' && !(inv.dueDate && new Date(inv.dueDate) < new Date()) && (
                      <Badge className={
                        inv.status === 'due' ? 'bg-orange-100 text-orange-700' :
                        'bg-sky-100 text-sky-700'
                      }>
                        {inv.status}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between pl-7">
                  <div>
                    {inv.status === 'paid' && inv.paidAt ? (
                      <p className="text-xs text-emerald-600">
                        Paid {fmtRelative(new Date(inv.paidAt).toISOString())} · {fmtDollar((inv.amountPaid ?? 0) / 100)}
                      </p>
                    ) : inv.viewedAt ? (
                      <p className="text-xs text-emerald-600">Viewed {fmtRelative(new Date(inv.viewedAt).toISOString())}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Not yet viewed</p>
                    )}
                  </div>
                  <button
                    onClick={() => resendInvoice.mutate({ invoiceId: inv.id })}
                    disabled={resendInvoice.isPending}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={11} className={resendInvoice.isPending ? 'animate-spin' : ''} />
                    Resend
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Appointments */}
      {appointments.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Appointments ({appointments.length})
          </h3>
          <div className="space-y-2">
            {appointments.map((apt: any) => (
              <div key={apt.id} className="rounded-xl border bg-card p-3 flex items-center gap-3">
                <Calendar size={16} className="text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{apt.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {apt.startTime ? fmtDate(new Date(apt.startTime).toISOString()) : '—'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Service Requests (Booking) */}
      {customerServiceReqs.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Service Requests ({customerServiceReqs.length})
          </h3>
          <div className="space-y-2">
            {customerServiceReqs.map((req: any) => (
              <div key={req.id} className="rounded-xl border bg-card p-3 space-y-2">
                <div className="flex items-start gap-3">
                  <Wrench size={15} className="text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-2">{req.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {req.preferredTimeline ? `Timeline: ${req.preferredTimeline.replace('_', ' ')}` : ''}
                      {req.address ? ` · ${req.address}` : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    req.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                    req.status === 'reviewed' ? 'bg-sky-100 text-sky-700' :
                    req.status === 'converted' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-muted text-muted-foreground'
                  }`}>{req.status}</span>
                </div>
                {req.status === 'pending' && (
                  <div className="flex gap-2 pl-6">
                    <button
                      onClick={() => reviewServiceRequest.mutate({ id: req.id, status: 'reviewed' })}
                      disabled={reviewServiceRequest.isPending}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 text-xs font-medium hover:bg-sky-100 transition-colors disabled:opacity-50"
                    >
                      Mark Reviewed
                    </button>
                    <button
                      onClick={() => reviewServiceRequest.mutate({ id: req.id, status: 'converted' })}
                      disabled={reviewServiceRequest.isPending}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50"
                    >
                      Convert to Lead
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* HP Action Buttons */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Push to Portal
        </h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowShareDoc(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
          >
            <FileUp size={13} /> Share Document
          </button>
          <button
            onClick={() => setShowAddPhoto(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
          >
            <Camera size={13} /> Add Photo
          </button>
          <button
            onClick={() => setShowScheduleAppt(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
          >
            <CalendarPlus size={13} /> Schedule Appointment
          </button>
        </div>
      </div>

      {/* Share Document Modal */}
      {showShareDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowShareDoc(false)}>
          <div className="bg-card rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-base">Share Document with Customer</h2>
              <button onClick={() => setShowShareDoc(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Document Name</label>
              <input
                type="text" value={docName} onChange={e => setDocName(e.target.value)}
                placeholder="e.g. Scope of Work — Kitchen Remodel"
                className="field-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">File</label>
              <input
                ref={docFileRef} type="file" className="hidden"
                onChange={e => setDocFile(e.target.files?.[0] ?? null)}
              />
              <button
                onClick={() => docFileRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors w-full"
              >
                <FileUp size={14} />
                {docFile ? docFile.name : 'Click to select file'}
              </button>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleShareDoc}
                disabled={docUploading || addDocumentMutation.isPending}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {docUploading ? 'Uploading…' : 'Share'}
              </button>
              <button onClick={() => setShowShareDoc(false)} className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Photo Modal */}
      {showAddPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAddPhoto(false)}>
          <div className="bg-card rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-base">Add Photo to Customer Gallery</h2>
              <button onClick={() => setShowAddPhoto(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Photo</label>
              <input
                ref={photoFileRef} type="file" accept="image/*" className="hidden"
                onChange={e => setPhotoFile(e.target.files?.[0] ?? null)}
              />
              <button
                onClick={() => photoFileRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 border border-dashed border-border rounded-lg text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors w-full"
              >
                <Camera size={14} />
                {photoFile ? photoFile.name : 'Click to select photo'}
              </button>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Caption (optional)</label>
              <input
                type="text" value={photoCaption} onChange={e => setPhotoCaption(e.target.value)}
                placeholder="e.g. After — new kitchen backsplash"
                className="field-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Phase</label>
              <select value={photoPhase} onChange={e => setPhotoPhase(e.target.value as any)} className="field-input w-full">
                <option value="before">Before</option>
                <option value="during">During</option>
                <option value="after">After</option>
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleAddPhoto}
                disabled={photoUploading || addGalleryPhotoMutation.isPending}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {photoUploading ? 'Uploading…' : 'Add Photo'}
              </button>
              <button onClick={() => setShowAddPhoto(false)} className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Appointment Modal */}
      {showScheduleAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowScheduleAppt(false)}>
          <div className="bg-card rounded-2xl shadow-2xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-base">Schedule Appointment</h2>
              <button onClick={() => setShowScheduleAppt(false)} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Title</label>
              <input
                type="text" value={apptTitle} onChange={e => setApptTitle(e.target.value)}
                placeholder="e.g. Site Visit — Kitchen Remodel"
                className="field-input w-full"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Date</label>
                <input type="date" value={apptDate} onChange={e => setApptDate(e.target.value)} className="field-input w-full" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Start Time</label>
                <input type="time" value={apptTime} onChange={e => setApptTime(e.target.value)} className="field-input w-full" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">End Time</label>
                <input type="time" value={apptEndTime} onChange={e => setApptEndTime(e.target.value)} className="field-input w-full" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Technician</label>
                <input
                  type="text" value={apptTech} onChange={e => setApptTech(e.target.value)}
                  placeholder="Tech name"
                  className="field-input w-full"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Address (optional)</label>
              <input
                type="text" value={apptAddress} onChange={e => setApptAddress(e.target.value)}
                placeholder="Job site address"
                className="field-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Notes (optional)</label>
              <textarea
                value={apptNotes} onChange={e => setApptNotes(e.target.value)}
                placeholder="Any notes for the customer…"
                rows={2} className="field-input w-full resize-none"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleScheduleAppt}
                disabled={addAppointmentMutation.isPending}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {addAppointmentMutation.isPending ? 'Scheduling…' : 'Schedule'}
              </button>
              <button onClick={() => setShowScheduleAppt(false)} className="px-4 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Portal Messages Preview */}
      {customerMsgs.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Portal Messages ({customerMsgs.length})
          </h3>
          <div className="space-y-1.5">
            {[...customerMsgs].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5).map((msg: any) => (
              <div key={msg.id} className={`rounded-lg p-2.5 text-xs flex gap-2 ${
                msg.senderRole === 'hp_team' ? 'bg-[#1a2e1a]/5 border border-[#1a2e1a]/10' : 'bg-muted'
              }`}>
                <span className={`shrink-0 font-semibold ${
                  msg.senderRole === 'hp_team' ? 'text-[#1a2e1a]' : 'text-amber-700'
                }`}>
                  {msg.senderRole === 'hp_team' ? 'HP Team' : (msg.senderName || 'Customer')}:
                </span>
                <span className="text-foreground/80 line-clamp-2">{msg.body}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
