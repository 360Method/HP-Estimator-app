import { describe, expect, it } from "vitest";
import { extractTotals, marginFieldsFromSnapshot } from "./lib/marginAudit";

const NOW = "2026-05-29T00:00:00.000Z";

describe("extractTotals", () => {
  it("reads explicit total hard cost + price", () => {
    const snap = JSON.stringify({ totals: { totalHard: 6000, totalPrice: 10000, totalGM: 0.4 } });
    expect(extractTotals(snap)).toEqual({ hardCost: 6000, price: 10000 });
  });
  it("derives hard cost from price + gm when hard cost absent", () => {
    const snap = JSON.stringify({ totals: { price: 10000, gm: 0.4 } });
    const t = extractTotals(snap);
    expect(t?.price).toBe(10000);
    expect(t?.hardCost).toBeCloseTo(6000, 5);
  });
  it("returns null for missing/blank/garbage snapshots", () => {
    expect(extractTotals(null)).toBeNull();
    expect(extractTotals("")).toBeNull();
    expect(extractTotals("not json")).toBeNull();
    expect(extractTotals(JSON.stringify({ totals: {} }))).toBeNull();
    expect(extractTotals(JSON.stringify({ totals: { price: 0 } }))).toBeNull();
  });
});

describe("marginFieldsFromSnapshot", () => {
  it("flags a below-floor standard job", () => {
    // 20% GM standard job
    const snap = JSON.stringify({ totals: { totalHard: 8000, totalPrice: 10000, totalGM: 0.2 } });
    const f = marginFieldsFromSnapshot(snap, NOW);
    expect(f).not.toBeNull();
    expect(f!.belowFloor).toBe(true);
    expect(f!.isSmallJob).toBe(false);
    expect(f!.grossMarginBps).toBe(2000);
    expect(f!.minGmBps).toBe(3000);
    expect(f!.hardCostCents).toBe(800000);
    expect(f!.marginAuditedAt).toBe(NOW);
  });
  it("flags a below-floor small job at 33% GM", () => {
    const snap = JSON.stringify({ totals: { totalHard: 1000, totalPrice: 1500, totalGM: 1 / 3 } });
    const f = marginFieldsFromSnapshot(snap, NOW);
    expect(f!.isSmallJob).toBe(true);
    expect(f!.minGmBps).toBe(4000);
    expect(f!.belowFloor).toBe(true);
  });
  it("passes a healthy 40% standard job", () => {
    const snap = JSON.stringify({ totals: { totalHard: 6000, totalPrice: 10000, totalGM: 0.4 } });
    const f = marginFieldsFromSnapshot(snap, NOW);
    expect(f!.belowFloor).toBe(false);
  });
  it("returns null when not derivable", () => {
    expect(marginFieldsFromSnapshot(null, NOW)).toBeNull();
  });
});
