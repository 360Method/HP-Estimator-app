// ============================================================
// PhoneSettings — Inbound call routing configuration
// Two separate prompts:
//   1. Call Greeting     — played before routing (forwarding modes only)
//   2. Voicemail Prompt  — played before the beep (voicemail mode + after-hours)
// ============================================================

import { useState } from 'react';
import {
  Phone, PhoneForwarded, Bot, Voicemail, TestTube, Save, Loader2,
  Clock, ChevronDown, ChevronUp, Sparkles, AlertTriangle,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

type ForwardingMode = 'forward_to_number' | 'forward_to_ai' | 'voicemail';

const DAYS = [
  { num: 0, label: 'Sun' },
  { num: 1, label: 'Mon' },
  { num: 2, label: 'Tue' },
  { num: 3, label: 'Wed' },
  { num: 4, label: 'Thu' },
  { num: 5, label: 'Fri' },
  { num: 6, label: 'Sat' },
];

// ─── Recording disclosure sentence ───────────────────────────────────────────
const RECORDING_DISCLOSURE = " This call may be recorded for quality and training purposes.";

// ─── Call Greeting examples (forwarding modes) ────────────────────────────────
const GREETING_EXAMPLES: { label: string; text: string; recommended?: boolean }[] = [
  {
    label: 'Professional (with recording notice)',
    recommended: true,
    text: "Thank you for calling Handy Pioneers. This call may be recorded for quality and training purposes. Please hold while we connect you.",
  },
  {
    label: 'Friendly & warm',
    text: "Hi, you've reached Handy Pioneers — your local home improvement experts. We're excited to help with your project. Please hold for just a moment.",
  },
  {
    label: 'Brief & direct',
    text: "Thank you for calling Handy Pioneers. Please hold.",
  },
  {
    label: 'With recording notice only',
    text: "Thank you for calling Handy Pioneers. This call may be recorded. Please hold while we connect you.",
  },
  {
    label: 'Bilingual (English / Spanish)',
    text: "Thank you for calling Handy Pioneers. This call may be recorded. Para español, por favor espere.",
  },
];

// ─── Voicemail Prompt examples ────────────────────────────────────────────────
const VOICEMAIL_EXAMPLES: { label: string; text: string; recommended?: boolean }[] = [
  {
    label: 'Standard (with recording notice)',
    recommended: true,
    text: "You've reached Handy Pioneers. This call may be recorded. We're unavailable right now — please leave your name, number, and a brief description of your project after the beep and we'll call you back shortly.",
  },
  {
    label: 'Detailed project request',
    text: "Hi, you've reached Handy Pioneers. We're unable to take your call at the moment. Please leave your name, callback number, your address, and a description of the work you need done. We'll get back to you within one business day. This call may be recorded.",
  },
  {
    label: 'After-hours specific',
    text: "You've reached Handy Pioneers. Our office is currently closed. Our business hours are Monday through Friday, 8 AM to 5 PM Pacific. Please leave your name, number, and project details and we'll return your call the next business day. This call may be recorded.",
  },
  {
    label: 'Estimate request prompt',
    text: "Thanks for calling Handy Pioneers! Please leave your name, phone number, property address, and a description of the work you're interested in. We'll follow up to schedule a free estimate. This call may be recorded.",
  },
  {
    label: 'Brief & direct',
    text: "You've reached Handy Pioneers. Please leave a message after the beep. This call may be recorded.",
  },
];

const MAX_GREETING_LENGTH = 500;
const MAX_VOICEMAIL_LENGTH = 600;

// ─── PromptEditor sub-component ───────────────────────────────────────────────

interface PromptEditorProps {
  id: string;
  label: string;
  sublabel: string;
  value: string;
  onChange: (v: string) => void;
  examples: { label: string; text: string; recommended?: boolean }[];
  maxLength: number;
  showRecordingNudge: boolean;
  placeholder: string;
}

function PromptEditor({
  id, label, sublabel, value, onChange, examples, maxLength, showRecordingNudge, placeholder,
}: PromptEditorProps) {
  const [showExamples, setShowExamples] = useState(false);
  const hasDisclosure = /recorded|recording/i.test(value);
  const showNudge = showRecordingNudge && value.trim().length > 0 && !hasDisclosure;
  const showEmptyNudge = showRecordingNudge && !value.trim();

  const applyExample = (text: string) => {
    onChange(text);
    setShowExamples(false);
  };

  const addDisclosure = () => {
    const trimmed = value.trimEnd();
    const sep = /[.!?]$/.test(trimmed) ? '' : '.';
    onChange((trimmed + sep + RECORDING_DISCLOSURE).slice(0, maxLength));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor={id} className="text-sm font-semibold">{label}</Label>
          <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowExamples(v => !v)}
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Sparkles size={12} />
          Examples
          {showExamples ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* Example templates panel */}
      {showExamples && (
        <div className="border border-border rounded-lg divide-y divide-border bg-card">
          {examples.map((ex, i) => (
            <button
              key={i}
              type="button"
              onClick={() => applyExample(ex.text)}
              className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-foreground">{ex.label}</span>
                {ex.recommended && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5">recommended</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{ex.text}</p>
            </button>
          ))}
        </div>
      )}

      <Textarea
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value.slice(0, maxLength))}
        rows={4}
        className="resize-none text-sm"
      />

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Leave blank to use the default message.</p>
        <span className={`text-xs tabular-nums ${value.length >= maxLength - 20 ? 'text-amber-500' : 'text-muted-foreground'}`}>
          {value.length}/{maxLength}
        </span>
      </div>

      {/* Nudge: recording on, greeting present, no disclosure */}
      {showNudge && (
        <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
          <AlertTriangle size={13} className="mt-0.5 text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
              Call recording is on — consider adding a disclosure
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Many states require notifying callers before recording.
            </p>
            <button type="button" onClick={addDisclosure} className="mt-2 text-xs text-primary underline hover:no-underline">
              Add disclosure sentence
            </button>
          </div>
        </div>
      )}

      {/* Nudge: recording on, field empty */}
      {showEmptyNudge && (
        <div className="flex items-start gap-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
          <AlertTriangle size={13} className="mt-0.5 text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
              Call recording is on — a prompt with disclosure is recommended
            </p>
            <button type="button" onClick={() => applyExample(examples[0].text)} className="mt-2 text-xs text-primary underline hover:no-underline">
              Use recommended template
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PhoneSettings() {
  const { data: settings, isLoading, refetch } = trpc.phone.getSettings.useQuery();

  const [mode, setMode] = useState<ForwardingMode | null>(null);
  const [forwardingNumber, setForwardingNumber] = useState<string | null>(null);
  const [aiServiceNumber, setAiServiceNumber] = useState<string | null>(null);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [voicemailPrompt, setVoicemailPrompt] = useState<string | null>(null);
  const [callRecording, setCallRecording] = useState<boolean | null>(null);
  const [transcribeVoicemail, setTranscribeVoicemail] = useState<boolean | null>(null);
  const [afterHoursEnabled, setAfterHoursEnabled] = useState<boolean | null>(null);
  const [businessHoursStart, setBusinessHoursStart] = useState<string | null>(null);
  const [businessHoursEnd, setBusinessHoursEnd] = useState<string | null>(null);
  const [businessDays, setBusinessDays] = useState<string | null>(null);
  const [testNumber, setTestNumber] = useState('');

  // Use server values as defaults when local state is null
  const effectiveMode = (mode ?? settings?.forwardingMode ?? 'forward_to_number') as ForwardingMode;
  const effectiveForwardingNumber = forwardingNumber ?? settings?.forwardingNumber ?? '';
  const effectiveAiServiceNumber = aiServiceNumber ?? settings?.aiServiceNumber ?? '';
  const effectiveGreeting = greeting ?? settings?.greeting ?? '';
  const effectiveVoicemailPrompt = voicemailPrompt ?? settings?.voicemailPrompt ?? '';
  const effectiveCallRecording = callRecording ?? settings?.callRecording ?? false;
  const effectiveTranscribeVoicemail = transcribeVoicemail ?? settings?.transcribeVoicemail ?? true;
  const effectiveAfterHoursEnabled = afterHoursEnabled ?? settings?.afterHoursEnabled ?? false;
  const effectiveBusinessHoursStart = businessHoursStart ?? settings?.businessHoursStart ?? '08:00';
  const effectiveBusinessHoursEnd = businessHoursEnd ?? settings?.businessHoursEnd ?? '17:00';
  const effectiveBusinessDays = businessDays ?? settings?.businessDays ?? '1,2,3,4,5';

  const selectedDays = effectiveBusinessDays.split(',').map(Number).filter(n => !isNaN(n));

  const toggleDay = (dayNum: number) => {
    const current = new Set(selectedDays);
    if (current.has(dayNum)) current.delete(dayNum);
    else current.add(dayNum);
    setBusinessDays(Array.from(current).sort((a, b) => a - b).join(','));
  };

  const updateMutation = trpc.phone.updateSettings.useMutation({
    onSuccess: () => { refetch(); toast.success('Phone settings saved'); },
    onError: (err) => toast.error('Save failed', { description: err.message }),
  });

  const testCallMutation = trpc.phone.testCall.useMutation({
    onSuccess: ({ callSid }) => toast.success('Test call placed', { description: `SID: ${callSid}` }),
    onError: (err) => toast.error('Test call failed', { description: err.message }),
  });

  const handleSave = () => {
    updateMutation.mutate({
      forwardingMode: effectiveMode,
      forwardingNumber: effectiveForwardingNumber,
      aiServiceNumber: effectiveAiServiceNumber,
      greeting: effectiveGreeting,
      voicemailPrompt: effectiveVoicemailPrompt,
      callRecording: effectiveCallRecording,
      transcribeVoicemail: effectiveTranscribeVoicemail,
      afterHoursEnabled: effectiveAfterHoursEnabled,
      businessHoursStart: effectiveBusinessHoursStart,
      businessHoursEnd: effectiveBusinessHoursEnd,
      businessDays: effectiveBusinessDays,
    });
  };

  if (isLoading) {
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />
        Loading phone settings…
      </div>
    );
  }

  const MODES: { id: ForwardingMode; label: string; desc: string; icon: React.ElementType }[] = [
    {
      id: 'forward_to_number',
      label: 'Ring cell first, then AI / voicemail',
      desc: 'Rings your personal cell for ~2 rings (10 s). If unanswered, the call falls through to your AI service or system voicemail — no voicemail ever goes to your personal cell.',
      icon: PhoneForwarded,
    },
    {
      id: 'forward_to_ai',
      label: 'Forward directly to AI answering service',
      desc: 'Skips the personal cell entirely. All calls go straight to your AI answering service number.',
      icon: Bot,
    },
    {
      id: 'voicemail',
      label: 'System voicemail only (saved in app)',
      desc: 'Callers hear your voicemail prompt and leave a message. Recordings are saved to their customer profile — never to a personal phone.',
      icon: Voicemail,
    },
  ];

  const isForwardingMode = effectiveMode === 'forward_to_number' || effectiveMode === 'forward_to_ai';

  return (
    <div className="p-6 max-w-2xl space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Phone size={18} className="text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">Phone Settings</h2>
          <p className="text-sm text-muted-foreground">
            Configure inbound call routing for <span className="font-medium text-foreground">+1 (360) 838-6731</span>
          </p>
        </div>
      </div>

      {/* Routing mode */}
      <div className="space-y-3">
        <Label className="text-sm font-semibold">Inbound Call Routing</Label>
        <div className="space-y-2">
          {MODES.map(({ id, label, desc, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={`w-full flex items-start gap-3 p-4 rounded-lg border text-left transition-colors ${
                effectiveMode === id ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/40'
              }`}
            >
              <div className={`mt-0.5 p-1.5 rounded-md ${effectiveMode === id ? 'bg-primary/15' : 'bg-muted'}`}>
                <Icon size={14} className={effectiveMode === id ? 'text-primary' : 'text-muted-foreground'} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${effectiveMode === id ? 'text-primary' : 'text-foreground'}`}>{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
              <div className={`mt-1 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${effectiveMode === id ? 'border-primary' : 'border-muted-foreground/40'}`}>
                {effectiveMode === id && <div className="w-2 h-2 rounded-full bg-primary" />}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Forwarding number */}
      {effectiveMode === 'forward_to_number' && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="forwarding-number">Personal Cell Number</Label>
            <Input id="forwarding-number" placeholder="+18157933243" value={effectiveForwardingNumber} onChange={e => setForwardingNumber(e.target.value)} />
            <p className="text-xs text-muted-foreground">E.164 format (e.g. +18157933243). Rings for ~2 rings (10 s) then falls through.</p>
          </div>
          {/* Stage-2 fallback info */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
            <p className="text-xs font-semibold text-foreground">Stage 2 — if cell doesn't answer</p>
            <p className="text-xs text-muted-foreground">
              {effectiveAiServiceNumber
                ? `Forwards to AI service: ${effectiveAiServiceNumber}`
                : 'Routes to system voicemail (recording saved in app). Set an AI Service Number below to forward to AI instead.'}
            </p>
          </div>
          {/* AI service number (optional stage-2 override) */}
          <div className="space-y-2">
            <Label htmlFor="ai-number-fallback">AI Service Number <span className="text-muted-foreground font-normal">(optional — stage 2 fallback)</span></Label>
            <Input id="ai-number-fallback" placeholder="+18157939999" value={effectiveAiServiceNumber} onChange={e => setAiServiceNumber(e.target.value)} />
            <p className="text-xs text-muted-foreground">If set, unanswered calls go to this AI service instead of system voicemail.</p>
          </div>
        </div>
      )}

      {/* AI service number (direct mode) */}
      {effectiveMode === 'forward_to_ai' && (
        <div className="space-y-2">
          <Label htmlFor="ai-number">AI Service Number</Label>
          <Input id="ai-number" placeholder="+18157939999" value={effectiveAiServiceNumber} onChange={e => setAiServiceNumber(e.target.value)} />
          <p className="text-xs text-muted-foreground">All inbound calls go directly to this number. No personal cell involved.</p>
        </div>
      )}

      {/* ── Call Greeting (forwarding modes only) ── */}
      {isForwardingMode && (
        <PromptEditor
          id="greeting"
          label="Call Greeting"
          sublabel="Played to the caller before the call is connected. Keep it brief (under 10 seconds)."
          value={effectiveGreeting}
          onChange={setGreeting}
          examples={GREETING_EXAMPLES}
          maxLength={MAX_GREETING_LENGTH}
          showRecordingNudge={effectiveCallRecording}
          placeholder="Thank you for calling Handy Pioneers. This call may be recorded. Please hold while we connect you."
        />
      )}

      {/* ── Voicemail Prompt ── */}
      <PromptEditor
        id="voicemail-prompt"
        label="Voicemail Prompt"
        sublabel={
          effectiveMode === 'voicemail'
            ? "Played to callers before they leave a voicemail. The recording is saved to their customer profile in the app."
            : "Played before the beep when calls go to voicemail (after-hours or when no forwarding number is set)."
        }
        value={effectiveVoicemailPrompt}
        onChange={setVoicemailPrompt}
        examples={VOICEMAIL_EXAMPLES}
        maxLength={MAX_VOICEMAIL_LENGTH}
        showRecordingNudge={effectiveCallRecording}
        placeholder="You've reached Handy Pioneers. Please leave your name, number, and project details after the beep."
      />

      {/* Toggles */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Call Recording</p>
            <p className="text-xs text-muted-foreground">Record calls and save recordings to the customer profile</p>
          </div>
          <Switch checked={effectiveCallRecording} onCheckedChange={v => setCallRecording(v)} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Transcribe Voicemails</p>
            <p className="text-xs text-muted-foreground">Auto-transcribe voicemail recordings (via Twilio)</p>
          </div>
          <Switch checked={effectiveTranscribeVoicemail} onCheckedChange={v => setTranscribeVoicemail(v)} />
        </div>
      </div>

      {/* After-hours routing */}
      <div className="border border-border rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold text-foreground">After-Hours Voicemail</p>
              <p className="text-xs text-muted-foreground">Route calls to voicemail outside business hours</p>
            </div>
          </div>
          <Switch checked={effectiveAfterHoursEnabled} onCheckedChange={v => setAfterHoursEnabled(v)} />
        </div>

        {effectiveAfterHoursEnabled && (
          <div className="space-y-4 pt-2 border-t border-border">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Business Days</Label>
              <div className="flex gap-1.5 flex-wrap">
                {DAYS.map(({ num, label }) => (
                  <button
                    key={num}
                    onClick={() => toggleDay(num)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors border ${
                      selectedDays.includes(num)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card text-muted-foreground border-border hover:border-primary/50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="hours-start" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Opens</Label>
                <Input id="hours-start" type="time" value={effectiveBusinessHoursStart} onChange={e => setBusinessHoursStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hours-end" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Closes</Label>
                <Input id="hours-end" type="time" value={effectiveBusinessHoursEnd} onChange={e => setBusinessHoursEnd(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Times are in Pacific Time (America/Los_Angeles).</p>
          </div>
        )}
      </div>

      {/* Save button */}
      <Button onClick={handleSave} disabled={updateMutation.isPending} className="w-full sm:w-auto">
        {updateMutation.isPending
          ? <><Loader2 size={14} className="animate-spin mr-2" />Saving…</>
          : <><Save size={14} className="mr-2" />Save Phone Settings</>}
      </Button>

      {/* Test call */}
      <div className="border-t border-border pt-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <TestTube size={14} className="text-muted-foreground" />
            Test Call
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Place a test call from +1 (360) 838-6731 to verify Twilio is working.
          </p>
        </div>
        <div className="flex gap-2">
          <Input placeholder="+18157933243" value={testNumber} onChange={e => setTestNumber(e.target.value)} className="max-w-xs" />
          <Button variant="outline" onClick={() => testCallMutation.mutate({ toNumber: testNumber.trim() })} disabled={!testNumber.trim() || testCallMutation.isPending}>
            {testCallMutation.isPending
              ? <><Loader2 size={14} className="animate-spin mr-2" />Calling…</>
              : <><Phone size={14} className="mr-2" />Call</>}
          </Button>
        </div>
      </div>

      {/* Twilio webhook instructions */}
      <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-4 space-y-2">
        <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">Twilio Console Setup Required</p>
        <p className="text-xs text-muted-foreground">
          Set the Voice webhook on your Twilio number to:
        </p>
        <code className="block text-xs bg-muted rounded px-3 py-2 font-mono break-all">
          https://pro.handypioneers.com/api/twilio/voice/inbound
        </code>
        <p className="text-xs text-muted-foreground">
          Method: <strong>HTTP POST</strong>. Find this in{' '}
          <a href="https://console.twilio.com/us1/develop/phone-numbers/manage/incoming" target="_blank" rel="noopener noreferrer" className="text-primary underline">
            Twilio Console → Phone Numbers → Manage → Active Numbers
          </a>.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          <strong>Important:</strong> Voicemails are always saved to the app — never to your personal cell.
          The fallback route <code className="text-[10px] bg-muted px-1 rounded">/api/twilio/voice/fallback</code> is handled automatically.
        </p>
      </div>
    </div>
  );
}
