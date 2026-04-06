// ============================================================
// JobDetailsSection — shown as the "Job" tab inside an open
// job opportunity. Contains all job-specific fields:
//   - Stage selector
//   - Job Type, Estimator, Job Number
//   - Estimate / Expires / Service dates
//   - Scope of Work
//   - Address (service location)
//   - Internal notes
//   - Signed Estimate attachment
//   - Statement of Work (SOW) viewer
// ============================================================

import { useState } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import {
  JOB_TYPES, JOB_STAGES, OpportunityStage,
} from '@/lib/types';
import {
  Briefcase, MapPin, Hash, Calendar, User, FileText,
  ExternalLink, Edit3, ChevronDown, CalendarDays, ClipboardList, Download, ImageIcon,
} from 'lucide-react';
import { toast } from 'sonner';

const STAGE_COLORS: Record<string, string> = {
  'New Job':                  'bg-blue-100 text-blue-800',
  'Deposit Needed':           'bg-amber-100 text-amber-800',
  'Deposit Collected':        'bg-lime-100 text-lime-800',
  'Need to Order Materials':  'bg-orange-100 text-orange-800',
  'Waiting on Materials':     'bg-yellow-100 text-yellow-800',
  'Materials Received':       'bg-teal-100 text-teal-800',
  'Unscheduled':              'bg-slate-100 text-slate-700',
  'Scheduled':                'bg-sky-100 text-sky-800',
  'In Progress':              'bg-indigo-100 text-indigo-800',
  'Completed':                'bg-emerald-100 text-emerald-800',
  'Invoice Sent':             'bg-violet-100 text-violet-800',
  'Invoice Paid':             'bg-green-100 text-green-800',
};

export default function JobDetailsSection() {
  const { state, setJobInfo, updateOpportunity, setSection, setScheduleFilter } = useEstimator();
  const { jobInfo, activeOpportunityId, opportunities } = state;

  const activeOpp = activeOpportunityId
    ? opportunities.find(o => o.id === activeOpportunityId)
    : null;

  if (!activeOpp) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm">
        No active job opportunity selected.
      </div>
    );
  }

  const handleStageChange = (stage: string) => {
    updateOpportunity(activeOpp.id, { stage: stage as OpportunityStage });
    toast.success(`Stage updated to "${stage}"`);
  };

  const stageColor = STAGE_COLORS[activeOpp.stage] ?? 'bg-slate-100 text-slate-700';
  const signedEstimateUrl = activeOpp.jobSignedEstimateDataUrl || activeOpp.signedEstimateDataUrl;
  const signedEstimateFilename = activeOpp.jobSignedEstimateFilename || activeOpp.signedEstimateFilename || 'signed-estimate.png';

  return (
    <div className="space-y-5 pb-10">

      {/* ── Stage card ── */}
      <div className="card-section">
        <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
          <Briefcase size={13} />
          <span>Job Status</span>
          <span className={`ml-auto px-2 py-0.5 rounded-full text-[11px] font-semibold ${stageColor}`}>
            {activeOpp.stage}
          </span>
        </div>
        <div className="card-section-body">
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            Update Stage
          </label>
          <div className="relative">
            <select
              value={activeOpp.stage}
              onChange={e => handleStageChange(e.target.value)}
              className="field-input w-full appearance-none pr-8"
            >
              {JOB_STAGES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
          {activeOpp.value > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              Job value: <span className="font-semibold text-foreground">
                ${activeOpp.value.toLocaleString('en-US', { minimumFractionDigits: 0 })}
              </span>
            </p>
          )}
          {/* Schedule deep-link */}
          {(() => {
            const linkedEvents = state.scheduleEvents.filter(
              e => e.opportunityId === activeOpp.id
            );
            return (
              <button
                onClick={() => {
                  setScheduleFilter(activeOpp.id);
                  setSection('schedule');
                }}
                className="mt-3 w-full flex items-center justify-between rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 px-3 py-2 text-xs hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors"
              >
                <div className="flex items-center gap-2 text-sky-700 dark:text-sky-400">
                  <CalendarDays size={14} />
                  <span className="font-semibold">Project Schedule</span>
                  {linkedEvents.length > 0 && (
                    <span className="bg-sky-200 dark:bg-sky-800 text-sky-800 dark:text-sky-200 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                      {linkedEvents.length} phase{linkedEvents.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <ExternalLink size={12} className="text-sky-500" />
              </button>
            );
          })()}
        </div>
      </div>

      {/* ── Job Details card ── */}
      <div className="card-section">
        <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
          <FileText size={13} />
          <span>Job Details</span>
        </div>
        <div className="card-section-body grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Job Type */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Job Type
            </label>
            <div className="relative">
              <select
                value={jobInfo.jobType}
                onChange={e => setJobInfo({ jobType: e.target.value })}
                className="field-input w-full appearance-none pr-8"
              >
                {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Estimator */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Estimator / Assigned To
            </label>
            <div className="relative">
              <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={jobInfo.estimator}
                onChange={e => setJobInfo({ estimator: e.target.value })}
                placeholder="e.g. Mike, Sarah"
                className="field-input w-full pl-8"
              />
            </div>
          </div>

          {/* Job Number */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Job Number
            </label>
            <div className="relative">
              <Hash size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={jobInfo.jobNumber}
                onChange={e => setJobInfo({ jobNumber: e.target.value })}
                placeholder="HP-2026-001"
                className="field-input w-full pl-8"
              />
            </div>
          </div>

          {/* Estimate Date */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Estimate Date
            </label>
            <div className="relative">
              <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="date"
                value={jobInfo.date}
                onChange={e => setJobInfo({ date: e.target.value })}
                className="field-input w-full pl-8"
              />
            </div>
          </div>

          {/* Expires Date */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Estimate Expires
            </label>
            <div className="relative">
              <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="date"
                value={jobInfo.expiresDate}
                onChange={e => setJobInfo({ expiresDate: e.target.value })}
                className="field-input w-full pl-8"
              />
            </div>
          </div>

          {/* Service Date */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Service / Start Date
            </label>
            <div className="relative">
              <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="date"
                value={jobInfo.servicedDate}
                onChange={e => setJobInfo({ servicedDate: e.target.value })}
                className="field-input w-full pl-8"
              />
            </div>
          </div>

          {/* Scope of Work */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Scope of Work
            </label>
            <textarea
              value={jobInfo.scope}
              onChange={e => setJobInfo({ scope: e.target.value })}
              placeholder="e.g. Full trim package — install new baseboard, door casing, and window casing throughout main floor."
              rows={4}
              className="field-input w-full resize-none"
            />
          </div>
        </div>
      </div>

      {/* ── Service Address card ── */}
      <div className="card-section">
        <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
          <MapPin size={13} />
          <span>Service Address</span>
        </div>
        <div className="card-section-body space-y-3">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Street Address
            </label>
            <div className="relative">
              <MapPin size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={jobInfo.address}
                onChange={e => setJobInfo({ address: e.target.value })}
                placeholder="1234 Main St"
                className="field-input w-full pl-8"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">City</label>
              <input
                type="text"
                value={jobInfo.city}
                onChange={e => setJobInfo({ city: e.target.value })}
                placeholder="Vancouver"
                className="field-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">State</label>
              <input
                type="text"
                value={jobInfo.state}
                onChange={e => setJobInfo({ state: e.target.value })}
                placeholder="WA"
                className="field-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">ZIP</label>
              <input
                type="text"
                value={jobInfo.zip}
                onChange={e => setJobInfo({ zip: e.target.value })}
                placeholder="98660"
                className="field-input w-full"
              />
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

      {/* ── Internal Notes card ── */}
      <div className="card-section">
        <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
          <Edit3 size={13} />
          <span>Internal Notes</span>
          <span className="ml-auto text-[10px] text-muted-foreground font-normal">Not visible to customer</span>
        </div>
        <div className="card-section-body">
          <textarea
            value={activeOpp.notes || ''}
            onChange={e => updateOpportunity(activeOpp.id, { notes: e.target.value })}
            placeholder="Internal notes about this job — crew instructions, access info, special considerations…"
            rows={4}
            className="field-input w-full resize-none"
          />
        </div>
      </div>

      {/* ── Signed Estimate card ── */}
      {signedEstimateUrl && (
        <div className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <ImageIcon size={13} />
            <span>Signed Estimate</span>
            <span className="ml-auto text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
              ✓ Attached
            </span>
          </div>
          <div className="card-section-body space-y-3">
            <p className="text-xs text-muted-foreground">
              The customer-signed estimate is attached to this job for reference.
            </p>
            <div className="rounded-lg border overflow-hidden bg-muted/20">
              <img
                src={signedEstimateUrl}
                alt="Signed Estimate"
                className="w-full object-contain max-h-72"
              />
            </div>
            <a
              href={signedEstimateUrl}
              download={signedEstimateFilename}
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <Download size={11} />
              Download signed estimate
            </a>
          </div>
        </div>
      )}

      {/* ── Statement of Work card ── */}
      {activeOpp.sowDocument && (
        <div className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <ClipboardList size={13} />
            <span>Statement of Work (SOW)</span>
            {activeOpp.sowGeneratedAt && (
              <span className="ml-auto text-[10px] text-muted-foreground font-normal">
                Generated {new Date(activeOpp.sowGeneratedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </div>
          <div className="card-section-body">
            <SowViewer
              sow={activeOpp.sowDocument}
              filename={`SOW-${activeOpp.jobNumber || activeOpp.id}.txt`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── SOW Viewer sub-component ──────────────────────────────────
function SowViewer({ sow, filename }: { sow: string; filename: string }) {
  const [expanded, setExpanded] = useState(false);
  const lines = sow.split('\n');
  const preview = lines.slice(0, 25).join('\n');

  const handleDownload = () => {
    const blob = new Blob([sow], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-2">
      <pre className="text-[11px] font-mono bg-muted/40 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
        {expanded ? sow : preview + (lines.length > 25 ? '\n…' : '')}
      </pre>
      <div className="flex items-center gap-4">
        <button
          onClick={() => setExpanded(v => !v)}
          className="text-xs text-primary hover:underline"
        >
          {expanded ? 'Show less' : 'Show full SOW'}
        </button>
        <button
          onClick={handleDownload}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Download size={11} />
          Download .txt
        </button>
      </div>
    </div>
  );
}
