/**
 * Vendor-neutral voice-agent layer.
 *
 * An AI voice platform (Vapi today, Retell or Bland tomorrow) answers the
 * Handy Pioneers line, talks to the caller, and during the call asks our app
 * to do things: look up the caller, confirm the service area, capture a lead.
 * When the call ends it posts a report we log to the caller's conversation
 * thread (the same Inbox the Twilio calls land in).
 *
 * The platform-specific request and response shapes live in adapters/.
 * Everything below the adapter speaks the normalized types in this file, so
 * swapping providers never touches the business logic. This is the OS rule:
 * no hard dependency on any one vendor.
 */

export type VoiceProvider = "vapi" | "retell" | "bland";

/** A function the AI asked us to run mid-call. */
export interface NormalizedToolCall {
  /** The provider's tool-call id, echoed back so it can match our answer. */
  id: string;
  /** Our tool name, e.g. "capture_lead". */
  name: string;
  args: Record<string, unknown>;
}

/** Our answer to one tool call. `result` is a short line the AI reads/uses. */
export interface NormalizedToolResult {
  id: string;
  result: string;
}

/** End-of-call summary from the platform. */
export interface NormalizedCallReport {
  /** The platform's call id. Stored where a Twilio CallSid would go. */
  callId: string;
  /** The caller (E.164 when the platform provides it). */
  fromNumber: string | null;
  /** The HP number that was dialed. */
  toNumber: string | null;
  direction: "inbound" | "outbound";
  endedReason: string | null;
  durationSecs: number;
  /** Full plain-text transcript, when available. */
  transcript: string | null;
  /** The platform's natural-language summary of the call. */
  summary: string | null;
  recordingUrl: string | null;
}

/** What an adapter produces from a raw webhook body. */
export type NormalizedEvent =
  | { kind: "tool-calls"; calls: NormalizedToolCall[]; fromNumber: string | null }
  | { kind: "call-report"; report: NormalizedCallReport }
  | { kind: "ignored"; reason: string };

export interface VoiceAdapter {
  provider: VoiceProvider;
  /** Verify the request really came from the platform (shared secret / signature). */
  verify(headers: Record<string, unknown>, parsedBody: unknown): boolean;
  /** Translate a raw webhook body into a normalized event. */
  parse(parsedBody: unknown): NormalizedEvent;
  /** Format tool results into the HTTP response body the provider expects. */
  formatToolResults(results: NormalizedToolResult[]): unknown;
}
