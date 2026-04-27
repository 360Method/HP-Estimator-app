/**
 * Twilio Integration
 * - Outbound SMS via REST API
 * - Inbound SMS webhook handler
 * - Voice call log webhook handler
 * - Twilio Voice token generation for in-browser calling
 *
 * Required env vars (set via Settings → Secrets):
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_PHONE_NUMBER   (e.g. +13605550100)
 *   TWILIO_TWIML_APP_SID  (for Voice SDK — create in Twilio console)
 */

import twilio from "twilio";
import { findOrCreateConversation, findOrCreateCustomerFromCall, getCallLogByTwilioSid, incrementUnread, insertCallLog, insertMessage, updateCallLog, updateConversationLastMessage, updateConversation } from "./db";
import { storagePut } from "./storage";
import { runAutomationsForTrigger } from "./automationEngine";

/**
 * Downloads a Twilio recording (requires Basic Auth) and re-uploads it to app S3.
 * Returns the public app S3 URL, or null if download fails.
 */
export async function downloadAndStoreRecording(
  twilioRecordingUrl: string,
  callSid: string,
): Promise<string | null> {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) return null;

    // Twilio recordings require Basic Auth
    const mp3Url = twilioRecordingUrl.endsWith(".mp3") ? twilioRecordingUrl : `${twilioRecordingUrl}.mp3`;
    const response = await fetch(mp3Url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      },
    });
    if (!response.ok) {
      console.warn(`[Recording] Failed to download from Twilio (${response.status}): ${mp3Url}`);
      return null;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const key = `call-recordings/${callSid}-${Date.now()}.mp3`;
    const { url } = await storagePut(key, buffer, "audio/mpeg");
    console.log(`[Recording] Stored to app S3: ${url}`);
    return url;
  } catch (err) {
    console.warn("[Recording] downloadAndStoreRecording failed:", err);
    return null;
  }
}

function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio credentials not configured. Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in Settings → Secrets.");
  return twilio(sid, token);
}

export function isTwilioConfigured() {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
}

// ─── Outbound SMS ─────────────────────────────────────────────────────────────

export async function sendSms(to: string, body: string): Promise<{ sid: string; status: string }> {
  const client = getTwilioClient();
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!from) throw new Error("TWILIO_PHONE_NUMBER not configured");

  const msg = await client.messages.create({ to, from, body });
  return { sid: msg.sid, status: msg.status };
}

// ─── Inbound SMS Webhook ──────────────────────────────────────────────────────
// POST /api/twilio/sms
// Called by Twilio when an SMS arrives at your number.

export async function handleInboundSms(params: {
  From: string;
  To: string;
  Body: string;
  MessageSid: string;
  NumMedia?: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
}) {
  const { From, Body, MessageSid, MediaUrl0, MediaContentType0 } = params;

  // Find or create customer from phone, then link conversation
  const { customer } = await findOrCreateCustomerFromCall(From).catch(() => ({ customer: null }));
  const conv = await findOrCreateConversation(From, null, customer?.displayName ?? null, customer?.id);
  // Backfill customerId if conversation existed but wasn't linked yet
  if (customer && !conv.customerId) {
    await updateConversation(conv.id, { customerId: customer.id, contactName: customer.displayName });
  }

  // Insert inbound message
  const msg = await insertMessage({
    conversationId: conv.id,
    channel: "sms",
    direction: "inbound",
    body: Body || "(media message)",
    status: "delivered",
    twilioSid: MessageSid,
    attachmentUrl: MediaUrl0 ?? undefined,
    attachmentMime: MediaContentType0 ?? undefined,
    isInternal: false,
    sentAt: new Date(),
  });

  await updateConversationLastMessage(conv.id, Body || "(media)", "sms");
  await incrementUnread(conv.id);
  // Fire inbound_sms automation (non-blocking)
  runAutomationsForTrigger('inbound_sms', {
    customerName: customer?.displayName ?? undefined,
    customerFirstName: customer?.displayName?.split(' ')[0],
    phone: From,
    description: Body?.slice(0, 100),
  }).catch(e => console.error('[automation] inbound_sms error:', e));
  console.log(`[Twilio] Inbound SMS from ${From}: ${Body?.slice(0, 50)}`);
  return msg;
}

// ─── Inbound Call Webhook ─────────────────────────────────────────────────────
// POST /api/twilio/voice/status
// Called by Twilio when a call status changes.

export async function handleCallStatusUpdate(params: {
  CallSid: string;
  From: string;
  To: string;
  CallStatus: string;
  CallDuration?: string;
  Direction: string;
  RecordingUrl?: string;
}) {
  const { CallSid, From, To, CallStatus, CallDuration, Direction, RecordingUrl } = params;

  // Only process terminal statuses
  const terminalStatuses = ["completed", "busy", "no-answer", "failed", "canceled"];
  if (!terminalStatuses.includes(CallStatus)) return;

  const callerPhone = Direction === "inbound" ? From : To;
  // Auto-link to customer (or create stub) on every call
  const { customer, wasCreated } = await findOrCreateCustomerFromCall(callerPhone).catch(() => ({ customer: null, wasCreated: false }));
  if (wasCreated && customer) {
    console.log(`[Twilio] Auto-created customer stub for unknown caller ${callerPhone} → ${customer.id}`);
  }
  const conv = await findOrCreateConversation(callerPhone, null, customer?.displayName ?? null, customer?.id);
  // Backfill customerId if conversation existed but wasn't linked
  if (customer && !conv.customerId) {
    await updateConversation(conv.id, { customerId: customer.id, contactName: customer.displayName });
  }

  // Map Twilio status to our status
  const statusMap: Record<string, string> = {
    completed: "answered",
    busy: "busy",
    "no-answer": "missed",
    failed: "missed",
    canceled: "missed",
  };

  const durationSecs = CallDuration ? parseInt(CallDuration, 10) : 0;
  const isMissed = statusMap[CallStatus] === "missed";

  // Insert call log
  const callLog = await insertCallLog({
    conversationId: conv.id,
    twilioCallSid: CallSid,
    direction: Direction === "inbound" ? "inbound" : "outbound",
    status: statusMap[CallStatus] || CallStatus,
    durationSecs,
    recordingUrl: RecordingUrl ?? undefined,
    callerPhone,
    startedAt: new Date(),
    endedAt: new Date(),
  });
  // Async: download recording from Twilio and store in app S3 so it plays inline
  if (RecordingUrl && callLog?.id) {
    downloadAndStoreRecording(RecordingUrl, CallSid)
      .then(appUrl => {
        if (appUrl) updateCallLog(callLog.id, { recordingAppUrl: appUrl }).catch(console.warn);
      })
      .catch(console.warn);
  }

  // Insert a call-type message into the thread
  const preview = isMissed
    ? `Missed call from ${callerPhone}`
    : `${Direction === "inbound" ? "Inbound" : "Outbound"} call — ${durationSecs}s`;

  await insertMessage({
    conversationId: conv.id,
    channel: "call",
    direction: Direction === "inbound" ? "inbound" : "outbound",
    body: preview,
    status: statusMap[CallStatus] || CallStatus,
    twilioSid: CallSid,
    isInternal: false,
    sentAt: new Date(),
  });

  await updateConversationLastMessage(conv.id, preview, "call");
  if (isMissed) {
    await incrementUnread(conv.id);
    // Fire missed_call automation (non-blocking)
    runAutomationsForTrigger('missed_call', {
      customerName: customer?.displayName ?? undefined,
      customerFirstName: customer?.displayName?.split(' ')[0],
      phone: callerPhone,
    }).catch(e => console.error('[automation] missed_call error:', e));

    // Lead routing — notify the Nurturer about the missed inbound call so
    // they can follow up before it goes cold. Creation of an opportunity is
    // left to the Nurturer's discretion after they talk to the caller.
    import('./leadRouting').then(({ createNotification, findDefaultUserForRole }) =>
      findDefaultUserForRole('nurturer').then((userId) =>
        createNotification({
          userId,
          role: 'nurturer',
          eventType: 'missed_call',
          title: `Missed call: ${customer?.displayName ?? callerPhone}`,
          body: `Inbound call was missed. Call back today — leads go cold fast. Conversation thread is in the Inbox.`,
          linkUrl: `/?section=inbox`,
          customerId: customer?.id,
          priority: 'high',
        })
      )
    ).catch((e) => console.error('[leadRouting] missed_call notify failed:', e));

    // Phase 5 trigger: call.missed fans out to Lead Nurturer AI.
    import('./lib/agentRuntime/triggerBus').then(({ emitAgentEvent }) =>
      emitAgentEvent('call.missed', {
        customerId: customer?.id ?? null,
        customerName: customer?.displayName ?? null,
        callerNumber: callerPhone,
        twilioCallSid: CallSid,
        durationSecs,
        direction: Direction || 'inbound',
      }).catch(() => null)
    ).catch(() => null);
  }
  console.log(`[Twilio] Call ${CallSid} ${CallStatus} — ${durationSecs}s`);
}

// ─── Voice Token (for in-browser calling) ────────────────────────────────────

export function generateVoiceToken(identity: string): string {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKey = process.env.TWILIO_API_KEY;
  const apiSecret = process.env.TWILIO_API_SECRET;
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;

  if (!accountSid || !apiKey || !apiSecret || !twimlAppSid) {
    const missing = [
      !accountSid && 'TWILIO_ACCOUNT_SID',
      !apiKey && 'TWILIO_API_KEY',
      !apiSecret && 'TWILIO_API_SECRET',
      !twimlAppSid && 'TWILIO_TWIML_APP_SID',
    ].filter(Boolean).join(', ');
    throw new Error(`Twilio Voice not fully configured. Missing: ${missing}`);
  }

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: twimlAppSid,
    incomingAllow: true,
  });

  // AccessToken must be signed with an API Key (SK...) + API Secret pair.
  // Using Auth Token directly causes error 20101 (AccessTokenInvalid).
  const accessToken = new AccessToken(accountSid, apiKey, apiSecret, {
    identity,
    ttl: 3600, // 1 hour
  });

  accessToken.addGrant(voiceGrant);
  return accessToken.toJwt();
}
