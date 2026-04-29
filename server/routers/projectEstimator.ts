/**
 * Project Estimator router — Book Consultation pipeline.
 *
 * Procedures:
 *   submitFromOnlineRequest (internal, called by booking.submit) — runs the
 *     orchestrator after a /book lands. Returns redirectUrl.
 *   getStatus (public, polled by the confirmation page).
 *   getProject (public) — full estimate for the customer-facing
 *     /portal/projects/:id page.
 *   markViewed / markProceed / markWalkthrough (public).
 *   listForCustomer (admin) — list all estimates for a customer.
 *   rerun (admin) — re-runs the worker for a given estimate id.
 *
 * Note: agent draft management (list/approve/reject/send) lives on the
 * existing agentDrafts router (`trpc.agentDrafts.*`) shipped in PR #44.
 * The Project Estimator pipeline simply inserts rows into that table; the
 * Lead Nurturer's UI handles the rest.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { projectEstimates } from "../../drizzle/schema.bookConsultation";
import { customers, opportunities, onlineRequests } from "../../drizzle/schema";
import {
  startProjectEstimate,
  rerunEstimatorWorker,
} from "../lib/projectEstimator/estimator";
import { pauseCadenceForCustomer } from "../lib/projectEstimator/cadence";

const internalSubmitInput = z.object({
  workerKey: z.string(),
  customerId: z.string(),
  opportunityId: z.string(),
  onlineRequestId: z.number().nullable(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email(),
  phone: z.string(),
  smsConsent: z.boolean(),
  serviceType: z.string(),
  description: z.string(),
  timeline: z.string(),
  street: z.string(),
  unit: z.string().default(""),
  city: z.string(),
  state: z.string(),
  zip: z.string(),
  photoUrls: z.array(z.string()).default([]),
});

export const projectEstimatorRouter = router({
  /** Internal — guarded by INTERNAL_WORKER_KEY. Called from booking.submit. */
  submitFromOnlineRequest: publicProcedure
    .input(internalSubmitInput)
    .mutation(async ({ input }) => {
      if (input.workerKey !== process.env.INTERNAL_WORKER_KEY) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { workerKey: _ignored, ...rest } = input;
      const result = await startProjectEstimate(db, rest);
      return result;
    }),

  /** Public — confirmation page polls this every 5s. */
  getStatus: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db
        .select()
        .from(projectEstimates)
        .where(eq(projectEstimates.id, input.id))
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return {
        id: row.id,
        status: row.status,
        confidence: row.confidence,
        rangeLow: row.customerRangeLowUsd,
        rangeHigh: row.customerRangeHighUsd,
        deliveredAt: row.deliveredAt,
      };
    }),

  /** Public — full project page data. */
  getProject: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db
        .select()
        .from(projectEstimates)
        .where(eq(projectEstimates.id, input.id))
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      const onlineRequest = row.onlineRequestId
        ? (
            await db
              .select()
              .from(onlineRequests)
              .where(eq(onlineRequests.id, row.onlineRequestId))
              .limit(1)
          )[0] ?? null
        : null;

      const customer = (
        await db
          .select()
          .from(customers)
          .where(eq(customers.id, row.customerId))
          .limit(1)
      )[0];

      return {
        id: row.id,
        status: row.status,
        confidence: row.confidence,
        scopeSummary: row.scopeSummary,
        rangeLow: row.customerRangeLowUsd,
        rangeHigh: row.customerRangeHighUsd,
        inclusionsMd: row.inclusionsMd,
        viewedAt: row.viewedAt,
        proceedClickedAt: row.proceedClickedAt,
        walkthroughRequestedAt: row.walkthroughRequestedAt,
        firstName: customer?.firstName ?? "",
        serviceType: onlineRequest?.serviceType ?? "Project request",
        propertyAddress: onlineRequest
          ? [
              onlineRequest.street,
              onlineRequest.city,
              onlineRequest.state,
            ]
              .filter(Boolean)
              .join(", ")
          : "",
        photos: onlineRequest
          ? (() => {
              try {
                return JSON.parse(onlineRequest.photoUrls ?? "[]");
              } catch {
                return [];
              }
            })()
          : [],
      };
    }),

  /** Public — fired the first time the portal page loads. */
  markViewed: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(projectEstimates)
        .set({ viewedAt: new Date() })
        .where(eq(projectEstimates.id, input.id));
      return { ok: true };
    }),

  /** Public — customer clicks "Proceed". Pauses cadence + redirects to scheduler. */
  markProceed: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db
        .select()
        .from(projectEstimates)
        .where(eq(projectEstimates.id, input.id))
        .limit(1);
      const row = rows[0];
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      await db
        .update(projectEstimates)
        .set({ proceedClickedAt: new Date() })
        .where(eq(projectEstimates.id, input.id));

      await pauseCadenceForCustomer(db, {
        customerId: row.customerId,
        reason: "estimate.approved",
        opportunityId: row.opportunityId,
      });

      // Best-effort notify owner so they can pick up the project.
      try {
        const { notifyOwner } = await import("../_core/notification");
        await notifyOwner({
          title: "Customer ready to proceed on a project",
          content: [
            `Estimate id: ${input.id}`,
            `Range: $${row.customerRangeLowUsd?.toLocaleString() ?? "?"}–$${row.customerRangeHighUsd?.toLocaleString() ?? "?"}`,
            `Customer id: ${row.customerId}`,
          ].join("\n"),
        });
      } catch {
        /* non-fatal */
      }

      const schedulerUrl = `${process.env.PORTAL_BASE_URL || "https://client.handypioneers.com"}/portal/appointments?source=project&projectId=${input.id}`;
      return { schedulerUrl };
    }),

  /** Public — customer requests an in-person walkthrough first. */
  markWalkthrough: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(projectEstimates)
        .set({ walkthroughRequestedAt: new Date() })
        .where(eq(projectEstimates.id, input.id));
      const schedulerUrl = `${process.env.PORTAL_BASE_URL || "https://client.handypioneers.com"}/portal/appointments?source=walkthrough&projectId=${input.id}`;
      return { schedulerUrl };
    }),

  // ─── Admin ─────────────────────────────────────────────────────────────
  rerun: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await rerunEstimatorWorker(db, input.id);
      return { ok: true };
    }),

  /** List all estimates for a customer (admin). */
  listForCustomer: protectedProcedure
    .input(z.object({ customerId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return await db
        .select()
        .from(projectEstimates)
        .where(eq(projectEstimates.customerId, input.customerId))
        .orderBy(desc(projectEstimates.createdAt));
    }),

  /**
   * Estimates that need the operator's review for this customer (status =
   * needs_review or needs_info). Surfaced inside the customer profile's
   * Pending Your Review section.
   */
  listPendingForCustomer: protectedProcedure
    .input(z.object({ customerId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(projectEstimates)
        .where(eq(projectEstimates.customerId, input.customerId))
        .orderBy(desc(projectEstimates.createdAt));
      return rows.filter(
        (r) => r.status === "needs_review" || r.status === "needs_info",
      );
    }),

  /**
   * Operator-side: approve a needs_review estimate as-is or with edits.
   * Flips status → delivered, stamps deliveredAt, and updates customer-facing
   * fields if the operator tweaked them.
   */
  approveProject: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        scopeSummary: z.string().optional(),
        inclusionsMd: z.string().optional(),
        rangeLow: z.number().optional(),
        rangeHigh: z.number().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const patch: Record<string, unknown> = {
        status: "delivered",
        deliveredAt: new Date(),
        updatedAt: new Date(),
      };
      if (input.scopeSummary !== undefined) patch.scopeSummary = input.scopeSummary;
      if (input.inclusionsMd !== undefined) patch.inclusionsMd = input.inclusionsMd;
      if (input.rangeLow !== undefined) patch.customerRangeLowUsd = input.rangeLow;
      if (input.rangeHigh !== undefined) patch.customerRangeHighUsd = input.rangeHigh;
      await db
        .update(projectEstimates)
        .set(patch)
        .where(eq(projectEstimates.id, input.id));
      return { ok: true };
    }),

  /**
   * Operator-side: reject (kill) a draft estimate. Sets failureReason for
   * audit. The customer never sees it.
   */
  rejectProject: protectedProcedure
    .input(z.object({ id: z.string(), reason: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(projectEstimates)
        .set({
          status: "failed",
          failureReason: input.reason ?? "rejected_by_operator",
          updatedAt: new Date(),
        })
        .where(eq(projectEstimates.id, input.id));
      return { ok: true };
    }),
});

export type ProjectEstimatorRouter = typeof projectEstimatorRouter;
