// ============================================================
// PipelineBoard — Shared Kanban + Table view for Leads / Estimates / Jobs
//
// Design: HP Industrial — clean white cards, amber accents
// Drag-and-drop: @dnd-kit with useDroppable columns + useSortable cards
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  LayoutGrid, List, Plus, GripVertical, ExternalLink,
  DollarSign, Archive, ArrowRight, ChevronDown, Trash2,
  ArrowUpDown, MapPin, Search, User, UserPlus, Check, X as XIcon, ChevronRight,
  SendHorizonal,
} from 'lucide-react';
import { Opportunity, PipelineArea, OpportunityStage, Customer, LeadNote, JobAttachment } from '@/lib/types';
import { useEstimator } from '@/contexts/EstimatorContext';
import { nanoid } from 'nanoid';
import { toast } from 'sonner';
import { ConvertToEstimateModal, ConvertToJobModal } from '@/components/ConversionModal';

// ── Stage color map ───────────────────────────────────────────
const STAGE_COLORS: Record<string, string> = {
  'New Lead':                 'bg-blue-100 text-blue-800 border-blue-200',
  'Return Call Needed':       'bg-amber-100 text-amber-800 border-amber-200',
  'First Contact':            'bg-sky-100 text-sky-800 border-sky-200',
  'Second Contact':           'bg-cyan-100 text-cyan-800 border-cyan-200',
  'Third Contact':            'bg-teal-100 text-teal-800 border-teal-200',
  'On Hold':                  'bg-gray-100 text-gray-600 border-gray-200',
  'Won':                      'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Lost':                     'bg-red-100 text-red-700 border-red-200',
  'Unscheduled':              'bg-slate-100 text-slate-700 border-slate-200',
  'Scheduled':                'bg-blue-100 text-blue-800 border-blue-200',
  'In Progress':              'bg-indigo-100 text-indigo-800 border-indigo-200',
  'Completed':                'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Draft':                    'bg-gray-100 text-gray-600 border-gray-200',
  'Ready to Send':            'bg-violet-100 text-violet-800 border-violet-200',
  'Created on Job':           'bg-indigo-100 text-indigo-800 border-indigo-200',
  'Sent':                     'bg-sky-100 text-sky-800 border-sky-200',
  'Verbal Acceptance':        'bg-lime-100 text-lime-800 border-lime-200',
  'Approved':                 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Rejected':                 'bg-red-100 text-red-700 border-red-200',
  'New Job':                  'bg-blue-100 text-blue-800 border-blue-200',
  'Deposit Needed':           'bg-amber-100 text-amber-800 border-amber-200',
  'Deposit Collected':        'bg-lime-100 text-lime-800 border-lime-200',
  'Need to Order Materials':  'bg-orange-100 text-orange-800 border-orange-200',
  'Waiting on Materials':     'bg-yellow-100 text-yellow-800 border-yellow-200',
  'Materials Received':       'bg-teal-100 text-teal-800 border-teal-200',
  'Invoice Sent':             'bg-violet-100 text-violet-800 border-violet-200',
  'Invoice Paid':             'bg-emerald-100 text-emerald-800 border-emerald-200',
};

function stageColor(stage: string) {
  return STAGE_COLORS[stage] ?? 'bg-gray-100 text-gray-600 border-gray-200';
}

function fmtDollar(n: number) {
  if (n === 0) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Props ─────────────────────────────────────────────────────
export interface PipelineBoardProps {
  area: PipelineArea;
  stages: OpportunityStage[];
  opportunities: Opportunity[];
  onAdd: (title: string, stage: OpportunityStage, value: number, notes: string, customerId?: string, customerDisplayName?: string) => void;
  onUpdate: (id: string, payload: Partial<Opportunity>) => void;
  onRemove: (id: string) => void;
  onConvertToEstimate?: (id: string, title: string, value: number, transferNotes?: LeadNote[], transferAttachments?: JobAttachment[]) => void;
  onConvertToJob?: (id: string, title: string, value: number) => void;
  onArchive?: (id: string, value: number) => void;
  onOpen?: (id: string) => void;
  customerName?: string;
  compact?: boolean;
  /** When provided, clicking Add opens the full intake modal instead of the inline form */
  onOpenIntakeModal?: () => void;
}

// ── Kanban Card (draggable) ───────────────────────────────────
function KanbanCard({
  opp, area, stages, onUpdate, onRemove,
  onConvertToEstimate, onConvertToJob, onArchive, onOpen,
  customerName,
}: {
  opp: Opportunity;
  area: PipelineArea;
  stages: OpportunityStage[];
  onUpdate: (id: string, payload: Partial<Opportunity>) => void;
  onRemove: (id: string) => void;
  onConvertToEstimate?: (id: string, title: string, value: number, transferNotes?: LeadNote[], transferAttachments?: JobAttachment[]) => void;
  onConvertToJob?: (id: string, title: string, value: number) => void;
  onArchive?: (id: string, value: number) => void;
  onOpen?: (id: string) => void;
  customerName?: string;
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: opp.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const [showActions, setShowActions] = useState(false);
  const [showConvertToEstimateModal, setShowConvertToEstimateModal] = useState(false);
  const [showConvertToJobModal, setShowConvertToJobModal] = useState(false);

  const handleDelete = () => {
    if (window.confirm(`Delete "${opp.title}"? This cannot be undone.`)) {
      onRemove(opp.id);
      toast.success('Opportunity removed');
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border border-border rounded-xl shadow-sm hover:shadow-md transition-shadow group ${isDragging ? 'opacity-30' : ''}`}
    >
      {/* Card header */}
      <div className="flex items-start gap-2 p-3">
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className="mt-0.5 shrink-0 text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none select-none p-0.5"
          aria-label="Drag to reorder"
          role="button"
        >
          <GripVertical size={14} />
        </div>

        <div className="flex-1 min-w-0">
          {customerName && (
            <div className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-0.5 truncate">
              {customerName}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <div className="text-sm font-semibold text-foreground truncate flex-1">{opp.title}</div>
            {opp.isChangeOrder && (
              <span className="flex-shrink-0 px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400 text-[9px] font-bold uppercase tracking-wider">
                CO
              </span>
            )}
          </div>
          {opp.value > 0 && (
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <DollarSign size={10} />
              {fmtDollar(opp.value)}
            </div>
          )}
          {opp.notes && (
            <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
              {opp.notes}
            </div>
          )}
          {opp.clientSnapshot?.address && (
            <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
              <MapPin size={9} className="shrink-0" />
              <span className="truncate">{[opp.clientSnapshot.address, opp.clientSnapshot.city].filter(Boolean).join(', ')}</span>
            </div>
          )}
          {opp.sentAt && (
            <div className="inline-flex items-center gap-1 mt-1.5 px-1.5 py-0.5 bg-sky-50 border border-sky-200 text-sky-700 rounded-full text-[9px] font-semibold">
              <SendHorizonal size={8} />
              Sent {new Date(opp.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          )}
        </div>

        <button
          onClick={() => setShowActions(s => !s)}
          className="shrink-0 p-1 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors opacity-0 group-hover:opacity-100"
        >
          <ChevronDown size={13} className={`transition-transform ${showActions ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Expanded actions */}
      {showActions && (
        <div className="border-t border-border px-3 py-2 space-y-1.5 bg-slate-50/80 rounded-b-xl">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-12 shrink-0">Stage</span>
            <div className="relative flex-1">
              <select
                value={opp.stage}
                onChange={e => {
                  onUpdate(opp.id, { stage: e.target.value as OpportunityStage });
                  toast.success(`Moved to "${e.target.value}"`);
                }}
                className="w-full text-[11px] font-semibold border border-border rounded-lg px-2 py-1 bg-white appearance-none pr-6 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {stages.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 pt-1">
            {onOpen && (
              <button
                onClick={() => onOpen(opp.id)}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <ExternalLink size={10} /> Open
              </button>
            )}
            {opp.clientSnapshot?.address && (
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent([opp.clientSnapshot.address, opp.clientSnapshot.city, opp.clientSnapshot.state, opp.clientSnapshot.zip].filter(Boolean).join(', '))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold border border-border rounded-lg text-muted-foreground hover:text-primary hover:border-primary transition-colors"
              >
                <MapPin size={10} /> Maps
              </a>
            )}
            {onConvertToEstimate && (
              <button
                onClick={() => setShowConvertToEstimateModal(true)}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold border border-border rounded-lg text-muted-foreground hover:text-primary hover:border-primary transition-colors"
              >
                <ArrowRight size={10} /> → Estimate
              </button>
            )}
            {onConvertToJob && (
              <button
                onClick={() => setShowConvertToJobModal(true)}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold border border-border rounded-lg text-muted-foreground hover:text-primary hover:border-primary transition-colors"
              >
                <ArrowRight size={10} /> → Job
              </button>
            )}
            {onArchive && !opp.archived && (
              <button
                onClick={() => onArchive(opp.id, opp.value)}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold border border-border rounded-lg text-muted-foreground hover:text-emerald-700 hover:border-emerald-300 transition-colors"
              >
                <Archive size={10} /> Archive
              </button>
            )}
            <button
              onClick={handleDelete}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold border border-border rounded-lg text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors ml-auto"
            >
              <Trash2 size={10} /> Delete
            </button>
          </div>
          <div className="text-[9px] text-muted-foreground pt-0.5">
            Created {fmtDate(opp.createdAt)}
          </div>
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
          estimate={opp}
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

// ── Droppable Kanban Column ───────────────────────────────────
// Each column is registered as a droppable target with its stage name as the id.
function KanbanColumn({
  stage, opps, area, stages, onUpdate, onRemove,
  onConvertToEstimate, onConvertToJob, onArchive, onOpen,
  customerName,
}: {
  stage: string;
  opps: Opportunity[];
  area: PipelineArea;
  stages: OpportunityStage[];
  onUpdate: (id: string, payload: Partial<Opportunity>) => void;
  onRemove: (id: string) => void;
  onConvertToEstimate?: (id: string, title: string, value: number, transferNotes?: LeadNote[], transferAttachments?: JobAttachment[]) => void;
  onConvertToJob?: (id: string, title: string, value: number) => void;
  onArchive?: (id: string, value: number) => void;
  onOpen?: (id: string) => void;
  customerName?: string;
}) {
  // Register this column as a droppable target using the stage name as id
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const colValue = opps.reduce((s, o) => s + o.value, 0);

  return (
    <div
      className={`flex flex-col min-w-[220px] w-[220px] sm:min-w-[240px] sm:w-[240px] shrink-0 rounded-xl border transition-colors ${
        isOver ? 'border-primary/50 bg-primary/5' : 'border-border bg-slate-50/60'
      }`}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${stageColor(stage)} truncate max-w-[130px]`}>
            {stage}
          </span>
          <span className="text-[10px] text-muted-foreground font-semibold shrink-0">{opps.length}</span>
        </div>
        {colValue > 0 && (
          <span className="text-[10px] text-muted-foreground font-semibold shrink-0">{fmtDollar(colValue)}</span>
        )}
      </div>

      {/* Cards — ref is on the cards container so the whole column body is the drop zone */}
      <div ref={setNodeRef} className="flex-1 p-2 space-y-2 min-h-[80px]">
        <SortableContext items={opps.map(o => o.id)} strategy={verticalListSortingStrategy}>
          {opps.map(opp => (
            <KanbanCard
              key={opp.id}
              opp={opp}
              area={area}
              stages={stages}
              onUpdate={onUpdate}
              onRemove={onRemove}
              onConvertToEstimate={onConvertToEstimate}
              onConvertToJob={onConvertToJob}
              onArchive={onArchive}
              onOpen={onOpen}
              customerName={customerName}
            />
          ))}
        </SortableContext>
        {opps.length === 0 && (
          <div className={`text-center py-4 text-[10px] rounded-lg border border-dashed transition-colors ${
            isOver ? 'border-primary/40 text-primary bg-primary/5' : 'border-border/50 text-muted-foreground/50'
          }`}>
            Drop here
          </div>
        )}
      </div>
    </div>
  );
}

// // ── Table Row ─────────────────────────────────────────────
function TableRow({
  opp, area, stages, onUpdate, onRemove,
  onConvertToEstimate, onConvertToJob, onArchive, onOpen,
  customerName,
}: {
  opp: Opportunity;
  area: PipelineArea;
  stages: OpportunityStage[];
  onUpdate: (id: string, payload: Partial<Opportunity>) => void;
  onRemove: (id: string) => void;
  onConvertToEstimate?: (id: string, title: string, value: number, transferNotes?: LeadNote[], transferAttachments?: JobAttachment[]) => void;
  onConvertToJob?: (id: string, title: string, value: number) => void;
  onArchive?: (id: string, value: number) => void;
  onOpen?: (id: string) => void;
  customerName?: string;
}) {
  const [showConvertToEstimateModal, setShowConvertToEstimateModal] = useState(false);
  const [showConvertToJobModal, setShowConvertToJobModal] = useState(false);
  return (
    <>
    <tr className="hover:bg-slate-50 transition-colors group">
      {customerName !== undefined && (
        <td className="px-4 py-3 text-xs font-semibold text-primary truncate max-w-[120px]">
          {customerName}
        </td>
      )}
      <td className="px-4 py-3">
        <div className="font-medium text-sm text-foreground">{opp.title}</div>
        {opp.notes && (
          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{opp.notes}</div>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="relative inline-block">
          <select
            value={opp.stage}
            onChange={e => {
              onUpdate(opp.id, { stage: e.target.value as OpportunityStage });
              toast.success(`Moved to "${e.target.value}"`);
            }}
            className={`appearance-none pl-2 pr-6 py-1 text-[11px] font-semibold border rounded-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring ${stageColor(opp.stage)}`}
          >
            {stages.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </td>
      <td className="px-4 py-3 text-right font-mono text-sm hidden md:table-cell">
        {opp.value > 0 ? (
          <span className="font-semibold text-foreground">{fmtDollar(opp.value)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
        {fmtDate(opp.createdAt)}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onOpen && (
            <button
              onClick={() => onOpen(opp.id)}
              className="px-2 py-1 text-[10px] font-semibold border border-border rounded-lg text-muted-foreground hover:text-primary hover:border-primary transition-colors"
            >
              Open
            </button>
          )}
          {opp.clientSnapshot?.address && (
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent([opp.clientSnapshot.address, opp.clientSnapshot.city, opp.clientSnapshot.state, opp.clientSnapshot.zip].filter(Boolean).join(', '))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 text-muted-foreground/50 hover:text-primary transition-colors"
              title="Open in Google Maps"
            >
              <MapPin size={12} />
            </a>
          )}
          {onConvertToEstimate && (
            <button
              onClick={() => setShowConvertToEstimateModal(true)}
              className="px-2 py-1 text-[10px] font-semibold border border-border rounded-lg text-muted-foreground hover:text-primary hover:border-primary transition-colors hidden sm:inline-flex"
            >
              → Est
            </button>
          )}
          {onConvertToJob && (
            <button
              onClick={() => setShowConvertToJobModal(true)}
              className="px-2 py-1 text-[10px] font-semibold border border-border rounded-lg text-muted-foreground hover:text-primary hover:border-primary transition-colors hidden sm:inline-flex"
            >
              → Job
            </button>
          )}
          {onArchive && !opp.archived && (
            <button
              onClick={() => onArchive(opp.id, opp.value)}
              className="px-2 py-1 text-[10px] font-semibold border border-border rounded-lg text-muted-foreground hover:text-emerald-700 hover:border-emerald-300 transition-colors hidden sm:inline-flex"
            >
              Archive
            </button>
          )}
          <button
            onClick={() => {
              if (window.confirm(`Delete "${opp.title}"?`)) {
                onRemove(opp.id);
                toast.success('Removed');
              }
            }}
            className="p-1 text-muted-foreground/50 hover:text-destructive transition-colors"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </td>
    </tr>
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
        estimate={opp}
        onConfirm={(title, value) => {
          onConvertToJob(opp.id, title, value);
          setShowConvertToJobModal(false);
          toast.success('Estimate approved — Job created');
        }}
        onClose={() => setShowConvertToJobModal(false)}
      />
    )}
    </>
  );
}

// ── Add Form ──────────────────────────────────────────────────
function AddForm({
  area, stages, onAdd, onCancel,
}: {
  area: PipelineArea;
  stages: OpportunityStage[];
  onAdd: (title: string, stage: OpportunityStage, value: number, notes: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [stage, setStage] = useState<OpportunityStage>(stages[0]);
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd(title.trim(), stage, parseFloat(value) || 0, notes.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-primary/30 rounded-xl p-4 shadow-sm space-y-3">
      <div className="text-xs font-bold uppercase tracking-wider text-primary mb-2">
        New {area === 'lead' ? 'Lead' : area === 'estimate' ? 'Estimate' : 'Job'}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Title *</label>
          <input
            autoFocus
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={area === 'lead' ? 'e.g. Kitchen remodel inquiry' : area === 'estimate' ? 'e.g. Full kitchen estimate' : 'e.g. Kitchen remodel job'}
            className="field-input w-full"
            required
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Stage</label>
          <div className="relative">
            <select value={stage} onChange={e => setStage(e.target.value as OpportunityStage)} className="field-input w-full appearance-none pr-7">
              {stages.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Value ($)</label>
          <input
            type="number"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="0"
            min="0"
            className="field-input w-full"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Optional notes..."
            rows={2}
            className="field-input w-full resize-none"
          />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors">
          Add
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 border border-border rounded-lg text-xs font-semibold text-muted-foreground hover:bg-muted/50 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Customer Picker Modal ────────────────────────────────────
interface PickedCustomer { id: string; displayName: string; }

function CustomerPickerModal({
  area, onConfirm, onClose,
}: {
  area: PipelineArea;
  onConfirm: (c: PickedCustomer) => void;
  onClose: () => void;
}) {
  const { state, addCustomer } = useEstimator();
  const [mode, setMode] = useState<'search' | 'create'>('search');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<PickedCustomer | null>(null);
  const [newForm, setNewForm] = useState({ firstName: '', lastName: '', phone: '', email: '' });
  const inputRef = useRef<HTMLInputElement>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === 'search') setTimeout(() => inputRef.current?.focus(), 50);
    else setTimeout(() => firstNameRef.current?.focus(), 50);
  }, [mode]);

  const q = query.toLowerCase();
  const matches = q.length < 1 ? [] : (state.customers ?? []).filter(c => {
    const name = `${c.firstName ?? ''} ${c.lastName ?? ''} ${c.displayName ?? ''}`.toLowerCase();
    return name.includes(q) || (c.email ?? '').toLowerCase().includes(q) || (c.mobilePhone ?? '').includes(q);
  }).slice(0, 8);

  const handleSelectExisting = (c: typeof matches[0]) => {
    const display = c.displayName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
    setSelected({ id: c.id, displayName: display });
    setQuery(display);
  };

  const handleCreateNew = () => {
    const displayName = [newForm.firstName, newForm.lastName].filter(Boolean).join(' ');
    if (!displayName.trim()) return;
    const id = nanoid(8);
    const customer: Customer = {
      id, firstName: newForm.firstName, lastName: newForm.lastName, displayName,
      company: '', mobilePhone: newForm.phone, homePhone: '', workPhone: '',
      email: newForm.email, role: '', customerType: 'homeowner', doNotService: false,
      street: '', unit: '', city: '', state: 'WA', zip: '', addressNotes: '',
      customerNotes: '', billsTo: '', tags: [], leadSource: '', referredBy: '',
      sendNotifications: true, sendMarketingOptIn: false,
      createdAt: new Date().toISOString(), lifetimeValue: 0, outstandingBalance: 0,
    };
    addCustomer(customer);
    onConfirm({ id, displayName });
  };

  const areaLabel = area === 'lead' ? 'Lead' : area === 'estimate' ? 'Estimate' : 'Job';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <div className="text-base font-bold text-slate-800">New {areaLabel}</div>
            <div className="text-xs text-slate-500 mt-0.5">Select or create a customer first</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <XIcon size={16} />
          </button>
        </div>
        <div className="flex border-b border-slate-100">
          <button
            onClick={() => { setMode('search'); setSelected(null); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold transition-colors ${
              mode === 'search' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Search size={13} /> Existing customer
          </button>
          <button
            onClick={() => { setMode('create'); setSelected(null); setQuery(''); }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold transition-colors ${
              mode === 'create' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <UserPlus size={13} /> New customer
          </button>
        </div>
        <div className="p-4">
          {mode === 'search' ? (
            <div>
              <div className="relative mb-3">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={e => { setQuery(e.target.value); setSelected(null); }}
                  placeholder="Name, email, or phone…"
                  className="w-full pl-8 pr-8 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                {query && (
                  <button onClick={() => { setQuery(''); setSelected(null); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                    <XIcon size={13} />
                  </button>
                )}
              </div>
              {matches.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden mb-3">
                  {matches.map(c => {
                    const display = c.displayName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
                    const isSel = selected?.id === c.id;
                    return (
                      <button
                        key={c.id}
                        onClick={() => handleSelectExisting(c)}
                        className={`w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors border-b border-slate-100 last:border-0 ${
                          isSel ? 'bg-primary/5' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                          <User size={12} className="text-slate-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-slate-800">{display}</div>
                          <div className="text-xs text-slate-500 truncate">{c.mobilePhone ?? c.email ?? ''}</div>
                        </div>
                        {isSel && <Check size={14} className="text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
              {q.length >= 1 && matches.length === 0 && (
                <div className="text-center py-4 text-sm text-slate-400 mb-3">
                  No match —{' '}
                  <button onClick={() => setMode('create')} className="text-primary font-semibold hover:underline">
                    create new
                  </button>
                </div>
              )}
              {q.length === 0 && (
                <div className="text-center py-4 text-xs text-slate-400 mb-3">
                  Type to search {state.customers.length} customer{state.customers.length !== 1 ? 's' : ''}
                </div>
              )}
              <button
                onClick={() => selected && onConfirm(selected)}
                disabled={!selected}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Check size={14} /> Continue with {selected?.displayName ?? 'customer'} <ChevronRight size={14} />
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 mb-1 block">First name *</label>
                  <input
                    ref={firstNameRef}
                    type="text"
                    value={newForm.firstName}
                    onChange={e => setNewForm(f => ({ ...f, firstName: e.target.value }))}
                    placeholder="First"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Last name</label>
                  <input
                    type="text"
                    value={newForm.lastName}
                    onChange={e => setNewForm(f => ({ ...f, lastName: e.target.value }))}
                    placeholder="Last"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Mobile phone</label>
                <input
                  type="tel"
                  value={newForm.phone}
                  onChange={e => setNewForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="(360) 555-0100"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Email</label>
                <input
                  type="email"
                  value={newForm.email}
                  onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="email@example.com"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              <button
                onClick={handleCreateNew}
                disabled={!newForm.firstName.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <UserPlus size={14} /> Create & Continue <ChevronRight size={14} />
              </button>
              <p className="text-[11px] text-slate-400 text-center">Full profile can be completed after saving</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main PipelineBoard ────────────────────────────────────────
export default function PipelineBoard({
  area, stages, opportunities, onAdd, onUpdate, onRemove,
  onConvertToEstimate, onConvertToJob, onArchive, onOpen,
  customerName, compact = false, onOpenIntakeModal,
}: PipelineBoardProps) {
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [showAdd, setShowAdd] = useState(false);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [pickedCustomer, setPickedCustomer] = useState<PickedCustomer | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'title' | 'stage' | 'value' | 'created'>('created');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // PointerSensor with a small movement threshold + TouchSensor for mobile
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const activeOpps = opportunities.filter(o => !o.archived);
  const archivedOpps = opportunities.filter(o => o.archived);
  const totalValue = activeOpps.reduce((s, o) => s + o.value, 0);

  // Build stage → opps map
  const byStage: Record<string, Opportunity[]> = {};
  for (const s of stages) byStage[s] = [];
  for (const opp of activeOpps) {
    if (byStage[opp.stage] !== undefined) byStage[opp.stage].push(opp);
    else byStage[stages[0]].push(opp);
  }

  // Active drag card for DragOverlay
  const activeOpp = activeId ? opportunities.find(o => o.id === activeId) : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragOver = useCallback((_event: DragOverEvent) => {
    // Visual feedback is handled by useDroppable's isOver in each column
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const draggedOpp = opportunities.find(o => o.id === active.id);
    if (!draggedOpp) return;

    const overId = over.id as string;

    // Case 1: Dropped directly on a column (over.id === stage name from useDroppable)
    if (stages.includes(overId as OpportunityStage)) {
      if (draggedOpp.stage !== overId) {
        onUpdate(draggedOpp.id, { stage: overId as OpportunityStage });
        toast.success(`Moved to "${overId}"`);
      }
      return;
    }

    // Case 2: Dropped on another card — move to that card's column
    const overOpp = opportunities.find(o => o.id === overId);
    if (overOpp && draggedOpp.stage !== overOpp.stage) {
      onUpdate(draggedOpp.id, { stage: overOpp.stage });
      toast.success(`Moved to "${overOpp.stage}"`);
    }
  }, [opportunities, stages, onUpdate]);

  // Sorted table rows
  const sortedOpps = [...activeOpps].sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case 'title':   cmp = a.title.localeCompare(b.title); break;
      case 'stage':   cmp = a.stage.localeCompare(b.stage); break;
      case 'value':   cmp = a.value - b.value; break;
      case 'created': cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => (
    <ArrowUpDown size={10} className={`inline ml-1 ${sortField === field ? 'text-primary' : 'text-muted-foreground/30'}`} />
  );

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
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

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setView('kanban')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                view === 'kanban' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'
              }`}
            >
              <LayoutGrid size={12} />
              <span className="hidden sm:inline">Board</span>
            </button>
            <button
              onClick={() => setView('table')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                view === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/50'
              }`}
            >
              <List size={12} />
              <span className="hidden sm:inline">Table</span>
            </button>
          </div>

          <button
            onClick={() => {
              if (onOpenIntakeModal) {
                // Customer-profile context: open full intake modal pre-filled with this customer
                onOpenIntakeModal();
              } else if (customerName) {
                // Already inside a customer context — skip picker
                setShowAdd(s => !s);
              } else {
                setPickedCustomer(null);
                setShowCustomerPicker(true);
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      {/* ── Customer picker modal ── */}
      {showCustomerPicker && (
        <CustomerPickerModal
          area={area}
          onConfirm={(c) => {
            setPickedCustomer(c);
            setShowCustomerPicker(false);
            setShowAdd(true);
          }}
          onClose={() => setShowCustomerPicker(false)}
        />
      )}

      {/* ── Add form ── */}
      {showAdd && (
        <>
          {pickedCustomer && (
            <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg text-sm">
              <User size={13} className="text-primary shrink-0" />
              <span className="font-semibold text-primary">{pickedCustomer.displayName}</span>
              <span className="text-muted-foreground text-xs ml-1">— will be linked to this {area}</span>
            </div>
          )}
          <AddForm
            area={area}
            stages={stages}
            onAdd={(t, s, v, n) => {
              onAdd(t, s, v, n, pickedCustomer?.id, pickedCustomer?.displayName);
              setShowAdd(false);
              setPickedCustomer(null);
            }}
            onCancel={() => { setShowAdd(false); setPickedCustomer(null); }}
          />
        </>
      )}

      {/* ── Empty state ── */}
      {activeOpps.length === 0 && archivedOpps.length === 0 && !showAdd && (
        <div className="text-center py-12 border-2 border-dashed border-border rounded-xl text-muted-foreground">
          <div className="text-base font-semibold mb-1">
            No {area === 'lead' ? 'leads' : area === 'estimate' ? 'estimates' : 'jobs'} yet
          </div>
          <div className="text-sm">Click "Add" to get started.</div>
        </div>
      )}

      {/* ── KANBAN VIEW ── */}
      {view === 'kanban' && activeOpps.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="overflow-x-auto pb-3 -mx-1 px-1">
            <div className="flex gap-3" style={{ minWidth: 'max-content' }}>
              {stages.map(stage => (
                <KanbanColumn
                  key={stage}
                  stage={stage}
                  opps={byStage[stage] ?? []}
                  area={area}
                  stages={stages}
                  onUpdate={onUpdate}
                  onRemove={onRemove}
                  onConvertToEstimate={onConvertToEstimate}
                  onConvertToJob={onConvertToJob}
                  onArchive={onArchive}
                  onOpen={onOpen}
                  customerName={customerName}
                />
              ))}
            </div>
          </div>

          {/* Drag overlay — ghost card that follows the cursor */}
          <DragOverlay dropAnimation={null}>
            {activeOpp ? (
              <div className="bg-white border-2 border-primary/40 rounded-xl shadow-2xl p-3 w-[220px] rotate-1 opacity-95">
                <div className="text-sm font-semibold text-foreground">{activeOpp.title}</div>
                {activeOpp.value > 0 && (
                  <div className="text-xs text-muted-foreground mt-0.5">{fmtDollar(activeOpp.value)}</div>
                )}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* ── TABLE VIEW ── */}
      {view === 'table' && activeOpps.length > 0 && (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                {customerName !== undefined && (
                  <th className="px-4 py-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Customer</th>
                )}
                <th
                  className="px-4 py-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none"
                  onClick={() => handleSort('title')}
                >
                  Title <SortIcon field="title" />
                </th>
                <th
                  className="px-4 py-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none"
                  onClick={() => handleSort('stage')}
                >
                  Stage <SortIcon field="stage" />
                </th>
                <th
                  className="px-4 py-3 text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none hidden md:table-cell"
                  onClick={() => handleSort('value')}
                >
                  Value <SortIcon field="value" />
                </th>
                <th
                  className="px-4 py-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none hidden lg:table-cell"
                  onClick={() => handleSort('created')}
                >
                  Created <SortIcon field="created" />
                </th>
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedOpps.map(opp => (
                <TableRow
                  key={opp.id}
                  opp={opp}
                  area={area}
                  stages={stages}
                  onUpdate={onUpdate}
                  onRemove={onRemove}
                  onConvertToEstimate={onConvertToEstimate}
                  onConvertToJob={onConvertToJob}
                  onArchive={onArchive}
                  onOpen={onOpen}
                  customerName={customerName}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Archived section ── */}
      {archivedOpps.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowArchived(s => !s)}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <Archive size={12} />
            {showArchived ? 'Hide' : 'Show'} {archivedOpps.length} archived {area}(s)
            {!showArchived && archivedOpps.reduce((s, o) => s + o.value, 0) > 0 && (
              <span className="text-emerald-700 font-semibold">
                · {fmtDollar(archivedOpps.reduce((s, o) => s + o.value, 0))} earned
              </span>
            )}
          </button>
          {showArchived && (
            <div className="space-y-2 pl-2 border-l-2 border-emerald-200">
              {archivedOpps.map(opp => (
                <div key={opp.id} className="bg-white border border-border rounded-xl p-3 opacity-70">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium text-foreground">{opp.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{opp.stage} · {fmtDollar(opp.value)}</div>
                    </div>
                    <button
                      onClick={() => { if (window.confirm(`Delete "${opp.title}"?`)) { onRemove(opp.id); } }}
                      className="p-1 text-muted-foreground/40 hover:text-destructive transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
