/**
 * IDS Issues Log router (audit Rec 2) — admin CRUD over the
 * Identify / Discuss / Solve list. All procedures are admin-only.
 */
import { z } from "zod";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import {
  IDS_CATEGORIES,
  isValidCategory,
  listIdsIssues,
  createIdsIssue,
  updateIdsIssue,
  getIdsIssueByDedupeKey,
} from "../lib/idsIssues";

const STATUS = z.enum(["open", "discussing", "solved", "dropped"]);
const PRIORITY = z.enum(["low", "normal", "high"]);
const categorySchema = z.string().refine(isValidCategory, "Invalid IDS category");

export const idsRouter = router({
  /** The 8 BOS categories, for pickers. */
  categories: protectedProcedure.query(() => IDS_CATEGORIES),

  list: protectedProcedure
    .input(
      z
        .object({
          status: STATUS.optional(),
          category: categorySchema.optional(),
          limit: z.number().int().min(1).max(1000).default(500),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      return listIdsIssues({
        status: input?.status,
        category: input?.category as any,
        limit: input?.limit,
      });
    }),

  /** Open-issue counts grouped by category, for the scorecard/dashboard. */
  stats: protectedProcedure.query(async () => {
    const open = await listIdsIssues({ status: "open", limit: 1000 });
    const byCategory: Record<string, number> = {};
    for (const issue of open) byCategory[issue.category] = (byCategory[issue.category] ?? 0) + 1;
    return { openCount: open.length, byCategory };
  }),

  create: protectedProcedure
    .input(
      z.object({
        category: categorySchema,
        title: z.string().min(3).max(2000),
        detail: z.string().max(8000).optional(),
        priority: PRIORITY.default("normal"),
        ownerUserId: z.number().int().optional(),
        action: z.string().max(2000).optional(),
        dueDate: z.string().optional(),
        opportunityId: z.string().optional(),
        customerId: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const issue = await createIdsIssue({
        id: nanoid(),
        category: input.category,
        title: input.title,
        detail: input.detail,
        priority: input.priority,
        source: "manual",
        ownerUserId: input.ownerUserId,
        action: input.action,
        dueDate: input.dueDate,
        opportunityId: input.opportunityId,
        customerId: input.customerId,
      });
      if (!issue) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      return issue;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: STATUS.optional(),
        priority: PRIORITY.optional(),
        title: z.string().min(3).max(2000).optional(),
        detail: z.string().max(8000).optional(),
        ownerUserId: z.number().int().nullable().optional(),
        action: z.string().max(2000).optional(),
        dueDate: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...patch } = input;
      // Stamp resolvedAt when transitioning into a terminal state.
      const resolvedAt =
        patch.status === "solved" || patch.status === "dropped"
          ? new Date().toISOString()
          : patch.status
            ? null
            : undefined;
      await updateIdsIssue(id, { ...patch, ...(resolvedAt !== undefined ? { resolvedAt } : {}) });
      return { success: true };
    }),

  /** Mark an issue solved with the agreed action (one owner, one action, one due date). */
  solve: protectedProcedure
    .input(z.object({ id: z.string(), action: z.string().min(3).max(2000), ownerUserId: z.number().int().optional() }))
    .mutation(async ({ input }) => {
      await updateIdsIssue(input.id, {
        status: "solved",
        action: input.action,
        ownerUserId: input.ownerUserId,
        resolvedAt: new Date().toISOString(),
      });
      return { success: true };
    }),
});

export { getIdsIssueByDedupeKey };
