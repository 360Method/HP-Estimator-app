import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { notificationPreferences } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

// All supported event keys with their default channel settings
export const DEFAULT_NOTIFICATION_PREFS: {
  eventKey: string;
  label: string;
  description: string;
  defaults: { email: boolean; sms: boolean; in_app: boolean };
}[] = [
  { eventKey: "new_lead",        label: "New lead received",             description: "When a new lead is created",                  defaults: { email: true,  sms: true,  in_app: true  } },
  { eventKey: "lead_assigned",   label: "Lead assigned to you",          description: "When a lead is assigned to your account",     defaults: { email: true,  sms: false, in_app: true  } },
  { eventKey: "estimate_sent",   label: "Estimate sent",                 description: "When an estimate is sent to a customer",      defaults: { email: true,  sms: false, in_app: true  } },
  { eventKey: "estimate_viewed", label: "Estimate viewed",               description: "When a customer opens your estimate",         defaults: { email: false, sms: false, in_app: true  } },
  { eventKey: "estimate_approved", label: "Estimate approved / signed",  description: "When a customer approves an estimate",        defaults: { email: true,  sms: true,  in_app: true  } },
  { eventKey: "job_created",     label: "Job created",                   description: "When a new job is created",                   defaults: { email: true,  sms: false, in_app: true  } },
  { eventKey: "job_scheduled",   label: "Job scheduled",                 description: "When a job is added to the schedule",         defaults: { email: true,  sms: true,  in_app: true  } },
  { eventKey: "job_completed",   label: "Job completed",                 description: "When a job is marked as completed",           defaults: { email: true,  sms: false, in_app: true  } },
  { eventKey: "invoice_sent",    label: "Invoice sent",                  description: "When an invoice is sent to a customer",       defaults: { email: true,  sms: false, in_app: true  } },
  { eventKey: "invoice_paid",    label: "Invoice paid",                  description: "When a payment is received",                  defaults: { email: true,  sms: true,  in_app: true  } },
  { eventKey: "invoice_overdue", label: "Invoice overdue",               description: "When an invoice becomes overdue",             defaults: { email: true,  sms: false, in_app: true  } },
  { eventKey: "missed_call",     label: "Missed call",                   description: "When an inbound call is missed",              defaults: { email: false, sms: true,  in_app: true  } },
  { eventKey: "inbound_sms",     label: "Inbound SMS received",          description: "When a customer sends a text message",        defaults: { email: false, sms: false, in_app: true  } },
  { eventKey: "new_booking",     label: "New booking form submission",   description: "When a customer submits a booking request",   defaults: { email: true,  sms: true,  in_app: true  } },
  { eventKey: "task_due",        label: "Task due soon",                 description: "When a job task is due within 24 hours",      defaults: { email: false, sms: false, in_app: true  } },
  { eventKey: "review_received", label: "Customer review received",      description: "When a customer leaves a review",             defaults: { email: true,  sms: false, in_app: true  } },
];

/**
 * Check if a specific notification channel is enabled for an event.
 * Used by the server before firing any notification.
 */
export async function isNotificationEnabled(
  eventKey: string,
  channel: "email" | "sms" | "in_app"
): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.eventKey, eventKey),
        eq(notificationPreferences.channel, channel)
      )
    )
    .limit(1);

  if (rows.length === 0) {
    const def = DEFAULT_NOTIFICATION_PREFS.find((p) => p.eventKey === eventKey);
    if (!def) return true;
    return def.defaults[channel] ?? true;
  }
  return rows[0].enabled;
}

export const notificationPreferencesRouter = router({
  getAll: protectedProcedure.query(async () => {
    const db = await getDb();
    const dbRows = await db.select().from(notificationPreferences);

    return DEFAULT_NOTIFICATION_PREFS.map((def) => {
      const channels = (["email", "sms", "in_app"] as const).map((ch) => {
        const row = dbRows.find(
          (r) => r.eventKey === def.eventKey && r.channel === ch
        );
        return {
          channel: ch,
          enabled: row ? row.enabled : def.defaults[ch],
        };
      });
      return {
        eventKey: def.eventKey,
        label: def.label,
        description: def.description,
        channels,
      };
    });
  }),

  upsert: protectedProcedure
    .input(
      z.object({
        eventKey: z.string().max(60),
        channel: z.enum(["email", "sms", "in_app"]),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db
        .insert(notificationPreferences)
        .values({
          eventKey: input.eventKey,
          channel: input.channel,
          enabled: input.enabled,
        })
        .onDuplicateKeyUpdate({ set: { enabled: input.enabled } });
      return { ok: true };
    }),
});
