/**
 * phone.ts — Phone settings DB helpers + inbound call routing logic
 *
 * Two separate prompts:
 *   greeting        — played before routing (forwarding modes only)
 *   voicemailPrompt — played before the voicemail beep (voicemail mode + after-hours)
 *
 * Inbound routing modes:
 *   forward_to_number — dial forwardingNumber (owner's personal cell)
 *   forward_to_ai     — dial aiServiceNumber (AI answering service)
 *   voicemail         — play voicemailPrompt, record, notify owner
 *
 * After-hours routing:
 *   When afterHoursEnabled=true, calls outside businessHours are routed to
 *   voicemail regardless of the forwardingMode setting.
 */
import twilio from "twilio";
import { getDb } from "./db";
import { phoneSettings } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { ENV } from "./_core/env";

// ─── Default voicemail prompts ────────────────────────────────────────────────

const DEFAULT_VOICEMAIL_PROMPT =
  "You've reached Handy Pioneers. We're unavailable right now. Please leave your name, number, and a brief description of your project after the beep and we'll call you back shortly.";

const DEFAULT_AFTER_HOURS_PROMPT =
  "You've reached Handy Pioneers. Our office is currently closed. Please leave your name, number, and a brief description of your project after the beep and we'll call you back during business hours.";

// ─── DB helpers ──────────────────────────────────────────────────────────────

export async function getPhoneSettings() {
  const db = await getDb();
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
  await db.insert(phoneSettings).values(defaultSettings).onDuplicateKeyUpdate({
    set: { updatedAt: new Date() },
  });
  const fresh = await db.select().from(phoneSettings).where(eq(phoneSettings.id, 1)).limit(1);
  return fresh[0];
}

export async function updatePhoneSettings(
  patch: Partial<Omit<typeof phoneSettings.$inferInsert, "id" | "updatedAt">>
) {
  // Ensure row exists first
  await getPhoneSettings();
  const db = await getDb();
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

// ─── TwiML builder ───────────────────────────────────────────────────────────

/**
 * Build TwiML for an inbound call based on current phoneSettings.
 * Returns the TwiML XML string.
 *
 * Flow:
 *   1. If greeting is set, speak it (forwarding modes only — before <Dial>)
 *   2. Route based on effectiveMode:
 *      - forward_to_number / forward_to_ai → <Dial>
 *      - voicemail (or after-hours fallback) → speak voicemailPrompt, then <Record>
 */
export async function buildInboundCallTwiml(callbackBaseUrl: string): Promise<string> {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const settings = await getPhoneSettings();
  const {
    forwardingMode,
    forwardingNumber,
    aiServiceNumber,
    greeting,
    voicemailPrompt,
    callRecording,
    transcribeVoicemail,
    afterHoursEnabled,
    businessHoursStart,
    businessHoursEnd,
    businessDays,
  } = settings;

  // Determine effective routing mode — after-hours overrides to voicemail
  const withinHours = afterHoursEnabled
    ? isBusinessHours(businessHoursStart, businessHoursEnd, businessDays)
    : true;
  const effectiveMode = withinHours ? forwardingMode : "voicemail";

  if (effectiveMode === "forward_to_number" && forwardingNumber) {
    // Play greeting before connecting (forwarding modes only)
    if (greeting && greeting.trim()) {
      twiml.say({ voice: "Polly.Joanna" }, greeting.trim());
    }
    const dial = twiml.dial({
      callerId: ENV.twilioPhoneNumber || "",
      record: callRecording ? "record-from-answer" : "do-not-record",
      action: `${callbackBaseUrl}/api/twilio/voice/status`,
    });
    dial.number(forwardingNumber);
  } else if (effectiveMode === "forward_to_ai" && aiServiceNumber) {
    // Play greeting before connecting (forwarding modes only)
    if (greeting && greeting.trim()) {
      twiml.say({ voice: "Polly.Joanna" }, greeting.trim());
    }
    const dial = twiml.dial({
      callerId: ENV.twilioPhoneNumber || "",
      record: callRecording ? "record-from-answer" : "do-not-record",
      action: `${callbackBaseUrl}/api/twilio/voice/status`,
    });
    dial.number(aiServiceNumber);
  } else {
    // Voicemail mode (or fallback when no number configured, or after-hours)
    // Use voicemailPrompt if set; otherwise fall back to context-aware default
    const fallbackPrompt = !withinHours ? DEFAULT_AFTER_HOURS_PROMPT : DEFAULT_VOICEMAIL_PROMPT;
    const promptText = (voicemailPrompt && voicemailPrompt.trim()) ? voicemailPrompt.trim() : fallbackPrompt;
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

// ─── Test call helper ─────────────────────────────────────────────────────────

/**
 * Place a test call to the given number using Twilio REST API.
 * The call will say a short message and hang up.
 */
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
