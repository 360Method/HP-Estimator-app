// ============================================================
// PhoneSettings — Inbound call routing configuration
// ============================================================

import { useState } from 'react';
import { Phone, PhoneForwarded, Bot, Voicemail, TestTube, Save, Loader2, Clock } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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

export default function PhoneSettings() {
  const { data: settings, isLoading, refetch } = trpc.phone.getSettings.useQuery();

  const [mode, setMode] = useState<ForwardingMode | null>(null);
  const [forwardingNumber, setForwardingNumber] = useState<string | null>(null);
  const [aiServiceNumber, setAiServiceNumber] = useState<string | null>(null);
  const [greeting, setGreeting] = useState<string | null>(null);
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
  const effectiveCallRecording = callRecording ?? settings?.callRecording ?? false;
  const effectiveTranscribeVoicemail = transcribeVoicemail ?? settings?.transcribeVoicemail ?? true;
  const effectiveAfterHoursEnabled = afterHoursEnabled ?? settings?.afterHoursEnabled ?? false;
  const effectiveBusinessHoursStart = businessHoursStart ?? settings?.businessHoursStart ?? '08:00';
  const effectiveBusinessHoursEnd = businessHoursEnd ?? settings?.businessHoursEnd ?? '17:00';
  const effectiveBusinessDays = businessDays ?? settings?.businessDays ?? '1,2,3,4,5';

  const selectedDays = effectiveBusinessDays.split(',').map(Number).filter(n => !isNaN(n));

  const toggleDay = (dayNum: number) => {
    const current = new Set(selectedDays);
    if (current.has(dayNum)) {
      current.delete(dayNum);
    } else {
      current.add(dayNum);
    }
    setBusinessDays(Array.from(current).sort((a, b) => a - b).join(','));
  };

  const updateMutation = trpc.phone.updateSettings.useMutation({
    onSuccess: () => {
      refetch();
      toast.success('Phone settings saved', { description: 'Inbound call routing updated.' });
    },
    onError: (err) => {
      toast.error('Save failed', { description: err.message });
    },
  });

  const testCallMutation = trpc.phone.testCall.useMutation({
    onSuccess: ({ callSid }) => {
      toast.success('Test call placed', { description: `Call SID: ${callSid}` });
    },
    onError: (err) => {
      toast.error('Test call failed', { description: err.message });
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      forwardingMode: effectiveMode,
      forwardingNumber: effectiveForwardingNumber,
      aiServiceNumber: effectiveAiServiceNumber,
      greeting: effectiveGreeting,
      callRecording: effectiveCallRecording,
      transcribeVoicemail: effectiveTranscribeVoicemail,
      afterHoursEnabled: effectiveAfterHoursEnabled,
      businessHoursStart: effectiveBusinessHoursStart,
      businessHoursEnd: effectiveBusinessHoursEnd,
      businessDays: effectiveBusinessDays,
    });
  };

  const handleTestCall = () => {
    if (!testNumber.trim()) {
      toast.error('Enter a number', { description: 'Provide a phone number to test.' });
      return;
    }
    testCallMutation.mutate({ toNumber: testNumber.trim() });
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
      label: 'Forward to personal cell',
      desc: 'Inbound calls are forwarded to your personal phone number.',
      icon: PhoneForwarded,
    },
    {
      id: 'forward_to_ai',
      label: 'Forward to AI answering service',
      desc: 'Inbound calls are forwarded to an AI answering service number.',
      icon: Bot,
    },
    {
      id: 'voicemail',
      label: 'Voicemail only',
      desc: 'Callers hear a greeting and leave a voicemail. You get notified via SMS.',
      icon: Voicemail,
    },
  ];

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
                effectiveMode === id
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card hover:bg-muted/40'
              }`}
            >
              <div className={`mt-0.5 p-1.5 rounded-md ${effectiveMode === id ? 'bg-primary/15' : 'bg-muted'}`}>
                <Icon size={14} className={effectiveMode === id ? 'text-primary' : 'text-muted-foreground'} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${effectiveMode === id ? 'text-primary' : 'text-foreground'}`}>
                  {label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
              <div className={`mt-1 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                effectiveMode === id ? 'border-primary' : 'border-muted-foreground/40'
              }`}>
                {effectiveMode === id && <div className="w-2 h-2 rounded-full bg-primary" />}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Forwarding number */}
      {effectiveMode === 'forward_to_number' && (
        <div className="space-y-2">
          <Label htmlFor="forwarding-number">Forwarding Number</Label>
          <Input
            id="forwarding-number"
            placeholder="+18157933243"
            value={effectiveForwardingNumber}
            onChange={e => setForwardingNumber(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">E.164 format (e.g. +18157933243)</p>
        </div>
      )}

      {/* AI service number */}
      {effectiveMode === 'forward_to_ai' && (
        <div className="space-y-2">
          <Label htmlFor="ai-number">AI Service Number</Label>
          <Input
            id="ai-number"
            placeholder="+1..."
            value={effectiveAiServiceNumber}
            onChange={e => setAiServiceNumber(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Phone number of your AI answering service</p>
        </div>
      )}

      {/* Greeting */}
      <div className="space-y-2">
        <Label htmlFor="greeting">Custom Greeting (optional)</Label>
        <Input
          id="greeting"
          placeholder="Thank you for calling Handy Pioneers…"
          value={effectiveGreeting}
          onChange={e => setGreeting(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Played before routing. Leave blank for no greeting (voicemail mode uses a default message).
        </p>
      </div>

      {/* Toggles */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Call Recording</p>
            <p className="text-xs text-muted-foreground">Record forwarded calls (stored in Twilio)</p>
          </div>
          <Switch
            checked={effectiveCallRecording}
            onCheckedChange={v => setCallRecording(v)}
          />
        </div>
        {effectiveMode === 'voicemail' && (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Transcribe Voicemails</p>
              <p className="text-xs text-muted-foreground">Auto-transcribe voicemails (Twilio Transcription)</p>
            </div>
            <Switch
              checked={effectiveTranscribeVoicemail}
              onCheckedChange={v => setTranscribeVoicemail(v)}
            />
          </div>
        )}
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
          <Switch
            checked={effectiveAfterHoursEnabled}
            onCheckedChange={v => setAfterHoursEnabled(v)}
          />
        </div>

        {effectiveAfterHoursEnabled && (
          <div className="space-y-4 pt-2 border-t border-border">
            {/* Business days */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Business Days</Label>
              <div className="flex gap-1.5 flex-wrap">
                {DAYS.map(({ num, label }) => (
                  <button
                    key={num}
                    type="button"
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

            {/* Business hours */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="hours-start" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Opens</Label>
                <Input
                  id="hours-start"
                  type="time"
                  value={effectiveBusinessHoursStart}
                  onChange={e => setBusinessHoursStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hours-end" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Closes</Label>
                <Input
                  id="hours-end"
                  type="time"
                  value={effectiveBusinessHoursEnd}
                  onChange={e => setBusinessHoursEnd(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Times are in Pacific Time (America/Los_Angeles).</p>
          </div>
        )}
      </div>

      {/* Save button */}
      <Button
        onClick={handleSave}
        disabled={updateMutation.isPending}
        className="w-full sm:w-auto"
      >
        {updateMutation.isPending ? (
          <><Loader2 size={14} className="animate-spin mr-2" />Saving…</>
        ) : (
          <><Save size={14} className="mr-2" />Save Phone Settings</>
        )}
      </Button>

      {/* Divider */}
      <div className="border-t border-border pt-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <TestTube size={14} className="text-muted-foreground" />
            Test Call
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Place a test call from +1 (360) 838-6731 to any number to verify Twilio is working.
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="+18157933243"
            value={testNumber}
            onChange={e => setTestNumber(e.target.value)}
            className="max-w-xs"
          />
          <Button
            variant="outline"
            onClick={handleTestCall}
            disabled={testCallMutation.isPending}
          >
            {testCallMutation.isPending ? (
              <><Loader2 size={14} className="animate-spin mr-2" />Calling…</>
            ) : (
              <><Phone size={14} className="mr-2" />Call</>
            )}
          </Button>
        </div>
      </div>

      {/* Twilio webhook instructions */}
      <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-4 space-y-2">
        <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">Twilio Console Setup Required</p>
        <p className="text-xs text-muted-foreground">
          For inbound calls to route correctly, set the Voice webhook on your Twilio number to:
        </p>
        <code className="block text-xs bg-muted rounded px-3 py-2 font-mono break-all">
          https://pro.handypioneers.com/api/twilio/voice/inbound
        </code>
        <p className="text-xs text-muted-foreground">
          Method: <strong>HTTP POST</strong>. Find this in{' '}
          <a
            href="https://console.twilio.com/us1/develop/phone-numbers/manage/incoming"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            Twilio Console → Phone Numbers → Manage → Active Numbers
          </a>
          .
        </p>
      </div>
    </div>
  );
}
