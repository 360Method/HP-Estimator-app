import { describe, expect, it } from "vitest";
import { isSubEligibleForJob, subGrossMargin, DEFAULT_BILLED_HOURLY_CENTS } from "./subEligibility";

describe("subGrossMargin", () => {
  it("computes GM at the billed rate", () => {
    expect(subGrossMargin(10000, 15000)).toBeCloseTo(1 / 3, 5); // $100 cost / $150 billed = 33.3%
    expect(subGrossMargin(8000, 15000)).toBeCloseTo(0.4667, 4);
  });
});

describe("isSubEligibleForJob — Sub #1 carpenter ($100/hr cost, $150/hr billed = 33% GM)", () => {
  it("is INELIGIBLE on a small job (hard cost < $2,000)", () => {
    const r = isSubEligibleForJob({ subHourlyCostCents: 10000, jobHardCostCents: 150000 }); // $1,500 job
    expect(r.isSmallJob).toBe(true);
    expect(r.floor).toBe(0.4);
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/below the 40% small-job floor/);
  });
  it("is eligible on a standard job (hard cost >= $2,000)", () => {
    const r = isSubEligibleForJob({ subHourlyCostCents: 10000, jobHardCostCents: 500000 }); // $5,000 job
    expect(r.isSmallJob).toBe(false);
    expect(r.eligible).toBe(true);
  });
});

describe("isSubEligibleForJob — lower-cost sub", () => {
  it("a $80/hr sub (47% GM) is eligible even on a small job", () => {
    const r = isSubEligibleForJob({ subHourlyCostCents: 8000, jobHardCostCents: 150000 });
    expect(r.isSmallJob).toBe(true);
    expect(r.eligible).toBe(true);
  });
  it("a $90/hr sub (40% GM) is exactly at the small-job floor", () => {
    const r = isSubEligibleForJob({ subHourlyCostCents: 9000, jobHardCostCents: 150000 });
    expect(r.eligible).toBe(true);
  });
});

describe("isSubEligibleForJob — unknown hard cost fails open", () => {
  it("treats null/zero hard cost as not-small (cannot gate)", () => {
    expect(isSubEligibleForJob({ subHourlyCostCents: 10000, jobHardCostCents: null }).eligible).toBe(true);
    expect(isSubEligibleForJob({ subHourlyCostCents: 10000, jobHardCostCents: 0 }).eligible).toBe(true);
  });
});

describe("isSubEligibleForJob — custom billed rate", () => {
  it("uses the provided billed rate over the default", () => {
    const r = isSubEligibleForJob({ subHourlyCostCents: 10000, billedHourlyCents: 20000, jobHardCostCents: 150000 });
    expect(r.subGm).toBeCloseTo(0.5, 5); // $100 cost / $200 billed = 50%
    expect(r.eligible).toBe(true);
  });
  it("default billed rate is $150/hr", () => {
    expect(DEFAULT_BILLED_HOURLY_CENTS).toBe(15000);
  });
});
