// Opportunity card — extracted verbatim from CustomerSection.tsx (Phase D).
import { useState } from 'react';
import { toast } from 'sonner';
import {
  Archive, FolderOpen, ChevronUp, ChevronDown, Trash2, RefreshCw, CheckCircle2,
} from 'lucide-react';
import {
  type Opportunity, type OpportunityStage, type PipelineArea,
  type LeadNote, type JobAttachment,
} from '@/lib/types';
import { ConvertToEstimateModal, ConvertToJobModal } from '@/components/ConversionModal';
import { stageColor, fmtDollar, fmtDate } from '@/components/clients/formatters';

export default function OpportunityCard({
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
