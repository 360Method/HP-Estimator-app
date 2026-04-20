/**
 * phone.ts — Phone settings DB helpers + inbound call routing logic
 *
 * TWO-STAGE INBOUND ROUTING
 * ─────────────────────────
 * Business hours:
 *   1. Speak greeting (if set)
 *   2. Dial personal cell with timeout=10s (~2 rings), no voicemail pickup
 *      - <Dial action=/api/twilio/voice/fallback> — if unanswered/busy/failed
 *        the fallback route continues to stage 2
 *   3. Stage 2 (fallback): route to AI service or system voicemail
 *
 * After hours (afterHoursEnabled=true):
 *   Skip cell entirely → go straight to AI service or system voicemail
 *
 * Key invariant: voicemail NEVER goes to personal cell.
 * All recordings are saved in the app (callLogs table).
 *
 * Prompts:
 *   greeting        — played before dialing cell (business hours only)
 *   voicemailPrompt — played before the voicemail beep in system voicemail
 */
import twilio from "twilio";
import { getDb } from "./db";
import { phoneSettings } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { ENV } from "./_core/env";

// ─── Default prompts ──────────────────────────────────────────────────────────

const DEFAULT_VOICEMAIL_PROMPT =
  "You've reached Handy Pioneers. We're unavailable right now. Please leave your name, number, and a brief description of your project after the beep and we'll call you back shortly.";

const DEFAULT_AFTER_HOURS_PROMPT =
  "You've reached Handy Pioneers. Our office is currently closed. Please leave your name, number, and a brief description of your project after the beep and we'll call you back during business hours.";

// ─── DB helpers ──────────────────────────────────────────────────────────────

export async function getPhoneSettings() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(phoneSettings).where(eq(phoneSettings.id, 1)).limit(1);
  if (rows.length > 0) return rows[0];
  // Seed default row on first access
  const defaultSettings = {
    id: 1,
    forwardingMode: "forward_to_number" as const,
    forwardingNumber: ENV.ownerPhone || "",
    aiServiceNumber: "",
    greeting: "",
    voicemailPrompt: "",
    callRecording: false,
    transcribeVoicemail: true,
    afterHoursEnabled: false,
    businessHoursStart: "08:00",
    businessHoursEnd: "17:00",
    businessDays: "1,2,3,4,5",
  };
  await db.insert(phoneSettings).values(defaultSettings).onConflictDoUpdate({
    target: phoneSettings.id,
    set: { updatedAt: new Date() },
  });
  const fresh = await db.select().from(phoneSettings).where(eq(phoneSettings.id, 1)).limit(1);
  return fresh[0];
}

export async function updatePhoneSettings(
  patch: Partial<Omit<typeof phoneSettings.$inferInsert, "id" | "updatedAt">>
) {
  await getPhoneSettings();
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(phoneSettings).set(patch).where(eq(phoneSettings.id, 1));
  return getPhoneSettings();
}

// ─── Business hours helper ────────────────────────────────────────────────────

/**
 * Returns true if the current time in America/Los_Angeles is within business hours.
 * businessHoursStart / businessHoursEnd are "HH:MM" strings in 24h format.
 * businessDays is a comma-separated list of weekday numbers (0=Sun, 6=Sat).
 */
export function isBusinessHours(
  businessHoursStart: string | null | undefined,
  businessHoursEnd: string | null | undefined,
  businessDays: string | null | undefined,
): boolean {
  const tz = "America/Los_Angeles";
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const weekdayStr = parts.find(p => p.type === "weekday")?.value ?? "";
  const hourStr = parts.find(p => p.type === "hour")?.value ?? "0";
  const minuteStr = parts.find(p => p.type === "minute")?.value ?? "0";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayNum = weekdayMap[weekdayStr] ?? -1;
  const allowedDays = (businessDays || "1,2,3,4,5").split(",").map(Number);
  if (!allowedDays.includes(dayNum)) return false;
  const currentMinutes = parseInt(hourStr, 10) * 60 + parseInt(minuteStr, 10);
  const [startH, startM] = (businessHoursStart || "08:00").split(":").map(Number);
  const [endH, endM] = (businessHoursEnd || "17:00").split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

// ─── Stage-2 TwiML (AI service or system voicemail) ──────────────────────────

/**
 * Build TwiML for stage 2 of the call flow.
 * Called by /api/twilio/voice/fallback when the cell didn't answer,
 * AND directly for after-hours calls.
 *
 * Priority:
 *   1. If aiServiceNumber is set → forward to AI
 *   2. Otherwise → system voicemail (Record in app)
 */
export function buildFallbackTwiml(
  settings: Awaited<ReturnType<typeof getPhoneSettings>>,
  callbackBaseUrl: string,
  isAfterHours = false,
): string {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();
  const { aiServiceNumber, voicemailPrompt, callRecording, transcribeVoicemail } = settings;

  if (aiServiceNumber && aiServiceNumber.trim()) {
    // Route to AI answering service
    const dial = twiml.dial({
      callerId: ENV.twilioPhoneNumber || "",
      record: callRecording ? "record-from-answer" : "do-not-record",
      action: `${callbackBaseUrl}/api/twilio/voice/status`,
    });
    dial.number(aiServiceNumber.trim());
  } else {
    // System voicemail — recorded and saved in app, never to personal cell
    const fallback = isAfterHours ? DEFAULT_AFTER_HOURS_PROMPT : DEFAULT_VOICEMAIL_PROMPT;
    const promptText = (voicemailPrompt && voicemailPrompt.trim()) ? voicemailPrompt.trim() : fallback;
    twiml.say({ voice: "Polly.Joanna" }, promptText);
    twiml.record({
      maxLength: 120,
      transcribe: transcribeVoicemail,
      transcribeCallback: `${callbackBaseUrl}/api/twilio/voice/voicemail`,
      action: `${callbackBaseUrl}/api/twilio/voice/voicemail`,
      playBeep: true,
    });
    twiml.say({ voice: "Polly.Joanna" }, "Thank you. Goodbye.");
  }

  return twiml.toString();
}

// ─── Stage-1 TwiML (inbound entry point) ─────────────────────────────────────

/**
 * Build TwiML for an inbound call.
 *
 * Business hours + forward_to_number configured:
 *   1. Speak greeting (if set)
 *   2. Dial cell with timeout=10s, action=/fallback
 *      → if unanswered/busy/failed, Twilio POSTs to /fallback which runs stage 2
 *
 * Business hours + no forwardingNumber (or forward_to_ai mode):
 *   → Skip cell, go straight to stage 2 (AI or voicemail)
 *
 * After hours:
 *   → Skip cell entirely, go straight to stage 2
 */
export async function buildInboundCallTwiml(callbackBaseUrl: string): Promise<string> {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const settings = await getPhoneSettings();
  const {
    forwardingMode,
    forwardingNumber,
    greeting,
    callRecording,
    afterHoursEnabled,
    businessHoursStart,
    businessHoursEnd,
    businessDays,
  } = settings;

  // Determine if we're within business hours
  const withinHours = afterHoursEnabled
    ? isBusinessHours(businessHoursStart, businessHoursEnd, businessDays)
    : true;

  const shouldRingCell =
    withinHours &&
    forwardingMode === "forward_to_number" &&
    forwardingNumber &&
    forwardingNumber.trim();

  if (shouldRingCell) {
    // Stage 1: speak greeting, then ring cell for ~2 rings (10s)
    // The <Dial> action attribute ensures Twilio POSTs to /fallback
    // when the call is not answered — personal cell voicemail is bypassed
    // because timeout fires before most carrier voicemail picks up (usually 20-25s).
    if (greeting && greeting.trim()) {
      twiml.say({ voice: "Polly.Joanna" }, greeting.trim());
    }
    const dial = twiml.dial({
      callerId: ENV.twilioPhoneNumber || "",
      timeout: 10, // ~2 rings; fires before carrier voicemail
      record: callRecording ? "record-from-answer" : "do-not-record",
      // When dial completes (answered, no-answer, busy, failed) Twilio POSTs here
      action: `${callbackBaseUrl}/api/twilio/voice/fallback`,
      method: "POST",
    });
    dial.number(forwardingNumber!.trim());
  } else {
    // After hours or AI mode or no cell configured → go straight to stage 2
    const fallbackXml = buildFallbackTwiml(settings, callbackBaseUrl, !withinHours);
    // Parse the fallback TwiML and append its verbs directly
    // (We return the fallback TwiML directly since we're already building a response)
    return fallbackXml;
  }

  return twiml.toString();
}

// ─── Test call helper ─────────────────────────────────────────────────────────

export async function placeTestCall(toNumber: string, callbackBaseUrl: string): Promise<string> {
  if (!ENV.twilioAccountSid || !ENV.twilioAuthToken || !ENV.twilioPhoneNumber) {
    throw new Error("Twilio credentials not configured");
  }
  const client = twilio(ENV.twilioAccountSid, ENV.twilioAuthToken);
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();
  twiml.say(
    { voice: "Polly.Joanna" },
    "This is a test call from Handy Pioneers Field Estimator. Your phone routing is working correctly. Goodbye."
  );

  const call = await client.calls.create({
    to: toNumber,
    from: ENV.twilioPhoneNumber,
    twiml: twiml.toString(),
    statusCallback: `${callbackBaseUrl}/api/twilio/voice/status`,
  });
  return call.sid;
}
