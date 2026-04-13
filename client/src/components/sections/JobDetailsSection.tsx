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
import { useState, useRef, useEffect } from 'react';
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
  Flag, ListChecks, Send as SendIcon,
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
        <div className="card-section-header text-xs font-semibold uppercase tracking-wider w-full text-left flex items-center">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-1.5 flex-1 text-left min-w-0">
              {icon}
              <span>{title}</span>
              {badge}
              <span className="ml-auto flex items-center gap-1">
                {open
                  ? <ChevronUp size={13} className="text-muted-foreground" />
                  : <ChevronDown size={13} className="text-muted-foreground" />}
              </span>
            </button>
          </CollapsibleTrigger>
          {rightSlot && (
            <div className="ml-2 flex items-center gap-1 shrink-0">{rightSlot}</div>
          )}
        </div>
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
function Lightbox({ images, index, onClose }: { images: string[]; index: number; onClose: () => void }) {
  const [current, setCurrent] = useState(index);
  const hasPrev = current > 0;
  const hasNext = current < images.length - 1;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && current > 0) setCurrent(c => c - 1);
      if (e.key === 'ArrowRight' && current < images.length - 1) setCurrent(c => c + 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [current, images.length, onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={onClose}>
      {/* Close */}
      <button
        className="absolute top-4 right-4 z-10 text-white/70 hover:text-white bg-black/40 rounded-full p-2 transition-colors"
        onClick={onClose}
      >
        <X size={20} />
      </button>
      {/* Counter */}
      {images.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-white/70 text-xs font-medium bg-black/40 px-3 py-1 rounded-full">
          {current + 1} / {images.length}
        </div>
      )}
      {/* Prev */}
      {hasPrev && (
        <button
          className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-white/70 hover:text-white bg-black/40 rounded-full p-3 transition-colors"
          onClick={e => { e.stopPropagation(); setCurrent(c => c - 1); }}
        >
          <ChevronRight size={22} className="rotate-180" />
        </button>
      )}
      {/* Image */}
      <img
        src={images[current]}
        alt={`Attachment ${current + 1}`}
        className="max-w-[90vw] max-h-[85vh] rounded-lg object-contain shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
      {/* Next */}
      {hasNext && (
        <button
          className="absolute right-3 top-1/2 -translate-y-1/2 z-10 text-white/70 hover:text-white bg-black/40 rounded-full p-3 transition-colors"
          onClick={e => { e.stopPropagation(); setCurrent(c => c + 1); }}
        >
          <ChevronRight size={22} />
        </button>
      )}
      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 max-w-[90vw] overflow-x-auto pb-1" onClick={e => e.stopPropagation()}>
          {images.map((url, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`flex-shrink-0 w-12 h-8 rounded overflow-hidden border-2 transition-all ${
                i === current ? 'border-white opacity-100' : 'border-white/30 opacity-50 hover:opacity-80'
              }`}
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
// ── Job Complete Modal ─────────────────────────────────────────
function JobCompleteModal({
  open, onClose, onConfirm, jobTitle, balanceDue,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (signature: string | null, signedBy: string) => void;
  jobTitle: string;
  balanceDue: number;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [signedBy, setSignedBy] = useState('');
  const [mode, setMode] = useState<'draw' | 'adopt'>('draw');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStrokes, setHasStrokes] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const [adoptName, setAdoptName] = useState('');
  const previewRef = useRef<HTMLCanvasElement>(null);
  const fmtBal = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Load cursive font
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap';
    document.head.appendChild(link);
    return () => { if (document.head.contains(link)) document.head.removeChild(link); };
  }, []);

  // Adopt preview
  useEffect(() => {
    if (mode !== 'adopt') return;
    const canvas = previewRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!adoptName.trim()) return;
    ctx.font = `italic 56px 'Dancing Script', cursive`;
    ctx.fillStyle = '#1a1a2e';
    ctx.textBaseline = 'middle';
    ctx.fillText(adoptName.trim(), 16, canvas.height / 2);
  }, [adoptName, mode]);

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX, y: ((e as React.MouseEvent).clientY - rect.top) * scaleY };
  };
  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsDrawing(true);
    lastPos.current = getPos(e, canvas);
  };
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || !lastPos.current) return;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
    setHasStrokes(true);
  };
  const endDraw = () => { setIsDrawing(false); lastPos.current = null; };
  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  };

  const handleConfirm = () => {
    if (!signedBy.trim()) { toast.error('Enter the customer name'); return; }
    let sig: string | null = null;
    if (mode === 'draw') {
      if (!hasStrokes) { toast.error('Draw a signature or use Skip'); return; }
      sig = canvasRef.current?.toDataURL('image/png') ?? null;
    } else {
      if (!adoptName.trim()) { toast.error('Type your name to adopt a signature'); return; }
      const c = document.createElement('canvas');
      c.width = 600; c.height = 120;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.font = `italic 56px 'Dancing Script', cursive`;
        ctx.fillStyle = '#1a1a2e';
        ctx.textBaseline = 'middle';
        ctx.fillText(adoptName.trim(), 16, 60);
      }
      sig = c.toDataURL('image/png');
    }
    onConfirm(sig, signedBy.trim());
  };

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep(1); setSignedBy(''); setMode('draw');
      setHasStrokes(false); setAdoptName('');
    }
  }, [open]);

  if (!open) return null;
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-500" />
            Mark Job Complete
          </DialogTitle>
        </DialogHeader>
        {step === 1 ? (
          <div className="space-y-4">
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">{jobTitle}</p>
              {balanceDue > 0 ? (
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                  Final invoice of <strong>${fmtBal(balanceDue)}</strong> will be generated.
                </p>
              ) : (
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">Balance fully paid — no new invoice.</p>
              )}
            </div>
            <p className="text-sm text-muted-foreground">This moves the job to <strong>Completed</strong> and generates the final invoice. Proceed to collect customer sign-off?</p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={() => setStep(2)} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
                Collect Sign-Off <ChevronRight size={14} />
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customer Name *</label>
              <input
                value={signedBy}
                onChange={e => setSignedBy(e.target.value)}
                placeholder="Full name"
                className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="flex gap-1 bg-muted rounded-lg p-1 w-fit">
              <button
                onClick={() => setMode('draw')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  mode === 'draw' ? 'bg-white dark:bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >✏️ Draw</button>
              <button
                onClick={() => setMode('adopt')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  mode === 'adopt' ? 'bg-white dark:bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >Aa Adopt</button>
            </div>
            {mode === 'draw' ? (
              <div>
                <canvas
                  ref={canvasRef}
                  width={560} height={120}
                  className="w-full border-2 border-dashed border-border rounded-lg bg-white cursor-crosshair touch-none"
                  onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                  onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
                />
                <button onClick={clearCanvas} className="text-xs text-muted-foreground hover:text-foreground mt-1 underline">Clear</button>
              </div>
            ) : (
              <div>
                <input
                  value={adoptName}
                  onChange={e => setAdoptName(e.target.value)}
                  placeholder="Type name to adopt signature"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                {adoptName.trim() && (
                  <canvas ref={previewRef} width={560} height={100} className="w-full mt-2 border border-border rounded-lg bg-white" />
                )}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">By signing, the customer confirms the work is complete and satisfactory.</p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => onConfirm(null, signedBy.trim() || 'Skipped')}>Skip Signature</Button>
              <Button onClick={handleConfirm} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
                <CheckCircle2 size={14} /> Complete Job
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
// ── Job Progress Section ───────────────────────────────────────────────
const MILESTONE_STATUS_CONFIG = {
  pending:     { label: 'Pending',     color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400', dot: 'bg-slate-400' },
  in_progress: { label: 'In Progress', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',   dot: 'bg-sky-500' },
  complete:    { label: 'Complete',    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', dot: 'bg-emerald-500' },
} as const;

function JobProgressSection({ hpOpportunityId }: { hpOpportunityId: string }) {
  const { data, refetch, isLoading } = trpc.portal.getJobProgress.useQuery({ hpOpportunityId }, { staleTime: 30_000 });
  const upsertMilestone = trpc.portal.upsertMilestone.useMutation({ onSuccess: () => { refetch(); toast.success('Milestone saved'); } });
  const deleteMilestone = trpc.portal.deleteMilestone.useMutation({ onSuccess: () => { refetch(); toast.success('Milestone deleted'); } });
  const postUpdate = trpc.portal.postJobUpdate.useMutation({ onSuccess: () => { refetch(); setUpdateMsg(''); toast.success('Update posted'); } });
  const deleteUpdate = trpc.portal.deleteJobUpdate.useMutation({ onSuccess: () => { refetch(); toast.success('Update deleted'); } });
  const { data: signOff } = trpc.portal.getJobSignOffStatus.useQuery({ hpOpportunityId }, { staleTime: 60_000 });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editStatus, setEditStatus] = useState<'pending' | 'in_progress' | 'complete'>('pending');
  const [editDate, setEditDate] = useState('');
  const [addingNew, setAddingNew] = useState(false);
  const [updateMsg, setUpdateMsg] = useState('');

  const milestones = data?.milestones ?? [];
  const updates = data?.updates ?? [];

  const openEdit = (m: typeof milestones[0]) => {
    setEditingId(m.id);
    setEditTitle(m.title);
    setEditDesc(m.description ?? '');
    setEditStatus((m.status ?? 'pending') as 'pending' | 'in_progress' | 'complete');
    setEditDate(m.scheduledDate ? new Date(m.scheduledDate).toISOString().slice(0, 10) : '');
  };

  const saveEdit = () => {
    if (!editTitle.trim()) return;
    upsertMilestone.mutate({
      id: editingId ?? undefined,
      hpOpportunityId,
      title: editTitle.trim(),
      description: editDesc.trim() || undefined,
      status: editStatus,
      scheduledDate: editDate || undefined,
      sortOrder: editingId ? (milestones.find(m => m.id === editingId)?.sortOrder ?? 0) : milestones.length,
    });
    setEditingId(null);
    setAddingNew(false);
  };

  const startNew = () => {
    setEditingId(null);
    setEditTitle('');
    setEditDesc('');
    setEditStatus('pending');
    setEditDate('');
    setAddingNew(true);
  };

  return (
    <Section
      icon={<ListChecks size={13} />}
      title="Job Progress"
      defaultOpen={true}
      badge={
        <span className="ml-2 text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
          Visible to customer
        </span>
      }
      rightSlot={
        <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-1" onClick={startNew}>
          <Plus size={11} /> Milestone
        </Button>
      }
    >
      {isLoading && <p className="text-xs text-muted-foreground py-2">Loading…</p>}

      {/* Milestones list */}
      {milestones.length === 0 && !addingNew && (
        <p className="text-xs text-muted-foreground py-1">No milestones yet. Add one to show the customer what to expect.</p>
      )}
      <div className="space-y-1.5">
        {milestones.map(m => (
          <div key={m.id} className="rounded-md border border-border bg-card px-3 py-2">
            {editingId === m.id ? (
              <MilestoneForm
                title={editTitle} setTitle={setEditTitle}
                desc={editDesc} setDesc={setEditDesc}
                status={editStatus} setStatus={setEditStatus}
                date={editDate} setDate={setEditDate}
                onSave={saveEdit} onCancel={() => setEditingId(null)}
              />
            ) : (
              <div className="flex items-start gap-2">
                <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${MILESTONE_STATUS_CONFIG[m.status as keyof typeof MILESTONE_STATUS_CONFIG]?.dot ?? 'bg-slate-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium leading-snug">{m.title}</p>
                  {m.description && <p className="text-[11px] text-muted-foreground mt-0.5">{m.description}</p>}
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${MILESTONE_STATUS_CONFIG[m.status as keyof typeof MILESTONE_STATUS_CONFIG]?.color ?? ''}`}>
                      {MILESTONE_STATUS_CONFIG[m.status as keyof typeof MILESTONE_STATUS_CONFIG]?.label ?? m.status}
                    </span>
                    {m.scheduledDate && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Calendar size={9} /> {new Date(m.scheduledDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(m)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                    <Pencil size={11} />
                  </button>
                  <button onClick={() => deleteMilestone.mutate({ id: m.id })} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {addingNew && (
          <div className="rounded-md border border-border bg-card px-3 py-2">
            <MilestoneForm
              title={editTitle} setTitle={setEditTitle}
              desc={editDesc} setDesc={setEditDesc}
              status={editStatus} setStatus={setEditStatus}
              date={editDate} setDate={setEditDate}
              onSave={saveEdit} onCancel={() => setAddingNew(false)}
            />
          </div>
        )}
      </div>

      {/* Sign-off status banner */}
      {signOff && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
          <CheckCircle2 size={13} className="text-emerald-600 flex-shrink-0" />
          <p className="text-[11px] text-emerald-800 font-medium">
            Customer signed off on {new Date(signOff.signedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} — {signOff.signerName}
          </p>
        </div>
      )}

      {/* Progress updates */}
      <div className="mt-4 border-t border-border pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Progress Updates</p>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={updateMsg}
            onChange={e => setUpdateMsg(e.target.value)}
            placeholder="Post an update visible to the customer…"
            className="field-input flex-1 text-xs"
            onKeyDown={e => { if (e.key === 'Enter' && updateMsg.trim()) postUpdate.mutate({ hpOpportunityId, message: updateMsg.trim() }); }}
          />
          <Button
            size="sm" variant="default"
            className="h-8 px-3 gap-1 bg-[#2d4a2d] hover:bg-[#1a2e1a] text-white"
            disabled={!updateMsg.trim() || postUpdate.isPending}
            onClick={() => postUpdate.mutate({ hpOpportunityId, message: updateMsg.trim() })}
          >
            <SendIcon size={12} /> Post
          </Button>
        </div>
        {updates.length === 0 && <p className="text-xs text-muted-foreground">No updates posted yet.</p>}
        <div className="space-y-1.5">
          {updates.map(u => (
            <div key={u.id} className="flex items-start gap-2 text-xs">
              <Flag size={11} className="mt-0.5 text-[#c8922a] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="leading-snug">{u.message}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{u.postedBy ?? 'Handy Pioneers'} · {new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
              </div>
              <button onClick={() => deleteUpdate.mutate({ id: u.id })} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">
                <Trash2 size={10} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function MilestoneForm({
  title, setTitle, desc, setDesc, status, setStatus, date, setDate, onSave, onCancel,
}: {
  title: string; setTitle: (v: string) => void;
  desc: string; setDesc: (v: string) => void;
  status: 'pending' | 'in_progress' | 'complete'; setStatus: (v: 'pending' | 'in_progress' | 'complete') => void;
  date: string; setDate: (v: string) => void;
  onSave: () => void; onCancel: () => void;
}) {
  return (
    <div className="space-y-2">
      <input
        autoFocus
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Milestone title (e.g. Demo complete)"
        className="field-input w-full text-xs"
      />
      <input
        type="text"
        value={desc}
        onChange={e => setDesc(e.target.value)}
        placeholder="Description (optional)"
        className="field-input w-full text-xs"
      />
      <div className="flex gap-2">
        <select
          value={status}
          onChange={e => setStatus(e.target.value as 'pending' | 'in_progress' | 'complete')}
          className="field-input text-xs flex-1"
        >
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="complete">Complete</option>
        </select>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="field-input text-xs flex-1"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={onCancel}>Cancel</Button>
        <Button size="sm" className="h-6 text-xs px-2 bg-[#2d4a2d] hover:bg-[#1a2e1a] text-white" onClick={onSave} disabled={!title.trim()}>Save</Button>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────
export default function JobDetailsSection() {
  const {
    state, setJobInfo, updateOpportunity, setSection, setScheduleFilter,
    addJobTask, updateJobTask, removeJobTask,
    addJobAttachment, removeJobAttachment,
    addJobActivity,
    createChangeOrder, updateChangeOrder, updateSow,
    setActiveOpportunity, setPipelineArea, archiveJob,
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
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const openLightbox = (images: string[], index: number) => {
    setLightboxImages(images);
    setLightboxIndex(index);
  };
  const closeLightbox = () => setLightboxImages([]);

  // Job complete modal
  const [showCompleteModal, setShowCompleteModal] = useState(false);

  // File upload ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // MUST be defined before early return — used in derived values below
  const changeOrders = activeOpp?.changeOrders ?? [];
  const leadAttachmentsPre = (sourceLead?.leadAttachments ?? []).map(a => ({ ...a, source: 'Lead' as const, uid: `lead-${a.id}` }));
  const estimateAttachmentsPre = (sourceEstimate?.leadAttachments ?? []).map(a => ({ ...a, source: 'Estimate' as const, uid: `est-${a.id}` }));
  const jobAttachmentsPre = (activeOpp?.attachments ?? []).map(a => ({ ...a, source: 'Job' as const, uid: `job-${a.id}` }));
  const allAttachments = [...leadAttachmentsPre, ...estimateAttachmentsPre, ...jobAttachmentsPre];

  if (!activeOpp) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm">
        No active job selected.
      </div>
    );
  }

  // ── Derived display values ─────────────────────────────────
  const snap = activeOpp.clientSnapshot;
  const displayName = (activeCustomer ? `${activeCustomer.firstName ?? ''} ${activeCustomer.lastName ?? ''}`.trim() : '') || snap?.client || activeOpp.title;
  const displayCompany = activeCustomer?.company || snap?.companyName || '';
  const displayPhone = activeCustomer?.mobilePhone || activeCustomer?.homePhone || snap?.phone || '';
  const displayEmail = activeCustomer?.email || snap?.email || '';
  const displayAddress = activeCustomer?.street || snap?.address || jobInfo.address || '';
  const displayCity = activeCustomer?.city || snap?.city || jobInfo.city || '';
  const displayState = activeCustomer?.state || snap?.state || jobInfo.state || '';
  const displayZip = activeCustomer?.zip || snap?.zip || jobInfo.zip || '';
  const fullAddress = [displayAddress, displayCity, displayState, displayZip].filter(Boolean).join(', ');
  const mapsUrl = fullAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
    : null;

  const stageColor = STAGE_COLORS[activeOpp.stage] ?? 'bg-slate-100 text-slate-700';

  // CO pending badge
  const pendingCOs = changeOrders.filter(co => co.status === 'sent' || co.status === 'draft');
  const hasPendingCO = pendingCOs.length > 0;

  // Image list for lightbox
  const imageAttachments = allAttachments.filter(a => a.mimeType?.startsWith('image/'));
  const imageUrls = imageAttachments.map(a => a.url);

  // Job complete handler
  const handleJobComplete = (signature: string | null, signedBy: string) => {
    archiveJob(activeOpp.id, totalWithCOs);
    addJobActivity(activeOpp.id, {
      type: 'job_created',
      title: 'Job completed',
      description: signature
        ? `Customer sign-off collected from ${signedBy}.`
        : `Completed without signature. Signed by: ${signedBy}.`,
    });
    setShowCompleteModal(false);
    toast.success('Job marked complete — final invoice generated');
  };

  // Pricing
  const snap2 = activeOpp.estimateSnapshot;
  const totalPrice = activeOpp.value ?? 0;
  const depositAmount = snap2
    ? snap2.depositType === 'pct'
      ? Math.round(totalPrice * snap2.depositValue / 100 * 100) / 100
      : snap2.depositValue
    : 0;
  const balanceAmount = totalPrice - depositAmount;
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
            {hasPendingCO && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-yellow-400/90 text-yellow-900 text-[9px] font-bold uppercase tracking-wide animate-pulse">
                CO Pending
              </span>
            )}
          </span>
          <div className="flex items-center gap-2">
            {activeOpp.jobNumber && (
              <span className="flex items-center gap-1 opacity-80">
                <Hash size={11} />
                {activeOpp.jobNumber}
              </span>
            )}
            {activeOpp.stage !== 'Completed' && activeOpp.stage !== 'Invoice Sent' && activeOpp.stage !== 'Invoice Paid' && (
              <button
                onClick={() => setShowCompleteModal(true)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold uppercase tracking-wide transition-colors"
              >
                <CheckCircle2 size={10} /> Complete
              </button>
            )}
          </div>
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
          <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20 p-3 mb-3 space-y-2">
            <p className="text-[10px] font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
              <GitBranch size={10} /> Change Order Adjustments
            </p>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs py-0.5">
                <span className="text-muted-foreground">Base Contract</span>
                <span className="font-semibold text-foreground">${fmt$(totalPrice)}</span>
              </div>
              {changeOrders.filter(co => co.status === 'approved').map((co, idx) => (
                <div key={co.id} className="flex items-center justify-between text-xs py-0.5 border-t border-orange-200/60 dark:border-orange-800/60">
                  <span className="text-orange-700 dark:text-orange-400">CO-{String(idx + 1).padStart(3, '0')}: {co.reason}</span>
                  <span className={`font-semibold ${co.valueDelta >= 0 ? 'text-orange-700 dark:text-orange-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                    {co.valueDelta >= 0 ? '+' : ''}{fmt$(co.valueDelta)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-orange-300 dark:border-orange-700">
              <span className="text-xs font-bold text-orange-700 dark:text-orange-400">Contract Value incl. COs</span>
              <span className="text-base font-bold text-orange-700 dark:text-orange-300">${fmt$(totalWithCOs)}</span>
            </div>
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
                  <div key={a.uid ?? a.id} className="relative group">
                    <button onClick={() => openLightbox(imageUrls, imageUrls.indexOf(a.url))} className="w-full">
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
              <div key={a.uid ?? a.id} className="flex items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2 group">
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

      {/* ── Job Progress Milestones ── */}
      <JobProgressSection hpOpportunityId={activeOpp.id} />

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

      {/* Job Complete Modal */}
      <JobCompleteModal
        open={showCompleteModal}
        onClose={() => setShowCompleteModal(false)}
        onConfirm={handleJobComplete}
        jobTitle={activeOpp.title || displayName || 'Job'}
        balanceDue={Math.max(0, totalWithCOs - depositAmount)}
      />

      {/* Lightbox */}
      {lightboxImages.length > 0 && (
        <Lightbox images={lightboxImages} index={lightboxIndex} onClose={closeLightbox} />
      )}
    </div>
  );
}
