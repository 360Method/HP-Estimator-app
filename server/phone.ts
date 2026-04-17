/**
 * phone.ts — Phone settings DB helpers + inbound call routing logic
 *
 * Inbound routing modes:
 *   forward_to_number — dial forwardingNumber (owner's personal cell)
 *   forward_to_ai     — dial aiServiceNumber (AI answering service)
 *   voicemail         — record voicemail, notify owner
 */
import twilio from "twilio";
import { getDb } from "./db";
import { phoneSettings } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { ENV } from "./_core/env";

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
    callRecording: false,
    transcribeVoicemail: true,
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

// ─── TwiML builder ───────────────────────────────────────────────────────────

/**
 * Build TwiML for an inbound call based on current phoneSettings.
 * Returns the TwiML XML string.
 */
export async function buildInboundCallTwiml(callbackBaseUrl: string): Promise<string> {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();

  const settings = await getPhoneSettings();
  const { forwardingMode, forwardingNumber, aiServiceNumber, greeting, callRecording, transcribeVoicemail } = settings;

  // Optional greeting before routing
  if (greeting && greeting.trim()) {
    twiml.say({ voice: "Polly.Joanna" }, greeting.trim());
  }

  if (forwardingMode === "forward_to_number" && forwardingNumber) {
    const dial = twiml.dial({
      callerId: ENV.twilioPhoneNumber || "",
      record: callRecording ? "record-from-answer" : "do-not-record",
      action: `${callbackBaseUrl}/api/twilio/voice/status`,
    });
    dial.number(forwardingNumber);
  } else if (forwardingMode === "forward_to_ai" && aiServiceNumber) {
    const dial = twiml.dial({
      callerId: ENV.twilioPhoneNumber || "",
      record: callRecording ? "record-from-answer" : "do-not-record",
      action: `${callbackBaseUrl}/api/twilio/voice/status`,
    });
    dial.number(aiServiceNumber);
  } else {
    // Voicemail (or fallback when no number is configured)
    twiml.say(
      { voice: "Polly.Joanna" },
      greeting?.trim() ||
        "You've reached Handy Pioneers. We're unavailable right now. Please leave a message after the beep and we'll call you back shortly."
    );
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
