/**
 * estimateSync unit tests — Phase F gap #2: portal decline → pro-side stage.
 */
import { describe, it, expect } from "vitest";
import { declinedOpportunityStage, planEstimateResend } from "./lib/estimateSync";

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

describe("planEstimateResend (Phase F #1)", () => {
  const sib = (id: number, estimateNumber: string, status: string) => ({ id, estimateNumber, status });

  it("blocks when the incoming number collides with an approved estimate", () => {
    const plan = planEstimateResend([sib(1, "HP-2026-042", "approved")], "hp-2026-042");
    expect(plan.blockedBy?.id).toBe(1);
    expect(plan.supersedeIds).toEqual([]);
  });

  it("expires live siblings under old numbers", () => {
    const plan = planEstimateResend(
      [sib(1, "HP-2026-040", "sent"), sib(2, "HP-2026-041", "viewed"), sib(3, "HP-2026-039", "pending")],
      "HP-2026-042",
    );
    expect(plan.blockedBy).toBeNull();
    expect(plan.supersedeIds.sort()).toEqual([1, 2, 3]);
  });

  it("leaves approved, declined, and expired siblings as history", () => {
    const plan = planEstimateResend(
      [sib(1, "HP-2026-040", "approved"), sib(2, "HP-2026-041", "declined"), sib(3, "HP-2026-039", "expired")],
      "HP-2026-042",
    );
    expect(plan.blockedBy).toBeNull();
    expect(plan.supersedeIds).toEqual([]);
  });

  it("neither blocks nor supersedes a same-number unapproved row (upsert refreshes it)", () => {
    const plan = planEstimateResend([sib(1, "HP-2026-042", "viewed")], "HP-2026-042");
    expect(plan.blockedBy).toBeNull();
    expect(plan.supersedeIds).toEqual([]);
  });

  it("handles a first send with no siblings", () => {
    expect(planEstimateResend([], "HP-2026-001")).toEqual({ blockedBy: null, supersedeIds: [] });
  });
});
