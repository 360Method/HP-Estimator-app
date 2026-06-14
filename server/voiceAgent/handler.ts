/**
 * End-of-call handler. Logs an AI-answered call into the same conversation
 * thread the Twilio calls use, so the Inbox is one place for every channel.
 *
 * It records the call, attaches the recording, drops the AI's summary as a
 * call message, stores the full transcript as an internal note, and bumps the
 * unread count so the Nurturer sees it. Leads captured mid-call (via the
 * capture_lead tool) already created an opportunity and notified the team, so
 * this does not double-notify.
 */
import { nanoid } from "nanoid";
import {
  findOrCreateCustomerFromCall,
  findOrCreateConversation,
  updateConversation,
  updateConversationLastMessage,
  incrementUnread,
  insertCallLog,
  insertMessage,
  listOpportunities,
  createOpportunity,
  updateOpportunity,
  updateCustomer,
} from "../db";
import { onLeadCreated, customerLinkUrl } from "../leadRouting";
import { sendSms, isTwilioConfigured } from "../twilio";
import { sendEmail } from "../gmail";
import { normalizeZip } from "../lib/priorityTranslation/serviceArea";
import { extractLeadFromTranscript } from "./extract";
import type { NormalizedCallReport } from "./types";

const INTENT_LABEL: Record<string, string> = {
  membership: "Membership / 360 Method",
  consultation: "Consultation",
  one_off: "One-off project",
  unsure: "General inquiry",
};

/** Absolute base URL for deep links in alerts (env-driven, prod fallback). */
function appBaseUrl(): string {
  return (
    process.env.PUBLIC_APP_URL ||
    process.env.APP_BASE_URL ||
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "") ||
    "https://pro.handypioneers.com"
  );
}

/** Alert the owner so they can call a fresh lead back immediately, with a deep
 *  link. Sends by text (when Twilio works) and by email (reliable today). */
async function sendLeadAlert(input: {
  displayName: string;
  need: string;
  city?: string;
  callerPhone: string;
  customerId: string;
  opportunityId: string;
}): Promise<void> {
  const link = `${appBaseUrl()}${customerLinkUrl(input.customerId, input.opportunityId)}`;
  const where = input.city ? ` in ${input.city}` : "";
  const line = `New call lead: ${input.displayName}${where}. ${input.need}. Call back ${input.callerPhone}.`;

  const smsTo = process.env.LEAD_ALERT_PHONE;
  if (smsTo && isTwilioConfigured()) {
    await sendSms(smsTo, `${line} Open the lead: ${link}`).catch((e) => console.error("[voiceAgent] lead alert SMS failed:", e));
  }

  const emailTo = process.env.LEAD_ALERT_EMAIL;
  if (emailTo) {
    await sendEmail({
      to: emailTo,
      subject: `New call lead: ${input.displayName}${where}`,
      body: `${line}\n\nOpen the lead in the portal: ${link}`,
      html: `<p>${line}</p><p><a href="${link}">Open the lead in the portal</a></p>`,
      skipReplyToken: true,
    }).catch((e) => console.error("[voiceAgent] lead alert email failed:", e));
  }
}

export async function handleCallReport(report: NormalizedCallReport): Promise<void> {
  const callerPhone = report.direction === "inbound" ? report.fromNumber : report.toNumber;
  if (!callerPhone) {
    console.warn("[voiceAgent] call report had no caller number; skipping log", report.callId);
    return;
  }

  const { customer } = await findOrCreateCustomerFromCall(callerPhone).catch(() => ({
    customer: null as Awaited<ReturnType<typeof findOrCreateCustomerFromCall>>["customer"] | null,
  }));
  const conv = await findOrCreateConversation(
    callerPhone,
    null,
    customer?.displayName ?? null,
    customer?.id,
  );
  if (customer && !conv.customerId) {
    await updateConversation(conv.id, { customerId: customer.id, contactName: customer.displayName });
  }

  const durationSecs = report.durationSecs || 0;
  const callLog = await insertCallLog({
    conversationId: conv.id,
    twilioCallSid: report.callId,
    direction: report.direction,
    status: "answered",
    durationSecs,
    recordingUrl: report.recordingUrl ?? undefined,
    callerPhone,
    startedAt: new Date(Date.now() - durationSecs * 1000),
    endedAt: new Date(),
  }).catch((e) => {
    console.error("[voiceAgent] insertCallLog failed:", e);
    return null;
  });

  const summaryLine = report.summary?.trim() || `AI answered call — ${durationSecs}s`;
  await insertMessage({
    conversationId: conv.id,
    channel: "call",
    direction: report.direction,
    body: `AI call: ${summaryLine}`,
    status: "answered",
    twilioSid: report.callId,
    isInternal: false,
    sentAt: new Date(),
  }).catch((e) => console.error("[voiceAgent] insertMessage (summary) failed:", e));

  if (report.transcript?.trim()) {
    await insertMessage({
      conversationId: conv.id,
      channel: "note",
      direction: "inbound",
      body: `Call transcript:\n${report.transcript.trim()}`,
      status: "delivered",
      twilioSid: `${report.callId}-transcript`,
      isInternal: true,
      sentAt: new Date(),
    }).catch((e) => console.error("[voiceAgent] insertMessage (transcript) failed:", e));
  }

  await updateConversationLastMessage(conv.id, summaryLine, "call").catch(() => {});
  await incrementUnread(conv.id).catch(() => {});

  // Build the authoritative lead from the transcript: corrects thin/empty live
  // capture, fills the structured address, and alerts the owner. Best-effort.
  if (customer?.id) {
    await finalizeLeadFromTranscript(report, customer.id, customer.displayName ?? null, callerPhone).catch((e) =>
      console.error("[voiceAgent] finalizeLeadFromTranscript failed:", e),
    );
  }

  console.log(
    `[voiceAgent] logged AI call ${report.callId} from ${callerPhone} (${durationSecs}s, ended=${report.endedReason ?? "?"}) callLog=${callLog?.id ?? "none"}`,
  );
}

/**
 * After the call, read the transcript and make the lead correct: update the
 * customer with the real name/email/address, then either enrich the opportunity
 * the live agent already opened or create one. Fires the team alert once.
 */
async function finalizeLeadFromTranscript(
  report: NormalizedCallReport,
  customerId: string,
  existingDisplayName: string | null,
  callerPhone: string,
): Promise<void> {
  const durationSecs = report.durationSecs || 0;
  const transcript = report.transcript?.trim();
  if (durationSecs < 8 || !transcript) return; // ignore quick hangups / silence

  const ex = (await extractLeadFromTranscript(transcript, report.summary)) || {};

  // Update the customer with whatever we learned (fixes "Unknown Caller").
  const patch: Record<string, unknown> = {};
  if (ex.firstName) patch.firstName = ex.firstName;
  if (ex.lastName) patch.lastName = ex.lastName;
  if (ex.firstName || ex.lastName) patch.displayName = `${ex.firstName ?? ""} ${ex.lastName ?? ""}`.trim();
  if (ex.email) patch.email = ex.email.toLowerCase();
  if (ex.street) patch.street = ex.street;
  if (ex.city) patch.city = ex.city;
  if (ex.state) patch.state = ex.state;
  const zip = ex.zip ? normalizeZip(ex.zip) : null;
  if (zip) patch.zip = zip;
  if (Object.keys(patch).length) {
    await updateCustomer(customerId, patch).catch((e) => console.error("[voiceAgent] updateCustomer:", e));
  }

  const displayName = (patch.displayName as string) || existingDisplayName || callerPhone;
  const intent = ex.intent && INTENT_LABEL[ex.intent] ? ex.intent : "unsure";
  const intentLabel = INTENT_LABEL[intent];
  const need = ex.summary || report.summary?.trim() || "Phone inquiry";
  const high = /emergency|asap|urgent|today|leak|flood|no heat|no water/.test(`${ex.timeline ?? ""} ${need}`.toLowerCase());
  const title = `${displayName} — ${intentLabel}`;
  const notes = [
    "Source: AI phone agent",
    `Interest: ${intentLabel}`,
    `Need: ${need}`,
    ex.street || ex.city || zip ? `Address: ${[ex.street, ex.city, ex.state, zip].filter(Boolean).join(", ")}` : "",
    ex.email ? `Email: ${ex.email}` : "",
    `Callback: ${callerPhone}`,
    ex.bestTimeToCall ? `Best time to call: ${ex.bestTimeToCall}` : "",
    ex.budget ? `Investment: ${ex.budget}` : "",
    ex.timeline ? `Timeline: ${ex.timeline}` : "",
  ].filter(Boolean).join("\n");

  // Enrich the opportunity the live agent opened, or create one if there is none.
  const existing = (await listOpportunities("lead", customerId)).filter((o) => !o.archived);
  let opportunityId: string;
  if (existing.length > 0) {
    opportunityId = existing[0].id;
    await updateOpportunity(opportunityId, { title, notes }).catch((e) => console.error("[voiceAgent] updateOpportunity:", e));
  } else {
    opportunityId = nanoid();
    await createOpportunity({
      id: opportunityId,
      customerId,
      area: "lead",
      stage: "New Lead",
      title,
      notes,
      archived: false,
    }).catch((e) => console.error("[voiceAgent] createOpportunity:", e));
    await onLeadCreated({
      opportunityId,
      customerId,
      title: `New phone lead — ${displayName} (${intentLabel})`,
      source: intent === "membership" ? "membership_intent" : "inbound_call",
      priority: high ? "high" : "normal",
    }).catch(() => {});
  }

  await sendLeadAlert({ displayName, need, city: ex.city, callerPhone, customerId, opportunityId });
  console.log(`[voiceAgent] finalized lead for ${callerPhone} -> opp ${opportunityId} (${intentLabel})`);
}
