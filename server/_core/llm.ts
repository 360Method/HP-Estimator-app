// Anthropic Claude API integration via @anthropic-ai/sdk
import Anthropic from "@anthropic-ai/sdk";

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
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
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
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
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
      content: string | Array<TextContent | ImageContent | FileContent>;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

/** Extract plain text from our MessageContent union */
function extractText(content: MessageContent | MessageContent[]): string {
  const parts = Array.isArray(content) ? content : [content];
  return parts
    .map((p) => {
      if (typeof p === "string") return p;
      if (p.type === "text") return p.text;
      return "";
    })
    .join("\n")
    .trim();
}

/** Build a JSON-instruction suffix from a response_format / output_schema */
function buildJsonInstruction(params: InvokeParams): string | null {
  const fmt = params.responseFormat || params.response_format;
  const schema = params.outputSchema || params.output_schema;

  if (fmt) {
    if (fmt.type === "json_schema") {
      return `\n\nYou MUST respond with valid JSON matching this schema:\n${JSON.stringify(fmt.json_schema.schema, null, 2)}\n\nReturn ONLY the JSON object. No markdown, no code fences, no explanation.`;
    }
    if (fmt.type === "json_object") {
      return "\n\nYou MUST respond with valid JSON. Return ONLY the JSON object. No markdown, no code fences, no explanation.";
    }
  }

  if (schema) {
    return `\n\nYou MUST respond with valid JSON matching this schema:\n${JSON.stringify(schema.schema, null, 2)}\n\nReturn ONLY the JSON object. No markdown, no code fences, no explanation.`;
  }

  return null;
}

/** Convert our Tool[] to Claude's tool format */
function convertTools(tools: Tool[]): Anthropic.Messages.Tool[] {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description || "",
    input_schema: (t.function.parameters || { type: "object", properties: {} }) as Anthropic.Messages.Tool.InputSchema,
  }));
}

/** Convert our ToolChoice to Claude's tool_choice */
function convertToolChoice(
  tc: ToolChoice | undefined,
  tools: Tool[] | undefined
): Anthropic.Messages.MessageCreateParams["tool_choice"] | undefined {
  if (!tc) return undefined;
  if (tc === "none") return undefined; // Claude doesn't have "none" — just omit tools
  if (tc === "auto") return { type: "auto" };
  if (tc === "required") {
    if (tools && tools.length === 1) {
      return { type: "tool", name: tools[0].function.name };
    }
    return { type: "any" };
  }
  if ("name" in tc) return { type: "tool", name: tc.name };
  if ("function" in tc) return { type: "tool", name: tc.function.name };
  return undefined;
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const client = getClient();

  // Separate system messages from conversation messages
  let systemText = "";
  const conversationMessages: Anthropic.Messages.MessageParam[] = [];

  for (const msg of params.messages) {
    if (msg.role === "system") {
      systemText += (systemText ? "\n\n" : "") + extractText(msg.content);
      continue;
    }

    // Map to Claude's user/assistant roles
    const role: "user" | "assistant" = msg.role === "assistant" ? "assistant" : "user";
    const text = extractText(msg.content);
    if (text) {
      conversationMessages.push({ role, content: text });
    }
  }

  // Append JSON format instructions to system prompt
  const jsonInstruction = buildJsonInstruction(params);
  if (jsonInstruction) {
    systemText += jsonInstruction;
  }

  // Build the request
  const maxTokens = params.maxTokens || params.max_tokens || 8192;
  const requestParams: Anthropic.Messages.MessageCreateParams = {
    model: "claude-sonnet-4-5-20250514",
    max_tokens: maxTokens,
    messages: conversationMessages,
  };

  if (systemText) {
    requestParams.system = systemText;
  }

  // Add tools if provided (and tool_choice isn't "none")
  const tc = params.toolChoice || params.tool_choice;
  if (params.tools && params.tools.length > 0 && tc !== "none") {
    requestParams.tools = convertTools(params.tools);
    const toolChoice = convertToolChoice(tc, params.tools);
    if (toolChoice) {
      requestParams.tool_choice = toolChoice;
    }
  }

  const response = await client.messages.create(requestParams);

  // Map Claude's response back to our InvokeResult shape
  let textContent = "";
  const toolCalls: ToolCall[] = [];

  for (const block of response.content) {
    if (block.type === "text") {
      textContent += block.text;
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input),
        },
      });
    }
  }

  return {
    id: response.id,
    created: Date.now(),
    model: response.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: textContent,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: response.stop_reason === "end_turn" ? "stop" : response.stop_reason,
      },
    ],
    usage: {
      prompt_tokens: response.usage.input_tokens,
      completion_tokens: response.usage.output_tokens,
      total_tokens: response.usage.input_tokens + response.usage.output_tokens,
    },
  };
}
