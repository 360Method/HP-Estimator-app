/**
 * VoiceCallPanel
 * In-browser calling via Twilio Voice SDK.
 * Shows a floating call widget when a call is active.
 * Requires TWILIO_TWIML_APP_SID to be configured.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Device, Call } from '@twilio/voice-sdk';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';
import {
  Phone, PhoneOff, PhoneIncoming, Mic, MicOff,
  Volume2, VolumeX, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

type CallState = 'idle' | 'connecting' | 'ringing' | 'active' | 'incoming';

interface VoiceCallPanelProps {
  /** Phone number to call (E.164 format, e.g. +13605550100) */
  toNumber?: string;
  /** Display name for the call */
  toName?: string;
  /** Called when the call ends */
  onCallEnd?: (durationSecs: number) => void;
}

export default function VoiceCallPanel({ toNumber, toName, onCallEnd }: VoiceCallPanelProps) {
  const [callState, setCallState] = useState<CallState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);
  const [duration, setDuration] = useState(0);
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const activeCallRef = useRef<Call | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const { data: tokenData, isError: tokenError } = trpc.inbox.twilio.voiceToken.useQuery(undefined, {
    retry: false,
    staleTime: 50 * 60 * 1000, // 50 min (token valid 1hr)
  });

  // ── Initialize Twilio Device ──────────────────────────────────────────────
  useEffect(() => {
    if (!tokenData?.token) return;

    const device = new Device(tokenData.token, {
      logLevel: 1,
      codecPreferences: ['opus', 'pcmu'] as any,
    });

    device.on('registered', () => {
      console.log('[Voice] Device registered');
    });

    device.on('incoming', (call: Call) => {
      setIncomingCall(call);
      setCallState('incoming');
      toast.info(`Incoming call from ${call.parameters.From || 'Unknown'}`, {
        duration: 30000,
        action: { label: 'Answer', onClick: () => answerCall(call) },
      });
    });

    device.on('error', (err) => {
      console.error('[Voice] Device error:', err);
      toast.error(`Call error: ${err.message}`);
      setCallState('idle');
    });

    device.register();
    deviceRef.current = device;

    return () => {
      device.destroy();
      deviceRef.current = null;
    };
  }, [tokenData?.token]);

  // ── Timer ─────────────────────────────────────────────────────────────────
  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const secs = Math.floor((Date.now() - startTimeRef.current) / 1000);
    onCallEnd?.(secs);
    setDuration(0);
  }, [onCallEnd]);

  // ── Call setup helpers ────────────────────────────────────────────────────
  const wireCallEvents = useCallback((call: Call) => {
    call.on('accept', () => {
      setCallState('active');
      startTimer();
    });
    call.on('disconnect', () => {
      setCallState('idle');
      activeCallRef.current = null;
      stopTimer();
    });
    call.on('cancel', () => {
      setCallState('idle');
      activeCallRef.current = null;
      stopTimer();
    });
    call.on('reject', () => {
      setCallState('idle');
      activeCallRef.current = null;
      stopTimer();
    });
  }, [startTimer, stopTimer]);

  // ── Make call ────────────────────────────────────────────────────────────
  const makeCall = useCallback(async (number: string) => {
    if (!deviceRef.current) {
      toast.error('Voice device not ready. Check Twilio configuration.');
      return;
    }
    setCallState('connecting');
    try {
      const call = await deviceRef.current.connect({
        params: { To: number },
      });
      activeCallRef.current = call;
      wireCallEvents(call);
      setCallState('ringing');
    } catch (err: any) {
      toast.error(`Failed to connect: ${err.message}`);
      setCallState('idle');
    }
  }, [wireCallEvents]);

  // ── Answer incoming call ──────────────────────────────────────────────────
  const answerCall = useCallback((call: Call) => {
    call.accept();
    activeCallRef.current = call;
    wireCallEvents(call);
    setIncomingCall(null);
    setCallState('active');
    startTimer();
  }, [wireCallEvents, startTimer]);

  // ── Hang up ───────────────────────────────────────────────────────────────
  const hangUp = useCallback(() => {
    activeCallRef.current?.disconnect();
    incomingCall?.reject();
    setIncomingCall(null);
    setCallState('idle');
    stopTimer();
  }, [incomingCall, stopTimer]);

  // ── Mute / Speaker ────────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    if (!activeCallRef.current) return;
    const newMuted = !isMuted;
    activeCallRef.current.mute(newMuted);
    setIsMuted(newMuted);
  }, [isMuted]);

  const fmtDuration = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ── Not configured ────────────────────────────────────────────────────────
  if (tokenError) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Phone className="w-3.5 h-3.5" />
        <span>Voice calling requires Twilio setup</span>
      </div>
    );
  }

  // ── Idle state — show call button ─────────────────────────────────────────
  if (callState === 'idle' && toNumber) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => makeCall(toNumber)}
        className="gap-2 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
        disabled={!tokenData}
      >
        {!tokenData ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Phone className="w-3.5 h-3.5" />
        )}
        Call {toName || toNumber}
      </Button>
    );
  }

  // ── Incoming call ─────────────────────────────────────────────────────────
  if (callState === 'incoming' && incomingCall) {
    return (
      <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 animate-pulse">
        <PhoneIncoming className="w-4 h-4 text-emerald-600" />
        <span className="text-sm font-medium text-emerald-800">
          Incoming: {incomingCall.parameters.From || 'Unknown'}
        </span>
        <Button size="sm" onClick={() => answerCall(incomingCall)} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5">
          <Phone className="w-3.5 h-3.5" /> Answer
        </Button>
        <Button size="sm" variant="outline" onClick={hangUp} className="text-destructive border-destructive/30 gap-1.5">
          <PhoneOff className="w-3.5 h-3.5" /> Decline
        </Button>
      </div>
    );
  }

  // ── Active / connecting / ringing ─────────────────────────────────────────
  if (callState !== 'idle') {
    return (
      <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
        <div className="flex items-center gap-2">
          {callState === 'connecting' || callState === 'ringing' ? (
            <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
          ) : (
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          )}
          <span className="text-sm font-medium text-emerald-800">
            {callState === 'connecting' ? 'Connecting...' :
             callState === 'ringing' ? 'Ringing...' :
             fmtDuration(duration)}
          </span>
        </div>

        {callState === 'active' && (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={toggleMute}
              className={`p-1.5 ${isMuted ? 'text-destructive' : 'text-emerald-700'}`}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </Button>
          </>
        )}

        <Button
          size="sm"
          onClick={hangUp}
          className="bg-destructive hover:bg-destructive/90 text-white gap-1.5"
        >
          <PhoneOff className="w-3.5 h-3.5" />
          {callState === 'active' ? 'End' : 'Cancel'}
        </Button>
      </div>
    );
  }

  return null;
}
