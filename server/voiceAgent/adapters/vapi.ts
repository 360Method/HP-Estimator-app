/**
 * Vapi adapter — translates Vapi's webhook payloads to/from the normalized
 * voice-agent types. Vapi posts `{ message: { type, ... } }` to the server URL.
 *
 * Message types we act on:
 *   - "tool-calls"        the assistant wants to run one or more functions
 *   - "function-call"     legacy single-function form (older assistants)
 *   - "end-of-call-report" the call finished; transcript + summary + recording
 * Everything else is ignored.
 *
 * Auth: Vapi sends the assistant/org server secret in the `x-vapi-secret`
 * header. We compare it to VAPI_WEBHOOK_SECRET. Docs:
 *   https://docs.vapi.ai/server-url        (server messages)
 *   https://docs.vapi.ai/tools             (tool / function calls)
 */
import { ENV } from "../../_core/env";
import type {
  NormalizedCallReport,
  NormalizedEvent,
  NormalizedToolCall,
  NormalizedToolResult,
  VoiceAdapter,
} from "../types";

function asObject(v: unknown): Record<string, any> {
  return v && typeof v === "object" ? (v as Record<string, any>) : {};
}

/** Vapi sometimes parses tool arguments to an object, sometimes leaves JSON. */
function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function extractCallNumbers(message: Record<string, any>): {
  fromNumber: string | null;
  toNumber: string | null;
  direction: "inbound" | "outbound";
} {
  const call = asObject(message.call);
  const customerNumber: string | null = asObject(call.customer).number ?? asObject(message.customer).number ?? null;
  const ownNumber: string | null =
    asObject(call.phoneNumber).number ?? asObject(message.phoneNumber).number ?? null;
  const type: string = String(call.type ?? message.type ?? "");
  const isOutbound = type.toLowerCase().includes("outbound");
  return isOutbound
    ? { fromNumber: ownNumber, toNumber: customerNumber, direction: "outbound" }
    : { fromNumber: customerNumber, toNumber: ownNumber, direction: "inbound" };
}

export const vapiAdapter: VoiceAdapter = {
  provider: "vapi",

  verify(headers) {
    const secret = ENV.vapiWebhookSecret;
    // In production a secret is mandatory; the route layer enforces the reject.
    if (!secret) return !ENV.isProduction;
    const got = headers["x-vapi-secret"] ?? headers["X-Vapi-Secret"];
    return typeof got === "string" && got === secret;
  },

  parse(parsedBody): NormalizedEvent {
    const body = asObject(parsedBody);
    const message = asObject(body.message);
    const type = String(message.type ?? "");

    if (type === "tool-calls" || type === "tool-call") {
      const list: any[] = message.toolCallList ?? message.toolCalls ?? message.toolWithToolCallList ?? [];
      const calls: NormalizedToolCall[] = list.map((tc) => {
        const fn = asObject(tc.function ?? tc);
        return {
          id: String(tc.id ?? tc.toolCallId ?? fn.id ?? ""),
          name: String(fn.name ?? tc.name ?? ""),
          args: parseArgs(fn.arguments ?? fn.parameters ?? tc.arguments),
        };
      });
      const { fromNumber } = extractCallNumbers(message);
      return { kind: "tool-calls", calls, fromNumber };
    }

    // Legacy single-function form.
    if (type === "function-call") {
      const fn = asObject(message.functionCall);
      const { fromNumber } = extractCallNumbers(message);
      return {
        kind: "tool-calls",
        fromNumber,
        calls: [
          {
            id: String(fn.id ?? "legacy"),
            name: String(fn.name ?? ""),
            args: parseArgs(fn.parameters ?? fn.arguments),
          },
        ],
      };
    }

    if (type === "end-of-call-report") {
      const call = asObject(message.call);
      const artifact = asObject(message.artifact);
      const { fromNumber, toNumber, direction } = extractCallNumbers(message);
      const durationSecs =
        Number(message.durationSeconds) ||
        (Number(message.durationMs) ? Math.round(Number(message.durationMs) / 1000) : 0);
      const report: NormalizedCallReport = {
        callId: String(call.id ?? message.id ?? `vapi-${Date.now()}`),
        fromNumber,
        toNumber,
        direction,
        endedReason: message.endedReason ?? null,
        durationSecs,
        transcript: message.transcript ?? artifact.transcript ?? null,
        summary: message.summary ?? artifact.summary ?? null,
        recordingUrl:
          message.recordingUrl ??
          asObject(message.recording).url ??
          artifact.recordingUrl ??
          asObject(artifact.recording).url ??
          null,
      };
      return { kind: "call-report", report };
    }

    return { kind: "ignored", reason: type || "unknown" };
  },

  formatToolResults(results: NormalizedToolResult[]) {
    // Current Vapi expects { results: [{ toolCallId, result }] }.
    // The extra top-level `result` keeps legacy function-call assistants happy.
    return {
      results: results.map((r) => ({ toolCallId: r.id, result: r.result })),
      result: results[0]?.result,
    };
  },
};
