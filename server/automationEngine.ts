/**
 * Automation Engine
 * ─────────────────
 * Evaluates enabled automation rules for a given trigger event and executes
 * the configured action (immediately or after a delay).
 *
 * Usage:
 *   import { runAutomationsForTrigger } from "./automationEngine";
 *   await runAutomationsForTrigger("lead_created", { customerId, customerName, phone, email, ... });
 */

import { getDb } from "./db";
import { automationRules, automationRuleLogs } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

// ─── Trigger keys ─────────────────────────────────────────────────────────────
export type AutomationTrigger =
  | "lead_created"
  | "estimate_sent"
  | "estimate_viewed"
  | "estimate_approved"
  | "job_created"
  | "job_completed"
  | "invoice_sent"
  | "invoice_overdue"
  | "missed_call"
  | "inbound_sms"
  | "new_booking"
  | "job_signoff_submitted"
  | "change_order_approved"
  | "change_order_declined"
  | "offcycle_visit_requested"
  | "portal_onboarding_complete"
  | "invoice_paid";

// ─── Trigger payload shape ────────────────────────────────────────────────────
export interface TriggerPayload {
  customerId?: number;
  customerName?: string;
  customerFirstName?: string;
  phone?: string;
  email?: string;
  referenceNumber?: string;
  amount?: string;
  description?: string;
  [key: string]: unknown;
}

// ─── Condition evaluation ─────────────────────────────────────────────────────
interface Condition {
  field: string;
  operator: "eq" | "neq" | "contains" | "gt" | "lt";
  value: string | number;
}

function evaluateConditions(conditions: Condition[], payload: TriggerPayload): boolean {
  for (const cond of conditions) {
    const actual = (payload as Record<string, unknown>)[cond.field];
    switch (cond.operator) {
      case "eq":    if (String(actual) !== String(cond.value)) return false; break;
      case "neq":   if (String(actual) === String(cond.value)) return false; break;
      case "contains": if (!String(actual ?? "").includes(String(cond.value))) return false; break;
      case "gt":    if (Number(actual) <= Number(cond.value)) return false; break;
      case "lt":    if (Number(actual) >= Number(cond.value)) return false; break;
    }
  }
  return true;
}

// ─── Template interpolation ───────────────────────────────────────────────────
function interpolate(template: string, payload: TriggerPayload): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = (payload as Record<string, unknown>)[key];
    return val !== undefined && val !== null ? String(val) : "";
  });
}

// ─── Action executor ──────────────────────────────────────────────────────────
async function executeAction(
  rule: typeof automationRules.$inferSelect,
  payload: TriggerPayload
): Promise<void> {
  const ap = JSON.parse(rule.actionPayload || "{}");

  switch (rule.actionType) {
    case "send_sms": {
      if (!payload.phone) throw new Error("No phone number in payload");
      const { sendSms, isTwilioConfigured } = await import("./twilio");
      if (!isTwilioConfigured()) throw new Error("Twilio not configured");
      const message = interpolate(ap.messageTemplate ?? "", payload);
      await sendSms(payload.phone, message);
      break;
    }
    case "send_email": {
      if (!payload.email) throw new Error("No email in payload");
      const { sendEmail, isGmailConfigured } = await import("./gmail");
      if (!isGmailConfigured()) throw new Error("Gmail not configured");
      const subject = interpolate(ap.subject ?? "", payload);
      const body = interpolate(ap.bodyTemplate ?? "", payload);
      await sendEmail({ to: payload.email, subject, body, isHtml: false });
      break;
    }
    case "notify_owner": {
      const { notifyOwner } = await import("./_core/notification");
      const title = interpolate(ap.title ?? "Automation Alert", payload);
      const content = interpolate(ap.contentTemplate ?? "", payload);
      await notifyOwner({ title, content });
      break;
    }
    case "create_note": {
      if (!payload.customerId) throw new Error("No customerId in payload");
      const db = await getDb();
      const { conversations, messages } = await import("../drizzle/schema");
      const { eq: eqInner, and: andInner } = await import("drizzle-orm");
      const noteText = interpolate(ap.noteTemplate ?? "", payload);
      const convRows = await db
        .select()
        .from(conversations)
        .where(andInner(eqInner(conversations.customerId, payload.customerId), eqInner(conversations.channel, "note")))
        .limit(1);
      let convId: number;
      if (convRows.length > 0) {
        convId = convRows[0].id;
      } else {
        const ins = await db.insert(conversations).values({ customerId: payload.customerId, channel: "note", status: "open" });
        convId = (ins as any).insertId;
      }
      await db.insert(messages).values({
        conversationId: convId,
        body: noteText,
        channel: "note",
        direction: "outbound",
        senderRole: "hp_team",
        status: "sent",
      });
      break;
    }
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────
export async function runAutomationsForTrigger(
  trigger: AutomationTrigger,
  payload: TriggerPayload
): Promise<void> {
  try {
    const db = await getDb();

    // Hydrate workspace-level variables from appSettings
    try {
      const { appSettings } = await import("../drizzle/schema");
      const [settings] = await db.select().from(appSettings).limit(1);
      if (settings?.googleReviewLink) {
        payload = { ...payload, googleReviewLink: settings.googleReviewLink };
      }
    } catch { /* non-fatal */ }

    const rules = await db
      .select()
      .from(automationRules)
      .where(and(eq(automationRules.trigger, trigger), eq(automationRules.enabled, true)))
      .orderBy(automationRules.sortOrder);

    for (const rule of rules) {
      let conditionsMet = true;
      if (rule.conditions) {
        try {
          const conds: Condition[] = JSON.parse(rule.conditions);
          conditionsMet = evaluateConditions(conds, payload);
        } catch {
          conditionsMet = true;
        }
      }

      if (!conditionsMet) {
        await logRuleExecution(rule.id, trigger, payload, "skipped", null);
        continue;
      }

      const executeNow = async () => {
        try {
          await executeAction(rule, payload);
          await logRuleExecution(rule.id, trigger, payload, "success", null);
        } catch (err: any) {
          await logRuleExecution(rule.id, trigger, payload, "failed", err?.message ?? String(err));
        }
      };

      if (rule.delayMinutes > 0) {
        setTimeout(executeNow, rule.delayMinutes * 60 * 1000);
      } else {
        await executeNow();
      }
    }
  } catch (err) {
    console.error("[AutomationEngine] Uncaught error:", err);
  }
}

// ─── Log helper ───────────────────────────────────────────────────────────────
async function logRuleExecution(
  ruleId: number,
  trigger: string,
  payload: TriggerPayload,
  status: "success" | "failed" | "skipped",
  errorMessage: string | null
) {
  try {
    const db = await getDb();
    await db.insert(automationRuleLogs).values({
      ruleId,
      trigger,
      triggerPayload: JSON.stringify(payload),
      status,
      errorMessage: errorMessage ?? undefined,
    });
  } catch {
    // Logging failure should never crash the engine
  }
}
