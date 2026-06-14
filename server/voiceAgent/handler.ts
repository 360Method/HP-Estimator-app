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
} from "../db";
import { onLeadCreated } from "../leadRouting";
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

  // Safety net: never lose a real caller. If the agent didn't capture a lead
  // (e.g. the caller asked straight for a human, or a transfer went to
  // voicemail), and this customer has no opportunity at all, open one from the
  // call summary so it lands in the pipeline like every other lead.
  try {
    if (customer?.id && durationSecs >= 10 && (report.summary?.trim() || report.transcript?.trim())) {
      const existing = await listOpportunities(undefined, customer.id);
      if (existing.length === 0) {
        const leadId = nanoid();
        await createOpportunity({
          id: leadId,
          customerId: customer.id,
          area: "lead",
          stage: "New Lead",
          title: `${customer.displayName || callerPhone} — Phone call`,
          notes: [
            "Source: AI phone agent (auto-captured at end of call)",
            report.summary ? `Summary: ${report.summary.trim()}` : "",
            `Callback: ${callerPhone}`,
          ].filter(Boolean).join("\n"),
          archived: false,
        });
        await onLeadCreated({
          opportunityId: leadId,
          customerId: customer.id,
          title: `New phone lead — ${customer.displayName || callerPhone}`,
          source: "inbound_call",
          priority: "normal",
        }).catch(() => {});
        console.log(`[voiceAgent] safety-net lead created for ${callerPhone} (${leadId})`);
      }
    }
  } catch (e) {
    console.error("[voiceAgent] safety-net lead failed:", e);
  }

  console.log(
    `[voiceAgent] logged AI call ${report.callId} from ${callerPhone} (${durationSecs}s, ended=${report.endedReason ?? "?"}) callLog=${callLog?.id ?? "none"}`,
  );
}
