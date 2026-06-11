/**
 * profileDrift unit tests — Phase F #5 read side: portal profile edits vs CRM.
 */
import { describe, it, expect } from "vitest";
import { computeProfileDrift } from "./profileDrift";

const crm = {
  firstName: "Matthew",
  lastName: "Yates",
  displayName: "Matthew Yates",
  email: "matt@example.com",
  mobilePhone: "(360) 555-0101",
  homePhone: "",
  workPhone: "",
  addresses: [{ street: "123 Main St", unit: "", city: "Vancouver", state: "WA", zip: "98660" }],
};

describe("computeProfileDrift", () => {
  it("reports nothing when the portal matches the CRM", () => {
    const portal = { name: "Matthew  Yates", email: "MATT@example.com", phone: "+1 360-555-0101", address: "123 Main St, Vancouver WA 98660" };
    expect(computeProfileDrift(crm, portal)).toEqual([]);
  });

  it("flags a portal name change with a split apply payload", () => {
    const items = computeProfileDrift(crm, { name: "Matt Yates Jr", email: null, phone: null, address: null });
    expect(items).toHaveLength(1);
    expect(items[0].field).toBe("name");
    expect(items[0].apply).toEqual({ firstName: "Matt", lastName: "Yates Jr", displayName: "Matt Yates Jr" });
  });

  it("flags a new phone number and applies it to mobilePhone", () => {
    const items = computeProfileDrift(crm, { name: null, email: null, phone: "360-555-9999", address: null });
    expect(items).toHaveLength(1);
    expect(items[0].field).toBe("phone");
    expect(items[0].apply).toEqual({ mobilePhone: "360-555-9999" });
  });

  it("accepts the portal phone matching any CRM phone field", () => {
    const items = computeProfileDrift(
      { ...crm, mobilePhone: "", workPhone: "13605550101" },
      { name: null, email: null, phone: "(360) 555-0101", address: null },
    );
    expect(items).toEqual([]);
  });

  it("marks email drift informational (no apply)", () => {
    const items = computeProfileDrift(crm, { name: null, email: "new@example.com", phone: null, address: null });
    expect(items).toHaveLength(1);
    expect(items[0].field).toBe("email");
    expect(items[0].apply).toBeNull();
  });

  it("marks address drift informational and tolerates loose formatting", () => {
    const match = computeProfileDrift(crm, { name: null, email: null, phone: null, address: "123 MAIN ST Vancouver, WA 98660" });
    expect(match).toEqual([]);
    const drift = computeProfileDrift(crm, { name: null, email: null, phone: null, address: "999 Elm Ave, Portland OR" });
    expect(drift).toHaveLength(1);
    expect(drift[0].field).toBe("address");
    expect(drift[0].apply).toBeNull();
  });

  it("returns nothing without a portal record", () => {
    expect(computeProfileDrift(crm, null)).toEqual([]);
    expect(computeProfileDrift(null, { name: "X" })).toEqual([]);
  });
});
