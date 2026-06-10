/**
 * profileSync unit tests — Phase F #5 auto direction: CRM edit → portal profile.
 */
import { describe, it, expect } from "vitest";
import { buildPortalProfilePatch } from "./lib/profileSync";

const customer = {
  firstName: "Matthew",
  lastName: "Yates",
  displayName: "Matthew Yates",
  mobilePhone: "(360) 555-0101",
  street: "123 Main St",
  city: "Vancouver",
  state: "WA",
  zip: "98660",
};

const portal = { name: "Matthew Yates", phone: "(360) 555-0101", address: "123 Main St, Vancouver, WA, 98660" };

describe("buildPortalProfilePatch", () => {
  it("pushes a changed name when name fields were touched", () => {
    const patch = buildPortalProfilePatch(
      { firstName: "Matt" },
      { ...customer, firstName: "Matt" },
      portal,
    );
    expect(patch).toEqual({ name: "Matt Yates" });
  });

  it("pushes a changed phone when mobilePhone was touched", () => {
    const patch = buildPortalProfilePatch(
      { mobilePhone: "360-555-9999" },
      { ...customer, mobilePhone: "360-555-9999" },
      portal,
    );
    expect(patch).toEqual({ phone: "360-555-9999" });
  });

  it("pushes a composed address when any address field was touched", () => {
    const patch = buildPortalProfilePatch(
      { street: "456 Oak Ave" },
      { ...customer, street: "456 Oak Ave" },
      portal,
    );
    expect(patch).toEqual({ address: "456 Oak Ave, Vancouver, WA, 98660" });
  });

  it("returns null when the touched fields end up matching the portal", () => {
    expect(buildPortalProfilePatch({ firstName: "Matthew" }, customer, portal)).toBeNull();
  });

  it("ignores fields that were not part of the update", () => {
    // phone differs from portal, but only the name was touched and it matches
    const patch = buildPortalProfilePatch(
      { displayName: "Matthew Yates" },
      { ...customer, mobilePhone: "999-999-9999" },
      portal,
    );
    expect(patch).toBeNull();
  });

  it("never pushes an empty value", () => {
    const patch = buildPortalProfilePatch(
      { firstName: "", lastName: "", displayName: "" },
      { ...customer, firstName: "", lastName: "", displayName: "" },
      portal,
    );
    expect(patch).toBeNull();
  });

  it("falls back to displayName when first/last are empty", () => {
    const patch = buildPortalProfilePatch(
      { displayName: "Yates Household" },
      { ...customer, firstName: "", lastName: "", displayName: "Yates Household" },
      portal,
    );
    expect(patch).toEqual({ name: "Yates Household" });
  });
});
