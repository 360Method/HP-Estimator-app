/**
 * server/lib/agentRuntime/llm/index.ts
 *
 * Provider selection. `LLM_PROVIDER` picks the implementation (only
 * "anthropic" ships today — the seam is the deliverable, not a provider zoo).
 * Tests inject a fake via setLlmProviderForTests().
 */

import type { LlmProvider } from "./provider";
import { anthropicProvider } from "./anthropicProvider";

export type {
  LlmProvider,
  LlmCompleteRequest,
  LlmCompletion,
  LlmContentBlock,
  LlmMessage,
  LlmStopReason,
  LlmTextBlock,
  LlmToolDef,
  LlmToolResultBlock,
  LlmToolUseBlock,
} from "./provider";

let testOverride: LlmProvider | null = null;

export function setLlmProviderForTests(provider: LlmProvider | null): void {
  testOverride = provider;
}

export function getLlmProvider(name: string = process.env.LLM_PROVIDER ?? "anthropic"): LlmProvider {
  if (testOverride) return testOverride;
  switch (name) {
    case "anthropic":
      return anthropicProvider;
    default:
      console.warn(`[llm] Unknown LLM_PROVIDER '${name}' — falling back to anthropic.`);
      return anthropicProvider;
  }
}
