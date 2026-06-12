import { describe, expect, it } from "vitest";
import { buildPropertyScope, customerLevelInScope, recordInScope } from "./propertyScope";

describe("propertyScope", () => {
  const primary = buildPropertyScope({ id: "prop-a", isPrimary: true }, 2);
  const secondary = buildPropertyScope({ id: "prop-b", isPrimary: false }, 2);

  it("NULL-linked records fall back to the primary property", () => {
    expect(recordInScope(null, primary)).toBe(true);
    expect(recordInScope(undefined, primary)).toBe(true);
    expect(recordInScope(null, secondary)).toBe(false);
  });

  it("explicit links beat the primary fallback", () => {
    expect(recordInScope("prop-b", secondary)).toBe(true);
    expect(recordInScope("prop-b", primary)).toBe(false);
    expect(recordInScope("prop-a", secondary)).toBe(false);
  });

  it("a multi-property client's records never bleed across homes", () => {
    const linkedToA = "prop-a";
    expect(recordInScope(linkedToA, primary)).toBe(true);
    expect(recordInScope(linkedToA, secondary)).toBe(false);
  });

  it("a single non-primary property is treated as primary (zero backfill)", () => {
    const only = buildPropertyScope({ id: "prop-x", isPrimary: false }, 1);
    expect(only.treatAsPrimary).toBe(true);
    expect(recordInScope(null, only)).toBe(true);
    expect(customerLevelInScope(only)).toBe(true);
  });

  it("customer-level artifacts show under the primary only", () => {
    expect(customerLevelInScope(primary)).toBe(true);
    expect(customerLevelInScope(secondary)).toBe(false);
  });
});
