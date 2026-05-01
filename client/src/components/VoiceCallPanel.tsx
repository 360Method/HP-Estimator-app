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
  Loader2, AlertTriangle, RefreshCw, Grid3x3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const DIAL_PAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'] as const;

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
  const [duration, setDuration] = useState(0);
  const [incomingCall, setIncomingCall] = useState<Call | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [deviceReady, setDeviceReady] = useState(false);
  const [lastErrorCode, setLastErrorCode] = useState<number | null>(null);
  const [showDialPad, setShowDialPad] = useState(false);
  const deviceRef = useRef<Device | null>(null);
  const activeCallRef = useRef<Call | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const { data: twilioStatus } = trpc.inbox.twilio.status.useQuery(undefined, { staleTime: 30_000 });

  // Voice tokens expire after 1hr — refetch every 50min to keep the device registered.
  const { data: tokenData, isError: tokenError, refetch: refetchToken } = trpc.inbox.twilio.voiceToken.useQuery(undefined, {
    enabled: twilioStatus?.voiceConfigured === true,
    retry: false,
    staleTime: 50 * 60 * 1000,
    refetchInterval: 50 * 60 * 1000,
    refetchIntervalInBackground: true,
  });

  // ── Initialize Twilio Device ──────────────────────────────────────────────
  useEffect(() => {
    if (!tokenData?.token) return;

    // If the device already exists (token refresh while running), swap the
    // token in place so an active call survives — destroying the device would
    // hang up mid-call.
    if (deviceRef.current) {
      try {
        deviceRef.current.updateToken(tokenData.token);
        console.log('[Voice] Token refreshed in place');
        return;
      } catch (err) {
        console.warn('[Voice] updateToken failed, recreating device:', err);
        try { deviceRef.current.destroy(); } catch { /* ignore */ }
        deviceRef.current = null;
        setDeviceReady(false);
      }
    }

    setDeviceError(null);
    setDeviceReady(false);
    let device: Device;
    try {
      device = new Device(tokenData.token, {
        logLevel: 1,
        codecPreferences: ['opus', 'pcmu'] as any,
        // Edge selection: 'roaming' relies on a separate HTTP discovery call
        // to find the closest edge. If that call is blocked / slow / DNS
        // fails, the SDK logs "Preferred URI not set; backing off" and the
        // WebSocket times out. We hardcode an explicit list ordered by
        // expected proximity to the PNW (umatilla=us-west-or, ashburn=us-east-va,
        // sao-paulo + others as fallbacks) — the SDK tries them in order.
        edge: ['umatilla', 'ashburn', 'roaming'] as any,
      });
    } catch (err: any) {
      console.error('[Voice] Device constructor threw:', err);
      setDeviceError(`Voice init failed: ${err?.message ?? String(err)}`);
      return;
    }

    device.on('registered', () => {
      console.log('[Voice] Device registered — ready to call');
      setDeviceError(null);
      setDeviceReady(true);
    });

    device.on('unregistered', () => {
      console.log('[Voice] Device unregistered');
      setDeviceReady(false);
    });

    device.on('incoming', (call: Call) => {
      setIncomingCall(call);
      setCallState('incoming');
      toast.info(`Incoming call from ${call.parameters.From || 'Unknown'}`, {
        duration: 30000,
        action: { label: 'Answer', onClick: () => answerCall(call) },
      });
    });

    device.on('error', (err: any) => {
      // err may be a TwilioError object (with .code) or a plain Error
      const code = err?.code ?? err?.twilioError?.code ?? 0;
      const msg = err?.message ?? err?.twilioError?.message ?? String(err);
      console.error(`[Voice] Device error (code ${code}):`, err);
      setLastErrorCode(code || -1);

      if (code === 31202 || code === 20101) {
        // JWT signature validation failed — token stale or API key mismatch.
        setDeviceError('Voice token invalid. Click to retry.');
      } else if (code === 31204 || code === 20104) {
        // Token expired
        setDeviceError('Voice token expired. Click to retry.');
      } else if (code === 53000) {
        // Generic signaling error — usually transient
        setDeviceError('Signaling error. Click to retry.');
      } else if (code === 31005) {
        // WebSocket connection error
        setDeviceError('Voice connection blocked (firewall?). Click to retry.');
      } else {
        setDeviceError(msg ? `${msg} (code ${code})` : 'Voice error. Click to retry.');
      }
      setDeviceReady(false);
      setCallState('idle');
    });

    deviceRef.current = device;
    // register() is async — readiness is tracked via the 'registered' event
    // above. We deliberately set the ref BEFORE register() so the cleanup can
    // always destroy whatever was created.
    device.register().catch((err) => {
      console.error('[Voice] Device.register() rejected:', err);
      setDeviceError(`Voice register failed: ${err?.message ?? String(err)}`);
    });

    return () => {
      try { device.destroy(); } catch { /* ignore */ }
      if (deviceRef.current === device) {
        deviceRef.current = null;
        setDeviceReady(false);
      }
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
    if (onCallEnd) onCallEnd(duration);
    setDuration(0);
  }, [duration, onCallEnd]);

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
      toast.error('Voice device not initialized — refresh the page.');
      console.error('[Voice] makeCall: deviceRef.current is null', { tokenData, deviceError });
      return;
    }
    if (!deviceReady) {
      toast.error('Voice device still connecting — try again in a few seconds.');
      console.warn('[Voice] makeCall: device not yet registered');
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
      console.error('[Voice] connect() threw:', err);
      toast.error(`Failed to connect: ${err?.message ?? String(err)}`);
      setCallState('idle');
    }
  }, [wireCallEvents, deviceReady, tokenData, deviceError]);

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

  // ── DTMF (touch-tone digits during an active call) ───────────────────────
  const sendDigit = useCallback((digit: string) => {
    if (!activeCallRef.current || callState !== 'active') return;
    activeCallRef.current.sendDigits(digit);
  }, [callState]);

  const fmtDuration = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ── Not configured ────────────────────────────────────────────────────────
  if (twilioStatus && !twilioStatus.voiceConfigured) {
    const missing = twilioStatus.missingVoice?.join(', ') || 'voice configuration';
    return (
      <div className="flex items-center gap-2 text-xs text-amber-700" title={`Missing: ${missing}`}>
        <AlertTriangle className="w-3.5 h-3.5" />
        <span>Voice setup incomplete</span>
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Phone className="w-3.5 h-3.5" />
        <span>Voice calling requires Twilio setup</span>
      </div>
    );
  }

  // ── Device error — show retry button ─────────────────────────────────────
  if (deviceError) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setDeviceError(null);
          // Destroy old device before refetching token
          deviceRef.current?.destroy();
          deviceRef.current = null;
          refetchToken();
        }}
        className="gap-2 text-amber-600 border-amber-200 hover:bg-amber-50 text-xs"
        title={deviceError}
      >
        <AlertTriangle className="w-3.5 h-3.5" />
        <RefreshCw className="w-3.5 h-3.5" />
        Retry Voice
      </Button>
    );
  }

  // ── Idle state — show call button ─────────────────────────────────────────
  if (callState === 'idle' && toNumber) {
    const initializing = !tokenData || !deviceReady;
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => makeCall(toNumber)}
        className="gap-2 text-emerald-600 border-emerald-200 hover:bg-emerald-50 disabled:opacity-60"
        disabled={initializing}
        title={initializing ? 'Connecting to voice service…' : `Call ${toName || toNumber}`}
      >
        {initializing ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Phone className="w-3.5 h-3.5" />
        )}
        {initializing ? 'Connecting…' : `Call ${toName || toNumber}`}
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
      <div className="flex flex-col gap-2">
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
            {(callState === 'connecting' || callState === 'ringing') && (
              <span className="text-[10px] font-mono text-emerald-700/70 ml-1">
                [device:{deviceRef.current?.state ?? 'null'}
                {lastErrorCode != null ? ` err:${lastErrorCode}` : ''}]
              </span>
            )}
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
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowDialPad(v => !v)}
                className={`p-1.5 ${showDialPad ? 'text-emerald-900 bg-emerald-100' : 'text-emerald-700'}`}
                title="Dial pad (DTMF)"
              >
                <Grid3x3 className="w-4 h-4" />
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

        {callState === 'active' && showDialPad && (
          <div className="grid grid-cols-3 gap-1.5 bg-white border border-emerald-200 rounded-xl p-3 max-w-[220px]">
            {DIAL_PAD_KEYS.map(k => (
              <button
                key={k}
                type="button"
                onClick={() => sendDigit(k)}
                className="h-10 rounded-lg border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100 active:bg-emerald-200 text-base font-semibold text-emerald-900 transition-colors"
                aria-label={`Dial ${k}`}
              >
                {k}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}
