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

  auth: router({
    /**
     * Returns the current Manus user plus an `isAllowed` flag.
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
