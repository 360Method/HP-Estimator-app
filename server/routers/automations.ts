/**
 * Automations router — exposes automation log data + manual trigger for Marketing page.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { listAutomationLogs, recomputeLifecycleStage } from "../db";
import { runAutomations } from "../automations";
import { getDb } from "../db";
import { customers, opportunities, threeSixtyMemberships } from "../../drizzle/schema";
import { eq, isNull, sql } from "drizzle-orm";

export const automationsRouter = router({
  /** List automation logs, optionally filtered by customer */
  logs: protectedProcedure
    .input(z.object({ customerId: z.string().optional() }).optional())
    .query(async ({ input }) => {
      return listAutomationLogs(input?.customerId);
    }),

  /** Manually trigger the automation engine (for testing / admin override) */
  runNow: protectedProcedure
    .mutation(async () => {
      runAutomations().catch(console.error);
      return { queued: true };
    }),

  /**
   * Customer segments by lifecycle stage — for the Marketing page overview.
   * Returns counts and a sample of customers per stage.
   */
  segments: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { prospect: [], active: [], member: [], at_risk: [], churned: [] };

    const all = await db
      .select({
        id: customers.id,
        displayName: customers.displayName,
        firstName: customers.firstName,
        lastName: customers.lastName,
        email: customers.email,
        mobilePhone: customers.mobilePhone,
        lifeCycleStage: customers.lifeCycleStage,
        lastJobArchivedAt: customers.lastJobArchivedAt,
        sendMarketingOptIn: customers.sendMarketingOptIn,
      })
      .from(customers)
      .where(isNull(customers.mergedIntoId));

    const segments: Record<string, typeof all> = {
      prospect: [],
      active: [],
      member: [],
      at_risk: [],
      churned: [],
    };

    for (const c of all) {
      const stage = c.lifeCycleStage ?? 'prospect';
      if (segments[stage]) segments[stage].push(c);
    }

    return segments;
  }),

  /**
   * Broadcast a one-off SMS or email to a lifecycle segment.
   * channel: 'sms' | 'email'
   * stage: lifecycle stage to target
   * message: the message body
   */
  broadcast: protectedProcedure
    .input(z.object({
      stage: z.enum(['prospect', 'active', 'member', 'at_risk', 'churned']),
      channel: z.enum(['sms', 'email']),
      subject: z.string().optional(),
      message: z.string().min(10),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { sent: 0, failed: 0 };

      const targets = await db
        .select({
          id: customers.id,
          firstName: customers.firstName,
          email: customers.email,
          mobilePhone: customers.mobilePhone,
          sendMarketingOptIn: customers.sendMarketingOptIn,
        })
        .from(customers)
        .where(sql`"lifeCycleStage" = ${input.stage} AND "mergedIntoId" IS NULL AND "doNotService" = false`);

      const { sendSms, isTwilioConfigured } = await import("../twilio");
      const { sendEmail } = await import("../gmail");
      const { logAutomation } = await import("../db");

      let sent = 0;
      let failed = 0;

      for (const c of targets) {
        // Respect marketing opt-in for email channel
        if (input.channel === 'email' && !c.sendMarketingOptIn) continue;

        try {
          if (input.channel === 'sms' && isTwilioConfigured() && c.mobilePhone) {
            await sendSms(c.mobilePhone, input.message);
            await logAutomation({ customerId: c.id, trigger: 'winback', referenceId: `broadcast-${Date.now()}`, channel: 'sms', status: 'sent' });
            sent++;
          } else if (input.channel === 'email' && c.email) {
            await sendEmail({
              to: c.email,
              subject: input.subject ?? 'A message from Handy Pioneers',
              body: input.message,
              html: `<p>${input.message.replace(/\n/g, '<br/>')}</p>`,
            });
            await logAutomation({ customerId: c.id, trigger: 'winback', referenceId: `broadcast-${Date.now()}`, channel: 'email', status: 'sent' });
            sent++;
          }
        } catch {
          failed++;
        }
      }

      return { sent, failed };
    }),
});
