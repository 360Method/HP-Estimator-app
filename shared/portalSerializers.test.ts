import { describe, it, expect } from "vitest";
import {
  PORTAL_FORBIDDEN_KEYS,
  findForbiddenKeys,
  stripForbiddenKeys,
  assertNoForbiddenKeys,
} from "./portalSerializers";

describe("portal forbidden-key scanner", () => {
  it("passes a clean retail-only payload", () => {
    const clean = {
      id: "est_1",
      totalAmount: 1200_00,
      depositAmount: 300_00,
      lineItems: [{ name: "Repair faucet", qty: 1, unitPrice: 200_00, amount: 200_00 }],
    };
    expect(findForbiddenKeys(clean)).toEqual([]);
    expect(() => assertNoForbiddenKeys(clean)).not.toThrow();
  });

  it("flags a top-level internal field", () => {
    const leak = { id: "opp_1", totalAmount: 1200_00, hardCostCents: 800_00 };
    expect(findForbiddenKeys(leak)).toContain("$.hardCostCents");
    expect(() => assertNoForbiddenKeys(leak)).toThrow(/hardCostCents/);
  });

  it("finds forbidden keys nested inside arrays and objects", () => {
    const leak = {
      estimate: {
        lineItems: [
          { name: "Labor", unitPrice: 150_00, costCents: 100_00 },
          { name: "Parts", unitPrice: 50_00 },
        ],
      },
      meta: { grossMarginBps: 3000 },
    };
    const hits = findForbiddenKeys(leak);
    expect(hits).toContain("$.estimate.lineItems[0].costCents");
    expect(hits).toContain("$.meta.grossMarginBps");
    expect(hits).toHaveLength(2);
  });

  it("catches the raw snapshot blobs", () => {
    expect(findForbiddenKeys({ estimateSnapshot: "{...}" })).toEqual(["$.estimateSnapshot"]);
    expect(findForbiddenKeys({ clientSnapshot: "{...}" })).toEqual(["$.clientSnapshot"]);
  });

  it("does not false-positive on legitimate retail field names", () => {
    const clean = { totalAmount: 1, depositAmount: 1, amount: 1, unitPrice: 1, taxAmount: 1 };
    expect(findForbiddenKeys(clean)).toEqual([]);
  });

  it("handles cycles without infinite recursion", () => {
    const a: any = { totalAmount: 1 };
    a.self = a;
    expect(() => findForbiddenKeys(a)).not.toThrow();
    expect(findForbiddenKeys(a)).toEqual([]);
  });

  it("stripForbiddenKeys removes the keys in place and keeps the rest", () => {
    const leak: any = {
      id: "opp_1",
      totalAmount: 1200_00,
      hardCostCents: 800_00,
      nested: { grossMarginBps: 3000, label: "keep" },
      items: [{ unitPrice: 5, costCents: 3 }],
    };
    stripForbiddenKeys(leak);
    expect(leak).toEqual({
      id: "opp_1",
      totalAmount: 1200_00,
      nested: { label: "keep" },
      items: [{ unitPrice: 5 }],
    });
    expect(findForbiddenKeys(leak)).toEqual([]);
  });

  it("every documented forbidden key is detected", () => {
    for (const key of PORTAL_FORBIDDEN_KEYS) {
      expect(findForbiddenKeys({ [key]: 1 })).toEqual([`$.${key}`]);
    }
  });
});
