/**
 * Financials router — aggregated financial metrics from invoices + payments.
 * All monetary values are returned in CENTS (integers) to match DB storage.
 * Frontend divides by 100 for display.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { invoices, invoicePayments, customers } from "../../drizzle/schema";
import { and, ne, sql, desc, eq } from "drizzle-orm";

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
