import { describe, expect, it } from "vitest";
import {
  computeMarginAudit,
  minGmFor,
  toBps,
  fromBps,
  MIN_GM_STANDARD,
  MIN_GM_SMALL_JOB,
  SMALL_JOB_HARD_COST_THRESHOLD,
} from "./marginFloor";

describe("minGmFor", () => {
  it("applies the 40% floor below the small-job threshold", () => {
    expect(minGmFor(1999)).toBe(MIN_GM_SMALL_JOB);
    expect(minGmFor(0)).toBe(MIN_GM_SMALL_JOB);
  });
  it("applies the 30% floor at and above the threshold", () => {
    expect(minGmFor(SMALL_JOB_HARD_COST_THRESHOLD)).toBe(MIN_GM_STANDARD);
    expect(minGmFor(5000)).toBe(MIN_GM_STANDARD);
  });
});

describe("computeMarginAudit — standard jobs (hard cost >= $2,000)", () => {
  it("flags below the 30% floor", () => {
    // hardCost 8000, price 10000 → 20% GM
    const a = computeMarginAudit(8000, 10000);
    expect(a.isSmallJob).toBe(false);
    expect(a.minGM).toBe(0.3);
    expect(a.belowFloor).toBe(true);
    expect(a.status).toBe("below_floor");
  });
  it("warns in the 30–35% band", () => {
    // hardCost 6700, price 10000 → 33% GM (passes 30% floor, under 35%)
    const a = computeMarginAudit(6700, 10000);
    expect(a.belowFloor).toBe(false);
    expect(a.lowMargin).toBe(true);
    expect(a.status).toBe("warn");
  });
  it("is ok at or above 35%", () => {
    // hardCost 6000, price 10000 → 40% GM
    const a = computeMarginAudit(6000, 10000);
    expect(a.belowFloor).toBe(false);
    expect(a.lowMargin).toBe(false);
    expect(a.status).toBe("ok");
  });
  it("is ok exactly at the 30% floor", () => {
    // hardCost 7000, price 10000 → 30% GM exactly
    const a = computeMarginAudit(7000, 10000);
    expect(a.belowFloor).toBe(false);
  });
});

describe("computeMarginAudit — small jobs (hard cost < $2,000)", () => {
  it("flags below the 40% floor even when above 30%", () => {
    // hardCost 1000, price 1500 → 33% GM: passes standard floor, fails small-job floor
    const a = computeMarginAudit(1000, 1500);
    expect(a.isSmallJob).toBe(true);
    expect(a.minGM).toBe(0.4);
    expect(a.belowFloor).toBe(true);
    expect(a.status).toBe("below_floor");
  });
  it("does not raise the standard warn band for small jobs", () => {
    // 33% GM small job is below_floor, not warn
    const a = computeMarginAudit(1000, 1500);
    expect(a.lowMargin).toBe(false);
  });
  it("is ok at or above 40%", () => {
    // hardCost 900, price 1500 → 40% GM
    const a = computeMarginAudit(900, 1500);
    expect(a.belowFloor).toBe(false);
    expect(a.status).toBe("ok");
  });
});

describe("computeMarginAudit — Sub #1 carpenter scenario", () => {
  it("$100/hr cost billed at $150/hr = 33% GM fails the small-job floor", () => {
    // 10 hrs: cost $1000, price $1500 → 33.3% GM, hard cost < $2,000
    const a = computeMarginAudit(1000, 1500);
    expect(a.belowFloor).toBe(true);
  });
  it("the same 33% GM passes once the job is large (hard cost >= $2,000)", () => {
    // cost $4000, price $6000 → 33.3% GM, standard floor 30%
    const a = computeMarginAudit(4000, 6000);
    expect(a.belowFloor).toBe(false);
  });
});

describe("computeMarginAudit — empty / degenerate", () => {
  it("returns empty status for zero hard cost or price", () => {
    expect(computeMarginAudit(0, 0).status).toBe("empty");
    expect(computeMarginAudit(1000, 0).status).toBe("empty");
    expect(computeMarginAudit(0, 1000).belowFloor).toBe(false);
  });
});

describe("bps helpers", () => {
  it("round-trips ratios within rounding", () => {
    expect(toBps(0.3)).toBe(3000);
    expect(toBps(0.4)).toBe(4000);
    expect(fromBps(3333)).toBeCloseTo(0.3333, 4);
  });
});
