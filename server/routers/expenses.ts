/**
 * Expenses router — CRUD for job-level and general business expenses.
 * All amounts stored in cents.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createExpense,
  deleteExpense,
  getExpenseById,
  listExpenses,
  sumExpenses,
  updateExpense,
} from "../db";
import { nanoid } from "nanoid";

const EXPENSE_CATEGORIES = [
  "materials",
  "labor",
  "subcontractor",
  "equipment",
  "fuel",
  "permits",
  "other",
] as const;

const expenseInput = z.object({
  opportunityId: z.string().optional(),
  customerId: z.string().optional(),
  vendor: z.string().max(255).optional(),
  /** Amount in cents */
  amount: z.number().int().min(0),
  category: z.enum(EXPENSE_CATEGORIES).default("other"),
  description: z.string().optional(),
  receiptUrl: z.string().url().optional(),
  /** ISO date YYYY-MM-DD */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const expensesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        opportunityId: z.string().optional(),
        customerId: z.string().optional(),
        category: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(200),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      return listExpenses({ userId: ctx.user.id, ...input });
    }),

  summary: protectedProcedure
    .input(
      z.object({
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
        opportunityId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const total = await sumExpenses({ userId: ctx.user.id, ...input });
      const rows = await listExpenses({
        userId: ctx.user.id,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        opportunityId: input.opportunityId,
        limit: 500,
      });
      // Group by category
      const byCategory: Record<string, number> = {};
      for (const row of rows) {
        byCategory[row.category] = (byCategory[row.category] ?? 0) + row.amount;
      }
      return { total, byCategory, count: rows.length };
    }),

  create: protectedProcedure
    .input(expenseInput)
    .mutation(async ({ ctx, input }) => {
      const id = nanoid();
      return createExpense({
        id,
        userId: ctx.user.id,
        opportunityId: input.opportunityId ?? null,
        customerId: input.customerId ?? null,
        vendor: input.vendor ?? null,
        amount: input.amount,
        category: input.category,
        description: input.description ?? null,
        receiptUrl: input.receiptUrl ?? null,
        date: input.date,
      });
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string(), data: expenseInput.partial() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getExpenseById(input.id);
      if (!existing || existing.userId !== ctx.user.id) {
        throw new Error("Expense not found");
      }
      await updateExpense(input.id, input.data);
      return getExpenseById(input.id);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await getExpenseById(input.id);
      if (!existing || existing.userId !== ctx.user.id) {
        throw new Error("Expense not found");
      }
      await deleteExpense(input.id);
      return { success: true };
    }),
});
