import { describe, expect, it } from "vitest";
import { pickPropertyForMembership } from "./membershipPropertyLink";

const candidates = [
  { id: "prop-a", street: "123 Main St" },
  { id: "prop-b", street: "456 Oak Ave" },
  { id: "prop-c", street: null },
];

describe("pickPropertyForMembership", () => {
  it("prefers an explicit metadata propertyId over a street match", () => {
    // The street string points at prop-a, but checkout named prop-b.
    expect(pickPropertyForMembership(candidates, "prop-b", "123 Main St")).toEqual({
      propertyId: "prop-b",
      via: "metadata",
    });
  });

  it("falls back to the street match when metadata propertyId is absent", () => {
    expect(pickPropertyForMembership(candidates, null, "456 oak ave ")).toEqual({
      propertyId: "prop-b",
      via: "street",
    });
  });

  it("falls back to the street match when metadata propertyId does not belong to the customer", () => {
    expect(pickPropertyForMembership(candidates, "someone-elses-prop", "123 Main St")).toEqual({
      propertyId: "prop-a",
      via: "street",
    });
  });

  it("returns null when nothing matches (caller creates a fresh property)", () => {
    expect(pickPropertyForMembership(candidates, undefined, "789 Birch Blvd")).toBeNull();
    expect(pickPropertyForMembership(candidates, undefined, undefined)).toBeNull();
  });

  it("never matches an empty street to a property without one", () => {
    expect(pickPropertyForMembership(candidates, undefined, "  ")).toBeNull();
  });
});
