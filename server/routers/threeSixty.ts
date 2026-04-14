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
} from "../../drizzle/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import {
  calcMemberDiscount,
  effectiveDiscountRate,
  TIER_DEFINITIONS,
  type MemberTier,
  type BillingCadence,
} from "../../shared/threeSixtyTiers";
import Stripe from "stripe";

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
    .input(z.object({ customerId: z.number() }))
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
        customerId: z.number(),
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
        customerId: z.number().optional(),
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
        customerId: z.number(),
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
        checklistSnapshot: z.string().optional(), // JSON string
        laborBankUsed: z.number().default(0),
        linkedOpportunityId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, laborBankUsed, ...updates } = input;

      await db
        .update(threeSixtyVisits)
        .set({
          ...updates,
          status: "completed",
          completedDate: Date.now(),
          laborBankUsed,
        })
        .where(eq(threeSixtyVisits.id, id));

      // Deduct from labor bank if used
      if (laborBankUsed > 0) {
        const [visit] = await db
          .select()
          .from(threeSixtyVisits)
          .where(eq(threeSixtyVisits.id, id));

        if (visit) {
          // Use raw decrement
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

  create: protectedProcedure
    .input(
      z.object({
        membershipId: z.number(),
        customerId: z.number(),
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
        systemRatings: z.string().optional(), // JSON
        technicianNotes: z.string().optional(),
        status: z.enum(["draft", "completed", "delivered"]).optional(),
        reportUrl: z.string().optional(),
        reportFileKey: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;
      const db = await getDb();

      // If completing, mark membership scan as done
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

// ─── COMBINED ROUTER ─────────────────────────────────────────────────────────
export const threeSixtyRouter = router({
  memberships: membershipRouter,
  visits: visitsRouter,
  checklist: checklistRouter,
  laborBank: laborBankRouter,
  scans: scansRouter,
  checkout: checkoutRouter,
});
