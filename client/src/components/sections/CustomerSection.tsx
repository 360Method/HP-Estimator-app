// ============================================================
// CustomerSection — Job info + CRM pipeline tracker
// Design: HP Industrial — dark slate, amber accents, DM Sans
//   - Client info form (top)
//   - Job details form
//   - CRM Pipeline: 3 area tabs (Lead / Estimate / Job)
//     Each area shows stage buckets with opportunity cards
//     Estimator can add, move, and remove opportunities
// ============================================================

import { useState } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import {
  JOB_TYPES, LEAD_STAGES, ESTIMATE_STAGES, JOB_STAGES,
  PipelineArea, OpportunityStage, LeadStage, EstimateStage, JobStage,
} from '@/lib/types';
import {
  User, MapPin, Phone, Mail, Calendar, Briefcase, Hash, Building2,
  Plus, Trash2, ChevronDown, ChevronUp, DollarSign, Tag, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';

// ─── Stage color maps ─────────────────────────────────────────
const STAGE_COLORS: Record<string, string> = {
  // Lead
  'New Lead': 'bg-blue-100 text-blue-800 border-blue-200',
  'Return Call Needed': 'bg-amber-100 text-amber-800 border-amber-200',
  'First Contact': 'bg-sky-100 text-sky-800 border-sky-200',
  'Second Contact': 'bg-cyan-100 text-cyan-800 border-cyan-200',
  'Third Contact': 'bg-teal-100 text-teal-800 border-teal-200',
  'On Hold': 'bg-gray-100 text-gray-600 border-gray-200',
  'Won': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Lost': 'bg-red-100 text-red-700 border-red-200',
  // Estimate
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
  // Job
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
  return '$' + Math.round(n).toLocaleString('en-US');
}

// ─── Add Opportunity Form ─────────────────────────────────────
function AddOpportunityForm({
  area,
  onAdd,
  onCancel,
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
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Kitchen remodel — Johnson residence"
          className="field-input w-full"
          autoFocus
        />
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
          <input
            type="number"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="0.00"
            className="field-input w-full"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Any relevant notes..."
          rows={2}
          className="field-input w-full resize-none"
        />
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
  opp,
  stages,
  onUpdate,
  onRemove,
}: {
  opp: { id: string; title: string; stage: OpportunityStage; value: number; notes: string; createdAt: string };
  stages: OpportunityStage[];
  onUpdate: (id: string, payload: Partial<{ stage: OpportunityStage; title: string; value: number; notes: string }>) => void;
  onRemove: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white border border-border rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground truncate">{opp.title}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${stageColor(opp.stage)}`}>
              {opp.stage}
            </span>
            {opp.value > 0 && (
              <span className="text-xs text-muted-foreground font-medium">{fmtDollar(opp.value)}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setExpanded(e => !e)}
            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            onClick={() => { if (confirm('Remove this opportunity?')) onRemove(opp.id); }}
            className="p-1 rounded hover:bg-destructive/10 text-destructive/60 hover:text-destructive transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">Stage</label>
            <select
              value={opp.stage}
              onChange={e => onUpdate(opp.id, { stage: e.target.value as OpportunityStage })}
              className="field-input w-full text-xs py-1.5"
            >
              {stages.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">Est. Value ($)</label>
            <input
              type="number"
              value={opp.value || ''}
              onChange={e => onUpdate(opp.id, { value: parseFloat(e.target.value) || 0 })}
              placeholder="0.00"
              className="field-input w-full text-xs py-1.5"
            />
          </div>
          {opp.notes && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">{opp.notes}</div>
          )}
          <div className="text-[10px] text-muted-foreground">
            Added {new Date(opp.createdAt).toLocaleDateString()}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Pipeline Area Panel ──────────────────────────────────────
function PipelineAreaPanel({
  area,
  stages,
  opportunities,
  onAdd,
  onUpdate,
  onRemove,
}: {
  area: PipelineArea;
  stages: OpportunityStage[];
  opportunities: typeof stages extends never[] ? never[] : { id: string; area: PipelineArea; stage: OpportunityStage; title: string; value: number; notes: string; createdAt: string; updatedAt: string }[];
  onAdd: (title: string, stage: OpportunityStage, value: number, notes: string) => void;
  onUpdate: (id: string, payload: Partial<{ stage: OpportunityStage; title: string; value: number; notes: string }>) => void;
  onRemove: (id: string) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);

  // Group by stage
  const byStage: Record<string, typeof opportunities> = {};
  for (const s of stages) byStage[s] = [];
  for (const opp of opportunities) {
    if (byStage[opp.stage]) byStage[opp.stage].push(opp);
    else byStage[stages[0]].push(opp);
  }

  const totalValue = opportunities.reduce((s, o) => s + o.value, 0);
  const activeStages = stages.filter(s => byStage[s].length > 0);

  return (
    <div>
      {/* Area summary */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span><strong className="text-foreground">{opportunities.length}</strong> opportunit{opportunities.length === 1 ? 'y' : 'ies'}</span>
          {totalValue > 0 && (
            <span className="flex items-center gap-1">
              <DollarSign size={13} />
              <strong className="text-foreground">{fmtDollar(totalValue)}</strong> total value
            </span>
          )}
        </div>
        <button
          onClick={() => setShowAdd(s => !s)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus size={13} /> Add Opportunity
        </button>
      </div>

      {showAdd && (
        <div className="mb-4">
          <AddOpportunityForm
            area={area}
            onAdd={(title, stage, value, notes) => {
              onAdd(title, stage, value, notes);
              setShowAdd(false);
            }}
            onCancel={() => setShowAdd(false)}
          />
        </div>
      )}

      {opportunities.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm border-2 border-dashed border-border rounded-xl">
          No opportunities yet. Click "Add Opportunity" to track this {area}.
        </div>
      ) : (
        <div className="space-y-4">
          {/* Show all stages that have items, plus a collapsed view of empty stages */}
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
                      onUpdate={onUpdate}
                      onRemove={onRemove}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Stage summary table for empty stages */}
          <details className="mt-2">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              View all {stages.length} stages
            </summary>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {stages.map(stage => (
                <div key={stage} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50 border border-border">
                  <span className="text-xs text-foreground truncate">{stage}</span>
                  <span className="text-xs font-semibold text-muted-foreground ml-2 shrink-0">{byStage[stage].length}</span>
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
  const { state, setJobInfo, addOpportunity, updateOpportunity, removeOpportunity, setPipelineArea } = useEstimator();
  const { jobInfo, opportunities, activePipelineArea } = state;

  const field = (
    label: string,
    key: keyof typeof jobInfo,
    type: string = 'text',
    placeholder: string = '',
    icon?: React.ReactNode,
    colSpan?: string,
  ) => (
    <div className={colSpan}>
      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </div>
        )}
        <input
          type={type}
          value={jobInfo[key] as string}
          onChange={e => setJobInfo({ [key]: e.target.value })}
          placeholder={placeholder}
          className={`field-input w-full ${icon ? 'pl-9' : ''}`}
        />
      </div>
    </div>
  );

  const areaOpps = opportunities.filter(o => o.area === activePipelineArea);
  const areaStages: OpportunityStage[] =
    activePipelineArea === 'lead' ? LEAD_STAGES :
    activePipelineArea === 'estimate' ? ESTIMATE_STAGES :
    JOB_STAGES;

  const AREA_TABS: { key: PipelineArea; label: string; icon: string }[] = [
    { key: 'lead', label: 'Leads', icon: '🎯' },
    { key: 'estimate', label: 'Estimates', icon: '📋' },
    { key: 'job', label: 'Jobs', icon: '🔨' },
  ];

  return (
    <div className="space-y-6">
      {/* ── Client Info ── */}
      <div className="card-section">
        <div className="card-section-header">
          <User size={15} />
          <span>Client Information</span>
        </div>
        <div className="card-section-body grid grid-cols-1 sm:grid-cols-2 gap-4">
          {field('Client Name', 'client', 'text', 'Jane Smith', <User size={14} />)}
          {field('Company Name', 'companyName', 'text', 'Acme Corp (optional)', <Building2 size={14} />)}
          {field('Phone', 'phone', 'tel', '(360) 555-0100', <Phone size={14} />)}
          {field('Email', 'email', 'email', 'jane@example.com', <Mail size={14} />)}
          <div className="sm:col-span-2">
            {field('Street Address', 'address', 'text', '1234 Main St', <MapPin size={14} />)}
          </div>
          <div className="grid grid-cols-3 gap-3 sm:col-span-2">
            <div className="col-span-1">{field('City', 'city', 'text', 'Vancouver')}</div>
            <div>{field('State', 'state', 'text', 'WA')}</div>
            <div>{field('Zip', 'zip', 'text', '98683')}</div>
          </div>
        </div>
      </div>

      {/* ── Job Details ── */}
      <div className="card-section">
        <div className="card-section-header">
          <Briefcase size={15} />
          <span>Job Details</span>
        </div>
        <div className="card-section-body grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Job Type</label>
            <select value={jobInfo.jobType} onChange={e => setJobInfo({ jobType: e.target.value })} className="field-input w-full">
              {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {field('HP Job Number', 'jobNumber', 'text', 'HP-2026-001', <Hash size={14} />)}
          {field('Created Date', 'date', 'date', '', <Calendar size={14} />)}
          {field('Expires Date', 'expiresDate', 'date', '', <Calendar size={14} />)}
          {field('Service Date', 'servicedDate', 'date', '', <Calendar size={14} />)}
          {field('Prepared By (Technicians)', 'estimator', 'text', 'e.g. John D., Sarah M.')}
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Scope Summary (Internal)</label>
            <textarea
              value={jobInfo.scope}
              onChange={e => setJobInfo({ scope: e.target.value })}
              placeholder="e.g. Full trim package — install new baseboard, door casing, and window casing throughout main floor. Client supplied paint."
              rows={3}
              className="field-input w-full resize-none"
            />
          </div>
        </div>
      </div>

      {/* ── Quick Summary ── */}
      {(jobInfo.client || jobInfo.address) && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">Job Summary</div>
          <div className="text-sm font-semibold text-foreground">
            {jobInfo.client || 'Client TBD'}
            {jobInfo.companyName ? ` · ${jobInfo.companyName}` : ''}
          </div>
          {jobInfo.address && (
            <div className="text-sm text-muted-foreground">
              {jobInfo.address}{jobInfo.city ? `, ${jobInfo.city}` : ''}{jobInfo.state ? `, ${jobInfo.state}` : ''}{jobInfo.zip ? ` ${jobInfo.zip}` : ''}
            </div>
          )}
          <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
            {jobInfo.jobType && <span>{jobInfo.jobType}</span>}
            {jobInfo.estimator && <span>By: {jobInfo.estimator}</span>}
            {jobInfo.jobNumber && <span>#{jobInfo.jobNumber}</span>}
            {jobInfo.expiresDate && <span>Expires: {new Date(jobInfo.expiresDate + 'T12:00:00').toLocaleDateString()}</span>}
          </div>
        </div>
      )}

      {/* ── CRM Pipeline Tracker ── */}
      <div className="card-section">
        <div className="card-section-header">
          <ArrowRight size={15} />
          <span>Opportunity Pipeline</span>
          <div className="ml-auto flex items-center gap-1">
            {AREA_TABS.map(tab => {
              const count = opportunities.filter(o => o.area === tab.key).length;
              return (
                <button
                  key={tab.key}
                  onClick={() => setPipelineArea(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    activePipelineArea === tab.key
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                  {count > 0 && (
                    <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${
                      activePipelineArea === tab.key ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="card-section-body">
          <PipelineAreaPanel
            area={activePipelineArea}
            stages={areaStages}
            opportunities={areaOpps as any}
            onAdd={(title, stage, value, notes) =>
              addOpportunity({ area: activePipelineArea, stage, title, value, notes })
            }
            onUpdate={updateOpportunity}
            onRemove={removeOpportunity}
          />
        </div>
      </div>
    </div>
  );
}
