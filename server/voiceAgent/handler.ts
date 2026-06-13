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
import {
  findOrCreateCustomerFromCall,
  findOrCreateConversation,
  updateConversation,
  updateConversationLastMessage,
  incrementUnread,
  insertCallLog,
  insertMessage,
} from "../db";
import type { NormalizedCallReport } from "./types";

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

  console.log(
    `[voiceAgent] logged AI call ${report.callId} from ${callerPhone} (${durationSecs}s, ended=${report.endedReason ?? "?"}) callLog=${callLog?.id ?? "none"}`,
  );
}
