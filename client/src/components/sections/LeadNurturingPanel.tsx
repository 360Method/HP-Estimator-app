// ============================================================
// LeadNurturingPanel — Lead-specific details panel
// Shows: status switcher, next-action CTA, quick-contact buttons,
// timestamped notes/activity log with contact-type tags, and attachments.
// ============================================================
import { useState, useRef } from 'react';
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
  Footprints, PhoneCall, MessageCircle, AtSign,
  CheckCircle2, AlertCircle, Clock, ArrowRight, Zap,
} from 'lucide-react';
import type { LeadContactType, LeadStage, JobAttachment } from '@/lib/types';
import { LEAD_STAGES } from '@/lib/types';
import { ConvertToEstimateModal } from '@/components/ConversionModal';
import { Globe, Camera, Clock as ClockIcon, Wrench, ChevronDown, ChevronUp } from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function fmtFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Stage config: color + next-action guidance
const STAGE_CONFIG: Record<LeadStage, { color: string; dot: string; cta: string; ctaIcon: React.ReactNode }> = {
  'New Lead':           { color: 'bg-blue-100 text-blue-800 border-blue-200',       dot: 'bg-blue-500',    cta: 'Call or text to make first contact',           ctaIcon: <Phone size={14} /> },
  'Return Call Needed': { color: 'bg-amber-100 text-amber-800 border-amber-200',    dot: 'bg-amber-500',   cta: 'Follow up — customer is expecting your call',  ctaIcon: <PhoneCall size={14} /> },
  'First Contact':      { color: 'bg-sky-100 text-sky-800 border-sky-200',          dot: 'bg-sky-500',     cta: 'Schedule a site visit or send an estimate',    ctaIcon: <Footprints size={14} /> },
  'Second Contact':     { color: 'bg-indigo-100 text-indigo-800 border-indigo-200', dot: 'bg-indigo-500',  cta: 'Follow up again — keep the conversation warm', ctaIcon: <MessageSquare size={14} /> },
  'Third Contact':      { color: 'bg-violet-100 text-violet-800 border-violet-200', dot: 'bg-violet-500',  cta: 'Final follow-up or consider moving to On Hold', ctaIcon: <MessageCircle size={14} /> },
  'On Hold':            { color: 'bg-slate-100 text-slate-600 border-slate-200',    dot: 'bg-slate-400',   cta: 'Check back in — set a reminder to revisit',    ctaIcon: <Clock size={14} /> },
  'Won':                { color: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500', cta: 'Convert to an Estimate to start the project', ctaIcon: <CheckCircle2 size={14} /> },
  'Lost':               { color: 'bg-red-100 text-red-700 border-red-200',          dot: 'bg-red-400',     cta: 'Log why this lead was lost for future reference', ctaIcon: <AlertCircle size={14} /> },
};

const CONTACT_TYPES: { type: LeadContactType; label: string; icon: React.ReactNode; color: string }[] = [
  { type: 'note',  label: 'Note',   icon: <StickyNote size={12} />,    color: 'bg-slate-100 text-slate-700 border-slate-200' },
  { type: 'call',  label: 'Call',   icon: <PhoneCall size={12} />,     color: 'bg-green-100 text-green-700 border-green-200' },
  { type: 'sms',   label: 'SMS',    icon: <MessageCircle size={12} />, color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { type: 'email', label: 'Email',  icon: <AtSign size={12} />,        color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { type: 'visit', label: 'Visit',  icon: <Footprints size={12} />,    color: 'bg-amber-100 text-amber-700 border-amber-200' },
];

function ContactTypeBadge({ type }: { type: LeadContactType }) {
  const ct = CONTACT_TYPES.find(c => c.type === type) ?? CONTACT_TYPES[0];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ct.color}`}>
      {ct.icon} {ct.label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────
export default function LeadNurturingPanel() {
  const {
    state,
    updateOpportunity,
    addLeadNote,
    removeLeadNote,
    addLeadAttachment,
    removeLeadAttachment,
    convertLeadToEstimate,
  } = useEstimator();

  const activeOpp = state.opportunities.find(o => o.id === state.activeOpportunityId);
  const activeCustomer = state.customers.find(c => c.id === state.activeCustomerId);

  const [noteText, setNoteText] = useState('');
  const [noteType, setNoteType] = useState<LeadContactType>('note');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [stageSaving, setStageSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = trpc.uploads.uploadFile.useMutation();
  const moveStage = trpc.opportunities.moveStage.useMutation();
  const quickSendSms = trpc.opportunities.quickSendSms.useMutation();
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsBody, setSmsBody] = useState('');
  const [smsSending, setSmsSending] = useState(false);

  const onlineRequestId = activeOpp.onlineRequestId;
  const { data: onlineRequest } = trpc.booking.getRequest.useQuery(
    { id: onlineRequestId! },
    { enabled: !!onlineRequestId },
  );
  const [photosExpanded, setPhotosExpanded] = useState(false);

  if (!activeOpp || activeOpp.area !== 'lead') return null;

  // Contact info
  const phone = activeCustomer?.mobilePhone || activeCustomer?.homePhone || activeCustomer?.workPhone
    || (activeOpp.clientSnapshot as any)?.phone || '';
  const email = activeCustomer?.email || (activeOpp.clientSnapshot as any)?.email || '';
  const notes = activeOpp.leadNotes ?? [];
  const attachments = activeOpp.leadAttachments ?? [];
  const currentStage = (activeOpp.stage as LeadStage) ?? 'New Lead';
  const stageCfg = STAGE_CONFIG[currentStage] ?? STAGE_CONFIG['New Lead'];

  // ── Stage change ──────────────────────────────────────────
  const handleStageChange = async (newStage: LeadStage) => {
    if (newStage === currentStage || stageSaving) return;
    const prevStage = currentStage;
    setStageSaving(true);
    updateOpportunity(activeOpp.id, { stage: newStage }); // optimistic
    try {
      await moveStage.mutateAsync({ id: activeOpp.id, stage: newStage });
      toast.success(`Status → "${newStage}"`);
    } catch {
      updateOpportunity(activeOpp.id, { stage: prevStage }); // rollback
      toast.error('Failed to update status');
    } finally {
      setStageSaving(false);
    }
  };

  // ── Add note ──────────────────────────────────────────────
  const handleAddNote = () => {
    const text = noteText.trim();
    if (!text) return;
    addLeadNote(activeOpp.id, { text, type: noteType });
    setNoteText('');
    toast.success('Note saved');
  };

  // ── Upload attachment ─────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await uploadFile.mutateAsync({
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64,
        folder: 'lead-attachments',
      });
      const attachment: JobAttachment = {
        id: nanoid(8),
        name: file.name,
        url: result.url,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        uploadedAt: new Date().toISOString(),
      };
      addLeadAttachment(activeOpp.id, attachment);
      toast.success('File uploaded');
    } catch (err) {
      console.error('Upload failed:', err);
      toast.error('Upload failed');
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Quick SMS send ────────────────────────────────────────
  const handleSendSms = async () => {
    if (!phone || !smsBody.trim()) return;
    setSmsSending(true);
    try {
      await quickSendSms.mutateAsync({
        to: phone,
        body: smsBody.trim(),
        contactName: activeCustomer?.displayName,
        customerId: activeCustomer?.id,
      });
      addLeadNote(activeOpp.id, { text: `SMS sent: ${smsBody.trim()}`, type: 'sms' });
      toast.success('SMS sent');
      setSmsBody('');
      setSmsOpen(false);
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to send SMS');
    } finally {
      setSmsSending(false);
    }
  };

  // ── Convert to estimate ───────────────────────────────────
  const [showConvertModal, setShowConvertModal] = useState(false);
  const handleConvert = () => {
    setShowConvertModal(true);
  };

  // Parse photo URLs from online request
  const requestPhotos: string[] = (() => {
    if (!onlineRequest?.photoUrls) return [];
    try { return JSON.parse(onlineRequest.photoUrls); } catch { return []; }
  })();

  const timelineLabel: Record<string, string> = {
    'ASAP': '🔴 ASAP',
    'Within a week': '🟡 Within a week',
    'Flexible': '🟢 Flexible',
  };

  return (
    <div className="space-y-4">

      {/* ── ONLINE REQUEST BANNER ─────────────────────────────── */}
      {onlineRequest && (
        <Card className="border-2 border-sky-200 bg-sky-50/60">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-xs font-semibold uppercase tracking-widest text-sky-700 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" /> From Online Request
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4 space-y-3">
            {/* Service + Timeline row */}
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-white border border-sky-200 px-2.5 py-1 text-xs font-semibold text-sky-800">
                <Wrench size={11} /> {onlineRequest.serviceType}
              </span>
              {onlineRequest.timeline && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white border border-sky-200 px-2.5 py-1 text-xs font-semibold text-sky-800">
                  <ClockIcon size={11} /> {timelineLabel[onlineRequest.timeline] ?? onlineRequest.timeline}
                </span>
              )}
              {onlineRequest.smsConsent && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-2.5 py-1 text-xs font-semibold text-green-700">
                  SMS OK
                </span>
              )}
            </div>

            {/* Description */}
            {onlineRequest.description && (
              <p className="text-sm text-foreground leading-relaxed bg-white rounded-lg border border-sky-100 px-3 py-2.5">
                {onlineRequest.description}
              </p>
            )}

            {/* Address */}
            <p className="text-xs text-muted-foreground">
              {[onlineRequest.street, onlineRequest.unit, onlineRequest.city, onlineRequest.state, onlineRequest.zip]
                .filter(Boolean).join(', ')}
            </p>

            {/* Photos */}
            {requestPhotos.length > 0 && (
              <div>
                <button
                  className="flex items-center gap-1.5 text-xs font-semibold text-sky-700 mb-2 hover:text-sky-900 transition-colors"
                  onClick={() => setPhotosExpanded(p => !p)}
                >
                  <Camera size={12} /> {requestPhotos.length} photo{requestPhotos.length !== 1 ? 's' : ''} submitted
                  {photosExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
                {photosExpanded && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {requestPhotos.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={url}
                          alt={`Photo ${i + 1}`}
                          className="w-full h-28 object-cover rounded-lg border border-sky-200 hover:opacity-90 transition-opacity"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            <p className="text-[10px] text-muted-foreground">
              Submitted {new Date(onlineRequest.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── STATUS SWITCHER ─────────────────────────────────── */}
      <Card className="border-2 border-primary/10">
        <CardHeader className="pb-2 pt-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Lead Status
            </CardTitle>
            {stageSaving && <span className="text-xs text-muted-foreground animate-pulse">Saving…</span>}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold ${stageCfg.color}`}>
              <span className={`w-2 h-2 rounded-full ${stageCfg.dot}`} />
              {currentStage}
            </span>
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          {/* Stage chips */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {LEAD_STAGES.map(stage => {
              const cfg = STAGE_CONFIG[stage];
              const isActive = stage === currentStage;
              return (
                <button
                  key={stage}
                  onClick={() => handleStageChange(stage)}
                  disabled={stageSaving}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-all ${
                    isActive
                      ? cfg.color + ' ring-2 ring-offset-1 ring-current'
                      : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isActive ? cfg.dot : 'bg-muted-foreground/40'}`} />
                  {stage}
                </button>
              );
            })}
          </div>

          {/* Next-action CTA */}
          <div className="flex items-start gap-2.5 rounded-lg bg-primary/5 border border-primary/15 px-3 py-2.5">
            <span className="text-primary mt-0.5 shrink-0">{stageCfg.ctaIcon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground">Next Action</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stageCfg.cta}</p>
            </div>
            {currentStage === 'Won' && (
              <Button size="sm" className="gap-1.5 text-xs h-7 shrink-0" onClick={handleConvert}>
                <ArrowRight size={12} /> Convert to Estimate
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── QUICK CONTACT ────────────────────────────────────── */}
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
                  href={`mailto:${email}?subject=Following up on your service request`}
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

      {/* ── SMS COMPOSE DIALOG ───────────────────────────────── */}
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
            placeholder="Type your message..."
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

      {/* ── NOTES / ACTIVITY LOG ─────────────────────────────── */}
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
                noteType === 'sms'   ? 'Log a text message exchange...' :
                noteType === 'email' ? 'Summarize the email thread...' :
                noteType === 'visit' ? 'Notes from the site visit...' :
                'Add a note about this lead...'
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
              <p className="text-sm">No notes yet. Log calls, texts, and visits here.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── ATTACHMENTS ──────────────────────────────────────── */}
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
              className="gap-1.5 text-xs h-7"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFile}
            >
              <Plus className="w-3 h-3" />
              {uploadingFile ? 'Uploading…' : 'Add File'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
          />
          {attachments.length === 0 ? (
            <div
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/40 hover:bg-muted/20 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Drop files or click to upload</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Photos, PDFs, documents — max 16 MB</p>
            </div>
          ) : (
            <div className="space-y-2">
              {attachments.map(att => {
                const isImage = att.mimeType.startsWith('image/');
                return (
                  <div key={att.id} className="group flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 hover:bg-muted/30 transition-colors">
                    {isImage ? (
                      <img src={att.url} alt={att.name} className="w-10 h-10 rounded object-cover flex-shrink-0 border" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{att.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {fmtFileSize(att.size)} · {fmtDateTime(att.uploadedAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <a href={att.url} target="_blank" rel="noopener noreferrer" download={att.name}>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                          <Download size={13} />
                        </Button>
                      </a>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => removeLeadAttachment(activeOpp.id, att.id)}
                      >
                        <X size={13} />
                      </Button>
                    </div>
                  </div>
                );
              })}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
                disabled={uploadingFile}
              >
                <Plus size={12} /> {uploadingFile ? 'Uploading…' : 'Add another file'}
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Convert to Estimate modal with transfer prompt */}
      {showConvertModal && (
        <ConvertToEstimateModal
          lead={activeOpp}
          onConfirm={(title, value, transferNotes, transferAttachments) => {
            convertLeadToEstimate(activeOpp.id, title, value, transferNotes, transferAttachments);
            setShowConvertModal(false);
            toast.success('Lead converted to Estimate');
          }}
          onClose={() => setShowConvertModal(false)}
        />
      )}
    </div>
  );
}
