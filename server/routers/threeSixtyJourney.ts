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
  portalCustomers,
  portalDocuments,
  properties,
  threeSixtyLaborBankTransactions,
  threeSixtyMemberships,
  threeSixtyPropertySystems,
  threeSixtyScans,
  threeSixtyVisits,
  threeSixtyWorkOrders,
} from "../../drizzle/schema";
import { priorityTranslations } from "../../drizzle/schema.priorityTranslation";
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { deriveJourney, type JourneyInput, type JourneyState } from "../../shared/threeSixtyJourney";
import { SEASON_LABELS, type ThreeSixtyStepKey } from "../../shared/threeSixtyMethod";
import { TIER_DEFINITIONS, type MemberTier } from "../../shared/threeSixtyTiers";
import { buildPropertyScope, customerLevelInScope, recordInScope, type PropertyScope } from "../lib/propertyScope";
import type { DbProperty } from "../../drizzle/schema";

/** Scope for the shared journey loader: the whole umbrella, or one property. */
type JourneyScopeArg =
  | { kind: "customer" }
  | { kind: "property"; property: DbProperty; scope: PropertyScope };

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type MembershipRow = typeof threeSixtyMemberships.$inferSelect;

/** One record inside a step on the customer's nine-step board. */
export type StepContentItem = {
  kind: "scan" | "workorder" | "visit" | "spot" | "opportunity" | "document" | "info";
  refId: string | null;
  label: string;
  note: string;
  dateMs: number | null;
};

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

/**
 * Shared loader behind forCustomer and forProperty. Loads the journey plus
 * what sits inside each step. When scoped to a property, applies the scope
 * rules documented in server/lib/propertyScope.ts: membership only through
 * property.membershipId, and NULL-linked opportunities/spots fall back to
 * the property treated as primary.
 */
async function loadCustomerJourney(db: Db, customerId: string, scopeArg: JourneyScopeArg) {
      const scope = scopeArg.kind === "property" ? scopeArg.scope : null;

      let membership: MembershipRow | null = null;
      if (scopeArg.kind === "property") {
        // Scope rule 2: membership attaches only through the property link.
        if (scopeArg.property.membershipId != null) {
          const [m] = await db.select().from(threeSixtyMemberships)
            .where(eq(threeSixtyMemberships.id, scopeArg.property.membershipId))
            .limit(1);
          membership = m ?? null;
        }
      } else {
        const membershipRows = await db.select().from(threeSixtyMemberships)
          .where(or(
            eq(threeSixtyMemberships.hpCustomerId, customerId),
            eq(threeSixtyMemberships.customerId, customerId),
          ));
        // Prefer the active membership when a customer has history.
        membership = [...membershipRows].sort((a, b) =>
          (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) || b.startDate - a.startDate,
        )[0] ?? null;
      }

      const [customer] = await db
        .select({ id: customers.id, displayName: customers.displayName, firstName: customers.firstName, lastName: customers.lastName })
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);

      const [allSpotRows, allOppRows] = await Promise.all([
        db.select({
          id: priorityTranslations.id,
          status: priorityTranslations.status,
          createdAt: priorityTranslations.createdAt,
          crmPropertyId: priorityTranslations.crmPropertyId,
        }).from(priorityTranslations)
          .where(and(
            eq(priorityTranslations.hpCustomerId, customerId),
            eq(priorityTranslations.source, "spot_inspection"),
          ))
          .orderBy(desc(priorityTranslations.createdAt)),
        db.select({
          id: opportunities.id,
          title: opportunities.title,
          area: opportunities.area,
          stage: opportunities.stage,
          value: opportunities.value,
          scheduledDate: opportunities.scheduledDate,
          archived: opportunities.archived,
          createdAt: opportunities.createdAt,
          propertyId: opportunities.propertyId,
        }).from(opportunities).where(eq(opportunities.customerId, customerId)),
      ]);

      // Scope rules 3 + 4: explicit property link wins; NULL links fall back
      // to the property treated as primary.
      const spotRows = scope ? allSpotRows.filter(s => recordInScope(s.crmPropertyId, scope)) : allSpotRows;
      const oppRows = scope ? allOppRows.filter(o => recordInScope(o.propertyId, scope)) : allOppRows;

      // Membership-bound records only exist for members.
      const mid = membership?.id;
      const [scanRows, woRows, visitRows, systemCount, txnCount] = mid
        ? await Promise.all([
            db.select().from(threeSixtyScans).where(eq(threeSixtyScans.membershipId, mid)),
            db.select().from(threeSixtyWorkOrders).where(eq(threeSixtyWorkOrders.membershipId, mid)),
            db.select().from(threeSixtyVisits).where(eq(threeSixtyVisits.membershipId, mid)),
            db.select({ count: sql<number>`count(*)::int` }).from(threeSixtyPropertySystems)
              .where(eq(threeSixtyPropertySystems.membershipId, mid)).then(r => r[0]?.count ?? 0),
            db.select({ count: sql<number>`count(*)::int` }).from(threeSixtyLaborBankTransactions)
              .where(eq(threeSixtyLaborBankTransactions.membershipId, mid)).then(r => r[0]?.count ?? 0),
          ])
        : [[], [], [], 0, 0] as const;

      // Remodel consultations already filed in their portal (Step 8 artifacts).
      // Scope rule 6: customer-level docs show under the primary only.
      let consultationDocs: { id: number; name: string; uploadedAt: Date | null }[] = [];
      if (!scope || customerLevelInScope(scope)) {
        try {
          const [pc] = await db.select({ id: portalCustomers.id }).from(portalCustomers)
            .where(eq(portalCustomers.hpCustomerId, customerId)).limit(1);
          if (pc) {
            consultationDocs = await db
              .select({ id: portalDocuments.id, name: portalDocuments.name, uploadedAt: portalDocuments.uploadedAt })
              .from(portalDocuments)
              .where(and(eq(portalDocuments.portalCustomerId, pc.id), like(portalDocuments.name, "Remodel options%")));
          }
        } catch { /* contents enrichment only */ }
      }

      const journeyInput: JourneyInput = {
        membership: membership
          ? {
              tier: (membership.tier ?? "bronze") as MemberTier,
              status: (membership.status ?? "active") as "active" | "paused" | "cancelled",
              startDate: membership.startDate,
              annualScanCompleted: membership.annualScanCompleted,
              annualScanDate: membership.annualScanDate ?? null,
              laborBankBalance: membership.laborBankBalance,
            }
          : null,
        scans: scanRows.map(s => ({
          status: (s.status ?? "draft") as "draft" | "completed" | "delivered",
          scanDate: s.scanDate,
          sentToPortalAt: s.sentToPortalAt ?? null,
          hasRecommendations: jsonArrayLength(s.recommendationsJson) > 0,
          findingsCount: jsonArrayLength(s.inspectionItemsJson) || jsonArrayLength(s.recommendationsJson),
          healthScore: s.healthScore ?? null,
        })),
        workOrders: woRows.map(wo => ({
          type: wo.type,
          status: wo.status,
          visitYear: wo.visitYear ?? null,
          scheduledDate: wo.scheduledDate ?? null,
          completedDate: wo.completedDate ?? null,
          hpOpportunityId: wo.hpOpportunityId ?? null,
        })),
        visits: visitRows.map(v => ({ season: v.season, status: v.status, visitYear: v.visitYear })),
        propertySystemsCount: systemCount,
        opportunities: oppRows.map(o => ({
          area: o.area,
          stage: o.stage,
          value: o.value ?? null,
          scheduledDate: parseDateMs(o.scheduledDate),
          archived: o.archived,
        })),
        laborBankTxnCount: txnCount,
        spotInspections: spotRows.map(s => ({
          status: s.status,
          createdAt: s.createdAt instanceof Date ? s.createdAt.getTime() : Number(s.createdAt),
        })),
      };
      const journey = deriveJourney(journeyInput);

      // ── What sits inside each step, for the profile's step board ──────────
      const fmtDate = (d: Date | number | null | undefined) =>
        d == null ? null : d instanceof Date ? d.getTime() : Number(d);
      const oppLive = oppRows.filter(o => !o.archived);
      const jobDone = (stage: string | null) =>
        ["completed", "invoice sent", "invoice paid"].includes(String(stage ?? "").toLowerCase());
      const spotLabel = (status: string) =>
        status === "completed" ? "Mini roadmap delivered"
        : status === "awaiting_review" ? "Draft awaiting review"
        : status === "failed" ? "Generation failed"
        : "Spot inspection in progress";

      const stepContents: Record<ThreeSixtyStepKey, StepContentItem[]> = {
        baseline: [
          ...woRows.filter(w => w.type === "baseline_scan").map(w => ({
            kind: "workorder" as const, refId: String(w.id),
            label: "Baseline walkthrough", note: w.status.replace("_", " "),
            dateMs: fmtDate(w.completedDate ?? w.scheduledDate),
          })),
          ...scanRows.map(s => ({
            kind: "scan" as const, refId: String(s.id),
            label: "360 home scan", note: s.status, dateMs: fmtDate(s.scanDate),
          })),
        ],
        inspect: [
          ...woRows.filter(w => w.type !== "baseline_scan").map(w => ({
            kind: "workorder" as const, refId: String(w.id),
            label: `${SEASON_LABELS[w.type as keyof typeof SEASON_LABELS] ?? w.type} visit ${w.visitYear ?? ""}`.trim(),
            note: w.status.replace("_", " "), dateMs: fmtDate(w.completedDate ?? w.scheduledDate),
          })),
          ...visitRows.map(v => ({
            kind: "visit" as const, refId: String(v.id),
            label: `${SEASON_LABELS[v.season as keyof typeof SEASON_LABELS] ?? v.season} visit ${v.visitYear}`,
            note: v.status, dateMs: fmtDate(v.completedDate ?? v.scheduledDate),
          })),
          ...spotRows.map(s => ({
            kind: "spot" as const, refId: s.id,
            label: "Spot inspection", note: spotLabel(s.status), dateMs: fmtDate(s.createdAt),
          })),
        ],
        track: [
          ...oppLive.filter(o => jobDone(o.stage)).slice(0, 6).map(o => ({
            kind: "opportunity" as const, refId: o.id,
            label: o.title || "Job", note: "completed", dateMs: parseDateMs(o.createdAt as unknown as string),
          })),
          ...spotRows.filter(s => s.status === "completed").map(s => ({
            kind: "spot" as const, refId: s.id,
            label: "Spot inspection on the record", note: "delivered", dateMs: fmtDate(s.createdAt),
          })),
        ],
        prioritize: [
          ...scanRows.filter(s => jsonArrayLength(s.recommendationsJson) > 0).map(s => ({
            kind: "scan" as const, refId: String(s.id),
            label: "Priority roadmap from the 360 scan",
            note: s.sentToPortalAt ? "delivered" : "being prepared", dateMs: fmtDate(s.scanDate),
          })),
          ...spotRows.filter(s => ["completed", "awaiting_review", "processing"].includes(s.status)).map(s => ({
            kind: "spot" as const, refId: s.id,
            label: "Mini roadmap", note: spotLabel(s.status), dateMs: fmtDate(s.createdAt),
          })),
        ],
        schedule: oppLive
          .filter(o => parseDateMs(o.scheduledDate) != null && parseDateMs(o.scheduledDate)! > Date.now())
          .map(o => ({
            kind: "opportunity" as const, refId: o.id,
            label: o.title || "Scheduled work", note: "on the calendar", dateMs: parseDateMs(o.scheduledDate),
          })),
        execute: oppLive
          .filter(o => String(o.area) === "job")
          .slice(0, 8)
          .map(o => ({
            kind: "opportunity" as const, refId: o.id,
            label: o.title || "Job", note: String(o.stage ?? "").toLowerCase() || "open",
            dateMs: parseDateMs(o.scheduledDate),
          })),
        preserve: [],
        upgrade: [
          ...oppLive.filter(o => (o.value ?? 0) >= 2500).map(o => ({
            kind: "opportunity" as const, refId: o.id,
            label: o.title || "Improvement project", note: String(o.stage ?? "").toLowerCase(),
            dateMs: parseDateMs(o.scheduledDate),
          })),
          ...consultationDocs.map(d => ({
            kind: "document" as const, refId: String(d.id),
            label: d.name, note: "in their portal", dateMs: fmtDate(d.uploadedAt),
          })),
        ],
        scale: journey.valueDelivered.healthScore != null
          ? [{
              kind: "info" as const, refId: null,
              label: `Home Score ${journey.valueDelivered.healthScore}`,
              note: membership?.annualScanDate ? "from the latest review" : "from the latest scan",
              dateMs: fmtDate(membership?.annualScanDate ?? null),
            }]
          : [],
      };

      const tier = (membership?.tier ?? null) as MemberTier | null;
      return {
        membershipId: membership?.id ?? null,
        customerId,
        customerName: customer ? customer.displayName || `${customer.firstName} ${customer.lastName}`.trim() : "",
        tierLabel: tier ? TIER_DEFINITIONS[tier]?.label ?? "" : "",
        tier,
        membershipStatus: membership?.status ?? "none",
        memberSince: membership?.startDate ?? null,
        journey,
        stepContents,
      };
}

export const journeyRouter = router({
  /**
   * Journey for one customer, member or not. The nine steps are the
   * framework for every customer; this also returns what sits inside each
   * step (the records) so the profile can open any step and show its
   * contents or its empty state.
   */
  forCustomer: protectedProcedure
    .input(z.object({ customerId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      return loadCustomerJourney(db, input.customerId, { kind: "customer" });
    }),

  /**
   * Same shape as forCustomer, scoped to one property under the umbrella,
   * plus a property summary. Scope rules live in server/lib/propertyScope.ts.
   */
  forProperty: protectedProcedure
    .input(z.object({ customerId: z.string(), propertyId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const propertyRows = await db.select().from(properties)
        .where(eq(properties.customerId, input.customerId));
      const property = propertyRows.find(p => p.id === input.propertyId);
      // Scope rule 1: the property must belong to this customer.
      if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found for this customer" });

      const scope = buildPropertyScope(property, propertyRows.length);
      const result = await loadCustomerJourney(db, input.customerId, { kind: "property", property, scope });
      return {
        ...result,
        property: {
          id: property.id,
          label: property.label,
          street: property.street,
          city: property.city,
          isPrimary: property.isPrimary,
          membershipId: property.membershipId ?? null,
          treatAsPrimary: scope.treatAsPrimary,
        },
      };
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
