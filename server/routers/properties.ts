/**
 * Properties Router
 * Manages first-class property records (Customer → Property → Services).
 * Each property can have an independent 360° membership.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import {
  properties,
  opportunities,
  threeSixtyMemberships,
  threeSixtyVisits,
  DbProperty,
} from "../../drizzle/schema";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

// ─── Input schemas ────────────────────────────────────────────────────────────

const propertyInput = z.object({
  label: z.string().min(1).max(64).default("Home"),
  street: z.string().max(255).default(""),
  unit: z.string().max(64).default(""),
  city: z.string().max(128).default(""),
  state: z.string().max(64).default(""),
  zip: z.string().max(10).default(""),
  isPrimary: z.boolean().default(false),
  isBilling: z.boolean().default(false),
  propertyNotes: z.string().optional(),
  addressNotes: z.string().optional(),
  lat: z.string().optional(),
  lng: z.string().optional(),
});

// ─── Health score computation ─────────────────────────────────────────────────

type HealthColor = "green" | "yellow" | "red";
interface HealthScore {
  color: HealthColor;
  score: number; // 0–100
  reasons: string[];
}

async function computeHealthScore(
  propertyId: string,
  customerId: string,
  membershipId: number | null
): Promise<HealthScore> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
  const reasons: string[] = [];
  let score = 100;

  if (membershipId) {
    // Check annual scan
    const [membership] = await db
      .select({
        annualScanCompleted: threeSixtyMemberships.annualScanCompleted,
        annualScanDate: threeSixtyMemberships.annualScanDate,
      })
      .from(threeSixtyMemberships)
      .where(eq(threeSixtyMemberships.id, membershipId))
      .limit(1);

    if (membership && !membership.annualScanCompleted) {
      score -= 25;
      reasons.push("Annual scan not completed");
    }

    // Check last completed visit
    const [lastVisit] = await db
      .select({ completedDate: threeSixtyVisits.completedDate })
      .from(threeSixtyVisits)
      .where(
        and(
          eq(threeSixtyVisits.membershipId, membershipId),
          eq(threeSixtyVisits.status, "completed")
        )
      )
      .orderBy(desc(threeSixtyVisits.completedDate))
      .limit(1);

    if (lastVisit?.completedDate) {
      const daysSinceVisit = Math.floor(
        (Date.now() - lastVisit.completedDate) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceVisit > 180) {
        score -= 20;
        reasons.push(`Last visit ${daysSinceVisit} days ago`);
      }
    } else {
      score -= 15;
      reasons.push("No completed visits on record");
    }

    // Check for scheduled but missed visits
    const [missedCount] = await db
      .select({ n: count() })
      .from(threeSixtyVisits)
      .where(
        and(
          eq(threeSixtyVisits.membershipId, membershipId),
          eq(threeSixtyVisits.status, "skipped")
        )
      );
    if ((missedCount?.n ?? 0) > 0) {
      score -= 10;
      reasons.push(`${missedCount?.n} skipped visit(s)`);
    }
  } else {
    // No membership — neutral, not red unless there are open issues
    score = 70;
    reasons.push("No active 360° membership");
  }

  // Check open jobs for this property
  const [openJobs] = await db
    .select({ n: count() })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.propertyId, propertyId),
        eq(opportunities.area, "job"),
        sql`${opportunities.stage} NOT IN ('Completed', 'Cancelled')`
      )
    );
  const openJobCount = openJobs?.n ?? 0;
  if (openJobCount > 2) {
    score -= 10;
    reasons.push(`${openJobCount} open jobs`);
  }

  const color: HealthColor =
    score >= 80 ? "green" : score >= 55 ? "yellow" : "red";

  return { color, score: Math.max(0, score), reasons };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const propertiesRouter = router({
  /** List all properties for a customer, with membership status and health score */
  listByCustomer: protectedProcedure
    .input(z.object({ customerId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
      const rows = await db
        .select()
        .from(properties)
        .where(eq(properties.customerId, input.customerId))
        .orderBy(desc(properties.isPrimary), desc(properties.createdAt));

      // Attach membership info and health scores
      const enriched = await Promise.all(
        rows.map(async (prop) => {
          let membership = null;
          if (prop.membershipId) {
            const [m] = await db
              .select()
              .from(threeSixtyMemberships)
              .where(eq(threeSixtyMemberships.id, prop.membershipId))
              .limit(1);
            membership = m ?? null;
          }

          const [openJobsRow] = await db
            .select({ n: count() })
            .from(opportunities)
            .where(
              and(
                eq(opportunities.propertyId, prop.id),
                eq(opportunities.area, "job"),
                sql`${opportunities.stage} NOT IN ('Completed', 'Cancelled')`
              )
            );

          const healthScore = await computeHealthScore(
            prop.id,
            prop.customerId,
            prop.membershipId ?? null
          );

          return {
            ...prop,
            membership,
            openJobCount: openJobsRow?.n ?? 0,
            healthScore,
          };
        })
      );

      return enriched;
    }),

  /** Get a single property by id */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
      const [prop] = await db
        .select()
        .from(properties)
        .where(eq(properties.id, input.id))
        .limit(1);
      if (!prop) throw new TRPCError({ code: "NOT_FOUND" });
      return prop;
    }),

  /** Create a new property for a customer */
  create: protectedProcedure
    .input(
      propertyInput.extend({
        customerId: z.string(),
        source: z.enum(["manual", "auto-migrated"]).default("manual"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
      const id = nanoid();

      // If isPrimary, clear existing primary flags
      if (input.isPrimary) {
        await db
          .update(properties)
          .set({ isPrimary: false })
          .where(eq(properties.customerId, input.customerId));
      }

      await db.insert(properties).values({
        id,
        customerId: input.customerId,
        label: input.label,
        street: input.street,
        unit: input.unit,
        city: input.city,
        state: input.state,
        zip: input.zip,
        isPrimary: input.isPrimary,
        isBilling: input.isBilling,
        propertyNotes: input.propertyNotes ?? null,
        addressNotes: input.addressNotes ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        source: input.source,
      });

      const [created] = await db
        .select()
        .from(properties)
        .where(eq(properties.id, id))
        .limit(1);
      return created!;
    }),

  /** Update a property */
  update: protectedProcedure
    .input(propertyInput.partial().extend({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
      const { id, ...data } = input;

      const [existing] = await db
        .select()
        .from(properties)
        .where(eq(properties.id, id))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      // If setting as primary, clear others
      if (data.isPrimary) {
        await db
          .update(properties)
          .set({ isPrimary: false })
          .where(eq(properties.customerId, existing.customerId));
      }

      await db
        .update(properties)
        .set({ ...data })
        .where(eq(properties.id, id));

      const [updated] = await db
        .select()
        .from(properties)
        .where(eq(properties.id, id))
        .limit(1);
      return updated!;
    }),

  /** Delete a property (only if it has no linked opportunities) */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });

      const [linkedOpp] = await db
        .select({ id: opportunities.id })
        .from(opportunities)
        .where(eq(opportunities.propertyId, input.id))
        .limit(1);

      if (linkedOpp) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Cannot delete a property that has linked leads, estimates, or jobs. Archive them first.",
        });
      }

      await db.delete(properties).where(eq(properties.id, input.id));
      return { success: true };
    }),

  /** Set a property as the primary address for a customer */
  setPrimary: protectedProcedure
    .input(z.object({ id: z.string(), customerId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
      await db
        .update(properties)
        .set({ isPrimary: false })
        .where(eq(properties.customerId, input.customerId));
      await db
        .update(properties)
        .set({ isPrimary: true })
        .where(eq(properties.id, input.id));
      return { success: true };
    }),

  /** Get the health score for a property */
  getHealthScore: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
      const [prop] = await db
        .select()
        .from(properties)
        .where(eq(properties.id, input.id))
        .limit(1);
      if (!prop) throw new TRPCError({ code: "NOT_FOUND" });
      return computeHealthScore(prop.id, prop.customerId, prop.membershipId ?? null);
    }),

  /**
   * Enroll a property in a 360° membership.
   * Creates a new threeSixtyMembership record and links it to the property.
   */
  enrollMembership: protectedProcedure
    .input(
      z.object({
        propertyId: z.string(),
        customerId: z.string(),
        tier: z.enum(["bronze", "silver", "gold"]),
        cadence: z.enum(["monthly", "quarterly", "annual"]),
        notes: z.string().optional(),
        /** If enrolling via Stripe, pass the subscription ID */
        stripeSubscriptionId: z.string().optional(),
        stripeCustomerId: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });

      // Check if property already has an active membership
      const [prop] = await db
        .select()
        .from(properties)
        .where(eq(properties.id, input.propertyId))
        .limit(1);
      if (!prop) throw new TRPCError({ code: "NOT_FOUND" });

      if (prop.membershipId) {
        const [existing] = await db
          .select({ status: threeSixtyMemberships.status })
          .from(threeSixtyMemberships)
          .where(eq(threeSixtyMemberships.id, prop.membershipId))
          .limit(1);
        if (existing?.status === "active") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This property already has an active 360° membership.",
          });
        }
      }

      // Compute renewal date based on cadence
      const now = Date.now();
      const msPerDay = 86400000;
      const cadenceDays = { monthly: 30, quarterly: 90, annual: 365 };
      const renewalDate = now + cadenceDays[input.cadence] * msPerDay;

      // Labor bank initial credit (deferred for monthly silver/gold)
      const laborBankByTier = { bronze: 10000, silver: 20000, gold: 35000 }; // cents
      const isDeferred =
        input.cadence === "monthly" &&
        (input.tier === "silver" || input.tier === "gold");
      const initialBalance = isDeferred ? 0 : laborBankByTier[input.tier];
      const scheduledCreditAt = isDeferred ? now + 90 * msPerDay : null;
      const scheduledCreditCents = isDeferred ? laborBankByTier[input.tier] : 0;

      const [result] = await db
        .insert(threeSixtyMemberships)
        .values({
          customerId: input.customerId,
          hpCustomerId: input.customerId,
          tier: input.tier,
          status: "active",
          startDate: now,
          renewalDate,
          laborBankBalance: initialBalance,
          billingCadence: input.cadence,
          annualScanCompleted: false,
          planType: "single",
          stripeSubscriptionId: input.stripeSubscriptionId ?? null,
          stripeCustomerId: input.stripeCustomerId ?? null,
          scheduledCreditAt: scheduledCreditAt ?? undefined,
          scheduledCreditCents,
          notes: input.notes ?? null,
        });

      const membershipId = Number(result.insertId);

      // Link membership to property
      await db
        .update(properties)
        .set({ membershipId })
        .where(eq(properties.id, input.propertyId));

      const [created] = await db
        .select()
        .from(threeSixtyMemberships)
        .where(eq(threeSixtyMemberships.id, membershipId))
        .limit(1);

      return created!;
    }),

  /** Cancel the 360° membership for a property */
  cancelMembership: protectedProcedure
    .input(
      z.object({
        propertyId: z.string(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
      const [prop] = await db
        .select()
        .from(properties)
        .where(eq(properties.id, input.propertyId))
        .limit(1);
      if (!prop) throw new TRPCError({ code: "NOT_FOUND" });
      if (!prop.membershipId)
        throw new TRPCError({ code: "NOT_FOUND", message: "No active membership." });

      await db
        .update(threeSixtyMemberships)
        .set({
          status: "cancelled",
          notes: input.reason
            ? `Cancelled: ${input.reason}`
            : "Cancelled by staff",
        })
        .where(eq(threeSixtyMemberships.id, prop.membershipId));

      // Unlink from property (keep membershipId for history, just mark cancelled)
      return { success: true };
    }),

  /** Upgrade or downgrade the tier for a property's membership */
  changeTier: protectedProcedure
    .input(
      z.object({
        propertyId: z.string(),
        newTier: z.enum(["bronze", "silver", "gold"]),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
      const [prop] = await db
        .select()
        .from(properties)
        .where(eq(properties.id, input.propertyId))
        .limit(1);
      if (!prop) throw new TRPCError({ code: "NOT_FOUND" });
      if (!prop.membershipId)
        throw new TRPCError({ code: "NOT_FOUND", message: "No active membership." });

      await db
        .update(threeSixtyMemberships)
        .set({
          tier: input.newTier,
          notes: input.notes ?? null,
        })
        .where(eq(threeSixtyMemberships.id, prop.membershipId));

      return { success: true };
    }),

  /**
   * Auto-migrate: promote a customer's flat address fields to a Property record.
   * Idempotent — if a primary property already exists, returns it without creating a duplicate.
   */
  autoMigrateFromCustomer: protectedProcedure
    .input(
      z.object({
        customerId: z.string(),
        street: z.string(),
        unit: z.string().default(""),
        city: z.string(),
        state: z.string(),
        zip: z.string(),
        addressNotes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });

      // Check if primary property already exists
      const existing = await db
        .select()
        .from(properties)
        .where(
          and(
            eq(properties.customerId, input.customerId),
            eq(properties.isPrimary, true)
          )
        )
        .limit(1);

      if (existing.length > 0) return existing[0]!;

      // Create primary property from flat fields
      const id = nanoid();
      await db.insert(properties).values({
        id,
        customerId: input.customerId,
        label: "Home",
        street: input.street,
        unit: input.unit,
        city: input.city,
        state: input.state,
        zip: input.zip,
        isPrimary: true,
        isBilling: true,
        addressNotes: input.addressNotes ?? null,
        source: "auto-migrated",
      });

      const [created] = await db
        .select()
        .from(properties)
        .where(eq(properties.id, id))
        .limit(1);
      return created!;
    }),
});
