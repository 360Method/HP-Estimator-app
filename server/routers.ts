import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { paymentsRouter } from "./routers/payments";
import { estimateRouter } from "./routers/estimate";
import { inboxRouter } from "./routers/inbox";
import { gmailRouter } from "./routers/gmail";
import { portalRouter } from "./routers/portal";
import { uploadsRouter } from "./routers/uploads";
import { reportingRouter } from "./routers/reporting";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts
  system: systemRouter,
  payments: paymentsRouter,
  estimate: estimateRouter,
  inbox: inboxRouter,
  gmail: gmailRouter,
  portal: portalRouter,
  uploads: uploadsRouter,
  reporting: reportingRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
});

export type AppRouter = typeof appRouter;
