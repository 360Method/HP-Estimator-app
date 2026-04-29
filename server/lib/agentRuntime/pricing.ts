/**
 * server/lib/agentRuntime/pricing.ts
 *
 * Per-1M-token USD pricing for the Anthropic models we allow agents to run on.
 * Kept local so cost enforcement doesn't reach out to a live price list mid-run.
 * Numbers here are list price as of 2026-04; update as Anthropic's catalog moves.
 */

export type ModelPricing = {
  /** Input USD per 1M tokens. */
  inputPerMillion: number;
  /** Output USD per 1M tokens. */
  outputPerMillion: number;
};

const PRICING: Record<string, ModelPricing> = {
  "claude-haiku-4-5-20251001": { inputPerMillion: 1.0, outputPerMillion: 5.0 },
  "claude-haiku-4-5": { inputPerMillion: 1.0, outputPerMillion: 5.0 },
  "claude-sonnet-4-6": { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  "claude-sonnet-4-5": { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  "claude-opus-4-7": { inputPerMillion: 15.0, outputPerMillion: 75.0 },
  "claude-opus-4-6": { inputPerMillion: 15.0, outputPerMillion: 75.0 },
};

const FALLBACK: ModelPricing = { inputPerMillion: 3.0, outputPerMillion: 15.0 };

export function priceRun(args: {
  model: string;
  inputTokens: number;
  outputTokens: number;
}): number {
  const p = PRICING[args.model] ?? FALLBACK;
  const cost =
    (args.inputTokens / 1_000_000) * p.inputPerMillion +
    (args.outputTokens / 1_000_000) * p.outputPerMillion;
  return Math.round(cost * 10_000) / 10_000; // 4dp
}
