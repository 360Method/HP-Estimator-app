// ============================================================
// JobDetailsSection — World-class job detail view
//   • Customer header: name, company, phone, email, address + map
//   • Job status & stage selector
//   • Job details (type, estimator, number, dates, scope)
//   • Service address with map preview + Open in Google Maps
//   • Job tasks checklist (add/complete/delete, priority)
//   • Pricing summary from estimate snapshot
//   • Attachments (upload files, list with download/delete)
//   • Activity feed (per-job timeline + add note)
//   • Internal notes
//   • Signed estimate + SOW viewer
// ============================================================

import { useState, useRef } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import {
  JOB_TYPES, JOB_STAGES, OpportunityStage, JobTaskPriority,
} from '@/lib/types';
import {
  Briefcase, MapPin, Hash, Calendar, User, FileText,
  ExternalLink, Edit3, ChevronDown, CalendarDays, ClipboardList,
  Download, ImageIcon, Phone, Mail, Building2, CheckSquare,
  Square, Plus, Trash2, Paperclip, MessageSquare, Clock,
  AlertCircle, Flag, DollarSign, ChevronRight, Navigation,
  CheckCircle2, Circle, Upload, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import AddressAutocomplete, { ParsedAddress } from '@/components/AddressAutocomplete';
import AddressMapPreview from '@/components/AddressMapPreview';

// ── Priority config ───────────────────────────────────────────
const PRIORITY_CONFIG: Record<JobTaskPriority, { label: string; color: string; icon: React.ReactNode }> = {
  low:    { label: 'Low',    color: 'text-slate-400',  icon: <Circle size={12} /> },
  normal: { label: 'Normal', color: 'text-sky-500',    icon: <Flag size={12} /> },
  high:   { label: 'High',   color: 'text-rose-500',   icon: <AlertCircle size={12} /> },
};

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Activity icon map ─────────────────────────────────────────
function ActivityIcon({ type }: { type: string }) {
  const base = 'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0';
  switch (type) {
    case 'note_added':       return <div className={`${base} bg-sky-100 text-sky-600`}><MessageSquare size={13} /></div>;
    case 'stage_changed':    return <div className={`${base} bg-amber-100 text-amber-600`}><ChevronRight size={13} /></div>;
    case 'job_created':      return <div className={`${base} bg-emerald-100 text-emerald-600`}><CheckCircle2 size={13} /></div>;
    case 'payment_received': return <div className={`${base} bg-green-100 text-green-600`}><DollarSign size={13} /></div>;
    case 'call_logged':      return <div className={`${base} bg-violet-100 text-violet-600`}><Phone size={13} /></div>;
    default:                 return <div className={`${base} bg-slate-100 text-slate-500`}><Clock size={13} /></div>;
  }
}

export default function JobDetailsSection() {
  const {
    state, setJobInfo, updateOpportunity, setSection, setScheduleFilter,
    addJobTask, updateJobTask, removeJobTask,
    addJobAttachment, removeJobAttachment,
    addJobActivity,
  } = useEstimator();
  const { jobInfo, activeOpportunityId, opportunities, customers, activeCustomerId } = state;

  const activeOpp = activeOpportunityId
    ? opportunities.find(o => o.id === activeOpportunityId)
    : null;

  const activeCustomer = activeCustomerId
    ? customers.find(c => c.id === activeCustomerId)
    : null;

  // Task form state
  const [taskInput, setTaskInput] = useState('');
  const [taskPriority, setTaskPriority] = useState<JobTaskPriority>('normal');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [showTaskForm, setShowTaskForm] = useState(false);

  // Activity note state
  const [noteInput, setNoteInput] = useState('');

  // File upload ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!activeOpp) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm">
        No active job opportunity selected.
      </div>
    );
  }

  const handleStageChange = (stage: string) => {
    updateOpportunity(activeOpp.id, { stage: stage as OpportunityStage });
    addJobActivity(activeOpp.id, {
      type: 'stage_changed',
      title: 'Stage updated',
      description: `Stage changed to "${stage}"`,
    });
    toast.success(`Stage updated to "${stage}"`);
  };

  const stageColor = STAGE_COLORS[activeOpp.stage] ?? 'bg-slate-100 text-slate-700';
  const signedEstimateUrl = activeOpp.jobSignedEstimateDataUrl || activeOpp.signedEstimateDataUrl;
  const signedEstimateFilename = activeOpp.jobSignedEstimateFilename || activeOpp.signedEstimateFilename || 'signed-estimate.png';

  // Resolve customer display info — prefer clientSnapshot (captured at conversion time)
  const snap = activeOpp.clientSnapshot;
  const displayName = snap?.client || activeCustomer?.firstName
    ? `${activeCustomer?.firstName ?? ''} ${activeCustomer?.lastName ?? ''}`.trim()
    : activeOpp.title;
  const displayCompany = snap?.companyName || activeCustomer?.company || '';
  const displayPhone = snap?.phone || activeCustomer?.mobilePhone || activeCustomer?.homePhone || '';
  const displayEmail = snap?.email || activeCustomer?.email || '';
  const displayAddress = snap?.address || jobInfo.address || '';
  const displayCity = snap?.city || jobInfo.city || '';
  const displayState = snap?.state || jobInfo.state || '';
  const displayZip = snap?.zip || jobInfo.zip || '';
  const fullAddress = [displayAddress, displayCity, displayState, displayZip].filter(Boolean).join(', ');

  // Pricing from estimate snapshot
  const snap2 = activeOpp.estimateSnapshot;
  const totalPrice = activeOpp.value ?? 0;
  // Derive deposit from snapshot depositType/depositValue
  const depositAmount = snap2
    ? snap2.depositType === 'pct'
      ? Math.round(totalPrice * snap2.depositValue / 100 * 100) / 100
      : snap2.depositValue
    : 0;
  const balanceAmount = totalPrice - depositAmount;

  // Tasks
  const tasks = activeOpp.tasks ?? [];
  const completedCount = tasks.filter(t => t.completed).length;

  // Attachments
  const attachments = activeOpp.attachments ?? [];

  // Activity
  const jobActivity = activeOpp.jobActivity ?? [];

  // ── Handlers ──────────────────────────────────────────────
  const handleAddTask = () => {
    if (!taskInput.trim()) return;
    addJobTask(activeOpp.id, {
      id: nanoid(8),
      title: taskInput.trim(),
      completed: false,
      priority: taskPriority,
      assignedTo: taskAssignee.trim() || undefined,
      createdAt: new Date().toISOString(),
    });
    setTaskInput('');
    setTaskAssignee('');
    setTaskPriority('normal');
    setShowTaskForm(false);
    toast.success('Task added');
  };

  const handleToggleTask = (taskId: string, completed: boolean) => {
    updateJobTask(activeOpp.id, taskId, {
      completed,
      completedAt: completed ? new Date().toISOString() : undefined,
    });
  };

  const handleAddNote = () => {
    if (!noteInput.trim()) return;
    addJobActivity(activeOpp.id, {
      type: 'note_added',
      title: 'Note added',
      description: noteInput.trim(),
    });
    setNoteInput('');
    toast.success('Note added to activity feed');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach(file => {
      // Store as a data URL for local-only persistence (no S3 in static mode)
      const reader = new FileReader();
      reader.onload = (ev) => {
        const url = ev.target?.result as string;
        addJobAttachment(activeOpp.id, {
          id: nanoid(8),
          name: file.name,
          url,
          mimeType: file.type,
          size: file.size,
          uploadedAt: new Date().toISOString(),
        });
        addJobActivity(activeOpp.id, {
          type: 'note_added',
          title: 'Attachment added',
          description: `File "${file.name}" attached to job`,
        });
        toast.success(`"${file.name}" attached`);
      };
      reader.readAsDataURL(file);
    });
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteAttachment = (attachmentId: string, name: string) => {
    removeJobAttachment(activeOpp.id, attachmentId);
    toast.success(`"${name}" removed`);
  };

  const mapsUrl = fullAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
    : null;

  return (
    <div className="space-y-5 pb-10">

      {/* ── Customer Header ── */}
      <div className="card-section">
        <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
          <User size={13} />
          <span>Customer</span>
          {activeCustomer && (
            <button
              onClick={() => setSection('customers')}
              className="ml-auto flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              View profile <ExternalLink size={10} />
            </button>
          )}
        </div>
        <div className="card-section-body">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Customer info */}
            <div className="flex-1 space-y-2">
              <div>
                <p className="text-base font-bold text-foreground leading-tight">{displayName || '—'}</p>
                {displayCompany && (
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                    <Building2 size={12} />
                    {displayCompany}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                {displayPhone && (
                  <a href={`tel:${displayPhone}`} className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors">
                    <Phone size={13} className="text-muted-foreground flex-shrink-0" />
                    {displayPhone}
                  </a>
                )}
                {displayEmail && (
                  <a href={`mailto:${displayEmail}`} className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors truncate">
                    <Mail size={13} className="text-muted-foreground flex-shrink-0" />
                    {displayEmail}
                  </a>
                )}
                {fullAddress && (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin size={13} className="flex-shrink-0 mt-0.5" />
                    <span className="leading-snug">{fullAddress}</span>
                  </div>
                )}
              </div>
            </div>
            {/* Quick actions */}
            <div className="flex sm:flex-col gap-2">
              {displayPhone && (
                <a href={`tel:${displayPhone}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold hover:bg-emerald-100 transition-colors">
                  <Phone size={12} /> Call
                </a>
              )}
              {displayEmail && (
                <a href={`mailto:${displayEmail}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400 text-xs font-semibold hover:bg-sky-100 transition-colors">
                  <Mail size={12} /> Email
                </a>
              )}
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-xs font-semibold hover:bg-amber-100 transition-colors">
                  <Navigation size={12} /> Maps
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Job Status card ── */}
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
            const linkedEvents = state.scheduleEvents.filter(e => e.opportunityId === activeOpp.id);
            return (
              <button
                onClick={() => { setScheduleFilter(activeOpp.id); setSection('schedule'); }}
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

      {/* ── Pricing Summary card ── */}
      {totalPrice > 0 && (
        <div className="card-section">
          <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
            <DollarSign size={13} />
            <span>Pricing Summary</span>
          </div>
          <div className="card-section-body">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-muted/40 p-3 text-center">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total</p>
                <p className="text-base font-bold text-foreground">${totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 p-3 text-center">
                <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">Deposit</p>
                <p className="text-base font-bold text-amber-700 dark:text-amber-300">${depositAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 p-3 text-center">
                <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-1">Balance</p>
                <p className="text-base font-bold text-emerald-700 dark:text-emerald-300">${balanceAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>
            {snap2 && snap2.customItems.length > 0 && (
              <div className="mt-3 border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/40 border-b">
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Item</th>
                      <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Qty</th>
                      <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Hard Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snap2.customItems.slice(0, 8).map((item) => (
                      <tr key={item.id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-3 py-2 text-foreground">{item.description}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{item.qty} {item.unitType}</td>
                        <td className="px-3 py-2 text-right font-medium">${(item.matCostPerUnit * item.qty).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                    {snap2.customItems.length > 8 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-2 text-center text-muted-foreground italic">
                          +{snap2.customItems.length - 8} more items — view full estimate
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Job Tasks card ── */}
      <div className="card-section">
        <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
          <CheckSquare size={13} />
          <span>Job Tasks</span>
          {tasks.length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold">
              {completedCount}/{tasks.length}
            </span>
          )}
          <button
            onClick={() => setShowTaskForm(v => !v)}
            className="ml-auto flex items-center gap-1 text-[11px] text-primary hover:underline font-semibold"
          >
            <Plus size={12} /> Add Task
          </button>
        </div>
        <div className="card-section-body space-y-2">
          {/* Progress bar */}
          {tasks.length > 0 && (
            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden mb-3">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${(completedCount / tasks.length) * 100}%` }}
              />
            </div>
          )}

          {/* Add task form */}
          {showTaskForm && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2 mb-2">
              <input
                type="text"
                value={taskInput}
                onChange={e => setTaskInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddTask(); if (e.key === 'Escape') setShowTaskForm(false); }}
                placeholder="Task description…"
                className="field-input w-full text-sm"
                autoFocus
              />
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <select
                    value={taskPriority}
                    onChange={e => setTaskPriority(e.target.value as JobTaskPriority)}
                    className="field-input w-full appearance-none pr-6 text-xs"
                  >
                    <option value="low">Low priority</option>
                    <option value="normal">Normal priority</option>
                    <option value="high">High priority</option>
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>
                <input
                  type="text"
                  value={taskAssignee}
                  onChange={e => setTaskAssignee(e.target.value)}
                  placeholder="Assign to…"
                  className="field-input flex-1 text-xs"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowTaskForm(false)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1">Cancel</button>
                <button onClick={handleAddTask} className="text-xs bg-primary text-primary-foreground px-3 py-1 rounded-md font-semibold hover:bg-primary/90 transition-colors">Add</button>
              </div>
            </div>
          )}

          {/* Task list */}
          {tasks.length === 0 && !showTaskForm && (
            <p className="text-xs text-muted-foreground py-2 text-center">No tasks yet. Click "+ Add Task" to get started.</p>
          )}
          {tasks.map(task => {
            const pc = PRIORITY_CONFIG[task.priority];
            return (
              <div key={task.id} className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 group transition-colors ${task.completed ? 'bg-muted/20 opacity-60' : 'hover:bg-muted/30'}`}>
                <button
                  onClick={() => handleToggleTask(task.id, !task.completed)}
                  className="mt-0.5 flex-shrink-0 text-muted-foreground hover:text-emerald-600 transition-colors"
                >
                  {task.completed
                    ? <CheckCircle2 size={16} className="text-emerald-500" />
                    : <Circle size={16} />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug ${task.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`flex items-center gap-0.5 text-[10px] font-semibold ${pc.color}`}>
                      {pc.icon} {pc.label}
                    </span>
                    {task.assignedTo && (
                      <span className="text-[10px] text-muted-foreground">→ {task.assignedTo}</span>
                    )}
                    {task.completedAt && (
                      <span className="text-[10px] text-muted-foreground">{formatRelative(task.completedAt)}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => { removeJobTask(activeOpp.id, task.id); toast.success('Task removed'); }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-500 transition-all flex-shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
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
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Job Type</label>
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
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Estimator / Assigned To</label>
            <div className="relative">
              <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" value={jobInfo.estimator} onChange={e => setJobInfo({ estimator: e.target.value })}
                placeholder="e.g. Mike, Sarah" className="field-input w-full pl-8" />
            </div>
          </div>

          {/* Job Number */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Job Number</label>
            <div className="relative">
              <Hash size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" value={jobInfo.jobNumber} onChange={e => setJobInfo({ jobNumber: e.target.value })}
                placeholder="HP-2026-001" className="field-input w-full pl-8" />
            </div>
          </div>

          {/* Estimate Date */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Estimate Date</label>
            <div className="relative">
              <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="date" value={jobInfo.date} onChange={e => setJobInfo({ date: e.target.value })}
                className="field-input w-full pl-8" />
            </div>
          </div>

          {/* Expires Date */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Estimate Expires</label>
            <div className="relative">
              <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="date" value={jobInfo.expiresDate} onChange={e => setJobInfo({ expiresDate: e.target.value })}
                className="field-input w-full pl-8" />
            </div>
          </div>

          {/* Service Date */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Service / Start Date</label>
            <div className="relative">
              <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="date" value={jobInfo.servicedDate} onChange={e => setJobInfo({ servicedDate: e.target.value })}
                className="field-input w-full pl-8" />
            </div>
          </div>

          {/* Scope of Work */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Scope of Work</label>
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
          {mapsUrl && (
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
              className="ml-auto flex items-center gap-1 text-[11px] text-primary hover:underline font-semibold">
              <Navigation size={11} /> Open in Google Maps
            </a>
          )}
        </div>
        <div className="card-section-body space-y-3">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Street Address</label>
            <AddressAutocomplete
              value={jobInfo.address}
              onChange={v => setJobInfo({ address: v })}
              onAddressSelect={(parsed: ParsedAddress) => {
                setJobInfo({
                  address: parsed.street,
                  city: parsed.city || jobInfo.city,
                  state: parsed.state || jobInfo.state,
                  zip: parsed.zip || jobInfo.zip,
                });
              }}
              placeholder="1234 Main St"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
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
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">ZIP</label>
              <input type="text" value={jobInfo.zip} onChange={e => setJobInfo({ zip: e.target.value })}
                placeholder="98660" className="field-input w-full" />
            </div>
          </div>
          {jobInfo.address && (
            <AddressMapPreview
              street={jobInfo.address}
              city={jobInfo.city}
              state={jobInfo.state}
              zip={jobInfo.zip}
              height="180px"
              showLink
            />
          )}
        </div>
      </div>

      {/* ── Attachments card ── */}
      <div className="card-section">
        <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
          <Paperclip size={13} />
          <span>Attachments</span>
          {attachments.length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold">
              {attachments.length}
            </span>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="ml-auto flex items-center gap-1 text-[11px] text-primary hover:underline font-semibold"
          >
            <Upload size={12} /> Upload
          </button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileUpload} />
        </div>
        <div className="card-section-body">
          {attachments.length === 0 ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-muted-foreground/20 rounded-lg py-6 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
            >
              <Upload size={20} />
              <span className="text-xs font-medium">Click to upload files</span>
              <span className="text-[10px]">Photos, PDFs, documents</span>
            </button>
          ) : (
            <div className="space-y-1.5">
              {attachments.map(att => {
                const isImage = att.mimeType.startsWith('image/');
                return (
                  <div key={att.id} className="flex items-center gap-2.5 rounded-lg border px-3 py-2 group hover:bg-muted/30 transition-colors">
                    {isImage ? (
                      <img src={att.url} alt={att.name} className="w-8 h-8 rounded object-cover flex-shrink-0 border" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                        <FileText size={14} className="text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{att.name}</p>
                      <p className="text-[10px] text-muted-foreground">{formatBytes(att.size)} · {formatRelative(att.uploadedAt)}</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <a href={att.url} download={att.name}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                        <Download size={13} />
                      </a>
                      <button
                        onClick={() => handleDeleteAttachment(att.id, att.name)}
                        className="p-1 rounded hover:bg-rose-50 text-muted-foreground hover:text-rose-500 transition-colors">
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-primary py-2 border border-dashed border-muted-foreground/20 rounded-lg hover:border-primary/40 transition-colors"
              >
                <Plus size={12} /> Add more files
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Activity Feed card ── */}
      <div className="card-section">
        <div className="card-section-header text-xs font-semibold uppercase tracking-wider">
          <Clock size={13} />
          <span>Activity Feed</span>
        </div>
        <div className="card-section-body space-y-3">
          {/* Add note */}
          <div className="flex gap-2">
            <textarea
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddNote(); } }}
              placeholder="Add a note, update, or observation… (Enter to submit)"
              rows={2}
              className="field-input flex-1 resize-none text-sm"
            />
            <button
              onClick={handleAddNote}
              disabled={!noteInput.trim()}
              className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors self-end"
            >
              Add
            </button>
          </div>

          {/* Activity timeline */}
          {jobActivity.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">No activity yet. Stage changes and notes will appear here.</p>
          ) : (
            <div className="space-y-2 mt-1">
              {jobActivity.map(event => (
                <div key={event.id} className="flex gap-2.5">
                  <ActivityIcon type={event.type} />
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-baseline gap-2">
                      <p className="text-xs font-semibold text-foreground">{event.title}</p>
                      <p className="text-[10px] text-muted-foreground flex-shrink-0">{formatRelative(event.timestamp)}</p>
                    </div>
                    {event.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{event.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
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
            <span className="ml-auto text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">✓ Attached</span>
          </div>
          <div className="card-section-body space-y-3">
            <p className="text-xs text-muted-foreground">The customer-signed estimate is attached to this job for reference.</p>
            <div className="rounded-lg border overflow-hidden bg-muted/20">
              <img src={signedEstimateUrl} alt="Signed Estimate" className="w-full object-contain max-h-72" />
            </div>
            <a href={signedEstimateUrl} download={signedEstimateFilename}
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
              <Download size={11} /> Download signed estimate
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
            <SowViewer sow={activeOpp.sowDocument} filename={`SOW-${activeOpp.jobNumber || activeOpp.id}.txt`} />
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
        <button onClick={() => setExpanded(v => !v)} className="text-xs text-primary hover:underline">
          {expanded ? 'Show less' : 'Show full SOW'}
        </button>
        <button onClick={handleDownload} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          <Download size={11} /> Download .txt
        </button>
      </div>
    </div>
  );
}
