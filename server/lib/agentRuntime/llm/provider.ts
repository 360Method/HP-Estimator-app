/**
 * server/lib/agentRuntime/llm/provider.ts
 *
 * Provider-neutral LLM interface for the agent runtime. The shape mirrors
 * exactly what the tool loop in runtime.ts consumes — content blocks, a stop
 * reason, and token usage — so any provider (Anthropic today, anything else
 * later) can be plugged in behind `getLlmProvider()` without touching the
 * runtime. This seam is the point: the app is not married to one AI vendor.
 */

export type LlmTextBlock = { type: "text"; text: string };

export type LlmToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type LlmContentBlock = LlmTextBlock | LlmToolUseBlock;

export type LlmToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
};

export type LlmMessage = {
  role: "user" | "assistant";
  content: string | Array<LlmContentBlock | LlmToolResultBlock>;
};

/** Structurally compatible with Anthropic.Tool — name, description, input_schema. */
export type LlmToolDef = {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
};

export type LlmStopReason = "end_turn" | "tool_use" | "max_tokens" | "stop_sequence" | "other";

export type LlmCompletion = {
  content: LlmContentBlock[];
  stopReason: LlmStopReason;
  usage: { inputTokens: number; outputTokens: number };
};

export type LlmCompleteRequest = {
  model: string;
  /** System prompt. Providers should cache it where supported. */
  system: string;
  maxTokens: number;
  tools?: LlmToolDef[];
  messages: LlmMessage[];
};

export interface LlmProvider {
  readonly name: string;
  complete(req: LlmCompleteRequest): Promise<LlmCompletion>;
}
