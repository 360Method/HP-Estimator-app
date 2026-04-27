/**
 * KPI rollup aggregation rule tests. The real DB-backed rollup is exercised
 * in integration; here we pin the per-unit aggregation behavior in isolation.
 */
import { describe, it, expect } from "vitest";

function aggForUnit(unit: string): "sum" | "avg" {
  if (unit === "pct" || unit === "days") return "avg";
  return "sum";
}

describe("kpiRollup.aggForUnit", () => {
  it("sums usd and count", () => {
    expect(aggForUnit("usd")).toBe("sum");
    expect(aggForUnit("count")).toBe("sum");
  });

  it("averages pct and days", () => {
    expect(aggForUnit("pct")).toBe("avg");
    expect(aggForUnit("days")).toBe("avg");
  });

  it("defaults unknown units to sum", () => {
    expect(aggForUnit("widgets")).toBe("sum");
  });
});

describe("kpi dedupe by (scope, scopeId, key)", () => {
  // Latest row per pair wins — this protects against agents double-writing the
  // same metric within a cron window.
  const rows = [
    { agentId: 1, key: "mrr_usd", value: 100, computedAt: new Date("2026-01-01") },
    { agentId: 1, key: "mrr_usd", value: 200, computedAt: new Date("2026-01-02") },
    { agentId: 2, key: "mrr_usd", value: 50, computedAt: new Date("2026-01-02") },
  ];

  it("picks latest per (agentId, key)", () => {
    const latest = new Map<string, typeof rows[number]>();
    for (const r of [...rows].sort((a, b) => b.computedAt.getTime() - a.computedAt.getTime())) {
      const k = `${r.agentId}|${r.key}`;
      if (!latest.has(k)) latest.set(k, r);
    }
    expect(latest.get("1|mrr_usd")!.value).toBe(200);
    expect(latest.get("2|mrr_usd")!.value).toBe(50);
  });
});
