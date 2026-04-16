/**
 * Financials router — aggregated financial metrics from invoices + payments.
 * All monetary values are returned in CENTS (integers) to match DB storage.
 * Frontend divides by 100 for display.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { invoices, invoicePayments, customers, expenses } from "../../drizzle/schema";
import { and, ne, sql, desc, eq, gte, lte } from "drizzle-orm";
import { isGmailConfigured, sendOverdueReminderEmail } from "../gmail";
import { sendSms, isTwilioConfigured } from "../twilio";

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function startOfMonthIso(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function endOfMonthIso(year: number, month: number): string {
  const d = new Date(year, month, 0); // last day of month
  return `${year}-${String(month).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function getCustomerNames(db: any, customerIds: string[]): Promise<Record<string, string>> {
  if (!customerIds.length) return {};
  const custRows = await db
    .select({
      id: customers.id,
      firstName: customers.firstName,
      lastName: customers.lastName,
      company: customers.company,
      displayName: customers.displayName,
    })
    .from(customers)
    .where(sql`${customers.id} IN (${sql.join(customerIds.map(id => sql`${id}`), sql`, `)})`);
  const map: Record<string, string> = {};
  for (const c of custRows) {
    map[c.id] =
      [c.firstName, c.lastName].filter(Boolean).join(" ") ||
      c.displayName ||
      c.company ||
      c.id;
  }
  return map;
}

// ─── ROUTER ──────────────────────────────────────────────────────────────────

export const financialsRouter = router({
  /**
   * High-level KPI summary:
   * - totalInvoiced, totalCollected, outstanding, overdue (all cents)
   * - invoiceCount, paidCount
   */
  getSummary: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { totalInvoiced: 0, totalCollected: 0, outstanding: 0, overdue: 0, invoiceCount: 0, paidCount: 0 };

    const now = new Date().toISOString().slice(0, 10);

    const rows = await db
      .select({
        status: invoices.status,
        total: invoices.total,
        amountPaid: invoices.amountPaid,
        balance: invoices.balance,
        dueDate: invoices.dueDate,
      })
      .from(invoices)
      .where(ne(invoices.status, "void"));

    let totalInvoiced = 0;
    let totalCollected = 0;
    let outstanding = 0;
    let overdue = 0;
    let paidCount = 0;

    for (const row of rows) {
      totalInvoiced += row.total ?? 0;
      totalCollected += row.amountPaid ?? 0;
      const bal = row.balance ?? 0;
      if (bal > 0) {
        outstanding += bal;
        if (row.dueDate && row.dueDate < now) overdue += bal;
      }
      if (row.status === "paid") paidCount++;
    }

    return { totalInvoiced, totalCollected, outstanding, overdue, invoiceCount: rows.length, paidCount };
  }),

  /**
   * Revenue by month for the last N months (default 12).
   */
  getRevenueByMonth: protectedProcedure
    .input(z.object({ months: z.number().int().min(1).max(36).default(12) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const result: { year: number; month: number; label: string; invoiced: number; collected: number }[] = [];
      const now = new Date();
      const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

      for (let i = input.months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const start = startOfMonthIso(y, m);
        const end = endOfMonthIso(y, m);

        const [invoicedRow] = await db
          .select({ total: sql<number>`COALESCE(SUM(${invoices.total}), 0)` })
          .from(invoices)
          .where(
            and(
              ne(invoices.status, "void"),
              sql`${invoices.issuedAt} >= ${start}`,
              sql`${invoices.issuedAt} <= ${end}`
            )
          );

        const [collectedRow] = await db
          .select({ amount: sql<number>`COALESCE(SUM(${invoicePayments.amount}), 0)` })
          .from(invoicePayments)
          .where(
            and(
              sql`${invoicePayments.paidAt} >= ${start}`,
              sql`${invoicePayments.paidAt} <= ${end}`
            )
          );

        result.push({
          year: y,
          month: m,
          label: `${MONTH_NAMES[m - 1]} ${String(y).slice(2)}`,
          invoiced: Number(invoicedRow?.total ?? 0),
          collected: Number(collectedRow?.amount ?? 0),
        });
      }

      return result;
    }),

  /**
   * Outstanding invoices — non-void with balance > 0, sorted by dueDate asc.
   */
  getOutstandingInvoices: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const now = new Date().toISOString().slice(0, 10);

      const rows = await db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          status: invoices.status,
          type: invoices.type,
          total: invoices.total,
          amountPaid: invoices.amountPaid,
          balance: invoices.balance,
          issuedAt: invoices.issuedAt,
          dueDate: invoices.dueDate,
          customerId: invoices.customerId,
          opportunityId: invoices.opportunityId,
        })
        .from(invoices)
        .where(
          and(
            ne(invoices.status, "void"),
            ne(invoices.status, "paid"),
            sql`${invoices.balance} > 0`
          )
        )
        .orderBy(invoices.dueDate)
        .limit(input.limit);

      const customerIds = [...new Set(rows.map((r) => r.customerId))];
      const customerMap = await getCustomerNames(db, customerIds);

      return rows.map((r) => ({
        ...r,
        customerName: customerMap[r.customerId] ?? "Unknown",
        daysOverdue:
          r.dueDate && r.dueDate < now
            ? Math.floor((new Date(now).getTime() - new Date(r.dueDate).getTime()) / 86_400_000)
            : 0,
      }));
    }),

  /**
   * Top customers by total invoiced amount.
   */
  getTopCustomers: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const rows = await db
        .select({
          customerId: invoices.customerId,
          totalInvoiced: sql<number>`COALESCE(SUM(${invoices.total}), 0)`,
          totalCollected: sql<number>`COALESCE(SUM(${invoices.amountPaid}), 0)`,
          invoiceCount: sql<number>`COUNT(*)`,
        })
        .from(invoices)
        .where(ne(invoices.status, "void"))
        .groupBy(invoices.customerId)
        .orderBy(desc(sql`SUM(${invoices.total})`))
        .limit(input.limit);

      const customerIds = rows.map((r) => r.customerId);
      const customerMap = await getCustomerNames(db, customerIds);

      return rows.map((r) => ({
        customerId: r.customerId,
        customerName: customerMap[r.customerId] ?? "Unknown",
        totalInvoiced: Number(r.totalInvoiced),
        totalCollected: Number(r.totalCollected),
        invoiceCount: Number(r.invoiceCount),
      }));
    }),

  /**
   * P&L by month: revenue (invoiced), expenses, gross profit.
   */
  getPnLByMonth: protectedProcedure
    .input(z.object({ months: z.number().int().min(1).max(36).default(12) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      const result: {
        year: number; month: number; label: string;
        revenue: number; expenseTotal: number; grossProfit: number;
      }[] = [];
      const now = new Date();
      const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

      for (let i = input.months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const start = startOfMonthIso(y, m);
        const end = endOfMonthIso(y, m);

        const [collectedRow] = await db
          .select({ amount: sql<number>`COALESCE(SUM(${invoicePayments.amount}), 0)` })
          .from(invoicePayments)
          .where(and(
            sql`${invoicePayments.paidAt} >= ${start}`,
            sql`${invoicePayments.paidAt} <= ${end}`
          ));

        const [expRow] = await db
          .select({ total: sql<number>`COALESCE(SUM(${expenses.amount}), 0)` })
          .from(expenses)
          .where(and(
            eq(expenses.userId, ctx.user.id),
            gte(expenses.date, start),
            lte(expenses.date, end)
          ));

        const rev = Number(collectedRow?.amount ?? 0);
        const exp = Number(expRow?.total ?? 0);
        result.push({
          year: y, month: m,
          label: `${MONTH_NAMES[m - 1]} ${String(y).slice(2)}`,
          revenue: rev,
          expenseTotal: exp,
          grossProfit: rev - exp,
        });
      }
      return result;
    }),

  /**
   * Expense summary by category for a date range.
   */
  getExpenseSummary: protectedProcedure
    .input(z.object({
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { total: 0, byCategory: {} as Record<string, number> };

      const conditions = [eq(expenses.userId, ctx.user.id)];
      if (input.dateFrom) conditions.push(gte(expenses.date, input.dateFrom));
      if (input.dateTo) conditions.push(lte(expenses.date, input.dateTo));

      const rows = await db
        .select({ category: expenses.category, amount: expenses.amount })
        .from(expenses)
        .where(and(...conditions));

      const byCategory: Record<string, number> = {};
      let total = 0;
      for (const r of rows) {
        byCategory[r.category] = (byCategory[r.category] ?? 0) + r.amount;
        total += r.amount;
      }
      return { total, byCategory };
    }),

  /**
   * Send overdue payment reminder via email and/or SMS.
   */
  sendReminder: protectedProcedure
    .input(z.object({
      invoiceId: z.string(),
      channels: z.array(z.enum(["email", "sms"])).min(1),
      origin: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const [inv] = await db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          status: invoices.status,
          balance: invoices.balance,
          dueDate: invoices.dueDate,
          customerId: invoices.customerId,
        })
        .from(invoices)
        .where(eq(invoices.id, input.invoiceId))
        .limit(1);

      if (!inv) throw new Error("Invoice not found");

      const custRows = await db
        .select({
          id: customers.id,
          firstName: customers.firstName,
          lastName: customers.lastName,
          email: customers.email,
          phone: customers.phone,
        })
        .from(customers)
        .where(eq(customers.id, inv.customerId))
        .limit(1);

      const cust = custRows[0];
      if (!cust) throw new Error("Customer not found");

      const customerName = [cust.firstName, cust.lastName].filter(Boolean).join(" ") || "Valued Customer";
      const results: { channel: string; success: boolean; error?: string }[] = [];

      if (input.channels.includes("email") && cust.email) {
        if (!isGmailConfigured()) {
          results.push({ channel: "email", success: false, error: "Gmail not configured" });
        } else {
          try {
            await sendOverdueReminderEmail({
              to: cust.email,
              customerName,
              invoiceNumber: inv.invoiceNumber ?? inv.id,
              amountDueCents: inv.balance ?? 0,
              dueDate: inv.dueDate ? new Date(inv.dueDate) : null,
              portalInvoiceId: 0,
              origin: input.origin ?? "https://pro.handypioneers.com",
            });
            results.push({ channel: "email", success: true });
          } catch (e: any) {
            results.push({ channel: "email", success: false, error: e.message });
          }
        }
      }

      if (input.channels.includes("sms") && cust.phone) {
        if (!isTwilioConfigured()) {
          results.push({ channel: "sms", success: false, error: "Twilio not configured" });
        } else {
          try {
            const balStr = `$${((inv.balance ?? 0) / 100).toFixed(2)}`;
            const msg = `Hi ${customerName.split(" ")[0]}, this is a reminder that invoice ${inv.invoiceNumber ?? inv.id} for ${balStr} is overdue. Pay online at ${input.origin ?? "https://pro.handypioneers.com"}/portal. Reply STOP to opt out.`;
            await sendSms(cust.phone, msg);
            results.push({ channel: "sms", success: true });
          } catch (e: any) {
            results.push({ channel: "sms", success: false, error: e.message });
          }
        }
      }

      return { results };
    }),

  /**
   * Export financials as CSV string.
   */
  exportCsv: protectedProcedure
    .input(z.object({ months: z.number().int().min(1).max(36).default(12) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return "";

      const now = new Date();
      const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const lines: string[] = ["Month,Revenue (Collected),Expenses,Gross Profit,Margin %"];

      for (let i = input.months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const start = startOfMonthIso(y, m);
        const end = endOfMonthIso(y, m);
        const label = `${MONTH_NAMES[m - 1]} ${y}`;

        const [collRow] = await db
          .select({ amount: sql<number>`COALESCE(SUM(${invoicePayments.amount}), 0)` })
          .from(invoicePayments)
          .where(and(sql`${invoicePayments.paidAt} >= ${start}`, sql`${invoicePayments.paidAt} <= ${end}`));

        const [expRow] = await db
          .select({ total: sql<number>`COALESCE(SUM(${expenses.amount}), 0)` })
          .from(expenses)
          .where(and(eq(expenses.userId, ctx.user.id), gte(expenses.date, start), lte(expenses.date, end)));

        const rev = Number(collRow?.amount ?? 0) / 100;
        const exp = Number(expRow?.total ?? 0) / 100;
        const gp = rev - exp;
        const margin = rev > 0 ? ((gp / rev) * 100).toFixed(1) : "0.0";
        lines.push(`${label},${rev.toFixed(2)},${exp.toFixed(2)},${gp.toFixed(2)},${margin}%`);
      }

      // Append outstanding invoices section
      lines.push("");
      lines.push("Outstanding Invoices");
      lines.push("Invoice #,Customer,Balance,Due Date,Days Overdue");

      const nowStr = new Date().toISOString().slice(0, 10);
      const outstanding = await db
        .select({
          invoiceNumber: invoices.invoiceNumber,
          balance: invoices.balance,
          dueDate: invoices.dueDate,
          customerId: invoices.customerId,
        })
        .from(invoices)
        .where(and(ne(invoices.status, "void"), ne(invoices.status, "paid"), sql`${invoices.balance} > 0`))
        .orderBy(invoices.dueDate)
        .limit(200);

      const custIds = [...new Set(outstanding.map(r => r.customerId))];
      const custMap = await getCustomerNames(db, custIds);

      for (const r of outstanding) {
        const days = r.dueDate && r.dueDate < nowStr
          ? Math.floor((new Date(nowStr).getTime() - new Date(r.dueDate).getTime()) / 86_400_000)
          : 0;
        const name = (custMap[r.customerId] ?? "Unknown").replace(/,/g, " ");
        lines.push(`${r.invoiceNumber ?? ""},${name},${((r.balance ?? 0) / 100).toFixed(2)},${r.dueDate ?? ""},${days}`);
      }

      return lines.join("\n");
    }),

  /**
   * Recent payments — last N payments with customer + invoice info.
   */
  getRecentPayments: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const rows = await db
        .select({
          id: invoicePayments.id,
          invoiceId: invoicePayments.invoiceId,
          method: invoicePayments.method,
          amount: invoicePayments.amount,
          paidAt: invoicePayments.paidAt,
          reference: invoicePayments.reference,
          note: invoicePayments.note,
          customerId: invoices.customerId,
          invoiceNumber: invoices.invoiceNumber,
        })
        .from(invoicePayments)
        .innerJoin(invoices, eq(invoicePayments.invoiceId, invoices.id))
        .orderBy(desc(invoicePayments.paidAt))
        .limit(input.limit);

      const customerIds = [...new Set(rows.map((r) => r.customerId))];
      const customerMap = await getCustomerNames(db, customerIds);

      return rows.map((r) => ({
        ...r,
        customerName: customerMap[r.customerId] ?? "Unknown",
      }));
    }),
});
