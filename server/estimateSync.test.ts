/**
 * estimateSync unit tests — Phase F gap #2: portal decline → pro-side stage.
 */
import { describe, it, expect } from "vitest";
import { declinedOpportunityStage } from "./lib/estimateSync";

describe("declinedOpportunityStage", () => {
  it("moves an estimate-area opportunity to Rejected", () => {
    expect(declinedOpportunityStage("estimate", "Sent")).toBe("Rejected");
  });

  it("moves a lead-area opportunity to Lost", () => {
    expect(declinedOpportunityStage("lead", "First Contact")).toBe("Lost");
  });

  it("leaves a converted job alone", () => {
    expect(declinedOpportunityStage("job", "In Progress")).toBeNull();
  });

  it("is a no-op when already at the target stage", () => {
    expect(declinedOpportunityStage("estimate", "Rejected")).toBeNull();
    expect(declinedOpportunityStage("lead", "Lost")).toBeNull();
  });

  it("leaves unknown or missing areas alone", () => {
    expect(declinedOpportunityStage(null, "Sent")).toBeNull();
    expect(declinedOpportunityStage(undefined, "Sent")).toBeNull();
    expect(declinedOpportunityStage("something_else", "Sent")).toBeNull();
  });
});
