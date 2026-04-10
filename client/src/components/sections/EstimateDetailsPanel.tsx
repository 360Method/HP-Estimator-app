// ============================================================
// EstimateDetailsPanel — Rich details panel for estimate & job opportunities
// Sections:
//   1. Stage switcher (estimate or job stages)
//   2. Scope / description — inline editable
//   3. Quick contact (Call / SMS / Email) — auto-logs note
//   4. Notes & activity log — shared with lead notes
//   5. Attachments — upload to S3, thumbnail grid
//   6. Linked lead banner — read-only reference to source lead
//   7. Map preview
// ============================================================
import { useState, useRef, useEffect } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { trpc } from '@/lib/trpc';
import { nanoid } from 'nanoid';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Phone, MessageSquare, Mail, FileText, Trash2,
  Plus, Paperclip, Download, X, StickyNote,
  PhoneCall, MessageCircle, AtSign, Footprints,
  Zap, Edit3, Check, ChevronDown, ChevronUp,
  Link2, Camera, ChevronRight,
} from 'lucide-react';
import type { LeadContactType, JobAttachment, EstimateStage, JobStage, Opportunity, LeadNote } from '@/lib/types';
import { ESTIMATE_STAGES, JOB_STAGES } from '@/lib/types';
import AddressMapPreview from '@/components/AddressMapPreview';

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
      <button
        className="absolute top-4 right-4 z-10 text-white/70 hover:text-white bg-black/40 rounded-full p-2 transition-colors"
        onClick={onClose}
      >
        <X size={20} />
      </button>
      {images.length > 1 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 text-white/70 text-xs font-medium bg-black/40 px-3 py-1 rounded-full">
          {current + 1} / {images.length}
        </div>
      )}
      {hasPrev && (
        <button
          className="absolute left-3 top-1/2 -translate-y-1/2 z-10 text-white/70 hover:text-white bg-black/40 rounded-full p-3 transition-colors"
          onClick={e => { e.stopPropagation(); setCurrent(c => c - 1); }}
        >
          <ChevronRight size={22} className="rotate-180" />
        </button>
      )}
      <img
        src={images[current]}
        alt={`Attachment ${current + 1}`}
        className="max-w-[90vw] max-h-[85vh] rounded-lg object-contain shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
      {hasNext && (
        <button
          className="absolute right-3 top-1/2 -translate-y-1/2 z-10 text-white/70 hover:text-white bg-black/40 rounded-full p-3 transition-colors"
          onClick={e => { e.stopPropagation(); setCurrent(c => c + 1); }}
        >
          <ChevronRight size={22} />
        </button>
      )}
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
// ── Helpers ──────────────────────────────────────────────────
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}
function fmtBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Contact type config ───────────────────────────────────────
const CONTACT_TYPES: { type: LeadContactType; label: string; icon: React.ReactNode; color: string }[] = [
  { type: 'note',  label: 'Note',  icon: <StickyNote size={11} />,      color: 'bg-slate-100 text-slate-700 border-slate-300' },
  { type: 'call',  label: 'Call',  icon: <PhoneCall size={11} />,       color: 'bg-green-50 text-green-700 border-green-300' },
  { type: 'sms',   label: 'SMS',   icon: <MessageCircle size={11} />,   color: 'bg-blue-50 text-blue-700 border-blue-300' },
  { type: 'email', label: 'Email', icon: <AtSign size={11} />,          color: 'bg-purple-50 text-purple-700 border-purple-300' },
  { type: 'visit', label: 'Visit', icon: <Footprints size={11} />,      color: 'bg-amber-50 text-amber-700 border-amber-300' },
];

function ContactTypeBadge({ type }: { type: LeadContactType }) {
  const cfg = CONTACT_TYPES.find(c => c.type === type) ?? CONTACT_TYPES[0];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ── Stage config for estimates ────────────────────────────────
const ESTIMATE_STAGE_COLOR: Record<EstimateStage, string> = {
  'Unscheduled':      'bg-slate-100 text-slate-700 border-slate-300',
  'Scheduled':        'bg-blue-50 text-blue-700 border-blue-300',
  'Return Call Needed': 'bg-orange-50 text-orange-700 border-orange-300',
  'In Progress':      'bg-indigo-50 text-indigo-700 border-indigo-300',
  'Completed':        'bg-emerald-50 text-emerald-700 border-emerald-300',
  'Draft':            'bg-slate-100 text-slate-600 border-slate-300',
  'Ready to Send':    'bg-yellow-50 text-yellow-700 border-yellow-300',
  'Created on Job':   'bg-teal-50 text-teal-700 border-teal-300',
  'Sent':             'bg-sky-50 text-sky-700 border-sky-300',
  'Verbal Acceptance':'bg-lime-50 text-lime-700 border-lime-300',
  'Approved':         'bg-emerald-100 text-emerald-800 border-emerald-400',
  'Rejected':         'bg-red-50 text-red-700 border-red-300',
  'On Hold':          'bg-amber-50 text-amber-700 border-amber-300',
};

const JOB_STAGE_COLOR: Record<JobStage, string> = {
  'New Job':                'bg-slate-100 text-slate-700 border-slate-300',
  'Deposit Needed':         'bg-orange-50 text-orange-700 border-orange-300',
  'Deposit Collected':      'bg-lime-50 text-lime-700 border-lime-300',
  'Need to Order Materials':'bg-yellow-50 text-yellow-700 border-yellow-300',
  'Waiting on Materials':   'bg-amber-50 text-amber-700 border-amber-300',
  'Materials Received':     'bg-teal-50 text-teal-700 border-teal-300',
  'Unscheduled':            'bg-slate-100 text-slate-600 border-slate-300',
  'Scheduled':              'bg-blue-50 text-blue-700 border-blue-300',
  'In Progress':            'bg-indigo-50 text-indigo-700 border-indigo-300',
  'Completed':              'bg-emerald-100 text-emerald-800 border-emerald-400',
  'Invoice Sent':           'bg-sky-50 text-sky-700 border-sky-300',
  'Invoice Paid':           'bg-emerald-50 text-emerald-700 border-emerald-300',
};

// ── Main component ────────────────────────────────────────────
export default function EstimateDetailsPanel() {
  const {
    state,
    updateOpportunity,
    addLeadNote,
    removeLeadNote,
    addLeadAttachment,
    removeLeadAttachment,
  } = useEstimator();

  const activeOpp = state.opportunities.find(o => o.id === state.activeOpportunityId);
  const activeCustomer = state.customers.find(c => c.id === state.activeCustomerId);

  if (!activeOpp) return null;

  const isEstimate = activeOpp.area === 'estimate';
  const isJob = activeOpp.area === 'job';
  const stages = isEstimate ? ESTIMATE_STAGES : JOB_STAGES;
  const stageColorMap = isEstimate ? ESTIMATE_STAGE_COLOR : JOB_STAGE_COLOR;
  const currentStage = activeOpp.stage as EstimateStage | JobStage;
  const currentStageColor = (stageColorMap as Record<string, string>)[currentStage] ?? 'bg-slate-100 text-slate-700 border-slate-300';

  const notes = activeOpp.leadNotes ?? [];
  const attachments = activeOpp.leadAttachments ?? [];

  const snap = activeOpp.clientSnapshot;
  const phone = activeCustomer?.mobilePhone || activeCustomer?.homePhone || snap?.phone || '';
  const email = activeCustomer?.email || snap?.email || '';
  const address = activeCustomer?.street || snap?.address || '';
  const city = activeCustomer?.city || snap?.city || '';
  const stateAbbr = activeCustomer?.state || snap?.state || '';
  const zip = activeCustomer?.zip || snap?.zip || '';

  // Source lead (if converted from one)
  const sourceLead = activeOpp.sourceLeadId
    ? state.opportunities.find(o => o.id === activeOpp.sourceLeadId)
    : null;

  return (
    <EstimateDetailsPanelInner
      activeOpp={activeOpp}
      stages={stages as string[]}
      stageColorMap={stageColorMap as Record<string, string>}
      currentStage={currentStage as string}
      currentStageColor={currentStageColor}
      notes={notes}
      attachments={attachments}
      phone={phone}
      email={email}
      address={address}
      city={city}
      stateAbbr={stateAbbr}
      zip={zip}
      sourceLead={sourceLead ?? null}
      updateOpportunity={updateOpportunity}
      addLeadNote={addLeadNote}
      removeLeadNote={removeLeadNote}
      addLeadAttachment={addLeadAttachment}
      removeLeadAttachment={removeLeadAttachment}
    />
  );
}

// ── Inner component (stateful) ────────────────────────────────────────────
interface InnerProps { activeOpp: Opportunity;
  stages: string[];
  stageColorMap: Record<string, string>;
  currentStage: string;
  currentStageColor: string;
  notes: LeadNote[];
  attachments: JobAttachment[];
  phone: string;
  email: string;
  address: string;
  city: string;
  stateAbbr: string;
  zip: string;
  sourceLead: Opportunity | null;
  updateOpportunity: (id: string, payload: Partial<Opportunity>) => void;
  addLeadNote: (oppId: string, note: Omit<LeadNote, 'id' | 'createdAt'>) => void;
  removeLeadNote: (oppId: string, noteId: string) => void;
  addLeadAttachment: (oppId: string, attachment: JobAttachment) => void;
  removeLeadAttachment: (oppId: string, attachmentId: string) => void;
}

function EstimateDetailsPanelInner({
  activeOpp, stages, stageColorMap, currentStage, currentStageColor,
  notes, attachments, phone, email, address, city, stateAbbr, zip,
  sourceLead, updateOpportunity, addLeadNote, removeLeadNote,
  addLeadAttachment, removeLeadAttachment,
}: InnerProps) {
  // Stage
  const [stageSaving, setStageSaving] = useState(false);
  const moveStage = trpc.opportunities.moveStage.useMutation();

  // Scope editing
  const [editingScope, setEditingScope] = useState(false);
  const [scopeDraft, setScopeDraft] = useState(activeOpp.notes ?? '');

  // SMS
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsBody, setSmsBody] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const quickSendSms = trpc.opportunities.quickSendSms.useMutation();

  // Notes
  const [noteText, setNoteText] = useState('');
  const [noteType, setNoteType] = useState<LeadContactType>('note');

  // Attachments
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const uploadFile = trpc.uploads.uploadFile.useMutation();

  // Linked lead banner
  const [leadBannerOpen, setLeadBannerOpen] = useState(true);
  const [leadPhotosOpen, setLeadPhotosOpen] = useState(false);

  // Lightbox
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const openLightbox = (images: string[], idx: number) => { setLightboxImages(images); setLightboxIndex(idx); };
  const closeLightbox = () => setLightboxImages([]);

  // Precompute image URLs for lightbox
  const mainImageUrls = attachments.filter(a => a.mimeType?.startsWith('image/')).map(a => a.url);
  const leadImageUrls = (sourceLead?.leadAttachments ?? []).filter(a => a.mimeType?.startsWith('image/')).map(a => a.url);

  // ── Handlers ────────────────────────────────────────────────
  async function handleStageChange(stage: string) {
    setStageSaving(true);
    try {
      await moveStage.mutateAsync({ id: activeOpp.id, stage });
      updateOpportunity(activeOpp.id, { stage: stage as Opportunity['stage'] });
    } catch {
      toast.error('Failed to update stage');
    } finally {
      setStageSaving(false);
    }
  }

  function handleSaveScope() {
    updateOpportunity(activeOpp.id, { notes: scopeDraft });
    setEditingScope(false);
    toast.success('Description saved');
  }

  async function handleSendSms() {
    if (!phone || !smsBody.trim()) return;
    setSmsSending(true);
    try {
      await quickSendSms.mutateAsync({
        to: phone,
        body: smsBody.trim(),
        contactName: activeOpp.clientSnapshot?.client ?? '',
        customerId: activeOpp.clientSnapshot?.client ? undefined : undefined,
      });
      addLeadNote(activeOpp.id, { text: `SMS sent: "${smsBody.trim()}"`, type: 'sms' });
      setSmsBody('');
      setSmsOpen(false);
      toast.success('SMS sent');
    } catch (e: unknown) {
      toast.error((e as Error)?.message ?? 'Failed to send SMS');
    } finally {
      setSmsSending(false);
    }
  }

  function handleAddNote() {
    if (!noteText.trim()) return;
    addLeadNote(activeOpp.id, { text: noteText.trim(), type: noteType });
    setNoteText('');
    toast.success('Note saved');
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      toast.error('File too large (max 16 MB)');
      return;
    }
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const result = await uploadFile.mutateAsync({
          filename: file.name,
          mimeType: file.type,
          base64,
        });
        addLeadAttachment(activeOpp.id, {
          id: nanoid(8),
          name: file.name,
          url: result.url,
          mimeType: file.type,
          size: file.size,
          uploadedAt: new Date().toISOString(),
        });
        toast.success('File uploaded');
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // Parse linked lead photos
  const leadRequestPhotos: string[] = (() => {
    try {
      const raw = sourceLead?.onlineRequestId ? [] : [];
      return raw;
    } catch { return []; }
  })();

  const isApproved = !!activeOpp.wonAt;

  return (
    <div className="space-y-4">
      {/* ── STAGE SWITCHER ──────────────────────────────────── */}
      <Card className="border-2 border-primary/10">
        <CardHeader className="pb-2 pt-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {activeOpp.area === 'estimate' ? 'Estimate Status' : 'Job Status'}
            </CardTitle>
            {stageSaving && <span className="text-xs text-muted-foreground animate-pulse">Saving…</span>}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold ${currentStageColor}`}>
              <span className="w-2 h-2 rounded-full bg-current opacity-60" />
              {currentStage}
            </span>
            {isApproved && (
              <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700">
                Approved
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="flex flex-wrap gap-1.5">
            {stages.map(stage => {
              const isActive = stage === currentStage;
              const color = stageColorMap[stage] ?? 'bg-muted/40 text-muted-foreground border-border';
              return (
                <button
                  key={stage}
                  disabled={isApproved || stageSaving}
                  onClick={() => handleStageChange(stage)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    isActive
                      ? color + ' ring-2 ring-offset-1 ring-current'
                      : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-current' : 'bg-muted-foreground/40'}`} />
                  {stage}
                </button>
              );
            })}
          </div>
          {isApproved && (
            <p className="text-xs text-muted-foreground mt-2">
              Stage locked — estimate is approved.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── SCOPE / DESCRIPTION ─────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Scope / Description
            </CardTitle>
            {!editingScope && !isApproved && (
              <button
                onClick={() => { setScopeDraft(activeOpp.notes ?? ''); setEditingScope(true); }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Edit3 size={13} />
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          {editingScope ? (
            <div className="space-y-2">
              <Textarea
                value={scopeDraft}
                onChange={e => setScopeDraft(e.target.value)}
                placeholder="Describe the scope of work for this opportunity…"
                className="min-h-[100px] resize-none text-sm"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSaveScope();
                  if (e.key === 'Escape') setEditingScope(false);
                }}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveScope} className="gap-1.5">
                  <Check size={12} /> Save
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingScope(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div>
              {activeOpp.notes ? (
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {activeOpp.notes}
                </p>
              ) : (
                <button
                  onClick={() => { setScopeDraft(''); setEditingScope(true); }}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
                  disabled={isApproved}
                >
                  <Plus size={13} /> Add scope description…
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── LINKED LEAD BANNER ──────────────────────────────── */}
      {sourceLead && (
        <Card className="border-sky-200 bg-sky-50/50 dark:bg-sky-950/20 dark:border-sky-800">
          <CardHeader className="pb-2 pt-4">
            <button
              className="flex items-center justify-between w-full"
              onClick={() => setLeadBannerOpen(p => !p)}
            >
              <CardTitle className="text-xs font-semibold uppercase tracking-widest text-sky-700 dark:text-sky-400 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5" /> From Lead: {sourceLead.title}
              </CardTitle>
              {leadBannerOpen ? <ChevronUp size={14} className="text-sky-600" /> : <ChevronDown size={14} className="text-sky-600" />}
            </button>
          </CardHeader>
          {leadBannerOpen && (
            <CardContent className="pb-4 space-y-3">
              {/* Lead notes */}
              {(sourceLead.leadNotes ?? []).length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-600 mb-2">Lead Notes</p>
                  <div className="space-y-2">
                    {[...(sourceLead.leadNotes ?? [])].reverse().map(note => (
                      <div key={note.id} className="rounded-lg bg-white dark:bg-sky-950/40 border border-sky-100 dark:border-sky-800 px-3 py-2">
                        <div className="flex items-center gap-2 mb-1">
                          <ContactTypeBadge type={note.type} />
                          <span className="text-[10px] text-muted-foreground">{fmtDateTime(note.createdAt)}</span>
                        </div>
                        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{note.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Lead attachments */}
              {(sourceLead.leadAttachments ?? []).length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-600 mb-2">Lead Attachments</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {(sourceLead.leadAttachments ?? []).map((att, idx) => {
                      const isImg = att.mimeType.startsWith('image/');
                      return (
                        <div
                          key={att.id}
                          className="group relative rounded-lg border border-sky-200 overflow-hidden hover:border-sky-400 transition-colors"
                        >
                          {isImg ? (
                            <button
                              className="w-full"
                              onClick={() => openLightbox(leadImageUrls, leadImageUrls.indexOf(att.url))}
                            >
                              <img src={att.url} alt={att.name} className="w-full h-24 object-cover hover:opacity-90 transition-opacity" />
                            </button>
                          ) : (
                            <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center h-24 bg-sky-50 hover:bg-sky-100 transition-colors gap-1">
                              <Paperclip size={20} className="text-sky-400" />
                              <span className="text-[10px] text-sky-600 font-medium truncate px-2 max-w-full">{att.name}</span>
                            </a>
                          )}
                          <div className="absolute inset-0 pointer-events-none" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {(sourceLead.leadNotes ?? []).length === 0 && (sourceLead.leadAttachments ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">No notes or attachments on the original lead.</p>
              )}
              <p className="text-[10px] text-muted-foreground">Read-only — original lead data.</p>
            </CardContent>
          )}
        </Card>
      )}

      {/* ── QUICK CONTACT ───────────────────────────────────── */}
      {(phone || email) && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5" /> Contact Now
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="flex flex-wrap gap-2">
              {phone && (
                <>
                  <a
                    href={`tel:${phone}`}
                    onClick={() => addLeadNote(activeOpp.id, { text: `Called ${phone}`, type: 'call' })}
                  >
                    <Button variant="outline" size="sm" className="gap-2 text-green-700 border-green-300 hover:bg-green-50 font-semibold">
                      <Phone className="w-3.5 h-3.5" /> Call {phone}
                    </Button>
                  </a>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-blue-700 border-blue-300 hover:bg-blue-50 font-semibold"
                    onClick={() => setSmsOpen(true)}
                  >
                    <MessageSquare className="w-3.5 h-3.5" /> Text {phone}
                  </Button>
                </>
              )}
              {email && (
                <a
                  href={`mailto:${email}?subject=Re: ${encodeURIComponent(activeOpp.title)}`}
                  onClick={() => addLeadNote(activeOpp.id, { text: `Emailed ${email}`, type: 'email' })}
                >
                  <Button variant="outline" size="sm" className="gap-2 text-purple-700 border-purple-300 hover:bg-purple-50 font-semibold">
                    <Mail className="w-3.5 h-3.5" /> Email
                  </Button>
                </a>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">Tapping a button auto-logs the contact in Notes.</p>
          </CardContent>
        </Card>
      )}

      {/* ── SMS COMPOSE DIALOG ──────────────────────────────── */}
      <Dialog open={smsOpen} onOpenChange={setSmsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-600" /> Send SMS to {phone}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={smsBody}
            onChange={e => setSmsBody(e.target.value)}
            placeholder="Type your message…"
            className="min-h-[120px] resize-none text-sm"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSendSms();
            }}
          />
          <p className="text-xs text-muted-foreground">{smsBody.length}/1600 · ⌘↵ to send</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSmsOpen(false)} disabled={smsSending}>Cancel</Button>
            <Button onClick={handleSendSms} disabled={!smsBody.trim() || smsSending} className="gap-1.5">
              <MessageSquare size={13} /> {smsSending ? 'Sending…' : 'Send SMS'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── NOTES / ACTIVITY LOG ────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> Notes & Activity
            {notes.length > 0 && <Badge variant="secondary" className="text-xs ml-1">{notes.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pb-4">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {CONTACT_TYPES.map(ct => (
                <button
                  key={ct.type}
                  onClick={() => setNoteType(ct.type)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all ${
                    noteType === ct.type
                      ? ct.color + ' ring-2 ring-offset-1 ring-current'
                      : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
                  }`}
                >
                  {ct.icon} {ct.label}
                </button>
              ))}
            </div>
            <Textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder={
                noteType === 'call'  ? 'Log a call — what was discussed?' :
                noteType === 'sms'   ? 'Log a text message exchange…' :
                noteType === 'email' ? 'Summarize the email thread…' :
                noteType === 'visit' ? 'Notes from the site visit…' :
                'Add a note about this estimate…'
              }
              className="min-h-[80px] resize-none text-sm"
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddNote();
              }}
            />
            <Button
              size="sm"
              onClick={handleAddNote}
              disabled={!noteText.trim()}
              className="gap-1.5"
            >
              <Plus size={13} /> Save Note
              <span className="text-[10px] opacity-60 ml-1 hidden sm:inline">⌘↵</span>
            </Button>
          </div>
          {notes.length > 0 && (
            <>
              <div className="border-t border-border" />
              <div className="space-y-3">
                {[...notes].reverse().map(note => (
                  <div key={note.id} className="group flex gap-3">
                    <div className="flex-1 min-w-0 rounded-lg bg-muted/30 px-3 py-2.5 border border-border/50">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <ContactTypeBadge type={note.type} />
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground">{fmtDateTime(note.createdAt)}</span>
                          <button
                            onClick={() => removeLeadNote(activeOpp.id, note.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{note.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {notes.length === 0 && (
            <div className="text-center py-6 text-muted-foreground">
              <StickyNote className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No notes yet. Log calls, texts, and site visits here.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── ATTACHMENTS ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5" /> Attachments
              {attachments.length > 0 && <Badge variant="secondary" className="text-xs ml-1">{attachments.length}</Badge>}
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-7 text-xs"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Plus size={12} /> {uploading ? 'Uploading…' : 'Add File'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            onChange={handleFileChange}
          />
          {attachments.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {attachments.map(att => {
                const isImg = att.mimeType.startsWith('image/');
                return (
                  <div key={att.id} className="group relative rounded-lg border border-border overflow-hidden">
                    {isImg ? (
                      <button className="w-full" onClick={() => openLightbox(mainImageUrls, mainImageUrls.indexOf(att.url))}>
                        <img src={att.url} alt={att.name} className="w-full h-24 object-cover hover:opacity-90 transition-opacity" />
                      </button>
                    ) : (
                      <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center h-24 bg-muted/30 hover:bg-muted/50 transition-colors gap-1">
                        <Download size={20} className="text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground font-medium truncate px-2 max-w-full">{att.name}</span>
                        <span className="text-[9px] text-muted-foreground/70">{fmtBytes(att.size)}</span>
                      </a>
                    )}
                    <button
                      onClick={() => removeLeadAttachment(activeOpp.id, att.id)}
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded-full p-0.5 text-white hover:bg-red-600"
                    >
                      <X size={10} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Camera className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No attachments yet. Add photos, docs, or contracts.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── MAP PREVIEW ─────────────────────────────────────── */}
      {address && (
        <Card>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Job Site
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <AddressMapPreview
              street={address}
              city={city}
              state={stateAbbr}
              zip={zip}
              height="160px"
              showLink={true}
            />
          </CardContent>
        </Card>
      )}

      {/* Lightbox */}
      {lightboxImages.length > 0 && (
        <Lightbox images={lightboxImages} index={lightboxIndex} onClose={closeLightbox} />
      )}
    </div>
  );
}
