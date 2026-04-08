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
import { findOrCreateConversation, incrementUnread, insertCallLog, insertMessage, updateConversationLastMessage } from "./db";

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

  // Find or create conversation for this phone number
  const conv = await findOrCreateConversation(From, null, null);

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
  const conv = await findOrCreateConversation(callerPhone, null, null);

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
  await insertCallLog({
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
  if (isMissed) await incrementUnread(conv.id);

  console.log(`[Twilio] Call ${CallSid} ${CallStatus} — ${durationSecs}s`);
}

// ─── Voice Token (for in-browser calling) ────────────────────────────────────

export function generateVoiceToken(identity: string): string {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;

  if (!sid || !token || !twimlAppSid) {
    throw new Error("Twilio Voice not fully configured. Add TWILIO_TWIML_APP_SID in Settings → Secrets.");
  }

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: twimlAppSid,
    incomingAllow: true,
  });

  const accessToken = new AccessToken(sid, token, process.env.TWILIO_API_KEY || token, {
    identity,
    ttl: 3600, // 1 hour
  });

  accessToken.addGrant(voiceGrant);
  return accessToken.toJwt();
}
