/**
 * Re-engagement send worker.
 *
 * Runs on a 5-minute interval. Each tick:
 *   1. Read pacing limits (env-overridable, defaults below).
 *   2. Count drafts already sent today per channel.
 *   3. Pull approved-but-unsent drafts ordered by approvedAt ASC.
 *   4. For each, send via gmail.sendEmail or twilio.sendSms.
 *   5. Update draft row → status='sent', sentAt, providerMessageId.
 *      Log to customer_communications timeline (messages table) so the
 *      send appears in the unified customer profile feed and Email
 *      Manager AI's reply-detection picks it up automatically.
 *   6. Stop when daily cap is hit.
 *
 * Defaults: 50 emails/day, 25 SMS/day. Override via env:
 *   REENGAGEMENT_EMAIL_DAILY_CAP, REENGAGEMENT_SMS_DAILY_CAP
 *
 * Safety: this worker NEVER sends a draft with status != 'approved'.
 * Pending or rejected drafts are ignored.
 */
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { reengagementDrafts, customers } from "../../../drizzle/schema";
import { sendEmail } from "../../gmail";
import { sendSms, isTwilioConfigured } from "../../twilio";
import {
  findOrCreateConversation,
  insertMessage,
  updateConversationLastMessage,
} from "../../db";

const DEFAULT_EMAIL_CAP = 50;
const DEFAULT_SMS_CAP = 25;

function dailyCapEmail() {
  const v = Number(process.env.REENGAGEMENT_EMAIL_DAILY_CAP);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_EMAIL_CAP;
}
function dailyCapSms() {
  const v = Number(process.env.REENGAGEMENT_SMS_DAILY_CAP);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_SMS_CAP;
}

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function sentTodayCount(channel: "email" | "sms"): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const since = startOfTodayUtc();
  const rows = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(reengagementDrafts)
    .where(
      and(
        eq(reengagementDrafts.channel, channel),
        eq(reengagementDrafts.status, "sent"),
        gte(reengagementDrafts.sentAt, since),
      ),
    );
  return Number(rows[0]?.c ?? 0);
}

async function nextApprovedDrafts(
  channel: "email" | "sms",
  limit: number,
): Promise<Array<typeof reengagementDrafts.$inferSelect>> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(reengagementDrafts)
    .where(
      and(eq(reengagementDrafts.channel, channel), eq(reengagementDrafts.status, "approved")),
    )
    .orderBy(asc(reengagementDrafts.approvedAt))
    .limit(limit);
}

async function logSendToTimeline(
  customerId: string,
  channel: "email" | "sms",
  body: string,
  subject: string | null,
  providerMessageId: string,
) {
  const db = await getDb();
  if (!db) return;
  // Pull contact info from the customer row to anchor the conversation
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  if (!customer) return;

  const phone = channel === "sms" ? customer.mobilePhone || null : null;
  const email = channel === "email" ? customer.email || null : null;
  const conv = await findOrCreateConversation(
    phone,
    email,
    customer.displayName || `${customer.firstName} ${customer.lastName}`.trim() || null,
    customer.id,
  );
  await insertMessage({
    conversationId: conv.id,
    channel,
    direction: "outbound",
    body,
    subject: subject ?? undefined,
    status: "sent",
    gmailMessageId: channel === "email" ? providerMessageId : undefined,
    twilioSid: channel === "sms" ? providerMessageId : undefined,
    isInternal: false,
    sentAt: new Date(),
  });
  await updateConversationLastMessage(conv.id, body.slice(0, 255), channel);
}

async function sendOneEmailDraft(draft: typeof reengagementDrafts.$inferSelect) {
  const db = await getDb();
  if (!db) return;
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, draft.customerId))
    .limit(1);
  if (!customer || !customer.email) {
    await db
      .update(reengagementDrafts)
      .set({ status: "failed", errorMessage: "no email on file at send time", updatedAt: new Date() })
      .where(eq(reengagementDrafts.id, draft.id));
    return;
  }
  if (customer.doNotService) {
    await db
      .update(reengagementDrafts)
      .set({ status: "failed", errorMessage: "doNotService set", updatedAt: new Date() })
      .where(eq(reengagementDrafts.id, draft.id));
    return;
  }
  try {
    const { messageId } = await sendEmail({
      to: customer.email,
      subject: draft.subject ?? "A note from Handy Pioneers",
      body: draft.body,
    });
    await db
      .update(reengagementDrafts)
      .set({
        status: "sent",
        sentAt: new Date(),
        providerMessageId: messageId || null,
        updatedAt: new Date(),
      })
      .where(eq(reengagementDrafts.id, draft.id));
    if (messageId) {
      await logSendToTimeline(
        customer.id,
        "email",
        draft.body,
        draft.subject ?? null,
        messageId,
      );
    }
    console.log(`[reengagement] sent email draft ${draft.id} to ${customer.email}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(reengagementDrafts)
      .set({ status: "failed", errorMessage: msg.slice(0, 1000), updatedAt: new Date() })
      .where(eq(reengagementDrafts.id, draft.id));
    console.error(`[reengagement] email send failed for draft ${draft.id}:`, msg);
  }
}

async function sendOneSmsDraft(draft: typeof reengagementDrafts.$inferSelect) {
  const db = await getDb();
  if (!db) return;
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, draft.customerId))
    .limit(1);
  if (!customer || !customer.mobilePhone) {
    await db
      .update(reengagementDrafts)
      .set({ status: "failed", errorMessage: "no mobile phone at send time", updatedAt: new Date() })
      .where(eq(reengagementDrafts.id, draft.id));
    return;
  }
  if (customer.doNotService) {
    await db
      .update(reengagementDrafts)
      .set({ status: "failed", errorMessage: "doNotService set", updatedAt: new Date() })
      .where(eq(reengagementDrafts.id, draft.id));
    return;
  }
  if (!isTwilioConfigured()) {
    await db
      .update(reengagementDrafts)
      .set({ status: "failed", errorMessage: "Twilio not configured", updatedAt: new Date() })
      .where(eq(reengagementDrafts.id, draft.id));
    return;
  }
  try {
    const { sid } = await sendSms(customer.mobilePhone, draft.body);
    await db
      .update(reengagementDrafts)
      .set({
        status: "sent",
        sentAt: new Date(),
        providerMessageId: sid,
        updatedAt: new Date(),
      })
      .where(eq(reengagementDrafts.id, draft.id));
    await logSendToTimeline(customer.id, "sms", draft.body, null, sid);
    console.log(`[reengagement] sent sms draft ${draft.id} to ${customer.mobilePhone}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db
      .update(reengagementDrafts)
      .set({ status: "failed", errorMessage: msg.slice(0, 1000), updatedAt: new Date() })
      .where(eq(reengagementDrafts.id, draft.id));
    console.error(`[reengagement] sms send failed for draft ${draft.id}:`, msg);
  }
}

/** One worker tick — run from the boot scheduler every 5 minutes. */
export async function runReengagementSender(): Promise<{ emailSent: number; smsSent: number }> {
  const out = { emailSent: 0, smsSent: 0 };
  const db = await getDb();
  if (!db) return out;

  // Email
  const emailCap = dailyCapEmail();
  const emailToday = await sentTodayCount("email");
  const emailRoom = Math.max(0, emailCap - emailToday);
  if (emailRoom > 0) {
    // Only send a few per tick so a 5-min loop spreads load over the day.
    // 50/day across ~12hr business hours = ~4/hr ≈ 1 every 15 min ≈ 1 per 3 ticks.
    // We'll send up to ceil(emailRoom / 12) per tick to drain by EOD.
    const perTick = Math.max(1, Math.ceil(emailRoom / 12));
    const drafts = await nextApprovedDrafts("email", perTick);
    for (const d of drafts) {
      await sendOneEmailDraft(d);
      out.emailSent++;
    }
  }

  // SMS
  const smsCap = dailyCapSms();
  const smsToday = await sentTodayCount("sms");
  const smsRoom = Math.max(0, smsCap - smsToday);
  if (smsRoom > 0) {
    const perTick = Math.max(1, Math.ceil(smsRoom / 12));
    const drafts = await nextApprovedDrafts("sms", perTick);
    for (const d of drafts) {
      await sendOneSmsDraft(d);
      out.smsSent++;
    }
  }

  if (out.emailSent + out.smsSent > 0) {
    console.log(
      `[reengagement] sender tick: ${out.emailSent} email, ${out.smsSent} sms sent`,
    );
  }
  return out;
}
