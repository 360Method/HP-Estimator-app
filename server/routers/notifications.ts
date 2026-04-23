/**
 * notifications router — in-app notification bell feed.
 * All procedures scope by the caller's user.id from ctx.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  listNotificationsForUser,
  listNotificationsForRole,
  countUnreadForUser,
  markNotificationRead,
  markAllNotificationsReadForUser,
} from "../leadRouting";

export const notificationsRouter = router({
  /** Recent notifications for the current user (default 20). */
  list: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;
      return listNotificationsForUser(ctx.user.id, limit);
    }),

  /** Role-wide feed (for admin audit — shows notifications addressed to a role). */
  listByRole: protectedProcedure
    .input(z.object({
      role: z.enum(["nurturer", "consultant", "project_manager", "admin"]),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ input }) => {
      return listNotificationsForRole(input.role, input.limit);
    }),

  /** Unread badge count for the current user. */
  countUnread: protectedProcedure.query(async ({ ctx }) => {
    const count = await countUnreadForUser(ctx.user.id);
    return { count };
  }),

  /** Mark a single notification as read. */
  markRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await markNotificationRead(input.id);
      return { success: true };
    }),

  /** Mark every unread notification for the current user as read. */
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await markAllNotificationsReadForUser(ctx.user.id);
    return { success: true };
  }),
});
