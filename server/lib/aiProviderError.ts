/**
 * server/lib/aiProviderError.ts
 *
 * One place that turns "the AI call blew up" into something a human can act
 * on. Works for both AI call paths in this app:
 *   - the Anthropic SDK (integrator chat, agent runtime) — its APIError
 *     carries a numeric `status` and a parsed body with `error.type`
 *   - the raw-fetch wrapper in server/_core/llm.ts — which throws
 *     AiProviderError (below) with the same fields
 *
 * Vendor-agnostic on purpose: callers see codes and friendly copy, never
 * provider names, so the brain stays a swappable adapter.
 */

export type AiErrorCode =
  | "no_key"
  | "auth"
  | "billing"
  | "rate_limited"
  | "overloaded"
  | "server"
  | "network"
  | "unknown";

/** Thrown by the raw-fetch LLM wrapper so failures classify like SDK errors. */
export class AiProviderError extends Error {
  status?: number;
  providerType?: string;

  constructor(message: string, opts?: { status?: number; providerType?: string }) {
    super(message);
    this.name = "AiProviderError";
    this.status = opts?.status;
    this.providerType = opts?.providerType;
  }
}

export function classifyAiError(err: unknown): { code: AiErrorCode; friendly: string } {
  const anyErr = err as {
    status?: unknown;
    providerType?: unknown;
    error?: { type?: unknown; error?: { type?: unknown } };
    name?: unknown;
  } | null;

  // Numeric HTTP status: present on Anthropic SDK APIError and AiProviderError.
  const status = typeof anyErr?.status === "number" ? anyErr.status : undefined;
  // Provider error body type ("authentication_error", "billing_error",
  // "overloaded_error", ...). SDK nests the body under `error`.
  const rawType =
    anyErr?.providerType ??
    anyErr?.error?.error?.type ??
    anyErr?.error?.type;
  const providerType = typeof rawType === "string" ? rawType : undefined;

  const make = (code: AiErrorCode, friendly: string) => ({ code, friendly });

  if (providerType === "no_key") {
    return make("no_key", "The AI brain has no API key configured.");
  }
  if (providerType === "billing_error") {
    return make("billing", "The AI account's billing needs attention — it can't reply until that's fixed.");
  }
  if (status === 401 || providerType === "authentication_error") {
    return make("auth", "The AI account's key or billing needs attention — it can't reply until that's fixed.");
  }
  if (status === 403 || providerType === "permission_error") {
    return make("billing", "The AI account's key or billing needs attention — it can't reply until that's fixed.");
  }
  if (status === 429 || providerType === "rate_limit_error") {
    return make("rate_limited", "The AI provider is rate-limiting us — try again in a minute.");
  }
  if (status === 529 || providerType === "overloaded_error") {
    return make("overloaded", "The AI provider is overloaded right now — try again shortly.");
  }
  if (typeof status === "number" && status >= 500) {
    return make("server", "The AI provider is having trouble right now — try again shortly.");
  }
  // SDK connection failures have no status; raw fetch network errors are
  // TypeError("fetch failed") — also statusless.
  if (anyErr?.name === "APIConnectionError" || anyErr?.name === "APIConnectionTimeoutError" || (status === undefined && anyErr?.name === "TypeError")) {
    return make("network", "Couldn't reach the AI provider — check the connection and try again.");
  }
  return make("unknown", "The AI call failed unexpectedly. Try again, and check the Agents page if it keeps happening.");
}

/** True when the failure needs a human (key/billing), not a retry. */
export function isAiOfflineCode(code: AiErrorCode): boolean {
  return code === "no_key" || code === "auth" || code === "billing";
}
