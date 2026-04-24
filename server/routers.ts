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
import { aiAgentsRouter } from "./routers/aiAgents";
import { kpisRouter } from "./routers/kpis";
import {
  getAdminAllowlist,
  addAdminAllowlistEmail,
  removeAdminAllowlistEmail,
  isEmailAllowed,
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
  aiAgents: aiAgentsRouter,
  kpis: kpisRouter,

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
