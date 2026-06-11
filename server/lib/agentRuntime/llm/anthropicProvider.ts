/**
 * server/lib/agentRuntime/llm/anthropicProvider.ts
 *
 * Anthropic implementation of the LlmProvider seam. Wraps @anthropic-ai/sdk
 * exactly the way runtime.ts used to call it directly: cache_control on the
 * system prompt (charter cached across turns AND runs, 5-minute TTL), tools
 * passed through, and content blocks mapped to the provider-neutral shape.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  LlmCompleteRequest,
  LlmCompletion,
  LlmContentBlock,
  LlmProvider,
  LlmStopReason,
} from "./provider";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
    client = new Anthropic({ apiKey });
  }
  return client;
}

function mapStopReason(reason: string | null): LlmStopReason {
  switch (reason) {
    case "end_turn":
    case "tool_use":
    case "max_tokens":
    case "stop_sequence":
      return reason;
    default:
      return "other";
  }
}

export const anthropicProvider: LlmProvider = {
  name: "anthropic",

  async complete(req: LlmCompleteRequest): Promise<LlmCompletion> {
    const response = await getClient().messages.create({
      model: req.model,
      max_tokens: req.maxTokens,
      system: [
        { type: "text", text: req.system, cache_control: { type: "ephemeral" } },
      ],
      tools: req.tools && req.tools.length > 0 ? (req.tools as Anthropic.Tool[]) : undefined,
      messages: req.messages as Anthropic.MessageParam[],
    });

    const content: LlmContentBlock[] = [];
    for (const block of response.content) {
      if (block.type === "text") {
        content.push({ type: "text", text: block.text });
      } else if (block.type === "tool_use") {
        content.push({
          type: "tool_use",
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
      // Other block types (thinking, server tools) are not produced by the
      // models/params the runtime uses; ignore rather than crash if they appear.
    }

    return {
      content,
      stopReason: mapStopReason(response.stop_reason),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  },
};
