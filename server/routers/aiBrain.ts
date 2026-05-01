import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { recommendOpportunityNextStep } from "../lib/aiBrain/opportunityBrain";

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
});
