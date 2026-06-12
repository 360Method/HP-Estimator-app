/**
 * 360 Method journey router.
 *
 * Thin data-loading wrapper around the pure engine in
 * shared/threeSixtyJourney.ts. Loads a membership plus the records the
 * derivation reads (scans, work orders, legacy visits, property systems,
 * linked opportunities, labor bank activity), in batched inArray queries,
 * and returns the derived JourneyState per member.
 *
 * Mounted as `journey` inside the threeSixty router, so the client calls
 * trpc.threeSixty.journey.forCustomer / trpc.threeSixty.journey.roster.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  customers,
  opportunities,
  properties,
  threeSixtyLaborBankTransactions,
  threeSixtyMemberships,
  threeSixtyPropertySystems,
  threeSixtyScans,
  threeSixtyVisits,
  threeSixtyWorkOrders,
} from "../../drizzle/schema";
import { eq, inArray, or, sql } from "drizzle-orm";
import { deriveJourney, type JourneyInput, type JourneyState } from "../../shared/threeSixtyJourney";
import { TIER_DEFINITIONS, type MemberTier } from "../../shared/threeSixtyTiers";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type MembershipRow = typeof threeSixtyMemberships.$inferSelect;

export interface MemberJourney {
  membershipId: number;
  customerId: string;
  customerName: string;
  /** Customer-facing tier label (Essential / Full Coverage / Maximum Protection). */
  tierLabel: string;
  tier: MemberTier;
  membershipStatus: string;
  /** Unix ms */
  memberSince: number;
  journey: JourneyState;
}

function jsonArrayLength(text: string | null): number {
  if (!text) return 0;
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function parseDateMs(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Load everything the engine needs for a set of memberships, batched. */
async function deriveJourneys(db: Db, memberships: MembershipRow[]): Promise<MemberJourney[]> {
  if (memberships.length === 0) return [];
  const ids = memberships.map(m => m.id);

  const [scanRows, woRows, visitRows, systemCounts, oppRows, txnCounts, customerRows] = await Promise.all([
    db.select({
      membershipId: threeSixtyScans.membershipId,
      status: threeSixtyScans.status,
      scanDate: threeSixtyScans.scanDate,
      sentToPortalAt: threeSixtyScans.sentToPortalAt,
      recommendationsJson: threeSixtyScans.recommendationsJson,
      inspectionItemsJson: threeSixtyScans.inspectionItemsJson,
      healthScore: threeSixtyScans.healthScore,
    }).from(threeSixtyScans).where(inArray(threeSixtyScans.membershipId, ids)),

    db.select({
      membershipId: threeSixtyWorkOrders.membershipId,
      type: threeSixtyWorkOrders.type,
      status: threeSixtyWorkOrders.status,
      visitYear: threeSixtyWorkOrders.visitYear,
      scheduledDate: threeSixtyWorkOrders.scheduledDate,
      completedDate: threeSixtyWorkOrders.completedDate,
      hpOpportunityId: threeSixtyWorkOrders.hpOpportunityId,
    }).from(threeSixtyWorkOrders).where(inArray(threeSixtyWorkOrders.membershipId, ids)),

    db.select({
      membershipId: threeSixtyVisits.membershipId,
      season: threeSixtyVisits.season,
      status: threeSixtyVisits.status,
      visitYear: threeSixtyVisits.visitYear,
    }).from(threeSixtyVisits).where(inArray(threeSixtyVisits.membershipId, ids)),

    db.select({
      membershipId: threeSixtyPropertySystems.membershipId,
      count: sql<number>`count(*)::int`,
    }).from(threeSixtyPropertySystems)
      .where(inArray(threeSixtyPropertySystems.membershipId, ids))
      .groupBy(threeSixtyPropertySystems.membershipId),

    db.select({
      membershipId: opportunities.membershipId,
      area: opportunities.area,
      stage: opportunities.stage,
      value: opportunities.value,
      scheduledDate: opportunities.scheduledDate,
      archived: opportunities.archived,
    }).from(opportunities).where(inArray(opportunities.membershipId, ids)),

    db.select({
      membershipId: threeSixtyLaborBankTransactions.membershipId,
      count: sql<number>`count(*)::int`,
    }).from(threeSixtyLaborBankTransactions)
      .where(inArray(threeSixtyLaborBankTransactions.membershipId, ids))
      .groupBy(threeSixtyLaborBankTransactions.membershipId),

    (() => {
      const customerIds = Array.from(
        new Set(memberships.flatMap(m => [m.hpCustomerId, m.customerId]).filter((v): v is string => !!v)),
      );
      return customerIds.length
        ? db.select({
            id: customers.id,
            firstName: customers.firstName,
            lastName: customers.lastName,
            displayName: customers.displayName,
          }).from(customers).where(inArray(customers.id, customerIds))
        : Promise.resolve([] as { id: string; firstName: string; lastName: string; displayName: string }[]);
    })(),
  ]);

  const byMembership = <T extends { membershipId: number | null }>(rows: T[]) => {
    const map = new Map<number, T[]>();
    for (const row of rows) {
      if (row.membershipId == null) continue;
      const list = map.get(row.membershipId) ?? [];
      list.push(row);
      map.set(row.membershipId, list);
    }
    return map;
  };

  const scansBy = byMembership(scanRows);
  const wosBy = byMembership(woRows);
  const visitsBy = byMembership(visitRows);
  const oppsBy = byMembership(oppRows);
  const systemCountBy = new Map(systemCounts.map(r => [r.membershipId, r.count]));
  const txnCountBy = new Map(txnCounts.map(r => [r.membershipId, r.count]));
  const customerBy = new Map(customerRows.map(c => [c.id, c]));

  return memberships.map(m => {
    const input: JourneyInput = {
      membership: {
        tier: (m.tier ?? "bronze") as MemberTier,
        status: (m.status ?? "active") as "active" | "paused" | "cancelled",
        startDate: m.startDate,
        annualScanCompleted: m.annualScanCompleted,
        annualScanDate: m.annualScanDate ?? null,
        laborBankBalance: m.laborBankBalance,
      },
      scans: (scansBy.get(m.id) ?? []).map(s => ({
        status: (s.status ?? "draft") as "draft" | "completed" | "delivered",
        scanDate: s.scanDate,
        sentToPortalAt: s.sentToPortalAt ?? null,
        hasRecommendations: jsonArrayLength(s.recommendationsJson) > 0,
        findingsCount: jsonArrayLength(s.inspectionItemsJson) || jsonArrayLength(s.recommendationsJson),
        healthScore: s.healthScore ?? null,
      })),
      workOrders: (wosBy.get(m.id) ?? []).map(wo => ({
        type: wo.type,
        status: wo.status,
        visitYear: wo.visitYear ?? null,
        scheduledDate: wo.scheduledDate ?? null,
        completedDate: wo.completedDate ?? null,
        hpOpportunityId: wo.hpOpportunityId ?? null,
      })),
      visits: (visitsBy.get(m.id) ?? []).map(v => ({
        season: v.season,
        status: v.status,
        visitYear: v.visitYear,
      })),
      propertySystemsCount: systemCountBy.get(m.id) ?? 0,
      // opportunities.value carries dollars in live flows (legacy CSV imports
      // stored cents); the engine's improvement floor assumes dollars.
      opportunities: (oppsBy.get(m.id) ?? []).map(o => ({
        area: o.area,
        stage: o.stage,
        value: o.value ?? null,
        scheduledDate: parseDateMs(o.scheduledDate),
        archived: o.archived,
      })),
      laborBankTxnCount: txnCountBy.get(m.id) ?? 0,
    };

    const customer = (m.hpCustomerId && customerBy.get(m.hpCustomerId)) || customerBy.get(m.customerId);
    const customerName = customer
      ? customer.displayName || `${customer.firstName} ${customer.lastName}`.trim()
      : "";
    const tier = (m.tier ?? "bronze") as MemberTier;

    return {
      membershipId: m.id,
      customerId: m.hpCustomerId ?? m.customerId,
      customerName,
      tierLabel: TIER_DEFINITIONS[tier]?.label ?? "",
      tier,
      membershipStatus: m.status,
      memberSince: m.startDate,
      journey: deriveJourney(input),
    };
  });
}

export const journeyRouter = router({
  /** Journey for one customer's membership (CRM customer id). */
  forCustomer: protectedProcedure
    .input(z.object({ customerId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const rows = await db.select().from(threeSixtyMemberships)
        .where(or(
          eq(threeSixtyMemberships.hpCustomerId, input.customerId),
          eq(threeSixtyMemberships.customerId, input.customerId),
        ));
      // Prefer the active membership when a customer has history.
      const sorted = [...rows].sort((a, b) =>
        (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || b.startDate - a.startDate,
      );
      const [journey] = await deriveJourneys(db, sorted.slice(0, 1));
      return journey ?? null;
    }),

  /** Journey for one membership by id. */
  forMembership: protectedProcedure
    .input(z.object({ membershipId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const rows = await db.select().from(threeSixtyMemberships)
        .where(eq(threeSixtyMemberships.id, input.membershipId));
      const [journey] = await deriveJourneys(db, rows);
      return journey ?? null;
    }),

  /** Every current member with their derived step, for the hub roster. */
  roster: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const rows = await db.select().from(threeSixtyMemberships)
      .where(inArray(threeSixtyMemberships.status, ["active", "paused"]));
    const journeys = await deriveJourneys(db, rows);
    return journeys.sort((a, b) => a.customerName.localeCompare(b.customerName));
  }),
});
