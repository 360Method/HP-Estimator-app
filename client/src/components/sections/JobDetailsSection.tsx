// ============================================================
// JobDetailsSection — World-class job detail view
// Single source of truth for everything from lead → estimate → job
//   • Project command center header (customer, contact, map, stage)
//   • Full project history timeline (lead → estimate → job)
//   • Live editable SOW (regenerate or edit inline)
//   • Signed estimate viewer
//   • Estimate lineage (phases, pricing breakdown)
//   • Job tasks checklist (priority, assignee, due date)
//   • Pricing summary + deposit tracking
//   • Attachments (unified: lead + estimate + job)
//   • Activity feed
//   • Internal notes (crew-only)
//   • Change orders panel (create, track, open)
// ============================================================
import { useState, useRef } from 'react';
import { trpc } from '@/lib/trpc';
import { useEstimator } from '@/contexts/EstimatorContext';
import {
  JOB_STAGES, OpportunityStage, JobTaskPriority,
  ChangeOrder, ChangeOrderStatus,
} from '@/lib/types';
import {
  Briefcase, MapPin, Hash, Calendar, User, FileText,
  ExternalLink, Edit3, ChevronDown, ClipboardList,
  Download, Phone, Mail, Building2, CheckSquare,
  Plus, Trash2, Paperclip, MessageSquare, Clock,
  DollarSign, ChevronRight, Navigation,
  CheckCircle2, Circle, Upload, X, RefreshCw, Pencil,
  Save, ChevronUp, GitBranch, History,
  FileCheck, ArrowRight, Zap, Star,
} from 'lucide-react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import AddressMapPreview from '@/components/AddressMapPreview';
import { generateSOW } from '@/lib/generateSOW';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';

// ── Helpers ───────────────────────────────────────────────────
const fmt$ = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Priority config ───────────────────────────────────────────
const PRIORITY_CONFIG: Record<JobTaskPriority, { label: string; color: string; dot: string }> = {
  low:    { label: 'Low',    color: 'text-slate-400',  dot: 'bg-slate-300' },
  normal: { label: 'Normal', color: 'text-sky-500',    dot: 'bg-sky-400' },
  high:   { label: 'High',   color: 'text-rose-500',   dot: 'bg-rose-400' },
};

const STAGE_COLORS: Record<string, string> = {
  'New Job':                  'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  'Deposit Needed':           'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  'Deposit Collected':        'bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300',
  'Need to Order Materials':  'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  'Waiting on Materials':     'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  'Materials Received':       'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  'Unscheduled':              'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  'Scheduled':                'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  'In Progress':              'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  'Completed':                'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  'Invoice Sent':             'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  'Invoice Paid':             'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
};

const CO_STATUS_CONFIG: Record<ChangeOrderStatus, { label: string; color: string }> = {
  draft:    { label: 'Draft',    color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  sent:     { label: 'Sent',     color: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300' },
  approved: { label: 'Approved', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  rejected: { label: 'Rejected', color: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300' },
};

// ── Activity icon map ─────────────────────────────────────────
function ActivityIcon({ type }: { type: string }) {
  const base = 'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0';
  switch (type) {
    case 'note_added':           return <div className={`${base} bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400`}><MessageSquare size={13} /></div>;
    case 'stage_changed':        return <div className={`${base} bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400`}><ChevronRight size={13} /></div>;
    case 'job_created':          return <div className={`${base} bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400`}><CheckCircle2 size={13} /></div>;
    case 'payment_received':     return <div className={`${base} bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400`}><DollarSign size={13} /></div>;
    case 'call_logged':          return <div className={`${base} bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400`}><Phone size={13} /></div>;
    case 'change_order_created': return <div className={`${base} bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400`}><GitBranch size={13} /></div>;
    case 'sow_updated':
    case 'sow_edited':           return <div className={`${base} bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400`}><FileText size={13} /></div>;
    case 'attachment_added':     return <div className={`${base} bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400`}><Paperclip size={13} /></div>;
    default:                     return <div className={`${base} bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400`}><Clock size={13} /></div>;
  }
}

// ── Section wrapper ───────────────────────────────────────────
function Section({
  icon, title, badge, defaultOpen = true, rightSlot, children,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="card-section">
        <CollapsibleTrigger asChild>
          <button className="card-section-header text-xs font-semibold uppercase tracking-wider w-full text-left">
            {icon}
            <span>{title}</span>
            {badge}
            <span className="ml-auto flex items-center gap-2">
              {rightSlot}
              {open
                ? <ChevronUp size={13} className="text-muted-foreground" />
                : <ChevronDown size={13} className="text-muted-foreground" />}
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="card-section-body">
            {children}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// ── Create Change Order Modal ─────────────────────────────────
function CreateChangeOrderModal({
  open, onClose, onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string, scopeSummary: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [scope, setScope] = useState('');
  const handleSubmit = () => {
    if (!reason.trim()) { toast.error('Reason is required'); return; }
    onConfirm(reason.trim(), scope.trim());
    setReason(''); setScope('');
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch size={16} className="text-orange-500" />
            Create Change Order
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            A new estimate will be created and linked to this job. Price it out, then mark it approved to update the job total.
          </p>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Reason for Change *
            </label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Customer added scope — master bath tile"
              className="field-input w-full text-sm"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Scope Summary
            </label>
            <Textarea
              value={scope}
              onChange={e => setScope(e.target.value)}
              placeholder="Brief description of what changed…"
              rows={3}
              className="text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} className="gap-1.5">
            <GitBranch size={14} /> Create CO &amp; Open Estimate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Lightbox ──────────────────────────────────────────────────
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <button className="absolute top-4 right-4 text-white/80 hover:text-white" onClick={onClose}>
        <X size={24} />
      </button>
      <img
        src={src}
        alt="Attachment preview"
        className="max-w-full max-h-[90vh] rounded-lg object-contain"
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────
export default function JobDetailsSection() {
  const {
    state, setJobInfo, updateOpportunity, setSection, setScheduleFilter,
    addJobTask, updateJobTask, removeJobTask,
    addJobAttachment, removeJobAttachment,
    addJobActivity,
    createChangeOrder, updateChangeOrder, updateSow,
    setActiveOpportunity, setPipelineArea,
  } = useEstimator();

  const uploadFile = trpc.uploads.uploadFile.useMutation();
  const quickSendSms = trpc.opportunities.quickSendSms.useMutation();

  const {
    jobInfo, activeOpportunityId, opportunities, customers, activeCustomerId,
  } = state;

  const activeOpp = activeOpportunityId
    ? opportunities.find(o => o.id === activeOpportunityId)
    : null;
  const activeCustomer = activeCustomerId
    ? customers.find(c => c.id === activeCustomerId)
    : null;

  // Resolve source estimate and lead
  const sourceEstimate = activeOpp?.sourceEstimateId
    ? opportunities.find(o => o.id === activeOpp.sourceEstimateId)
    : null;
  const sourceLead = sourceEstimate?.sourceLeadId
    ? opportunities.find(o => o.id === sourceEstimate.sourceLeadId)
    : activeOpp?.sourceLeadId
      ? opportunities.find(o => o.id === activeOpp.sourceLeadId)
      : null;

  // Task form state
  const [taskInput, setTaskInput] = useState('');
  const [taskPriority, setTaskPriority] = useState<JobTaskPriority>('normal');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [showTaskForm, setShowTaskForm] = useState(false);

  // Activity note state
  const [noteInput, setNoteInput] = useState('');

  // SOW state
  const [sowEditMode, setSowEditMode] = useState(false);
  const [sowDraft, setSowDraft] = useState('');
  const [sowExpanded, setSowExpanded] = useState(false);

  // Change order modal
  const [showCOModal, setShowCOModal] = useState(false);

  // SMS modal
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsBody, setSmsBody] = useState('');
  const [smsSending, setSmsSending] = useState(false);

  // Lightbox
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // File upload ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!activeOpp) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm">
        No active job selected.
      </div>
    );
  }

  // ── Derived display values ─────────────────────────────────
  const snap = activeOpp.clientSnapshot;
  const displayName = snap?.client
    || (activeCustomer ? `${activeCustomer.firstName ?? ''} ${activeCustomer.lastName ?? ''}`.trim() : activeOpp.title);
  const displayCompany = snap?.companyName || activeCustomer?.company || '';
  const displayPhone = snap?.phone || activeCustomer?.mobilePhone || activeCustomer?.homePhone || '';
  const displayEmail = snap?.email || activeCustomer?.email || '';
  const displayAddress = snap?.address || jobInfo.address || '';
  const displayCity = snap?.city || jobInfo.city || '';
  const displayState = snap?.state || jobInfo.state || '';
  const displayZip = snap?.zip || jobInfo.zip || '';
  const fullAddress = [displayAddress, displayCity, displayState, displayZip].filter(Boolean).join(', ');
  const mapsUrl = fullAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
    : null;

  const stageColor = STAGE_COLORS[activeOpp.stage] ?? 'bg-slate-100 text-slate-700';

  // Pricing
  const snap2 = activeOpp.estimateSnapshot;
  const totalPrice = activeOpp.value ?? 0;
  const depositAmount = snap2
    ? snap2.depositType === 'pct'
      ? Math.round(totalPrice * snap2.depositValue / 100 * 100) / 100
      : snap2.depositValue
    : 0;
  const balanceAmount = totalPrice - depositAmount;
  const changeOrders = activeOpp.changeOrders ?? [];
  const totalWithCOs = totalPrice + changeOrders
    .filter(co => co.status === 'approved')
    .reduce((sum, co) => sum + co.valueDelta, 0);

  // Signed estimate
  const signedEstimateUrl = activeOpp.jobSignedEstimateDataUrl || activeOpp.signedEstimateDataUrl;
  const signedEstimateFilename = activeOpp.jobSignedEstimateFilename || activeOpp.signedEstimateFilename || 'signed-estimate.png';

  // Tasks
  const tasks = activeOpp.tasks ?? [];
  const completedCount = tasks.filter(t => t.completed).length;
  const taskProgress = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  // Attachments — unified: lead + estimate + job
  const leadAttachments = (sourceLead?.leadAttachments ?? []).map(a => ({ ...a, source: 'Lead' as const }));
  const estimateAttachments = (sourceEstimate?.leadAttachments ?? []).map(a => ({ ...a, source: 'Estimate' as const }));
  const jobAttachments = (activeOpp.attachments ?? []).map(a => ({ ...a, source: 'Job' as const }));
  const allAttachments = [...leadAttachments, ...estimateAttachments, ...jobAttachments];

  // Activity
  const jobActivity = [...(activeOpp.jobActivity ?? [])].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  // ── Handlers ──────────────────────────────────────────────
  const handleStageChange = (stage: string) => {
    updateOpportunity(activeOpp.id, { stage: stage as OpportunityStage });
    addJobActivity(activeOpp.id, {
      type: 'stage_changed',
      title: 'Stage updated',
      description: `Stage changed to "${stage}"`,
    });
    toast.success(`Stage → "${stage}"`);
  };

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
    setTaskInput(''); setTaskPriority('normal'); setTaskAssignee('');
    setShowTaskForm(false);
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
    toast.success('Note added');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    for (const file of files) {
      if (file.size > 16 * 1024 * 1024) { toast.error(`"${file.name}" exceeds 16 MB`); continue; }
      toast.loading(`Uploading "${file.name}"…`, { id: file.name });
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = ev => resolve(ev.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const result = await uploadFile.mutateAsync({
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          base64,
          folder: 'job-attachments',
        });
        addJobAttachment(activeOpp.id, {
          id: nanoid(8),
          name: file.name,
          url: result.url,
          mimeType: file.type,
          size: file.size,
          uploadedAt: new Date().toISOString(),
        });
        addJobActivity(activeOpp.id, {
          type: 'attachment_added',
          title: 'Attachment added',
          description: `"${file.name}" uploaded`,
        });
        toast.success(`"${file.name}" uploaded`, { id: file.name });
      } catch {
        toast.error(`Failed to upload "${file.name}"`, { id: file.name });
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSendSms = async () => {
    if (!displayPhone || !smsBody.trim()) return;
    setSmsSending(true);
    try {
      await quickSendSms.mutateAsync({
        to: displayPhone,
        body: smsBody.trim(),
        contactName: displayName,
        customerId: activeCustomer?.id,
      });
      addJobActivity(activeOpp.id, {
        type: 'call_logged',
        title: 'SMS sent',
        description: smsBody.trim(),
      });
      toast.success('SMS sent');
      setSmsBody(''); setSmsOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to send SMS');
    } finally {
      setSmsSending(false);
    }
  };

  const handleRegenerateSOW = () => {
    if (!snap2) { toast.error('No estimate snapshot — approve an estimate first'); return; }
    const sow = generateSOW(snap2);
    updateSow(activeOpp.id, sow);
    addJobActivity(activeOpp.id, {
      type: 'sow_updated',
      title: 'SOW regenerated',
      description: 'Statement of Work regenerated from approved estimate',
    });
    toast.success('SOW regenerated');
  };

  const handleSaveSowEdit = () => {
    updateSow(activeOpp.id, sowDraft);
    addJobActivity(activeOpp.id, {
      type: 'sow_updated',
      title: 'SOW edited',
      description: 'Statement of Work updated manually',
    });
    setSowEditMode(false);
    toast.success('SOW saved');
  };

  const handleCreateCO = (reason: string, scopeSummary: string) => {
    createChangeOrder(activeOpp.id, reason, scopeSummary);
    toast.success('Change order created — opening estimate…');
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="space-y-4 pb-12">

      {/* ── Project Header ── */}
      <div className="card-section overflow-hidden">
        {/* Stage banner */}
        <div className={`px-4 py-2 text-xs font-bold uppercase tracking-widest flex items-center justify-between ${stageColor}`}>
          <span className="flex items-center gap-1.5">
            <Briefcase size={12} />
            {activeOpp.stage}
          </span>
          {activeOpp.jobNumber && (
            <span className="flex items-center gap-1 opacity-80">
              <Hash size={11} />
              {activeOpp.jobNumber}
            </span>
          )}
        </div>

        <div className="card-section-body">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Customer info */}
            <div className="flex-1 space-y-3">
              <div>
                <h2 className="text-lg font-bold text-foreground leading-tight">{displayName || '—'}</h2>
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
              {/* Quick actions */}
              <div className="flex flex-wrap gap-2 pt-1">
                {displayPhone && (
                  <a href={`tel:${displayPhone}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">
                    <Phone size={12} /> Call
                  </a>
                )}
                {displayPhone && (
                  <button
                    onClick={() => setSmsOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-400 text-xs font-semibold hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors">
                    <MessageSquare size={12} /> SMS
                  </button>
                )}
                {displayEmail && (
                  <a href={`mailto:${displayEmail}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 text-xs font-semibold hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors">
                    <Mail size={12} /> Email
                  </a>
                )}
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors">
                    <Navigation size={12} /> Maps
                  </a>
                )}
                {activeCustomer && (
                  <button
                    onClick={() => setSection('customers')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                    <User size={12} /> Profile
                  </button>
                )}
              </div>
            </div>

            {/* Map */}
            {fullAddress && (
              <div className="w-full sm:w-44 flex-shrink-0">
                <AddressMapPreview
                  addressString={fullAddress}
                  height="130px"
                  showLink={false}
                  className="rounded-lg overflow-hidden border"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Stage Selector ── */}
      <Section icon={<Briefcase size={13} />} title="Job Stage" defaultOpen={true}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {JOB_STAGES.map(stage => (
            <button
              key={stage}
              onClick={() => handleStageChange(stage)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold text-left transition-all border ${
                activeOpp.stage === stage
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-transparent bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground'
              }`}
            >
              {stage}
            </button>
          ))}
        </div>
      </Section>

      {/* ── Project History Timeline ── */}
      <Section
        icon={<History size={13} />}
        title="Project History"
        defaultOpen={true}
        badge={
          <span className="ml-2 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-semibold">
            {[sourceLead, sourceEstimate, activeOpp].filter(Boolean).length} stages
          </span>
        }
      >
        <div className="relative">
          <div className="absolute left-3.5 top-4 bottom-4 w-px bg-border" />
          <div className="space-y-4 pl-10">

            {/* Lead */}
            {sourceLead && (
              <div className="relative">
                <div className="absolute -left-[26px] w-7 h-7 rounded-full bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400 flex items-center justify-center border-2 border-background">
                  <Star size={11} />
                </div>
                <div className="rounded-lg border bg-sky-50/50 dark:bg-sky-950/20 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wider">Lead</span>
                    <span className="text-[10px] text-muted-foreground">{formatRelative(sourceLead.createdAt)}</span>
                  </div>
                  <p className="text-sm font-semibold text-foreground">{sourceLead.title}</p>
                  {sourceLead.notes && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{sourceLead.notes}</p>
                  )}
                  {(sourceLead.leadNotes ?? []).length > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      {sourceLead.leadNotes!.length} note{sourceLead.leadNotes!.length !== 1 ? 's' : ''} logged
                    </p>
                  )}
                  {(sourceLead.leadAttachments ?? []).length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {(sourceLead.leadAttachments ?? []).slice(0, 4).map(a => (
                        a.mimeType?.startsWith('image/') ? (
                          <button key={a.id} onClick={() => setLightboxSrc(a.url)}>
                            <img src={a.url} alt={a.name} className="w-12 h-12 rounded object-cover border hover:opacity-80 transition-opacity" />
                          </button>
                        ) : (
                          <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 px-2 py-1 rounded bg-background border text-[10px] text-muted-foreground hover:text-foreground">
                            <Paperclip size={10} /> {a.name}
                          </a>
                        )
                      ))}
                      {(sourceLead.leadAttachments ?? []).length > 4 && (
                        <span className="text-[10px] text-muted-foreground self-center">
                          +{(sourceLead.leadAttachments ?? []).length - 4} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Estimate */}
            {sourceEstimate && (
              <div className="relative">
                <div className="absolute -left-[26px] w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center border-2 border-background">
                  <FileText size={11} />
                </div>
                <div className="rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Estimate</span>
                    <span className="text-[10px] text-muted-foreground">{formatRelative(sourceEstimate.createdAt)}</span>
                  </div>
                  <p className="text-sm font-semibold text-foreground">{sourceEstimate.title}</p>
                  {sourceEstimate.value != null && (
                    <p className="text-xs text-muted-foreground mt-0.5">${fmt$(sourceEstimate.value)}</p>
                  )}
                  {(sourceEstimate.leadNotes ?? []).length > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      {sourceEstimate.leadNotes!.length} note{sourceEstimate.leadNotes!.length !== 1 ? 's' : ''} logged
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Job (current) */}
            <div className="relative">
              <div className="absolute -left-[26px] w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border-2 border-background">
                <Briefcase size={11} />
              </div>
              <div className="rounded-lg border bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Job — Active</span>
                  <span className="text-[10px] text-muted-foreground">{formatRelative(activeOpp.createdAt)}</span>
                </div>
                <p className="text-sm font-semibold text-foreground">{activeOpp.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">${fmt$(totalPrice)}</p>
                {changeOrders.length > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {changeOrders.length} change order{changeOrders.length !== 1 ? 's' : ''}
                    {' '}(${fmt$(totalWithCOs)} total with approved COs)
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Pricing Summary ── */}
      <Section icon={<DollarSign size={13} />} title="Pricing Summary" defaultOpen={true}>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-lg bg-muted/40 p-3 text-center">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Contract Total</p>
            <p className="text-base font-bold text-foreground">${fmt$(totalPrice)}</p>
          </div>
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 p-3 text-center">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Deposit</p>
            <p className="text-base font-bold text-amber-700 dark:text-amber-300">${fmt$(depositAmount)}</p>
          </div>
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 p-3 text-center">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Balance Due</p>
            <p className="text-base font-bold text-emerald-700 dark:text-emerald-300">${fmt$(balanceAmount)}</p>
          </div>
        </div>

        {changeOrders.some(co => co.status === 'approved') && (
          <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20 p-3 flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <GitBranch size={13} className="text-orange-500" />
              <span className="text-xs font-semibold text-orange-700 dark:text-orange-400">Revised Total (with approved COs)</span>
            </div>
            <span className="text-base font-bold text-orange-700 dark:text-orange-300">${fmt$(totalWithCOs)}</span>
          </div>
        )}

        {/* Phase breakdown */}
        {snap2?.phases && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Phase Breakdown</p>
            <div className="space-y-1">
              {snap2.phases.filter(p => p.items.some(i => i.enabled && i.qty > 0)).map(phase => {
                const phaseTotal = phase.items.reduce((sum, item) => {
                  if (!item.enabled || item.qty === 0) return sum;
                  return sum + (item.totalPrice ?? 0);
                }, 0);
                if (phaseTotal === 0) return null;
                return (
                  <div key={phase.id} className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
                    <span className="text-muted-foreground">{phase.name}</span>
                    <span className="font-semibold text-foreground">${fmt$(phaseTotal)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Section>

      {/* ── Statement of Work ── */}
      <Section
        icon={<ClipboardList size={13} />}
        title="Statement of Work"
        defaultOpen={true}
        rightSlot={
          <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
            {!activeOpp.sowDocument && snap2 && (
              <button onClick={handleRegenerateSOW} className="flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline">
                <Zap size={10} /> Generate
              </button>
            )}
            {activeOpp.sowDocument && !sowEditMode && (
              <>
                <button
                  onClick={() => { setSowDraft(activeOpp.sowDocument!); setSowEditMode(true); }}
                  className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  <Pencil size={10} /> Edit
                </button>
                <button
                  onClick={handleRegenerateSOW}
                  className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw size={10} /> Regen
                </button>
              </>
            )}
          </div>
        }
      >
        {!activeOpp.sowDocument ? (
          <div className="text-center py-6 space-y-3">
            <ClipboardList size={28} className="mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No SOW yet.</p>
            {snap2 ? (
              <button
                onClick={handleRegenerateSOW}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
              >
                <Zap size={13} /> Generate from Estimate
              </button>
            ) : (
              <p className="text-xs text-muted-foreground">Approve an estimate first to generate the SOW.</p>
            )}
          </div>
        ) : sowEditMode ? (
          <div className="space-y-3">
            <Textarea
              value={sowDraft}
              onChange={e => setSowDraft(e.target.value)}
              rows={20}
              className="font-mono text-[11px] leading-relaxed"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setSowEditMode(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSaveSowEdit} className="gap-1.5">
                <Save size={13} /> Save SOW
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {activeOpp.sowGeneratedAt && (
              <p className="text-[10px] text-muted-foreground">
                Last updated {new Date(activeOpp.sowGeneratedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            )}
            <pre className="text-[11px] font-mono bg-muted/40 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
              {sowExpanded
                ? activeOpp.sowDocument
                : activeOpp.sowDocument.split('\n').slice(0, 25).join('\n') +
                  (activeOpp.sowDocument.split('\n').length > 25 ? '\n…' : '')}
            </pre>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setSowExpanded(v => !v)}
                className="text-xs text-primary hover:underline"
              >
                {sowExpanded ? 'Show less' : 'Show full SOW'}
              </button>
              <a
                href={`data:text/plain;charset=utf-8,${encodeURIComponent(activeOpp.sowDocument)}`}
                download={`SOW-${activeOpp.jobNumber || activeOpp.id}.txt`}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Download size={11} /> Download .txt
              </a>
            </div>
          </div>
        )}
      </Section>

      {/* ── Signed Estimate ── */}
      {signedEstimateUrl && (
        <Section
          icon={<FileCheck size={13} />}
          title="Signed Estimate"
          defaultOpen={false}
          badge={<span className="ml-2 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">✓ Attached</span>}
        >
          <div className="space-y-3">
            <button
              onClick={() => setLightboxSrc(signedEstimateUrl)}
              className="w-full rounded-lg border overflow-hidden bg-muted/20 hover:opacity-90 transition-opacity"
            >
              <img src={signedEstimateUrl} alt="Signed Estimate" className="w-full object-contain max-h-64" />
            </button>
            <a
              href={signedEstimateUrl}
              download={signedEstimateFilename}
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <Download size={11} /> Download signed estimate
            </a>
          </div>
        </Section>
      )}

      {/* ── Change Orders ── */}
      <Section
        icon={<GitBranch size={13} />}
        title="Change Orders"
        defaultOpen={true}
        badge={
          changeOrders.length > 0 ? (
            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400 text-[10px] font-semibold">
              {changeOrders.length}
            </span>
          ) : null
        }
        rightSlot={
          <button
            onClick={e => { e.stopPropagation(); setShowCOModal(true); }}
            className="flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
          >
            <Plus size={10} /> New CO
          </button>
        }
      >
        {changeOrders.length === 0 ? (
          <div className="text-center py-5 space-y-2">
            <GitBranch size={24} className="mx-auto text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">No change orders yet.</p>
            <button
              onClick={() => setShowCOModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
            >
              <Plus size={12} /> Create Change Order
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {changeOrders.map(co => {
              const cfg = CO_STATUS_CONFIG[co.status];
              return (
                <div key={co.id} className="rounded-lg border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-foreground">{co.coNumber}</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        {co.valueDelta !== 0 && (
                          <span className={`text-[10px] font-semibold ${co.valueDelta > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {co.valueDelta > 0 ? '+' : ''}${fmt$(co.valueDelta)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{co.reason}</p>
                      {co.scopeSummary && (
                        <p className="text-xs text-foreground mt-1">{co.scopeSummary}</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      {co.estimateId && (
                        <button
                          onClick={() => {
                            setActiveOpportunity(co.estimateId);
                            setPipelineArea('estimate');
                            setSection('estimate');
                          }}
                          className="flex items-center gap-1 text-[10px] text-primary hover:underline font-semibold"
                        >
                          <ExternalLink size={10} /> Open
                        </button>
                      )}
                      {co.status === 'draft' && (
                        <button
                          onClick={() => updateChangeOrder(activeOpp.id, co.id, { status: 'sent', sentAt: new Date().toISOString() })}
                          className="flex items-center gap-1 text-[10px] text-sky-600 hover:underline font-semibold"
                        >
                          <ArrowRight size={10} /> Mark Sent
                        </button>
                      )}
                      {co.status === 'sent' && (
                        <button
                          onClick={() => updateChangeOrder(activeOpp.id, co.id, { status: 'approved', approvedAt: new Date().toISOString() })}
                          className="flex items-center gap-1 text-[10px] text-emerald-600 hover:underline font-semibold"
                        >
                          <CheckCircle2 size={10} /> Approve
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span>Created {formatRelative(co.createdAt)}</span>
                    {co.approvedAt && <span>Approved {formatRelative(co.approvedAt)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* ── Job Tasks ── */}
      <Section
        icon={<CheckSquare size={13} />}
        title="Job Tasks"
        defaultOpen={true}
        badge={
          tasks.length > 0 ? (
            <span className="ml-2 text-[10px] text-muted-foreground font-normal">
              {completedCount}/{tasks.length}
            </span>
          ) : null
        }
        rightSlot={
          <button
            onClick={e => { e.stopPropagation(); setShowTaskForm(true); }}
            className="flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
          >
            <Plus size={10} /> Add
          </button>
        }
      >
        {tasks.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
              <span>Progress</span>
              <span>{taskProgress}%</span>
            </div>
            <Progress value={taskProgress} className="h-1.5" />
          </div>
        )}

        {showTaskForm && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2 mb-3">
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
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
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

        {tasks.length === 0 && !showTaskForm ? (
          <p className="text-xs text-muted-foreground py-3 text-center">No tasks yet.</p>
        ) : (
          <div className="space-y-1">
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
                        <span className={`w-1.5 h-1.5 rounded-full ${pc.dot}`} />
                        {pc.label}
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
        )}
      </Section>

      {/* ── Attachments (unified) ── */}
      <Section
        icon={<Paperclip size={13} />}
        title="Attachments"
        defaultOpen={false}
        badge={
          allAttachments.length > 0 ? (
            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-semibold">
              {allAttachments.length}
            </span>
          ) : null
        }
        rightSlot={
          <button
            onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
            className="flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
          >
            <Upload size={10} /> Upload
          </button>
        }
      >
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileUpload} />

        {allAttachments.length === 0 ? (
          <div className="text-center py-5 space-y-2">
            <Paperclip size={24} className="mx-auto text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">No attachments yet.</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-semibold hover:bg-muted/70 transition-colors"
            >
              <Upload size={12} /> Upload Files
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Image grid */}
            {allAttachments.some(a => a.mimeType?.startsWith('image/')) && (
              <div className="grid grid-cols-4 gap-2">
                {allAttachments.filter(a => a.mimeType?.startsWith('image/')).map(a => (
                  <div key={a.id} className="relative group">
                    <button onClick={() => setLightboxSrc(a.url)} className="w-full">
                      <img src={a.url} alt={a.name} className="w-full aspect-square object-cover rounded-lg border hover:opacity-80 transition-opacity" />
                    </button>
                    <div className="absolute top-1 left-1">
                      <span className={`px-1 py-0.5 rounded text-[9px] font-bold ${
                        a.source === 'Lead' ? 'bg-sky-600 text-white' :
                        a.source === 'Estimate' ? 'bg-amber-600 text-white' :
                        'bg-emerald-600 text-white'
                      }`}>
                        {a.source}
                      </span>
                    </div>
                    {a.source === 'Job' && (
                      <button
                        onClick={() => removeJobAttachment(activeOpp.id, a.id)}
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center transition-opacity"
                      >
                        <X size={10} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* File list */}
            {allAttachments.filter(a => !a.mimeType?.startsWith('image/')).map(a => (
              <div key={a.id} className="flex items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2 group">
                <FileText size={14} className="text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{a.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${
                      a.source === 'Lead' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400' :
                      a.source === 'Estimate' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' :
                      'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                    }`}>
                      {a.source}
                    </span>
                    {a.size && <span className="text-[10px] text-muted-foreground">{formatBytes(a.size)}</span>}
                  </div>
                </div>
                <a href={a.url} target="_blank" rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary transition-colors flex-shrink-0">
                  <Download size={13} />
                </a>
                {a.source === 'Job' && (
                  <button
                    onClick={() => removeJobAttachment(activeOpp.id, a.id)}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-500 transition-all flex-shrink-0"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ── Activity Feed ── */}
      <Section
        icon={<MessageSquare size={13} />}
        title="Activity"
        defaultOpen={true}
        badge={
          jobActivity.length > 0 ? (
            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-[10px] font-semibold">
              {jobActivity.length}
            </span>
          ) : null
        }
      >
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={noteInput}
            onChange={e => setNoteInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddNote(); }}
            placeholder="Add a note…"
            className="field-input flex-1 text-sm"
          />
          <button
            onClick={handleAddNote}
            disabled={!noteInput.trim()}
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-40"
          >
            Add
          </button>
        </div>

        {jobActivity.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">No activity yet.</p>
        ) : (
          <div className="space-y-2">
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
      </Section>

      {/* ── Internal Notes ── */}
      <Section
        icon={<Edit3 size={13} />}
        title="Internal Notes"
        defaultOpen={false}
        badge={
          <span className="ml-auto text-[10px] text-muted-foreground font-normal normal-case tracking-normal">
            Not visible to customer
          </span>
        }
      >
        <Textarea
          value={activeOpp.notes || ''}
          onChange={e => updateOpportunity(activeOpp.id, { notes: e.target.value })}
          placeholder="Crew instructions, access info, special considerations…"
          rows={4}
          className="text-sm"
        />
      </Section>

      {/* ── Modals ── */}
      <CreateChangeOrderModal
        open={showCOModal}
        onClose={() => setShowCOModal(false)}
        onConfirm={handleCreateCO}
      />

      {/* SMS Modal */}
      <Dialog open={smsOpen} onOpenChange={setSmsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare size={16} className="text-sky-500" />
              Send SMS to {displayName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">To: {displayPhone}</p>
            <Textarea
              value={smsBody}
              onChange={e => setSmsBody(e.target.value)}
              placeholder="Message…"
              rows={4}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSmsOpen(false)} disabled={smsSending}>Cancel</Button>
            <Button onClick={handleSendSms} disabled={smsSending || !smsBody.trim()} className="gap-1.5">
              {smsSending ? 'Sending…' : 'Send SMS'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      {lightboxSrc && <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
}
