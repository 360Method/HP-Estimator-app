import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { auditEstimateDraft, prioritizeBaselineFindings, recommendOpportunityNextStep } from "../lib/aiBrain/opportunityBrain";
import { classifyAiError, isAiOfflineCode } from "../lib/aiProviderError";

type BrainHealth = {
  ok: boolean;
  status: "online" | "offline_auth" | "degraded" | "no_key";
  checkedAt: string;
};

const HEALTH_CACHE_MS = 5 * 60 * 1000;
const HEALTH_PROBE_MODEL = "claude-haiku-4-5-20251001";
let healthCache: { result: BrainHealth; at: number } | null = null;

/**
 * Cheap "is the brain alive" probe: a ~1-token call that distinguishes a
 * dead key/billing (human must act) from a busy provider (retry). Cached so
 * page mounts don't burn tokens.
 */
async function probeBrainHealth(): Promise<BrainHealth> {
  const now = Date.now();
  if (healthCache && now - healthCache.at < HEALTH_CACHE_MS) return healthCache.result;

  let result: BrainHealth;
  if (!process.env.ANTHROPIC_API_KEY) {
    result = { ok: false, status: "no_key", checkedAt: new Date().toISOString() };
  } else {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 5_000, maxRetries: 0 });
      await client.messages.create({
        model: HEALTH_PROBE_MODEL,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      });
      result = { ok: true, status: "online", checkedAt: new Date().toISOString() };
    } catch (err) {
      const { code } = classifyAiError(err);
      result = {
        ok: false,
        status: isAiOfflineCode(code) ? "offline_auth" : "degraded",
        checkedAt: new Date().toISOString(),
      };
    }
  }
  healthCache = { result, at: now };
  return result;
}

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
  /** Is the AI provider reachable and the key/billing alive? Cached 5 min. */
  health: protectedProcedure
    .input(z.object({ force: z.boolean().optional() }).optional())
    .query(async ({ input }) => {
      if (input?.force) healthCache = null;
      return probeBrainHealth();
    }),

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
