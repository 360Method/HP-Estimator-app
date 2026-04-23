/**
 * pipelineEvents router — read-only audit log of opportunity transitions.
 * Writes happen inside leadRouting.ts — never from the client.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { listPipelineEventsFor } from "../leadRouting";

export const pipelineEventsRouter = router({
  /** Every recorded event for a single opportunity, newest first. */
  list: protectedProcedure
    .input(z.object({
      opportunityId: z.string(),
      limit: z.number().min(1).max(200).default(50),
    }))
    .query(async ({ input }) => {
      return listPipelineEventsFor(input.opportunityId, input.limit);
    }),
});
