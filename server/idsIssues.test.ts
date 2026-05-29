import { describe, expect, it } from "vitest";
import {
  IDS_CATEGORIES,
  isValidCategory,
  marginFloorDedupeKey,
  buildMarginFloorIssue,
} from "./lib/idsIssues";

describe("IDS categories", () => {
  it("defines exactly the 8 BOS categories", () => {
    expect(Object.keys(IDS_CATEGORIES)).toEqual([
      "CAT-1",
      "CAT-2",
      "CAT-3",
      "CAT-4",
      "CAT-5",
      "CAT-6",
      "CAT-7",
      "CAT-8",
    ]);
  });
  it("validates category membership", () => {
    expect(isValidCategory("CAT-4")).toBe(true);
    expect(isValidCategory("CAT-9")).toBe(false);
    expect(isValidCategory("margin")).toBe(false);
  });
});

describe("marginFloorDedupeKey", () => {
  it("is stable and opportunity-scoped", () => {
    expect(marginFloorDedupeKey("opp-123")).toBe("margin_floor:opp-123");
    expect(marginFloorDedupeKey("opp-123")).toBe(marginFloorDedupeKey("opp-123"));
    expect(marginFloorDedupeKey("opp-1")).not.toBe(marginFloorDedupeKey("opp-2"));
  });
});

describe("buildMarginFloorIssue", () => {
  it("creates a high-priority CAT-4 issue with GM vs floor in the statement", () => {
    const issue = buildMarginFloorIssue({
      opportunityId: "opp-9",
      title: "Smith bathroom remodel",
      grossMarginBps: 2000,
      minGmBps: 3000,
    });
    expect(issue.category).toBe("CAT-4");
    expect(issue.source).toBe("margin_floor");
    expect(issue.priority).toBe("high");
    expect(issue.dedupeKey).toBe("margin_floor:opp-9");
    expect(issue.title).toContain("Smith bathroom remodel");
    expect(issue.title).toContain("20.0% GM");
    expect(issue.title).toContain("30% floor");
  });
  it("falls back to the opportunity id when no title is given", () => {
    const issue = buildMarginFloorIssue({ opportunityId: "opp-x" });
    expect(issue.title).toContain("opp-x");
    expect(issue.dedupeKey).toBe("margin_floor:opp-x");
  });
});
