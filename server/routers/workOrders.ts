/**
 * workOrders.ts — tRPC router for 360° Work Orders
 *
 * Work orders are the atomic unit of every 360° service event.
 * They are created automatically on enrollment (baseline_scan) and
 * after baseline completion (seasonal visits).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createWorkOrder,
  getWorkOrder,
  listWorkOrders,
  updateWorkOrder,
  createOpportunity,
  updateOpportunity,
  getDb,
} from "../db";
import {
  threeSixtyWorkOrders,
  threeSixtyMemberships,
  threeSixtyLaborBankTransactions,
  portalReports,
  portalCustomers,
  portalEstimates,
  opportunities,
  properties,
  users,
} from "../../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import { sendEmail } from "../gmail";
import { notifyOwner } from "../_core/notification";
import { nanoid } from "nanoid";
import { TIER_DEFINITIONS } from "../../shared/threeSixtyTiers";

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** All four seasons in calendar order */
const SEASON_ORDER = ["spring", "summer", "fall", "winter"] as const;
type Season = (typeof SEASON_ORDER)[number];

/** Returns the seasons a tier is entitled to, based on seasonalVisits count */
function getSeasonsForTier(tier: string): Season[] {
  const def = TIER_DEFINITIONS[tier as keyof typeof TIER_DEFINITIONS];
  if (!def) return ["spring", "fall"];
  if (def.seasonalVisits >= 4) return ["spring", "summer", "fall", "winter"];
  // 2 visits → spring + fall
  return ["spring", "fall"];
}

/** Format cents as "$X.XX" */
function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ─── ROUTER ──────────────────────────────────────────────────────────────────

export const workOrdersRouter = router({
  /** List all work orders for a membership */
  list: protectedProcedure
    .input(z.object({ membershipId: z.number() }))
    .query(async ({ input }) => {
      return listWorkOrders(input.membershipId);
    }),

  /** Get a single work order */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const wo = await getWorkOrder(input.id);
      if (!wo) throw new TRPCError({ code: "NOT_FOUND" });
      return wo;
    }),

  /** Schedule a work order — set date, assigned techs, update schedule event */
  schedule: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        scheduledDate: z.number(), // Unix ms
        assignedTo: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const wo = await getWorkOrder(input.id);
      if (!wo) throw new TRPCError({ code: "NOT_FOUND" });
      if (wo.status === "completed" || wo.status === "skipped") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot reschedule a completed or skipped work order." });
      }

      await updateWorkOrder(input.id, {
        status: "scheduled",
        scheduledDate: input.scheduledDate,
        assignedTo: input.assignedTo ? JSON.stringify(input.assignedTo) : wo.assignedTo,
      });

      // Auto-create a linked CRM job so it appears in the customer Jobs tab and Calendar
      // Only create if one doesn't already exist for this work order
      if (!wo.hpOpportunityId) {
        try {
          const db = await getDb();
          if (db) {
            const [membership] = await db
              .select()
              .from(threeSixtyMemberships)
              .where(eq(threeSixtyMemberships.id, wo.membershipId))
              .limit(1);
            if (membership?.hpCustomerId) {
              const WO_TYPE_LABELS: Record<string, string> = {
                baseline_scan: 'Baseline Scan',
                spring: 'Spring Visit',
                summer: 'Summer Visit',
                fall: 'Fall Visit',
                winter: 'Winter Visit',
              };
              const visitLabel = WO_TYPE_LABELS[wo.type] ?? wo.type;
              const jobId = nanoid();
              const scheduledDateStr = new Date(input.scheduledDate).toISOString();
              await createOpportunity({
                id: jobId,
                customerId: membership.hpCustomerId,
                area: 'job',
                stage: 'Scheduled',
                title: `360° ${visitLabel} — ${wo.visitYear}`,
                value: 0,
                scheduledDate: scheduledDateStr,
                assignedTo: input.assignedTo ? JSON.stringify(input.assignedTo) : null,
                membershipId: wo.membershipId,
                propertyId: membership.propertyAddressId ? String(membership.propertyAddressId) : null,
                notes: `Auto-created from 360° Work Order #${wo.id}`,
              });
              await updateWorkOrder(input.id, { hpOpportunityId: jobId });
            }
          }
        } catch (err) {
          console.error('[WorkOrders] Failed to auto-create linked job on schedule:', err);
        }
      }

      // Send customer scheduling confirmation email
      try {
        const db = await getDb();
        if (db) {
          const [membership] = await db
            .select()
            .from(threeSixtyMemberships)
            .where(eq(threeSixtyMemberships.id, wo.membershipId))
            .limit(1);
          if (membership?.stripeCustomerId) {
            const [pc] = await db
              .select()
              .from(portalCustomers)
              .where(eq(portalCustomers.stripeCustomerId, membership.stripeCustomerId))
              .limit(1);
            if (pc?.email) {
              const visitDate = new Date(input.scheduledDate);
              const dateStr = visitDate.toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              });
              const timeStr = visitDate.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              });
              const typeLabel =
                wo.type === "baseline_scan"
                  ? "Annual 360° Home Scan"
                  : `${wo.type.charAt(0).toUpperCase() + wo.type.slice(1)} 360° Visit`;
              await sendEmail({
                to: pc.email,
                subject: `Your ${typeLabel} is Scheduled — ${dateStr}`,
                html: `
                  <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
                    <h2 style="color:#1a1a1a;">Your ${typeLabel} is Confirmed</h2>
                    <p>Hi ${pc.name || "there"},</p>
                    <p>Great news — your Handy Pioneers 360° visit has been scheduled:</p>
                    <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;">
                      <strong>Date:</strong> ${dateStr}<br/>
                      <strong>Time:</strong> ${timeStr}<br/>
                      <strong>Visit Type:</strong> ${typeLabel}
                    </div>
                    <p>Our technician will perform a thorough inspection of your home and provide you with a detailed report.</p>
                    <p>If you need to reschedule, please reply to this email or call us at (720) 900-4269.</p>
                    <p>— The Handy Pioneers Team</p>
                  </div>
                `,
              });
            }
          }
        }
      } catch (err) {
        console.error("[WorkOrders] Failed to send scheduling email:", err);
      }

      return { success: true };
    }),

  /** Mark a work order as in-progress */
  start: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const wo = await getWorkOrder(input.id);
      if (!wo) throw new TRPCError({ code: "NOT_FOUND" });
      await updateWorkOrder(input.id, { status: "in_progress" });
      return { success: true };
    }),

  /**
   * Complete a work order.
   * - If baseline_scan: auto-creates seasonal work orders for the year.
   * - If seasonal: creates portal report, sends customer email, creates estimate stubs for flagged items.
   */
  complete: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        inspectionItems: z.array(
          z.object({
            id: z.string(),
            section: z.string(),
            item: z.string(),
            condition: z.enum(["good", "fair", "repair_needed", "urgent", "na"]),
            notes: z.string().optional(),
            photoUrls: z.array(z.string()).optional(),
            estimatedCostLow: z.number().optional(),
            estimatedCostHigh: z.number().optional(),
          })
        ),
        laborBankUsed: z.number().default(0),
        technicianNotes: z.string().optional(),
        healthScore: z.number().min(0).max(100).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const wo = await getWorkOrder(input.id);
      if (!wo) throw new TRPCError({ code: "NOT_FOUND" });

      const now = Date.now();

      // Mark work order completed
      await updateWorkOrder(input.id, {
        status: "completed",
        completedDate: now,
        inspectionItemsJson: JSON.stringify(input.inspectionItems),
        laborBankUsed: input.laborBankUsed,
        technicianNotes: input.technicianNotes,
      });

      // Get membership
      const [membership] = await db
        .select()
        .from(threeSixtyMemberships)
        .where(eq(threeSixtyMemberships.id, wo.membershipId))
        .limit(1);
      if (!membership) throw new TRPCError({ code: "NOT_FOUND", message: "Membership not found" });

      // Deduct labor bank if used
      if (input.laborBankUsed > 0) {
        await db.insert(threeSixtyLaborBankTransactions).values({
          membershipId: wo.membershipId,
          type: "debit",
          amountCents: input.laborBankUsed,
          description: `Labor used during ${wo.type === "baseline_scan" ? "baseline scan" : `${wo.type} visit`}`,
          createdAt: new Date(),
        });
        const newBalance = (membership.laborBankBalance ?? 0) - input.laborBankUsed;
        await db
          .update(threeSixtyMemberships)
          .set({ laborBankBalance: Math.max(0, newBalance) })
          .where(eq(threeSixtyMemberships.id, wo.membershipId));
      }

      // ── BASELINE SCAN COMPLETION ──────────────────────────────────────────
      if (wo.type === "baseline_scan") {
        // Mark annual scan completed on membership
        await db
          .update(threeSixtyMemberships)
          .set({ annualScanCompleted: true })
          .where(eq(threeSixtyMemberships.id, wo.membershipId));

        // Auto-create seasonal work orders for the year
        const seasons = getSeasonsForTier(membership.tier ?? "bronze");
        const year = new Date().getFullYear();
        for (const season of seasons) {
          // Check if one already exists for this year/season
          const existing = await db
            .select({ id: threeSixtyWorkOrders.id })
            .from(threeSixtyWorkOrders)
            .where(
              and(
                eq(threeSixtyWorkOrders.membershipId, wo.membershipId),
                eq(threeSixtyWorkOrders.type, season),
                eq(threeSixtyWorkOrders.visitYear, year),
              )
            )
            .limit(1);
          if (existing.length === 0) {
            await db.insert(threeSixtyWorkOrders).values({
              membershipId: wo.membershipId,
              customerId: wo.customerId,
              type: season,
              status: "open",
              visitYear: year,
            });
          }
        }

        await notifyOwner({
          title: `✅ 360° Baseline Scan Completed`,
          content: `Baseline scan completed for membership #${wo.membershipId}. ${seasons.length} seasonal work orders have been auto-created for ${year}.`,
        }).catch(() => null);
        return { success: true, seasonalWorkOrdersCreated: seasons.length };
      }

      // ── SEASONAL VISIT COMPLETION ──────────────────────────────────────────────────────
      // Get portal customer via stripeCustomerId
      let portalCustomerId: number | null = null;
      let portalReportId: number | null = null;

      if (membership.stripeCustomerId) {
        const [pcLookup] = await db
          .select()
          .from(portalCustomers)
          .where(eq(portalCustomers.stripeCustomerId, membership.stripeCustomerId))
          .limit(1);
        if (pcLookup) portalCustomerId = pcLookup.id;
      }

      if (portalCustomerId) {
        const [pc] = await db
          .select()
          .from(portalCustomers)
          .where(eq(portalCustomers.id, portalCustomerId))
          .limit(1);

        const flaggedItems = input.inspectionItems.filter(
          (i) => i.condition === "repair_needed" || i.condition === "urgent"
        );

        // Build report JSON
        const reportJson = JSON.stringify({
          workOrderId: wo.id,
          visitType: wo.type,
          visitYear: wo.visitYear,
          healthScore: input.healthScore ?? null,
          technicianNotes: input.technicianNotes ?? null,
          items: input.inspectionItems,
          flaggedCount: flaggedItems.length,
          laborBankUsed: input.laborBankUsed,
          completedAt: now,
        });

        // Create portal report
        const [reportResult] = await db.insert(portalReports).values({
          portalCustomerId,
          scanId: 0, // work-order-based reports don't have a scan ID
          membershipId: wo.membershipId,
          hpCustomerId: parseInt(wo.customerId) || 0,
          healthScore: input.healthScore ?? null,
          reportJson,
          sentAt: now,
        });
        portalReportId = (reportResult as any).insertId as number;

        // Link report to work order
        await updateWorkOrder(input.id, { portalReportId });

        // Create portal estimate stubs + internal CRM estimates for flagged items
        let estimateCount = 0;
        for (const item of flaggedItems) {
          try {
            const estimateNumber = `360-${wo.membershipId}-${nanoid(6).toUpperCase()}`;
            const totalAmount = item.estimatedCostHigh
              ? Math.round((item.estimatedCostLow ?? 0 + item.estimatedCostHigh) / 2)
              : (item.estimatedCostLow ?? 0);
            // Portal estimate stub
            const [portalEstResult] = await db.insert(portalEstimates).values({
              customerId: portalCustomerId,
              estimateNumber,
              title: `${item.item} — ${item.section}`,
              status: "sent",
              totalAmount,
              depositAmount: Math.round(totalAmount * 0.5),
              depositPercent: 50,
              lineItemsJson: JSON.stringify([
                {
                  id: nanoid(),
                  description: item.item,
                  notes: item.notes ?? "",
                  quantity: 1,
                  unitPrice: totalAmount,
                  total: totalAmount,
                },
              ]),
              scopeOfWork: `360° Inspection Finding — ${item.section}\n\n${item.notes ?? ""}`.trim(),
            });
            // Internal CRM estimate — stamped with membershipId + propertyId
            const crmOppId = `360-${nanoid(10)}`;
            await createOpportunity({
              id: crmOppId,
              customerId: wo.customerId,
              area: "estimate",
              stage: "Draft",
              title: `360° Flagged Repair — ${item.item} (${item.section})`,
              value: totalAmount,
              membershipId: wo.membershipId,
              propertyId: membership.propertyAddressId ? String(membership.propertyAddressId) : null,
              notes: `Auto-created from 360° work order #${wo.id}.\n\nSection: ${item.section}\nItem: ${item.item}\nCondition: ${item.condition}\n${item.notes ? `Notes: ${item.notes}` : ""}`.trim(),
            });
            // Write back hpOpportunityId to work order (last created wins)
            await updateWorkOrder(input.id, { hpOpportunityId: crmOppId });
            estimateCount++;
          } catch (err) {
            console.error("[WorkOrders] Failed to create estimate stub:", err);
          }
        }

        // Send customer email with report
        if (pc?.email) {
          const typeLabel = `${wo.type.charAt(0).toUpperCase() + wo.type.slice(1)} 360° Visit`;
          const flaggedSummary =
            flaggedItems.length > 0
              ? `<p><strong>${flaggedItems.length} item${flaggedItems.length > 1 ? "s" : ""} flagged</strong> for follow-up — estimates have been added to your portal for review.</p>`
              : `<p>Everything looks great — no items flagged for follow-up.</p>`;
          const laborNote =
            input.laborBankUsed > 0
              ? `<p>Labor bank used this visit: <strong>${formatCents(input.laborBankUsed)}</strong>. Remaining balance: <strong>${formatCents(Math.max(0, (membership.laborBankBalance ?? 0) - input.laborBankUsed))}</strong>.</p>`
              : "";

          await sendEmail({
            to: pc.email,
            subject: `Your ${typeLabel} Report is Ready`,
            html: `
              <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
                <h2 style="color:#1a1a1a;">Your 360° Visit Report is Ready</h2>
                <p>Hi ${pc.name || "there"},</p>
                <p>Your <strong>${typeLabel}</strong> has been completed. Here's a summary:</p>
                ${input.healthScore != null ? `<div style="background:#f0fdf4;padding:16px;border-radius:8px;margin:16px 0;"><strong>Home Health Score:</strong> ${input.healthScore}/100</div>` : ""}
                ${flaggedSummary}
                ${laborNote}
                <p>View your full report with photos in your customer portal:</p>
                <a href="https://pro.handypioneers.com/portal/reports" style="display:inline-block;background:#16a34a;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin:8px 0;">View Full Report</a>
                <p style="margin-top:24px;">Thank you for being a Handy Pioneers 360° member. We're committed to keeping your home in top shape.</p>
                <p>— The Handy Pioneers Team</p>
              </div>
            `,
          }).catch((err: Error) => console.error("[WorkOrders] Failed to send report email:", err));
        }
      }

      // Advance next seasonal work order to "open" if it's still not created
      // (in case baseline was skipped and seasons were pre-created)
      const currentSeasonIdx = SEASON_ORDER.indexOf(wo.type as Season);
      if (currentSeasonIdx >= 0) {
        const nextSeason = SEASON_ORDER[(currentSeasonIdx + 1) % SEASON_ORDER.length];
        const nextYear = nextSeason === "spring" && wo.type === "winter" ? wo.visitYear + 1 : wo.visitYear;
        const [nextWo] = await db
          .select()
          .from(threeSixtyWorkOrders)
          .where(
            and(
              eq(threeSixtyWorkOrders.membershipId, wo.membershipId),
              eq(threeSixtyWorkOrders.type, nextSeason),
              eq(threeSixtyWorkOrders.visitYear, nextYear),
            )
          )
          .limit(1);
        if (!nextWo) {
          // Create it if missing
          await db.insert(threeSixtyWorkOrders).values({
            membershipId: wo.membershipId,
            customerId: wo.customerId,
            type: nextSeason,
            status: "open",
            visitYear: nextYear,
          });
        }
      }

      // ── WRITE BACK hpOpportunityId: find the most recent opportunity linked to this membership ──
      // This covers the case where an estimate was already created from a prior flagged item
      // and we want to surface it on the work order for cross-navigation.
      try {
        const [linkedOpp] = await db
          .select({ id: opportunities.id })
          .from(opportunities)
          .where(eq(opportunities.membershipId, wo.membershipId))
          .orderBy(desc(opportunities.createdAt))
          .limit(1);
        if (linkedOpp) {
          await updateWorkOrder(input.id, { hpOpportunityId: linkedOpp.id });
        }
      } catch (_) { /* non-blocking */ }

      return { success: true, portalReportId };
    }),

  /** Skip a work order with a reason */
  skip: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ input }) => {
      const wo = await getWorkOrder(input.id);
      if (!wo) throw new TRPCError({ code: "NOT_FOUND" });
      await updateWorkOrder(input.id, {
        status: "skipped",
        skipReason: input.reason ?? "No reason provided",
        completedDate: Date.now(),
      });
      return { success: true };
    }),

  /** List all staff users for tech assignment dropdown */
  listStaff: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];
      const staff = await db.select({ id: users.id, name: users.name, openId: users.openId }).from(users);
      return staff;
    }),

  /** Update assigned techs and notes without changing status */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        assignedTo: z.array(z.string()).optional(),
        technicianNotes: z.string().optional(),
        scheduledDate: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const wo = await getWorkOrder(input.id);
      if (!wo) throw new TRPCError({ code: "NOT_FOUND" });
      const patch: Record<string, unknown> = {};
      if (input.assignedTo !== undefined) patch.assignedTo = JSON.stringify(input.assignedTo);
      if (input.technicianNotes !== undefined) patch.technicianNotes = input.technicianNotes;
      if (input.scheduledDate !== undefined) patch.scheduledDate = input.scheduledDate;
      if (Object.keys(patch).length > 0) await updateWorkOrder(input.id, patch as any);
      return { success: true };
    }),
});
