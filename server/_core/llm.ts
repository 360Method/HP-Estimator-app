import { ENV } from "./env";

// ─────────────────────────────────────────────────────────────────────────────
// Shared LLM interface — historically OpenAI-shaped so many call sites already
// destructure `response.choices[0].message.content`. We keep that contract and
// translate to/from Anthropic's Messages API internally.
// ─────────────────────────────────────────────────────────────────────────────

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  model?: string;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  systemOverride?: string;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_TOKENS = 4096;

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const stringifyPart = (part: MessageContent): string => {
  if (typeof part === "string") return part;
  if (part.type === "text") return part.text;
  if (part.type === "image_url") return `[image: ${part.image_url.url}]`;
  if (part.type === "file_url") return `[file: ${part.file_url.url}]`;
  return "";
};

const messageToText = (message: Message): string =>
  ensureArray(message.content).map(stringifyPart).join("\n");

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string;
};

type AnthropicResponse = {
  id: string;
  model: string;
  role: "assistant";
  content: Array<{ type: string; text?: string }>;
  stop_reason: string | null;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
};

const buildAnthropicPayload = (params: InvokeParams) => {
  const systemParts: string[] = [];
  const anthropicMessages: AnthropicMessage[] = [];

  for (const m of params.messages) {
    if (m.role === "system") {
      systemParts.push(messageToText(m));
      continue;
    }

    if (m.role === "tool" || m.role === "function") {
      anthropicMessages.push({
        role: "user",
        content: `[tool result${m.name ? ` from ${m.name}` : ""}]\n${messageToText(m)}`,
      });
      continue;
    }

    anthropicMessages.push({
      role: m.role === "assistant" ? "assistant" : "user",
      content: messageToText(m),
    });
  }

  const rf = params.responseFormat || params.response_format;
  const schema = params.outputSchema || params.output_schema;

  if (rf?.type === "json_schema" || rf?.type === "json_object" || schema) {
    let instruction =
      "Respond with a single JSON object. Output ONLY valid JSON — no prose, no markdown fences, no comments.";
    const targetSchema = rf?.type === "json_schema" ? rf.json_schema : schema;
    if (targetSchema?.schema) {
      instruction += `\nJSON Schema:\n${JSON.stringify(targetSchema.schema)}`;
    }
    systemParts.push(instruction);
  }

  if (params.systemOverride) {
    systemParts.unshift(params.systemOverride);
  }

  const body: Record<string, unknown> = {
    model: params.model ?? DEFAULT_MODEL,
    max_tokens: params.max_tokens ?? params.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages:
      anthropicMessages.length > 0
        ? anthropicMessages
        : [{ role: "user" as const, content: "(no user message)" }],
  };

  if (systemParts.length > 0) {
    body.system = systemParts.join("\n\n");
  }

  return body;
};

const stripJsonFences = (text: string): string => {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenceMatch ? fenceMatch[1] : trimmed).trim();
};

const extractText = (response: AnthropicResponse): string => {
  const texts = (response.content ?? [])
    .filter(b => b.type === "text" && typeof b.text === "string")
    .map(b => b.text as string);
  return texts.join("\n");
};

const wantsJson = (params: InvokeParams): boolean => {
  const rf = params.responseFormat || params.response_format;
  if (rf?.type === "json_schema" || rf?.type === "json_object") return true;
  if (params.outputSchema || params.output_schema) return true;
  return false;
};

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  if (!ENV.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const body = buildAnthropicPayload(params);

  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ENV.anthropicApiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  const data = (await response.json()) as AnthropicResponse;
  const rawText = extractText(data);
  const content = wantsJson(params) ? stripJsonFences(rawText) : rawText;

  return {
    id: data.id,
    created: Math.floor(Date.now() / 1000),
    model: data.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content,
        },
        finish_reason: data.stop_reason,
      },
    ],
    usage: data.usage
      ? {
          prompt_tokens: data.usage.input_tokens,
          completion_tokens: data.usage.output_tokens,
          total_tokens: data.usage.input_tokens + data.usage.output_tokens,
        }
      : undefined,
  };
}
