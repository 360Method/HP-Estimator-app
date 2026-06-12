/**
 * Commissions router: the Consultant seat's ledger (HP-SOP-205).
 *
 * Staff-only surface (/os/commissions). Tracks sold-by attribution on Won
 * jobs and computes each consultant's commission per the shared rule:
 * 40%+ gross margin at sale to qualify, payable once the customer has paid
 * every invoice, marked paid out by hand. No payout automation.
 *
 * Everything here is INTERNAL: commission figures, rates, and GP never
 * reach portal serialization (see PORTAL_FORBIDDEN_KEYS).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { customers, opportunities, osConsultants, portalEstimates, portalInvoices } from "../../drizzle/schema";
import { commissionCents, commissionStatus, type CommissionStatus } from "../../shared/commission";
import { extractTotals } from "../lib/marginAudit";

async function db() {
  const d = await getDb();
  if (!d) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return d;
}

const consultantInput = z.object({
  name: z.string().min(1).max(200),
  email: z.string().max(320).optional(),
  userId: z.number().int().nullable().optional(),
  /** Personal rate in bps: the SOP caps every rate below 10% (1000 bps). */
  rateBps: z.number().int().min(0).max(999),
});

/**
 * Job price in cents. The estimate snapshot's totals (dollars) are the
 * authoritative source; opportunities.value is the fallback and is treated as
 * DOLLARS: the wizard writes Math.round(totals.totalPrice) and the live
 * pipeline UI formats it without dividing by 100, despite the old schema
 * comment saying cents. (CSV-imported rows did store cents; those legacy
 * jobs predate sold-by attribution so they never enter commission math.)
 */
function jobPriceCents(opp: { value: number; estimateSnapshot: string | null }): number {
  const totals = extractTotals(opp.estimateSnapshot);
  if (totals) return Math.round(totals.price * 100);
  return Math.round((opp.value ?? 0) * 100);
}

/** Every non-void invoice collected, or the totals cover what's due. */
function isFullyPaid(invs: { status: string; amountDue: number; amountPaid: number }[]): boolean {
  const live = invs.filter((i) => i.status !== "void");
  if (live.length === 0) return false;
  const everyPaid = live.every((i) => i.status === "paid" || i.amountPaid >= i.amountDue);
  const totalDue = live.reduce((s, i) => s + i.amountDue, 0);
  const totalPaid = live.reduce((s, i) => s + i.amountPaid, 0);
  return everyPaid || totalPaid >= totalDue;
}

/** Invoices per hpOpportunityId for a set of opportunities, in two queries. */
async function invoicesByOpportunity(
  d: Awaited<ReturnType<typeof db>>,
  oppIds: string[],
): Promise<Map<string, { status: string; amountDue: number; amountPaid: number }[]>> {
  const map = new Map<string, { status: string; amountDue: number; amountPaid: number }[]>();
  if (oppIds.length === 0) return map;
  const estRows = await d
    .select({ id: portalEstimates.id, hpOpportunityId: portalEstimates.hpOpportunityId })
    .from(portalEstimates)
    .where(inArray(portalEstimates.hpOpportunityId, oppIds));
  if (estRows.length === 0) return map;
  const oppByEstimate = new Map(estRows.map((e) => [e.id, e.hpOpportunityId!]));
  const invRows = await d
    .select({
      estimateId: portalInvoices.estimateId,
      status: portalInvoices.status,
      amountDue: portalInvoices.amountDue,
      amountPaid: portalInvoices.amountPaid,
    })
    .from(portalInvoices)
    .where(inArray(portalInvoices.estimateId, estRows.map((e) => e.id)));
  for (const inv of invRows) {
    const oppId = inv.estimateId != null ? oppByEstimate.get(inv.estimateId) : undefined;
    if (!oppId) continue;
    const list = map.get(oppId) ?? [];
    list.push({ status: inv.status, amountDue: inv.amountDue, amountPaid: inv.amountPaid });
    map.set(oppId, list);
  }
  return map;
}

export const commissionsRouter = router({
  listConsultants: adminProcedure
    .input(z.object({ includeInactive: z.boolean().optional() }).optional())
    .query(async ({ input }) => {
      const d = await db();
      return d
        .select()
        .from(osConsultants)
        .where(input?.includeInactive ? undefined : eq(osConsultants.active, true))
        .orderBy(asc(osConsultants.name));
    }),

  createConsultant: adminProcedure
    .input(consultantInput)
    .mutation(async ({ input }) => {
      const d = await db();
      const [row] = await d
        .insert(osConsultants)
        .values({
          name: input.name.trim(),
          email: input.email?.trim() ?? "",
          userId: input.userId ?? null,
          commissionRateBps: input.rateBps,
        })
        .returning({ id: osConsultants.id });
      return row;
    }),

  updateConsultant: adminProcedure
    .input(consultantInput.extend({ id: z.number().int(), active: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d
        .update(osConsultants)
        .set({
          name: input.name.trim(),
          email: input.email?.trim() ?? "",
          userId: input.userId ?? null,
          commissionRateBps: input.rateBps,
          ...(input.active !== undefined ? { active: input.active } : {}),
          updatedAt: new Date(),
        })
        .where(eq(osConsultants.id, input.id));
      return { ok: true };
    }),

  /** Attribute (or clear) who sold an opportunity. */
  setSoldBy: adminProcedure
    .input(z.object({ opportunityId: z.string(), consultantId: z.number().int().nullable() }))
    .mutation(async ({ input }) => {
      const d = await db();
      if (input.consultantId != null) {
        const [c] = await d.select().from(osConsultants).where(eq(osConsultants.id, input.consultantId));
        if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Consultant not found" });
      }
      await d
        .update(opportunities)
        .set({ soldByConsultantId: input.consultantId, updatedAt: new Date() })
        .where(eq(opportunities.id, input.opportunityId));
      return { ok: true };
    }),

  /**
   * The commission ledger: every attributed Won job, priced and bucketed by
   * the shared rule, grouped per consultant: plus recent Won jobs with no
   * sold-by so they can be attributed from the page.
   */
  report: adminProcedure
    .input(z.object({ consultantId: z.number().int().optional() }).optional())
    .query(async ({ input }) => {
      const d = await db();
      const consultants = await d.select().from(osConsultants).orderBy(asc(osConsultants.name));
      const byId = new Map(consultants.map((c) => [c.id, c]));

      const conds = [isNotNull(opportunities.soldByConsultantId), isNotNull(opportunities.wonAt)];
      if (input?.consultantId != null) conds.push(eq(opportunities.soldByConsultantId, input.consultantId));
      const opps = await d
        .select({
          id: opportunities.id,
          customerId: opportunities.customerId,
          title: opportunities.title,
          value: opportunities.value,
          estimateSnapshot: opportunities.estimateSnapshot,
          grossMarginBps: opportunities.grossMarginBps,
          soldByConsultantId: opportunities.soldByConsultantId,
          commissionPaidAt: opportunities.commissionPaidAt,
          wonAt: opportunities.wonAt,
        })
        .from(opportunities)
        .where(and(...conds))
        .orderBy(desc(opportunities.wonAt));

      const invMap = await invoicesByOpportunity(d, opps.map((o) => o.id));
      const custIds = [...new Set(opps.map((o) => o.customerId))];
      const custRows = custIds.length
        ? await d
            .select({ id: customers.id, displayName: customers.displayName })
            .from(customers)
            .where(inArray(customers.id, custIds))
        : [];
      const custName = new Map(custRows.map((c) => [c.id, c.displayName]));

      type JobRow = {
        opportunityId: string;
        title: string;
        customer: string;
        priceCents: number;
        grossMarginBps: number | null;
        status: CommissionStatus;
        commissionCents: number;
        wonAt: string | null;
        commissionPaidAt: Date | null;
      };
      const groups = new Map<number, { jobs: JobRow[] }>();
      for (const o of opps) {
        const consultant = byId.get(o.soldByConsultantId!);
        if (!consultant) continue;
        const status = commissionStatus({
          grossMarginBps: o.grossMarginBps,
          fullyPaid: isFullyPaid(invMap.get(o.id) ?? []),
          commissionPaidAt: o.commissionPaidAt,
        });
        const priceCents = jobPriceCents(o);
        const job: JobRow = {
          opportunityId: o.id,
          title: o.title,
          customer: custName.get(o.customerId) ?? "",
          priceCents,
          grossMarginBps: o.grossMarginBps,
          status,
          commissionCents: status === "ineligible" ? 0 : commissionCents(priceCents, consultant.commissionRateBps),
          wonAt: o.wonAt,
          commissionPaidAt: o.commissionPaidAt,
        };
        const g = groups.get(consultant.id) ?? { jobs: [] };
        g.jobs.push(job);
        groups.set(consultant.id, g);
      }

      const emptyTotals = (): Record<CommissionStatus, number> => ({
        ineligible: 0,
        awaiting_payment: 0,
        payable: 0,
        paid_out: 0,
      });
      const report = consultants
        .filter((c) => input?.consultantId == null || c.id === input.consultantId)
        .map((c) => {
          const jobs = groups.get(c.id)?.jobs ?? [];
          const totalsCents = emptyTotals();
          for (const j of jobs) totalsCents[j.status] += j.commissionCents;
          return {
            consultant: {
              id: c.id,
              name: c.name,
              email: c.email,
              commissionRateBps: c.commissionRateBps,
              active: c.active,
            },
            jobs,
            totalsCents,
          };
        });

      // Recent Won jobs nobody is credited for: attributable from the page.
      const unattributed = await d
        .select({
          id: opportunities.id,
          customerId: opportunities.customerId,
          title: opportunities.title,
          value: opportunities.value,
          estimateSnapshot: opportunities.estimateSnapshot,
          wonAt: opportunities.wonAt,
        })
        .from(opportunities)
        .where(
          and(
            isNull(opportunities.soldByConsultantId),
            isNotNull(opportunities.wonAt),
            eq(opportunities.archived, false),
          ),
        )
        .orderBy(desc(opportunities.wonAt))
        .limit(25);
      const unattrCustIds = [...new Set(unattributed.map((o) => o.customerId))].filter((id) => !custName.has(id));
      if (unattrCustIds.length) {
        const more = await d
          .select({ id: customers.id, displayName: customers.displayName })
          .from(customers)
          .where(inArray(customers.id, unattrCustIds));
        for (const c of more) custName.set(c.id, c.displayName);
      }

      return {
        report,
        unattributedWon: unattributed.map((o) => ({
          opportunityId: o.id,
          title: o.title,
          customer: custName.get(o.customerId) ?? "",
          priceCents: jobPriceCents(o),
          wonAt: o.wonAt,
        })),
      };
    }),

  /** Manual ledger action: the money moved, record it. No payout automation. */
  markPaidOut: adminProcedure
    .input(z.object({ opportunityId: z.string() }))
    .mutation(async ({ input }) => {
      const d = await db();
      const [opp] = await d
        .select({ id: opportunities.id, soldByConsultantId: opportunities.soldByConsultantId })
        .from(opportunities)
        .where(eq(opportunities.id, input.opportunityId));
      if (!opp) throw new TRPCError({ code: "NOT_FOUND", message: "Opportunity not found" });
      if (opp.soldByConsultantId == null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Job has no consultant attributed" });
      }
      await d
        .update(opportunities)
        .set({ commissionPaidAt: new Date(), updatedAt: new Date() })
        .where(eq(opportunities.id, input.opportunityId));
      return { ok: true };
    }),
});
