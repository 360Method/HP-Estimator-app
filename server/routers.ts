import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";

// (Imports below were merged from main + feat/lead-flow-unified.)
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
import { agentDraftsRouter } from "./routers/agentDrafts";
import { nurturerPlaybooksRouter } from "./routers/agentPlaybooks";
import { portalRoadmapRouter } from "./routers/portalRoadmap";
import { gbpRouter }           from "./routers/gbp";
import { metaRouter }          from "./routers/meta";
import { googleAdsRouter }     from "./routers/googleAds";
import { aiAgentsRouter }      from "./routers/aiAgents";
import { integratorChatRouter } from "./routers/integratorChat";
import { kpisRouter }          from "./routers/kpis";
import { forgeRouter }         from "./routers/forge";
import { schedulingRouter }    from "./routers/scheduling";
import { vendorsRouter }       from "./routers/vendors";
import { agentsRouter }        from "./routers/agents";
import { playbooksRouter }     from "./routers/playbooks";
import { leadsRouter }         from "./routers/leads";
import { projectEstimatorRouter } from "./routers/projectEstimator";
import { requestPasswordReset, consumePasswordReset } from "./passwordReset";
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
  agentDrafts: agentDraftsRouter,
  nurturerPlaybooks: nurturerPlaybooksRouter,
  portalRoadmap: portalRoadmapRouter,
  gbp: gbpRouter,
  meta: metaRouter,
  googleAds: googleAdsRouter,
  aiAgents: aiAgentsRouter,
  integratorChat: integratorChatRouter,
  kpis: kpisRouter,
  forge: forgeRouter,
  scheduling: schedulingRouter,
  vendors: vendorsRouter,
  agents: agentsRouter,
  playbooks: playbooksRouter,
  leads: leadsRouter,
  projectEstimator: projectEstimatorRouter,

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

    /**
     * Self-serve password reset request. Always returns success even when the
     * email isn't on file — prevents account enumeration. Email contains a
     * single-use token valid for 1 hour.
     */
    requestPasswordReset: publicProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ ctx, input }) => {
        const requestIp =
          (ctx.req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
          ctx.req.socket.remoteAddress ||
          null;
        await requestPasswordReset({ email: input.email, requestIp });
        return { ok: true } as const;
      }),

    /** Consume a reset token and set a new password (min 8 chars). */
    consumePasswordReset: publicProcedure
      .input(
        z.object({
          token: z.string().min(20),
          newPassword: z.string().min(8).max(200),
        }),
      )
      .mutation(async ({ input }) => {
        const result = await consumePasswordReset({
          rawToken: input.token,
          newPassword: input.newPassword,
        });
        if (!result.ok) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              result.reason === "weak"
                ? "Password must be at least 8 characters."
                : "Reset link is invalid or has expired. Request a new one.",
          });
        }
        return { ok: true } as const;
      }),
  }),

  allowlist: router({
    // adminProcedure (role='admin'): only the OWNER_EMAIL user gets this role at
    // upsert time, so allowlist mutations can no longer self-privilege.
    list: adminProcedure.query(async () => {
      return getAdminAllowlist();
    }),
    add: adminProcedure
      .input(z.object({ email: z.string().email() }))
      .mutation(async ({ ctx, input }) => {
        await addAdminAllowlistEmail(input.email, ctx.user.email ?? ctx.user.openId);
        return { success: true };
      }),
    remove: adminProcedure
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
