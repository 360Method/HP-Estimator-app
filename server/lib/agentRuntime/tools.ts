/**
 * server/lib/agentRuntime/tools.ts
 *
 * Tool registry — maps an agent's `toolKey` to an Anthropic tool-use schema
 * plus a server-side handler. Phase 1 ships an intentionally tiny set so the
 * platform can be exercised end-to-end. Phase 2 will fill this in with the
 * tRPC procedure wrappers agents actually need (see the seed list in
 * ai_agent_tools.notes when Phase 3 runs).
 *
 * Convention:
 *   - toolKey is a short dot-scoped string: "kpis.record", "customers.search".
 *   - requiresApproval=true means the runtime MUST park the run in
 *     `awaiting_approval` and return a draft to the admin queue — the handler
 *     is executed only after a human approves.
 */

import type Anthropic from "@anthropic-ai/sdk";

export type ToolContext = {
  agentId: number;
  taskId: number;
  /** Runtime-provided db handle — passed to avoid circular imports. */
  db: unknown;
};

export type ToolHandler = (args: {
  input: Record<string, unknown>;
  ctx: ToolContext;
}) => Promise<unknown>;

export type RegisteredTool = {
  key: string;
  /** Anthropic tool-use definition. */
  definition: Anthropic.Tool;
  /** If true, the runtime queues the run for human approval instead of executing. */
  requiresApproval: boolean;
  /** Only called when (a) not requiresApproval OR (b) after approve. */
  handler: ToolHandler;
};

const registry = new Map<string, RegisteredTool>();

export function registerTool(tool: RegisteredTool): void {
  registry.set(tool.key, tool);
}

export function getTool(key: string): RegisteredTool | undefined {
  return registry.get(key);
}

export function listToolKeys(): string[] {
  return Array.from(registry.keys()).sort();
}

export function getAnthropicToolDefinitions(keys: string[]): Anthropic.Tool[] {
  return keys
    .map((k) => registry.get(k)?.definition)
    .filter((d): d is Anthropic.Tool => Boolean(d));
}

// ─── Built-in tools (Phase 1) ─────────────────────────────────────────────────
// Only `kpis.record` ships in Phase 1 — every department needs the ability to
// write metrics, and it's the simplest possible end-to-end exercise of the
// runtime. Phase 2 fills in the rest.

registerTool({
  key: "kpis.record",
  requiresApproval: false,
  definition: {
    name: "kpis_record",
    description:
      "Record a KPI metric attributable to this agent. Used to report seat-level performance numbers that roll up to the department and company dashboards.",
    input_schema: {
      type: "object",
      properties: {
        key: {
          type: "string",
          description:
            "Metric key, e.g. 'mrr_usd', 'leads_new_30d', 'jobs_on_time_pct'.",
        },
        value: { type: "number", description: "Numeric value." },
        unit: {
          type: "string",
          enum: ["usd", "pct", "count", "days"],
          description: "Unit of the value.",
        },
        period: {
          type: "string",
          enum: [
            "realtime",
            "daily",
            "weekly",
            "monthly",
            "trailing_30",
            "trailing_90",
            "trailing_365",
          ],
        },
      },
      required: ["key", "value", "unit"],
    },
  },
  handler: async ({ input, ctx }) => {
    const { recordSeatKpi } = await import("./kpiRollup");
    await recordSeatKpi({
      agentId: ctx.agentId,
      key: String(input.key),
      value: Number(input.value),
      unit: String(input.unit ?? "count"),
      period: (input.period as string) ?? "realtime",
      sourceTaskId: ctx.taskId,
    });
    return { ok: true };
  },
});
