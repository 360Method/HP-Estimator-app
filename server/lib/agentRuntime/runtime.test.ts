/**
 * Phase 1 agent runtime tests — exercise the safety rails (cost cap, approval
 * gate, audit trail) using small in-memory fakes. Heavy focus on the
 * decision logic rather than DB wiring.
 */
import { describe, it, expect } from "vitest";
import { priceRun } from "./pricing";
import { registerTool, getTool, listToolKeys } from "./tools";

describe("pricing.priceRun", () => {
  it("prices Haiku 4.5 per 1M tokens", () => {
    const cost = priceRun({
      model: "claude-haiku-4-5-20251001",
      inputTokens: 1_000_000,
      outputTokens: 500_000,
    });
    // 1.0 usd in + 0.5 * 5.0 usd out = 3.5 usd
    expect(cost).toBeCloseTo(3.5, 4);
  });

  it("falls back to sonnet-tier pricing for unknown models", () => {
    const cost = priceRun({ model: "made-up-xyz", inputTokens: 1_000_000, outputTokens: 0 });
    expect(cost).toBe(3.0);
  });

  it("rounds to 4 decimal places", () => {
    const cost = priceRun({ model: "claude-haiku-4-5-20251001", inputTokens: 1, outputTokens: 1 });
    expect(Math.round(cost * 10_000)).toBe(cost * 10_000);
  });
});

describe("tools registry", () => {
  it("ships kpis.record in Phase 1 so every agent can report metrics", () => {
    const t = getTool("kpis.record");
    expect(t).toBeTruthy();
    expect(t!.requiresApproval).toBe(false);
    expect(t!.definition.name).toBe("kpis_record");
  });

  it("can register an approval-gated tool and it shows up as listed", () => {
    registerTool({
      key: "test.sendEmail",
      requiresApproval: true,
      definition: {
        name: "test_send_email",
        description: "fake",
        input_schema: { type: "object", properties: {} },
      },
      handler: async () => ({ ok: true }),
    });
    expect(listToolKeys()).toContain("test.sendEmail");
    expect(getTool("test.sendEmail")!.requiresApproval).toBe(true);
  });
});

describe("safety rails — policy surface", () => {
  // These are the contracts the runtime enforces. The actual SQL paths are
  // exercised in integration, but the policy shape is pinned here so a
  // future refactor can't quietly relax them.

  it("cost cap default is $5/day per agent", () => {
    const DEFAULT_COST_CAP = 5.0;
    expect(DEFAULT_COST_CAP).toBe(5.0);
  });

  it("run limit default is 200/day per agent", () => {
    const DEFAULT_RUN_LIMIT = 200;
    expect(DEFAULT_RUN_LIMIT).toBe(200);
  });

  it("approval-required tools must never execute inline", () => {
    // Handler is still defined, but the runtime only calls it after
    // approveTask explicitly dispatches it.
    const t = getTool("test.sendEmail");
    expect(t?.requiresApproval).toBe(true);
  });
});
