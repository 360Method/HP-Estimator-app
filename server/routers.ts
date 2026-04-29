import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { paymentsRouter } from "./routers/payments";
import { estimateRouter } from "./routers/estimate";
import { inboxRouter } from "./routers/inbox";
import { gmailRouter } from "./routers/gmail";
import { portalRouter } from "./routers/portal";
import { uploadsRouter } from "./routers/uploads";
import { reportingRouter } from "./routers/reporting";
import { customersRouter } from "./routers/customers";
import { opportunitiesRouter } from "./routers/opportunities";
import { bookingRouter } from "./routers/booking";
import { threeSixtyRouter } from "./routers/threeSixty";
import { workOrdersRouter } from "./routers/workOrders";
import { invoicesRouter } from "./routers/invoices";
import { scheduleRouter } from "./routers/schedule";
import { financialsRouter } from "./routers/financials";
import { expensesRouter } from "./routers/expenses";
import { quickbooksRouter } from "./routers/quickbooks";
import { propertiesRouter } from "./routers/properties";
import { phoneRouter } from "./routers/phone";
import { appSettingsRouter } from "./routers/appSettings";
import { notificationPreferencesRouter } from "./routers/notificationPreferences";
import { notificationsRouter } from "./routers/notifications";
import { pipelineEventsRouter } from "./routers/pipelineEvents";
import { automationRulesRouter } from "./routers/automationRules";
import { emailTemplatesRouter } from "./routers/emailTemplates";
import { campaignsRouter } from "./routers/campaigns";
import { priorityTranslationRouter } from "./routers/priorityTranslation";
import {
  getAdminAllowlist,
  addAdminAllowlistEmail,
  removeAdminAllowlistEmail,
  isEmailAllowed,
  listOrphanEmails,
  resolveOrphanEmail,
  findOrCreateConversation,
  insertMessage,
  updateConversationLastMessage,
  getCustomerById,
} from "./db";

export const appRouter = router({
  system: systemRouter,
  payments: paymentsRouter,
  estimate: estimateRouter,
  inbox: inboxRouter,
  gmail: gmailRouter,
  portal: portalRouter,
  uploads: uploadsRouter,
  reporting: reportingRouter,
  customers: customersRouter,
  opportunities: opportunitiesRouter,
  booking: bookingRouter,
  threeSixty: threeSixtyRouter,
  workOrders: workOrdersRouter,
  invoices: invoicesRouter,
  schedule: scheduleRouter,
  financials: financialsRouter,
  expenses: expensesRouter,
  quickbooks: quickbooksRouter,
  properties: propertiesRouter,
  phone: phoneRouter,
  appSettings: appSettingsRouter,
  notificationPreferences: notificationPreferencesRouter,
  notifications: notificationsRouter,
  pipelineEvents: pipelineEventsRouter,
  automationRules: automationRulesRouter,
  emailTemplates: emailTemplatesRouter,
  campaigns: campaignsRouter,
  priorityTranslation: priorityTranslationRouter,

  auth: router({
    /**
     * Returns the current user plus an `isAllowed` flag.
     * isAllowed=false means authenticated but not on the admin allowlist.
     * If the allowlist table is empty, all authenticated users are allowed.
     */
    me: publicProcedure.query(async (opts) => {
      const user = opts.ctx.user;
      if (!user) return null;
      const allowed = user.email ? await isEmailAllowed(user.email) : true;
      return { ...user, isAllowed: allowed };
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  orphanEmails: router({
    /** List inbound emails the poller couldn't attribute to a customer. */
    list: protectedProcedure
      .input(z.object({ includeResolved: z.boolean().default(false) }).optional())
      .query(async ({ input }) => {
        return listOrphanEmails(input?.includeResolved ?? false, 200);
      }),
    /** Attribute an orphan email to a customer (or dismiss with customerId=null).
     *  Materialises the email into a real `messages` row so it joins the unified feed. */
    resolve: protectedProcedure
      .input(z.object({
        id: z.number(),
        customerId: z.string().nullable(),
      }))
      .mutation(async ({ input }) => {
        await resolveOrphanEmail(input.id, input.customerId);
        if (input.customerId) {
          // Materialise into the canonical conversation so the unified feed picks it up.
          // Re-fetch the orphan row to get its body + subject.
          const rows = await listOrphanEmails(true, 1000);
          const orphan = rows.find(r => r.id === input.id);
          const customer = await getCustomerById(input.customerId);
          if (orphan && customer) {
            const conv = await findOrCreateConversation(
              null,
              orphan.fromEmail,
              orphan.fromName ?? null,
              customer.id,
            );
            await insertMessage({
              conversationId: conv.id,
              channel: "email",
              direction: "inbound",
              body: orphan.body ?? "",
              subject: orphan.subject ?? undefined,
              status: "delivered",
              gmailMessageId: orphan.gmailMessageId,
              isInternal: false,
              sentAt: orphan.receivedAt,
            });
            await updateConversationLastMessage(
              conv.id,
              (orphan.body ?? orphan.subject ?? "").slice(0, 255),
              "email",
            );
          }
        }
        return { ok: true };
      }),
  }),

  allowlist: router({
    list: protectedProcedure.query(async () => {
      return getAdminAllowlist();
    }),
    add: protectedProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ ctx, input }) => {
        await addAdminAllowlistEmail(input.email, ctx.user.email ?? ctx.user.openId);
        return { success: true };
      }),
    remove: protectedProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ ctx, input }) => {
        const list = await getAdminAllowlist();
        if (list.length === 1 && list[0].email === input.email.toLowerCase().trim()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot remove the last allowed email — the list would become empty (open mode).",
          });
        }
        await removeAdminAllowlistEmail(input.email);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
