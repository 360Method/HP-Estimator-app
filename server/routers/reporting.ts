// ─── Reporting Router ─────────────────────────────────────────────────────────
// Handles snapshot sync from local EstimatorContext state and live metrics queries.
// The snapshot tables are NOT the source of truth — they exist solely for reporting.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  snapshotOpportunities,
  snapshotInvoices,
} from "../../drizzle/schema";
import { gte } from "drizzle-orm";

// ── Input schemas ─────────────────────────────────────────────────────────────

const opportunitySchema = z.object({
  id: z.string(),
  area: z.string(),
  stage: z.string(),
  title: z.string(),
  value: z.number().default(0),
  archived: z.boolean().default(false),
  wonAt: z.string().nullable().optional(),
  sentAt: z.string().nullable().optional(),
  customerId: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(),
});

const invoiceSchema = z.object({
  id: z.string(),
  opportunityId: z.string().nullable().optional(),
  customerId: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(),
  status: z.string(),
  total: z.number().default(0),
  amountPaid: z.number().default(0),
  dueDate: z.string().nullable().optional(),
  issuedAt: z.string().nullable().optional(),
});

// ── Router ────────────────────────────────────────────────────────────────────

export const reportingRouter = router({
  /**
   * Accepts a full snapshot of local EstimatorContext state.
   * Upserts all opportunities and invoices into the snapshot tables.
   * Called on app load and debounced on any state change.
   */
  syncSnapshot: protectedProcedure
    .input(
      z.object({
        opportunities: z.array(opportunitySchema),
        invoices: z.array(invoiceSchema),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Upsert opportunities in batches
      if (input.opportunities.length > 0) {
        for (const opp of input.opportunities) {
          await db
            .insert(snapshotOpportunities)
            .values({
              id: opp.id,
              area: opp.area,
              stage: opp.stage,
              title: opp.title,
              value: opp.value,
              archived: opp.archived,
              wonAt: opp.wonAt ?? null,
              sentAt: opp.sentAt ?? null,
              customerId: opp.customerId ?? null,
              customerName: opp.customerName ?? null,
            })
            .onConflictDoUpdate({
              target: snapshotOpportunities.id,
              set: {
                area: opp.area,
                stage: opp.stage,
                title: opp.title,
                value: opp.value,
                archived: opp.archived,
                wonAt: opp.wonAt ?? null,
                sentAt: opp.sentAt ?? null,
                customerId: opp.customerId ?? null,
                customerName: opp.customerName ?? null,
              },
            });
        }
      }

      // Upsert invoices in batches
      if (input.invoices.length > 0) {
        for (const inv of input.invoices) {
          await db
            .insert(snapshotInvoices)
            .values({
              id: inv.id,
              opportunityId: inv.opportunityId ?? null,
              customerId: inv.customerId ?? null,
              customerName: inv.customerName ?? null,
              status: inv.status,
              total: inv.total,
              amountPaid: inv.amountPaid,
              dueDate: inv.dueDate ?? null,
              issuedAt: inv.issuedAt ?? null,
            })
            .onConflictDoUpdate({
              target: snapshotInvoices.id,
              set: {
                opportunityId: inv.opportunityId ?? null,
                customerId: inv.customerId ?? null,
                customerName: inv.customerName ?? null,
                status: inv.status,
                total: inv.total,
                amountPaid: inv.amountPaid,
                dueDate: inv.dueDate ?? null,
                issuedAt: inv.issuedAt ?? null,
              },
            });
        }
      }

      return { synced: true };
    }),

  /**
   * Returns aggregated metrics for the Reporting page.
   * All monetary values are in cents.
   */
  getMetrics: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

    const now = new Date();

    // Monthly revenue — last 12 months
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const allInvoices = await db
      .select()
      .from(snapshotInvoices)
      .where(gte(snapshotInvoices.createdAt, twelveMonthsAgo));

    const allOpportunities = await db
      .select()
      .from(snapshotOpportunities);

    // Build monthly revenue buckets
    const monthMap: Record<string, number> = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthMap[key] = 0;
    }
    for (const inv of allInvoices) {
      if (inv.status === "paid" || inv.status === "partial") {
        const d = new Date(inv.createdAt);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (key in monthMap) {
          monthMap[key] += inv.amountPaid;
        }
      }
    }
    const monthlyRevenue = Object.entries(monthMap).map(([month, revenue]) => ({
      month,
      revenue,
    }));

    // Funnel
    const activeOpps = allOpportunities.filter((o) => !o.archived);
    const funnel = {
      leads: activeOpps.filter((o) => o.area === "lead").length,
      estimates: activeOpps.filter((o) => o.area === "estimate").length,
      jobs: activeOpps.filter((o) => o.area === "job").length,
      won: allOpportunities.filter((o) => o.wonAt).length,
    };

    // Top customers by total job value
    const customerValueMap: Record<string, { name: string; value: number; jobCount: number }> = {};
    for (const opp of allOpportunities.filter((o) => o.area === "job" && !o.archived)) {
      const key = opp.customerId ?? opp.customerName ?? "Unknown";
      if (!customerValueMap[key]) {
        customerValueMap[key] = { name: opp.customerName ?? "Unknown", value: 0, jobCount: 0 };
      }
      customerValueMap[key].value += opp.value;
      customerValueMap[key].jobCount += 1;
    }
    const topCustomers = Object.values(customerValueMap)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Open invoices
    const openInvoices = allInvoices.filter(
      (inv) => inv.status === "unpaid" || inv.status === "partial"
    );
    const openInvoiceSummary = {
      count: openInvoices.length,
      totalOwed: openInvoices.reduce((s, inv) => s + (inv.total - inv.amountPaid), 0),
    };

    // KPIs
    const totalRevenue = allInvoices
      .filter((inv) => inv.status === "paid" || inv.status === "partial")
      .reduce((s, inv) => s + inv.amountPaid, 0);
    const jobOpps = allOpportunities.filter((o) => o.area === "job");
    const avgJobValue =
      jobOpps.length > 0
        ? jobOpps.reduce((s, o) => s + o.value, 0) / jobOpps.length
        : 0;
    const conversionRate =
      funnel.leads + funnel.estimates > 0
        ? Math.round((funnel.won / (funnel.leads + funnel.estimates + funnel.jobs + funnel.won)) * 100)
        : 0;

    return {
      monthlyRevenue,
      funnel,
      topCustomers,
      openInvoiceSummary,
      kpis: {
        totalRevenue,
        totalJobs: jobOpps.length,
        avgJobValue: Math.round(avgJobValue),
        conversionRate,
      },
    };
  }),
});
