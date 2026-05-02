import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { auditEstimateDraft, prioritizeBaselineFindings, recommendOpportunityNextStep } from "../lib/aiBrain/opportunityBrain";

const baselineFindingInput = z.object({
  id: z.string().min(1),
  section: z.string().min(1),
  title: z.string().min(1),
  condition: z.string().min(1),
  severity: z.string().min(1),
  timeframe: z.string().min(1),
  impact: z.array(z.string()).default([]),
  notes: z.string().default(""),
  photoCount: z.number().int().min(0).default(0),
  needsSpecialist: z.boolean().default(false),
  createOpportunity: z.boolean().default(false),
});

const estimateSnapshotInput = z.object({}).catchall(z.unknown());

export const aiBrainRouter = router({
  recommendOpportunityNextStep: protectedProcedure
    .input(
      z.object({
        opportunityId: z.string().min(1),
        operatorQuestion: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await recommendOpportunityNextStep(input);
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "AI brain recommendation failed",
        });
      }
    }),

  prioritizeBaselineFindings: protectedProcedure
    .input(
      z.object({
        customerName: z.string().max(200).optional(),
        propertyAddress: z.string().max(500).optional(),
        consultantName: z.string().max(200).optional(),
        findings: z.array(baselineFindingInput).max(80),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await prioritizeBaselineFindings(input);
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Baseline prioritization failed",
        });
      }
    }),

  auditEstimateDraft: protectedProcedure
    .input(
      z.object({
        customerId: z.string().min(1).optional(),
        propertyId: z.string().nullable().optional(),
        opportunityId: z.string().min(1).optional(),
        estimateSnapshot: estimateSnapshotInput,
        consultantNotes: z.string().max(5000).optional(),
        findings: z.string().max(5000).optional(),
        photos: z.string().max(3000).optional(),
        proposalStyle: z.literal("single_with_alternates"),
      })
    )
    .mutation(async ({ input }) => {
      try {
        return await auditEstimateDraft(input);
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Estimate audit failed",
        });
      }
    }),
});
