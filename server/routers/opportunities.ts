/**
 * Opportunities router — DB-backed CRUD for leads, estimates, and jobs.
 * All procedures are protectedProcedure (admin-only).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import {
  listOpportunities,
  getOpportunityById,
  createOpportunity,
  updateOpportunity,
  deleteOpportunity,
} from "../db";
import { nanoid } from "nanoid";

const OpportunityInput = z.object({
  customerId: z.string(),
  area: z.enum(["lead", "estimate", "job"]).default("lead"),
  stage: z.string().default("New Lead"),
  title: z.string().default(""),
  value: z.number().default(0),
  jobNumber: z.string().optional(),
  notes: z.string().optional(),
  archived: z.boolean().default(false),
  archivedAt: z.string().optional(),
  sourceLeadId: z.string().optional(),
  sourceEstimateId: z.string().optional(),
  convertedToEstimateAt: z.string().optional(),
  convertedToJobAt: z.string().optional(),
  sentAt: z.string().optional(),
  wonAt: z.string().optional(),
  scheduledDate: z.string().optional(),
  scheduledEndDate: z.string().optional(),
  scheduledDuration: z.number().optional(),
  assignedTo: z.string().optional(),
  scheduleNotes: z.string().optional(),
  estimateSnapshot: z.string().optional(), // JSON string
  tasks: z.string().optional(),            // JSON string
  attachments: z.string().optional(),      // JSON string
  jobActivity: z.string().optional(),      // JSON string
  clientSnapshot: z.string().optional(),   // JSON string
  signedEstimateUrl: z.string().optional(),
  signedEstimateFilename: z.string().optional(),
  completionSignatureUrl: z.string().optional(),
  completionSignedBy: z.string().optional(),
  completionSignedAt: z.string().optional(),
  sowDocument: z.string().optional(),
  sowGeneratedAt: z.string().optional(),
  onlineRequestId: z.number().optional(),
});

export const opportunitiesRouter = router({
  /** List opportunities, optionally filtered by area, customerId, or archived status */
  list: protectedProcedure
    .input(z.object({
      area: z.enum(["lead", "estimate", "job"]).optional(),
      customerId: z.string().optional(),
      archived: z.boolean().default(false),
      limit: z.number().default(500),
    }))
    .query(async ({ input }) => {
      return listOpportunities(input.area, input.customerId, input.archived, input.limit);
    }),

  /** Get a single opportunity by ID */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const opp = await getOpportunityById(input.id);
      if (!opp) throw new TRPCError({ code: "NOT_FOUND", message: "Opportunity not found" });
      return opp;
    }),

  /** Create a new opportunity */
  create: protectedProcedure
    .input(OpportunityInput)
    .mutation(async ({ input }) => {
      const id = nanoid();
      return createOpportunity({ id, ...input });
    }),

  /** Update an existing opportunity */
  update: protectedProcedure
    .input(z.object({ id: z.string() }).merge(OpportunityInput.partial()))
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      const existing = await getOpportunityById(id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Opportunity not found" });
      await updateOpportunity(id, rest);
      return getOpportunityById(id);
    }),

  /** Delete an opportunity */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await deleteOpportunity(input.id);
      return { success: true };
    }),

  /** Archive an opportunity */
  archive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await updateOpportunity(input.id, {
        archived: true,
        archivedAt: new Date().toISOString(),
      });
      return { success: true };
    }),

  /** Move opportunity to a new stage */
  moveStage: protectedProcedure
    .input(z.object({ id: z.string(), stage: z.string(), area: z.enum(["lead", "estimate", "job"]).optional() }))
    .mutation(async ({ input }) => {
      const update: Record<string, unknown> = { stage: input.stage };
      if (input.area) update.area = input.area;
      await updateOpportunity(input.id, update);
      return { success: true };
    }),
});
