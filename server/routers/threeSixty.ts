/**
 * 360 Method — tRPC Router
 * Handles memberships, seasonal visits, checklist, labor bank, and annual scans.
 */

import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  threeSixtyMemberships,
  threeSixtyVisits,
  threeSixtyChecklist,
  threeSixtyLaborBankTransactions,
  threeSixtyScans,
  threeSixtyPropertySystems,
  portalReports,
  portalCustomers,
} from "../../drizzle/schema";
import { storagePut } from "../storage";
import { eq, and, desc, asc, inArray } from "drizzle-orm";
import {
  calcMemberDiscount,
  effectiveDiscountRate,
  TIER_DEFINITIONS,
  type MemberTier,
  type BillingCadence,
} from "../../shared/threeSixtyTiers";
import Stripe from "stripe";
import { nanoid } from "nanoid";
import { findCustomerByEmail, createCustomer, createOpportunity } from "../db";

// ─── MEMBERSHIPS ─────────────────────────────────────────────────────────────

const membershipRouter = router({
  list: protectedProcedure.query(async () => {
      const db = await getDb();
      return await db
        .select()
        .from(threeSixtyMemberships)
        .orderBy(desc(threeSixtyMemberships.createdAt));
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [membership] = await db
        .select()
        .from(threeSixtyMemberships)
        .where(eq(threeSixtyMemberships.id, input.id));
      if (!membership) throw new TRPCError({ code: "NOT_FOUND" });
      return membership;
    }),

  getByCustomer: protectedProcedure
    .input(z.object({ customerId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return await db
        .select()
        .from(threeSixtyMemberships)
        .where(eq(threeSixtyMemberships.customerId, input.customerId))
        .orderBy(desc(threeSixtyMemberships.createdAt));
    }),

  create: protectedProcedure
    .input(
      z.object({
        customerId: z.string(),
        propertyAddressId: z.number().optional(),
        tier: z.enum(["bronze", "silver", "gold"]),
        startDate: z.number(), // Unix ms
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const tierDef = TIER_DEFINITIONS[input.tier];
      const renewalDate = input.startDate + 365 * 24 * 60 * 60 * 1000;

      const db = await getDb();
      const [result] = await db
        .insert(threeSixtyMemberships)
        .values({
          customerId: input.customerId,
          propertyAddressId: input.propertyAddressId,
          tier: input.tier,
          status: "active",
          startDate: input.startDate,
          renewalDate,
          laborBankBalance: tierDef.laborBankCreditCents,
          notes: input.notes,
        });

      const membershipId = (result as any).insertId as number;

      // Credit the initial labor bank if applicable
      if (tierDef.laborBankCreditCents > 0) {
        await db.insert(threeSixtyLaborBankTransactions).values({
          membershipId,
          type: "credit",
          amountCents: tierDef.laborBankCreditCents,
          description: `Initial ${tierDef.label} membership labor bank credit`,
        });
      }

      return { id: membershipId };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        tier: z.enum(["bronze", "silver", "gold"]).optional(),
        status: z.enum(["active", "paused", "cancelled"]).optional(),
        notes: z.string().optional(),
        stripeSubscriptionId: z.string().optional(),
        annualScanCompleted: z.boolean().optional(),
        annualScanDate: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;
      const db = await getDb();
      await db
        .update(threeSixtyMemberships)
        .set(updates)
        .where(eq(threeSixtyMemberships.id, id));
      return { success: true };
    }),

  /** Calculate the member discount for a given job total */
  calcDiscount: protectedProcedure
    .input(
      z.object({
        tier: z.enum(["bronze", "silver", "gold"]),
        jobTotalCents: z.number(),
      })
    )
    .query(({ input }) => {
      const discountCents = calcMemberDiscount(input.tier as MemberTier, input.jobTotalCents);
      const effectiveRate = effectiveDiscountRate(input.tier as MemberTier, input.jobTotalCents);
      return { discountCents, effectiveRate };
    }),
});

// ─── VISITS ──────────────────────────────────────────────────────────────────

const visitsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        membershipId: z.number().optional(),
        customerId: z.string().optional(),
        season: z.enum(["spring", "summer", "fall", "winter"]).optional(),
        status: z.enum(["scheduled", "completed", "skipped"]).optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      const conditions = [];
      if (input.membershipId !== undefined)
        conditions.push(eq(threeSixtyVisits.membershipId, input.membershipId));
      if (input.customerId !== undefined)
        conditions.push(eq(threeSixtyVisits.customerId, input.customerId));
      if (input.season !== undefined)
        conditions.push(eq(threeSixtyVisits.season, input.season));
      if (input.status !== undefined)
        conditions.push(eq(threeSixtyVisits.status, input.status));

      return await db
        .select()
        .from(threeSixtyVisits)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(threeSixtyVisits.visitYear), asc(threeSixtyVisits.season));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [visit] = await db
        .select()
        .from(threeSixtyVisits)
        .where(eq(threeSixtyVisits.id, input.id));
      if (!visit) throw new TRPCError({ code: "NOT_FOUND" });
      return visit;
    }),

  schedule: protectedProcedure
    .input(
      z.object({
        membershipId: z.number(),
        customerId: z.string(),
        season: z.enum(["spring", "summer", "fall", "winter"]),
        scheduledDate: z.number().optional(),
        visitYear: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [result] = await db.insert(threeSixtyVisits).values({
        membershipId: input.membershipId,
        customerId: input.customerId,
        season: input.season,
        scheduledDate: input.scheduledDate,
        visitYear: input.visitYear,
        status: "scheduled",
      });
      return { id: (result as any).insertId as number };
    }),

    complete: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        technicianNotes: z.string().optional(),
        checklistSnapshot: z.string().optional(), // legacy JSON string (binary checked/upsell)
        laborBankUsed: z.number().default(0),
        linkedOpportunityId: z.string().optional(),
        // New structured inspection items (Sprint 3+)
        inspectionItems: z
          .array(
            z.object({
              section: z.string(),
              itemName: z.string(),
              condition: z.enum(["good", "monitor", "repair_needed", "urgent", "na"]),
              notes: z.string().optional(),
              photoUrls: z.array(z.string()).optional(),
              estimatedCostLow: z.number().optional(),
              estimatedCostHigh: z.number().optional(),
              systemType: z.string().optional(),
            })
          )
          .optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, laborBankUsed, inspectionItems, ...updates } = input;

      // Enrich inspection items with cascade risk scores
      const enrichedItems: InspectionItem[] = (inspectionItems ?? []).map((item) => {
        const risk = computeCascadeRisk(item.systemType, item.condition);
        return {
          ...item,
          cascadeRiskScore: risk,
          priority: conditionToPriority(item.condition),
          photoUrls: item.photoUrls ?? [],
        };
      });

      await db
        .update(threeSixtyVisits)
        .set({
          ...updates,
          status: "completed",
          completedDate: Date.now(),
          laborBankUsed,
          // Keep legacy snapshot for backward compat
          checklistSnapshot: updates.checklistSnapshot,
        })
        .where(eq(threeSixtyVisits.id, id));

      // If structured items provided, upsert into the current-year scan
      if (enrichedItems.length > 0) {
        const [visit] = await db
          .select()
          .from(threeSixtyVisits)
          .where(eq(threeSixtyVisits.id, id));
        if (visit) {
          // Find or create the annual scan for this membership/year
          const [existingScan] = await db
            .select()
            .from(threeSixtyScans)
            .where(
              and(
                eq(threeSixtyScans.membershipId, visit.membershipId),
                eq(threeSixtyScans.linkedVisitId, id)
              )
            );

          const itemsJson = JSON.stringify(enrichedItems);
          const systems = await db
            .select()
            .from(threeSixtyPropertySystems)
            .where(eq(threeSixtyPropertySystems.membershipId, visit.membershipId));
          const healthScore = computeHealthScoreFromData(enrichedItems, systems);

          const actionable = enrichedItems.filter(
            (i) => i.condition === "urgent" || i.condition === "repair_needed" || i.condition === "monitor"
          );
          const recommendations: Recommendation[] = actionable
            .map((i) => ({
              priority:
                i.priority === "critical"
                  ? ("Critical" as const)
                  : i.priority === "high"
                  ? ("High" as const)
                  : i.priority === "medium"
                  ? ("Medium" as const)
                  : ("Low" as const),
              section: i.section,
              item: i.itemName,
              estimatedCostLow: i.estimatedCostLow,
              estimatedCostHigh: i.estimatedCostHigh,
              cascadeRiskScore: i.cascadeRiskScore,
              notes: i.notes,
              systemType: i.systemType,
            }))
            .sort((a, b) => b.cascadeRiskScore - a.cascadeRiskScore);

          if (existingScan) {
            await db
              .update(threeSixtyScans)
              .set({
                inspectionItemsJson: itemsJson,
                recommendationsJson: JSON.stringify(recommendations),
                healthScore,
                status: "completed",
                technicianNotes: input.technicianNotes,
              })
              .where(eq(threeSixtyScans.id, existingScan.id));
          } else {
            await db.insert(threeSixtyScans).values({
              membershipId: visit.membershipId,
              customerId: visit.customerId,
              scanDate: Date.now(),
              inspectionItemsJson: itemsJson,
              recommendationsJson: JSON.stringify(recommendations),
              healthScore,
              status: "completed",
              technicianNotes: input.technicianNotes,
              linkedVisitId: id,
            });
          }

          // Mark membership annual scan done
          await db
            .update(threeSixtyMemberships)
            .set({ annualScanCompleted: true, annualScanDate: Date.now() })
            .where(eq(threeSixtyMemberships.id, visit.membershipId));
        }
      }

      // Deduct from labor bank if used
      if (laborBankUsed > 0) {
        const [visit] = await db
          .select()
          .from(threeSixtyVisits)
          .where(eq(threeSixtyVisits.id, id));
        if (visit) {
          await db.execute(
            `UPDATE threeSixtyMemberships 
             SET laborBankBalance = GREATEST(0, laborBankBalance - ${laborBankUsed})
             WHERE id = ${visit.membershipId}`
          );
          await db.insert(threeSixtyLaborBankTransactions).values({
            membershipId: visit.membershipId,
            type: "debit",
            amountCents: laborBankUsed,
            description: `Visit #${id} — ${visit.season} ${visit.visitYear} labor bank draw`,
            linkedVisitId: id,
          });
        }
      }
       return { success: true };
    }),
  skip: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db
        .update(threeSixtyVisits)
        .set({ status: "skipped" })
        .where(eq(threeSixtyVisits.id, input.id));
      return { success: true };
    }),

  linkOpportunity: protectedProcedure
    .input(z.object({ visitId: z.number(), opportunityId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db
        .update(threeSixtyVisits)
        .set({ linkedOpportunityId: input.opportunityId })
        .where(eq(threeSixtyVisits.id, input.visitId));
      return { success: true };
    }),
});

// ─── CHECKLIST ───────────────────────────────────────────────────────────────

const checklistRouter = router({
  getBySeason: protectedProcedure
    .input(
      z.object({
        season: z.enum(["spring", "summer", "fall", "winter"]),
        region: z.string().default("PNW"),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      return await db
        .select()
        .from(threeSixtyChecklist)
        .where(
          and(
            eq(threeSixtyChecklist.season, input.season),
            eq(threeSixtyChecklist.region, input.region),
            eq(threeSixtyChecklist.active, true)
          )
        )
        .orderBy(
          asc(threeSixtyChecklist.category),
          asc(threeSixtyChecklist.sortOrder)
        );
    }),

  getAll: protectedProcedure
    .input(z.object({ region: z.string().default("PNW") }))
    .query(async ({ input }) => {
      const db = await getDb();
      return await db
        .select()
        .from(threeSixtyChecklist)
        .where(eq(threeSixtyChecklist.region, input.region))
        .orderBy(
          asc(threeSixtyChecklist.season),
          asc(threeSixtyChecklist.category),
          asc(threeSixtyChecklist.sortOrder)
        );
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        taskName: z.string().optional(),
        description: z.string().optional(),
        estimatedMinutes: z.number().optional(),
        isUpsellTrigger: z.boolean().optional(),
        sortOrder: z.number().optional(),
        active: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;
      const db = await getDb();
      await db
        .update(threeSixtyChecklist)
        .set(updates)
        .where(eq(threeSixtyChecklist.id, id));
      return { success: true };
    }),
});

// ─── LABOR BANK ───────────────────────────────────────────────────────────────

const laborBankRouter = router({
  getLedger: protectedProcedure
    .input(z.object({ membershipId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return await db
        .select()
        .from(threeSixtyLaborBankTransactions)
        .where(eq(threeSixtyLaborBankTransactions.membershipId, input.membershipId))
        .orderBy(desc(threeSixtyLaborBankTransactions.createdAt));
    }),

  adjust: protectedProcedure
    .input(
      z.object({
        membershipId: z.number(),
        type: z.enum(["credit", "debit", "adjustment"]),
        amountCents: z.number().positive(),
        description: z.string(),
        linkedVisitId: z.number().optional(),
        linkedOpportunityId: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const { membershipId, type, amountCents, description } = input;

      await db.insert(threeSixtyLaborBankTransactions).values({
        membershipId,
        type,
        amountCents,
        description,
        linkedVisitId: input.linkedVisitId,
        linkedOpportunityId: input.linkedOpportunityId,
        createdBy: ctx.user.id,
      });

      // Update balance
      const direction = type === "credit" ? "+" : "-";
      await db.execute(
        `UPDATE threeSixtyMemberships 
         SET laborBankBalance = GREATEST(0, laborBankBalance ${direction} ${amountCents})
         WHERE id = ${membershipId}`
      );

      return { success: true };
    }),
});

// ─── CASCADE RISK SCORING ─────────────────────────────────────────────────────
const SYSTEM_BASE_RISK: Record<string, number> = {
  foundation: 9,
  roof: 8,
  plumbing: 7,
  electrical: 6,
  hvac: 5,
  exterior_siding: 4,
  interior: 3,
  appliances: 3,
};
const CONDITION_MULTIPLIER: Record<string, number> = {
  urgent: 2.0,
  repair_needed: 1.5,
  monitor: 0.5,
  good: 0,
  na: 0,
};

export interface InspectionItem {
  section: string;
  itemName: string;
  condition: "good" | "monitor" | "repair_needed" | "urgent" | "na";
  notes?: string;
  photoUrls?: string[];
  estimatedCostLow?: number;
  estimatedCostHigh?: number;
  cascadeRiskScore: number;
  priority: "low" | "medium" | "high" | "critical";
  systemType?: string;
}

export interface Recommendation {
  priority: "Low" | "Medium" | "High" | "Critical";
  section: string;
  item: string;
  estimatedCostLow?: number;
  estimatedCostHigh?: number;
  cascadeRiskScore: number;
  notes?: string;
  systemType?: string;
}

function computeCascadeRisk(systemType: string | undefined, condition: string): number {
  const base = SYSTEM_BASE_RISK[systemType ?? "interior"] ?? 3;
  const mult = CONDITION_MULTIPLIER[condition] ?? 0;
  return Math.min(10, Math.round(base * mult * 10) / 10);
}

function conditionToPriority(condition: string): "low" | "medium" | "high" | "critical" {
  if (condition === "urgent") return "critical";
  if (condition === "repair_needed") return "high";
  if (condition === "monitor") return "medium";
  return "low";
}

function computeHealthScoreFromData(
  items: InspectionItem[],
  systems: { condition: string }[]
): number {
  const conditionScore: Record<string, number> = { good: 100, fair: 70, poor: 40, critical: 10 };
  const sysScore =
    systems.length > 0
      ? systems.reduce((s, sys) => s + (conditionScore[sys.condition] ?? 50), 0) / systems.length
      : 70;
  const actionable = items.filter((i) => i.condition !== "na");
  const passCount = actionable.filter(
    (i) => i.condition === "good" || i.condition === "monitor"
  ).length;
  const itemScore = actionable.length > 0 ? (passCount / actionable.length) * 100 : 80;
  const urgentCount = items.filter((i) => i.condition === "urgent").length;
  const repairCount = items.filter((i) => i.condition === "repair_needed").length;
  const penalty = Math.min(40, urgentCount * 10 + repairCount * 5);
  const penaltyScore = 100 - penalty;
  const raw = sysScore * 0.35 + itemScore * 0.35 + penaltyScore * 0.2 + 100 * 0.1;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

// ─── SCANS ────────────────────────────────────────────────────────────────────
const scansRouter = router({
  list: protectedProcedure
    .input(z.object({ membershipId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return await db
        .select()
        .from(threeSixtyScans)
        .where(eq(threeSixtyScans.membershipId, input.membershipId))
        .orderBy(desc(threeSixtyScans.scanDate));
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [scan] = await db
        .select()
        .from(threeSixtyScans)
        .where(eq(threeSixtyScans.id, input.id));
      if (!scan) throw new TRPCError({ code: "NOT_FOUND" });
      return scan;
    }),

  getDetail: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [scan] = await db
        .select()
        .from(threeSixtyScans)
        .where(eq(threeSixtyScans.id, input.id));
      if (!scan) throw new TRPCError({ code: "NOT_FOUND" });
      const items: InspectionItem[] = scan.inspectionItemsJson
        ? JSON.parse(scan.inspectionItemsJson)
        : [];
      const recommendations: Recommendation[] = scan.recommendationsJson
        ? JSON.parse(scan.recommendationsJson)
        : [];
      const systems = await db
        .select()
        .from(threeSixtyPropertySystems)
        .where(eq(threeSixtyPropertySystems.membershipId, scan.membershipId));
      return { ...scan, items, recommendations, systems };
    }),

  create: protectedProcedure
    .input(
      z.object({
        membershipId: z.number(),
        customerId: z.string(),
        scanDate: z.number(),
        technicianNotes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [result] = await db.insert(threeSixtyScans).values({
        ...input,
        status: "draft",
      });
      return { id: (result as any).insertId as number };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        systemRatings: z.string().optional(),
        technicianNotes: z.string().optional(),
        status: z.enum(["draft", "completed", "delivered"]).optional(),
        reportUrl: z.string().optional(),
        reportFileKey: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;
      const db = await getDb();
      if (updates.status === "completed" || updates.status === "delivered") {
        const [scan] = await db
          .select()
          .from(threeSixtyScans)
          .where(eq(threeSixtyScans.id, id));
        if (scan) {
          await db
            .update(threeSixtyMemberships)
            .set({ annualScanCompleted: true, annualScanDate: Date.now() })
            .where(eq(threeSixtyMemberships.id, scan.membershipId));
        }
      }
      await db
        .update(threeSixtyScans)
        .set(updates)
        .where(eq(threeSixtyScans.id, id));
      return { success: true };
    }),

  updateSummary: protectedProcedure
    .input(z.object({ id: z.number(), summary: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db
        .update(threeSixtyScans)
        .set({ summary: input.summary })
        .where(eq(threeSixtyScans.id, input.id));
      return { success: true };
    }),

  computeHealthScore: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [scan] = await db
        .select()
        .from(threeSixtyScans)
        .where(eq(threeSixtyScans.id, input.id));
      if (!scan) throw new TRPCError({ code: "NOT_FOUND" });

      const items: InspectionItem[] = scan.inspectionItemsJson
        ? JSON.parse(scan.inspectionItemsJson)
        : [];
      const systems = await db
        .select()
        .from(threeSixtyPropertySystems)
        .where(eq(threeSixtyPropertySystems.membershipId, scan.membershipId));

      const actionable = items.filter(
        (i) => i.condition === "urgent" || i.condition === "repair_needed" || i.condition === "monitor"
      );
      const recommendations: Recommendation[] = actionable
        .map((i) => ({
          priority:
            i.priority === "critical"
              ? ("Critical" as const)
              : i.priority === "high"
              ? ("High" as const)
              : i.priority === "medium"
              ? ("Medium" as const)
              : ("Low" as const),
          section: i.section,
          item: i.itemName,
          estimatedCostLow: i.estimatedCostLow,
          estimatedCostHigh: i.estimatedCostHigh,
          cascadeRiskScore: i.cascadeRiskScore,
          notes: i.notes,
          systemType: i.systemType,
        }))
        .sort((a, b) => b.cascadeRiskScore - a.cascadeRiskScore);

      const healthScore = computeHealthScoreFromData(items, systems);

      await db
        .update(threeSixtyScans)
        .set({
          healthScore,
          recommendationsJson: JSON.stringify(recommendations),
          status: "completed",
        })
        .where(eq(threeSixtyScans.id, input.id));

      await db
        .update(threeSixtyMemberships)
        .set({ annualScanCompleted: true, annualScanDate: Date.now() })
        .where(eq(threeSixtyMemberships.id, scan.membershipId));

      return { healthScore, recommendations };
    }),

  createEstimateFromFinding: protectedProcedure
    .input(
      z.object({
        scanId: z.number(),
        item: z.string(),
        section: z.string(),
        estimatedCostLow: z.number().optional(),
        estimatedCostHigh: z.number().optional(),
        notes: z.string().optional(),
        customerId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      return {
        prefill: {
          title: input.item,
          description: `360° Inspection Finding — ${input.section}\n\n${input.notes ?? ""}`.trim(),
          estimatedCostLow: input.estimatedCostLow,
          estimatedCostHigh: input.estimatedCostHigh,
          linkedScanId: input.scanId,
          customerId: input.customerId,
        },
      };
    }),

  sendToPortal: protectedProcedure
    .input(z.object({ scanId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [scan] = await db
        .select()
        .from(threeSixtyScans)
        .where(eq(threeSixtyScans.id, input.scanId));
      if (!scan) throw new TRPCError({ code: "NOT_FOUND" });

      const [portalCustomer] = await db
        .select()
        .from(portalCustomers)
        .where(eq(portalCustomers.hpCustomerId, scan.customerId));
      if (!portalCustomer) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Customer does not have a portal account. Invite them first.",
        });
      }

      const reportJson = JSON.stringify({
        healthScore: scan.healthScore,
        summary: scan.summary,
        items: scan.inspectionItemsJson ? JSON.parse(scan.inspectionItemsJson) : [],
        recommendations: scan.recommendationsJson ? JSON.parse(scan.recommendationsJson) : [],
        scanDate: scan.scanDate,
        pdfUrl: scan.pdfUrl,
      });

      const now = Date.now();
      const [result] = await db.insert(portalReports).values({
        portalCustomerId: portalCustomer.id,
        scanId: scan.id,
        membershipId: scan.membershipId,
        hpCustomerId: scan.customerId,
        healthScore: scan.healthScore,
        reportJson,
        pdfUrl: scan.pdfUrl ?? undefined,
        sentAt: now,
      });

      await db
        .update(threeSixtyScans)
        .set({ sentToPortalAt: now, status: "delivered" })
        .where(eq(threeSixtyScans.id, input.scanId));

      return { portalReportId: (result as any).insertId as number };
    }),
});

// ─── PROPERTY SYSTEMS ─────────────────────────────────────────────────────────
const propertySystemsRouter = router({
  list: protectedProcedure
    .input(z.object({ membershipId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return await db
        .select()
        .from(threeSixtyPropertySystems)
        .where(eq(threeSixtyPropertySystems.membershipId, input.membershipId))
        .orderBy(asc(threeSixtyPropertySystems.systemType));
    }),

  upsert: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        membershipId: z.number(),
        customerId: z.string(),
        systemType: z.enum([
          "hvac",
          "roof",
          "plumbing",
          "electrical",
          "foundation",
          "exterior_siding",
          "interior",
          "appliances",
        ]),
        brandModel: z.string().optional(),
        installYear: z.number().optional(),
        condition: z.enum(["good", "fair", "poor", "critical"]).default("good"),
        conditionNotes: z.string().optional(),
        lastServiceDate: z.string().optional(),
        nextServiceDate: z.string().optional(),
        estimatedLifespanYears: z.number().optional(),
        replacementCostEstimate: z.string().optional(),
        photoUrls: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, photoUrls, ...values } = input;
      const payload = {
        ...values,
        photoUrls: photoUrls ? JSON.stringify(photoUrls) : undefined,
      };
      if (id) {
        await db
          .update(threeSixtyPropertySystems)
          .set(payload)
          .where(eq(threeSixtyPropertySystems.id, id));
        return { id };
      } else {
        const [result] = await db.insert(threeSixtyPropertySystems).values(payload);
        return { id: (result as any).insertId as number };
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db
        .delete(threeSixtyPropertySystems)
        .where(eq(threeSixtyPropertySystems.id, input.id));
      return { success: true };
    }),

  uploadPhoto: protectedProcedure
    .input(
      z.object({
        membershipId: z.number(),
        systemType: z.string(),
        dataUrl: z.string(),
        fileName: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const base64 = input.dataUrl.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");
      const ext = input.fileName.split(".").pop() ?? "jpg";
      const key = `360-systems/${input.membershipId}/${input.systemType}-${Date.now()}.${ext}`;
      const { url } = await storagePut(key, buffer, `image/${ext}`);
      return { url, key };
    }),
});

// ─── SCANS: getLatestByCustomer (for CustomerSection badge) ──────────────────
const scansLatestRouter = router({
  getLatestByCustomer: protectedProcedure
    .input(z.object({ customerId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [scan] = await db
        .select()
        .from(threeSixtyScans)
        .where(eq(threeSixtyScans.customerId, input.customerId))
        .orderBy(desc(threeSixtyScans.scanDate))
        .limit(1);
      if (!scan) return null;
      return {
        id: scan.id,
        healthScore: scan.healthScore,
        scanDate: scan.scanDate,
        sentToPortalAt: scan.sentToPortalAt,
        summary: scan.summary,
      };
    }),

  /** Batch fetch latest health score for a list of customer IDs (used by CustomersListPage) */
  getHealthScoresByCustomerIds: protectedProcedure
    .input(z.object({ customerIds: z.array(z.string()) }))
    .query(async ({ input }) => {
      if (!input.customerIds.length) return {};
      const db = await getDb();
      const allScans = await db
        .select({
          customerId: threeSixtyScans.customerId,
          healthScore: threeSixtyScans.healthScore,
          scanDate: threeSixtyScans.scanDate,
        })
        .from(threeSixtyScans)
        .where(inArray(threeSixtyScans.customerId, input.customerIds))
        .orderBy(desc(threeSixtyScans.scanDate));
      // Reduce to latest per customer
      const result: Record<number, { healthScore: number | null; scanDate: number | null }> = {};
      for (const s of allScans) {
        if (s.customerId !== null && !(s.customerId in result)) {
          result[s.customerId] = { healthScore: s.healthScore, scanDate: s.scanDate };
        }
      }
      return result;
    }),
});

// ─── CHECKOUT ────────────────────────────────────────────────────────────────

/**
 * Map of tier+cadence to Stripe Price IDs.
 * These are set via environment variables after creating products in Stripe dashboard.
 */
function getStripePriceId(tier: MemberTier, cadence: BillingCadence): string {
  const key = `STRIPE_PRICE_${tier.toUpperCase()}_${cadence.toUpperCase()}`;
  const priceId = process.env[key];
  if (!priceId) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Stripe price ID not configured for ${tier} ${cadence}. Set env var ${key}.`,
    });
  }
  return priceId;
}

const checkoutRouter = router({
  /**
   * Creates a Stripe Checkout Session for a 360 membership subscription.
   * Returns the Stripe-hosted checkout URL.
   * The webhook (checkout.session.completed) handles DB record creation.
   */
  createSession: publicProcedure
    .input(
      z.object({
        tier: z.enum(["bronze", "silver", "gold"]),
        cadence: z.enum(["monthly", "quarterly", "annual"]),
        /** Customer name for prefill */
        customerName: z.string().optional(),
        /** Customer email for prefill */
        customerEmail: z.string().email().optional(),
        /** Customer phone number */
        customerPhone: z.string().optional(),
        /** Service address fields */
        serviceAddress: z.string().optional(),
        serviceCity: z.string().optional(),
        serviceState: z.string().optional(),
        serviceZip: z.string().optional(),
        /** Internal HP customer ID to link after payment */
        hpCustomerId: z.string().optional(),
        /** Property address ID to associate with membership */
        propertyAddressId: z.number().int().optional(),
        /** Frontend origin for success/cancel redirect */
        origin: z.string().url(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: "2025-03-31.basil",
      });

      const priceId = getStripePriceId(input.tier, input.cadence);

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        customer_email: input.customerEmail ?? (ctx as any).user?.email ?? undefined,
        allow_promotion_codes: true,
        success_url: `${input.origin}/360/confirmation?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${input.origin}/360/checkout?tier=${input.tier}&cadence=${input.cadence}&cancelled=1`,
        metadata: {
          tier: input.tier,
          cadence: input.cadence,
          hpCustomerId: input.hpCustomerId ?? "",
          propertyAddressId: input.propertyAddressId?.toString() ?? "",
          enrolledByUserId: (ctx as any).user?.id?.toString() ?? "",
          customerName: input.customerName ?? "",
          customerEmail: input.customerEmail ?? "",
          customerPhone: input.customerPhone ?? "",
          serviceAddress: input.serviceAddress ?? "",
          serviceCity: input.serviceCity ?? "",
          serviceState: input.serviceState ?? "",
          serviceZip: input.serviceZip ?? "",
        },
        subscription_data: {
          metadata: {
            tier: input.tier,
            cadence: input.cadence,
            hpCustomerId: input.hpCustomerId ?? "",
          },
        },
      });

      return { url: session.url! };
    }),
});

// ─── ABANDONED LEAD CAPTURE ──────────────────────────────────────────────────

const abandonedLeadRouter = router({
  capture: publicProcedure
    .input(
      z.object({
        tier: z.enum(["bronze", "silver", "gold"]),
        cadence: z.enum(["monthly", "quarterly", "annual"]),
        customerName: z.string().min(1),
        customerEmail: z.string().email(),
        customerPhone: z.string().optional(),
        serviceAddress: z.string().optional(),
        serviceCity: z.string().optional(),
        serviceState: z.string().optional(),
        serviceZip: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { tier, cadence, customerName, customerEmail, customerPhone } = input;
      try {
        let customer = await findCustomerByEmail(customerEmail);
        if (!customer) {
          const nameParts = customerName.trim().split(" ");
          const firstName = nameParts[0] ?? "";
          const lastName = nameParts.slice(1).join(" ") || "";
          customer = await createCustomer({
            id: nanoid(),
            firstName,
            lastName,
            displayName: customerName.trim(),
            email: customerEmail.toLowerCase().trim(),
            mobilePhone: customerPhone || "",
            street: input.serviceAddress || "",
            city: input.serviceCity || "",
            state: input.serviceState || "",
            zip: input.serviceZip || "",
            customerType: "homeowner",
            leadSource: "360 Funnel",
            customerNotes: `Initiated 360° checkout (${tier} ${cadence}). Did not complete payment.`,
            sendNotifications: true,
            tags: "[]",
          });
        }
        await createOpportunity({
          id: nanoid(),
          customerId: customer.id,
          area: "lead",
          stage: "Cart Abandoned",
          title: `360° ${tier.charAt(0).toUpperCase() + tier.slice(1)} Plan (${cadence}) — Abandoned`,
          notes: [
            `Tier: ${tier} | Cadence: ${cadence}`,
            `Contact: ${customerName} <${customerEmail}>${customerPhone ? ` | ${customerPhone}` : ""}`,
            `Source: 360° Funnel — cart abandonment capture`,
          ].join("\n"),
          archived: false,
        });
        return { captured: true };
      } catch (err) {
        console.error("[360 Abandoned Lead] capture failed:", err);
        return { captured: false };
      }
    }),
});

// ─── PORTFOLIO PLAN PRICING HELPERS ─────────────────────────────────────────

// Portfolio tiers match the Stripe products created:
// exterior_shield = Exterior-only coverage (1 price per property)
// full_coverage   = Full Coverage (exterior + interior systems)
// max             = Maximum Protection (all systems + priority)
type PortfolioTier = "exterior_shield" | "full_coverage" | "max";

const PORTFOLIO_PRICE_IDS: Record<PortfolioTier, Record<BillingCadence, string>> = {
  exterior_shield: {
    monthly:   process.env.STRIPE_PRICE_PORTFOLIO_EXTERIOR_MONTHLY!,
    quarterly: process.env.STRIPE_PRICE_PORTFOLIO_EXTERIOR_QUARTERLY!,
    annual:    process.env.STRIPE_PRICE_PORTFOLIO_EXTERIOR_ANNUAL!,
  },
  full_coverage: {
    monthly:   process.env.STRIPE_PRICE_PORTFOLIO_FULL_MONTHLY!,
    quarterly: process.env.STRIPE_PRICE_PORTFOLIO_FULL_QUARTERLY!,
    annual:    process.env.STRIPE_PRICE_PORTFOLIO_FULL_ANNUAL!,
  },
  max: {
    monthly:   process.env.STRIPE_PRICE_PORTFOLIO_MAX_MONTHLY!,
    quarterly: process.env.STRIPE_PRICE_PORTFOLIO_MAX_QUARTERLY!,
    annual:    process.env.STRIPE_PRICE_PORTFOLIO_MAX_ANNUAL!,
  },
};

// Interior add-on: billed per door, annual only
const PORTFOLIO_INTERIOR_ADDON_PRICE_ID = process.env.STRIPE_PRICE_INTERIOR_ADDON_ANNUAL_PER_DOOR!;

const portfolioPropertySchema = z.object({
  id: z.string(),
  tier: z.enum(["exterior_shield", "full_coverage", "max"]),
  label: z.string().optional(),
  address: z.string().optional(),
  interiorAddon: z.boolean().default(false),
  interiorDoors: z.number().int().min(0).default(0),
});

// ─── PORTFOLIO CHECKOUT ───────────────────────────────────────────────────────

const portfolioCheckoutRouter = router({
  createSession: publicProcedure
    .input(
      z.object({
        cadence: z.enum(["monthly", "quarterly", "annual"]),
        properties: z.array(portfolioPropertySchema).min(1).max(20),
        customerName: z.string().min(1),
        customerEmail: z.string().email(),
        customerPhone: z.string().optional(),
        billingAddress: z.string().optional(),
        billingCity: z.string().optional(),
        billingState: z.string().optional(),
        billingZip: z.string().optional(),
        origin: z.string().url(),
      })
    )
    .mutation(async ({ input }) => {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: "2025-03-31.basil",
      });
      const { cadence, properties, origin } = input;
      const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = properties.map((prop) => ({
        price: PORTFOLIO_PRICE_IDS[prop.tier][cadence],
        quantity: 1,
      }));
      // Interior add-on: sum of interiorDoors across all properties that opted in
      const totalInteriorDoors = properties
        .filter((p) => p.interiorAddon)
        .reduce((sum, p) => sum + (p.interiorDoors || 1), 0);
      if (totalInteriorDoors > 0) {
        lineItems.push({
          price: PORTFOLIO_INTERIOR_ADDON_PRICE_ID,
          quantity: totalInteriorDoors,
        });
      }
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: lineItems,
        customer_email: input.customerEmail,
        allow_promotion_codes: true,
        success_url: `${origin}/confirmation?session_id={CHECKOUT_SESSION_ID}&plan=portfolio`,
        cancel_url: `${origin}/multifamily?cancelled=1`,
        metadata: {
          planType: "portfolio",
          cadence,
          customerName: input.customerName,
          customerEmail: input.customerEmail,
          customerPhone: input.customerPhone ?? "",
          billingAddress: input.billingAddress ?? "",
          billingCity: input.billingCity ?? "",
          billingState: input.billingState ?? "",
          billingZip: input.billingZip ?? "",
          properties: JSON.stringify(properties),
          interiorAddonDoors: totalInteriorDoors.toString(),
        },
        subscription_data: {
          metadata: {
            planType: "portfolio",
            cadence,
            customerEmail: input.customerEmail,
          },
        },
      });
      return { url: session.url! };
    }),
});

// ─── PORTFOLIO CART ABANDONMENT ───────────────────────────────────────────────

const portfolioAbandonedLeadRouter = router({
  capture: publicProcedure
    .input(
      z.object({
        cadence: z.enum(["monthly", "quarterly", "annual"]),
        properties: z.array(portfolioPropertySchema).min(1),
        customerName: z.string().min(1),
        customerEmail: z.string().email(),
        customerPhone: z.string().optional(),
        billingAddress: z.string().optional(),
        billingCity: z.string().optional(),
        billingState: z.string().optional(),
        billingZip: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { cadence, properties, customerName, customerEmail, customerPhone } = input;
      try {
        let customer = await findCustomerByEmail(customerEmail);
        if (!customer) {
          const nameParts = customerName.trim().split(" ");
          const firstName = nameParts[0] ?? "";
          const lastName = nameParts.slice(1).join(" ") || "";
          customer = await createCustomer({
            id: nanoid(),
            firstName,
            lastName,
            displayName: customerName.trim(),
            email: customerEmail.toLowerCase().trim(),
            mobilePhone: customerPhone || "",
            street: input.billingAddress || "",
            city: input.billingCity || "",
            state: input.billingState || "",
            zip: input.billingZip || "",
            customerType: "homeowner",
            leadSource: "360 Portfolio Funnel",
            customerNotes: `Initiated 360° Portfolio checkout (${cadence}). Did not complete payment. Portfolio: ${properties.length} properties.`,
            sendNotifications: true,
            tags: "[]",
          });
        }
        const propSummary = properties
          .map((p) => `${p.label || p.address || p.tier}${p.interiorAddon ? " +interior" : ""}`)
          .join(", ");
        await createOpportunity({
          id: nanoid(),
          customerId: customer.id,
          area: "lead",
          stage: "Cart Abandoned",
          title: `360° Portfolio Plan (${cadence}) — ${properties.length} propert${properties.length === 1 ? "y" : "ies"} — Abandoned`,
          notes: [
            `Cadence: ${cadence} | Properties: ${properties.length}`,
            `Portfolio: ${propSummary}`,
            `Contact: ${customerName} <${customerEmail}>${customerPhone ? ` | ${customerPhone}` : ""}`,
            `Source: 360° Portfolio Funnel — cart abandonment capture`,
          ].join("\n"),
          archived: false,
        });
        return { captured: true };
      } catch (err) {
        console.error("[360 Portfolio Abandoned Lead] capture failed:", err);
        return { captured: false };
      }
    }),
});

// ─── COMBINED ROUTER ─────────────────────────────────────────────────────────
export const threeSixtyRouter = router({
  memberships: membershipRouter,
  visits: visitsRouter,
  checklist: checklistRouter,
  laborBank: laborBankRouter,
  scans: scansRouter,
  scansLatest: scansLatestRouter,
  propertySystems: propertySystemsRouter,
  checkout: checkoutRouter,
  abandonedLead: abandonedLeadRouter,
  portfolioCheckout: portfolioCheckoutRouter,
  portfolioAbandonedLead: portfolioAbandonedLeadRouter,
});
