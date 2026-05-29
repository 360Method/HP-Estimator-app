import { describe, expect, it } from "vitest";
import {
  IDS_CATEGORIES,
  isValidCategory,
  marginFloorDedupeKey,
  buildMarginFloorIssue,
  estimateVarianceDedupeKey,
  buildEstimateVarianceIssue,
  isVisitSlipped,
  buildVisitSlipIssue,
  visitSlipDedupeKey,
  VISIT_SLIP_GRACE_MS,
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

describe("buildEstimateVarianceIssue", () => {
  it("creates a CAT-4 issue keyed separately from the margin-floor issue", () => {
    const issue = buildEstimateVarianceIssue({ opportunityId: "opp-9", title: "Smith remodel", variance: 0.22 });
    expect(issue.category).toBe("CAT-4");
    expect(issue.source).toBe("estimate_variance");
    expect(issue.dedupeKey).toBe("estimate_variance:opp-9");
    expect(issue.dedupeKey).not.toBe(marginFloorDedupeKey("opp-9"));
    expect(issue.title).toContain("22% over");
  });
  it("variance dedupe key is opportunity-scoped", () => {
    expect(estimateVarianceDedupeKey("opp-1")).toBe("estimate_variance:opp-1");
  });
});

describe("isVisitSlipped", () => {
  const NOW = 1_000 * VISIT_SLIP_GRACE_MS; // arbitrary large now
  it("is slipped when non-terminal and >1 week past schedule", () => {
    expect(isVisitSlipped(NOW - VISIT_SLIP_GRACE_MS - 1, "scheduled", NOW)).toBe(true);
    expect(isVisitSlipped(NOW - VISIT_SLIP_GRACE_MS - 1, "open", NOW)).toBe(true);
    expect(isVisitSlipped(NOW - VISIT_SLIP_GRACE_MS - 1, "in_progress", NOW)).toBe(true);
  });
  it("is not slipped within the grace window", () => {
    expect(isVisitSlipped(NOW - VISIT_SLIP_GRACE_MS + 1000, "scheduled", NOW)).toBe(false);
  });
  it("is never slipped when completed or skipped", () => {
    expect(isVisitSlipped(NOW - 10 * VISIT_SLIP_GRACE_MS, "completed", NOW)).toBe(false);
    expect(isVisitSlipped(NOW - 10 * VISIT_SLIP_GRACE_MS, "skipped", NOW)).toBe(false);
  });
  it("is not slipped without a scheduled date", () => {
    expect(isVisitSlipped(null, "scheduled", NOW)).toBe(false);
    expect(isVisitSlipped(undefined, "open", NOW)).toBe(false);
  });
});

describe("buildVisitSlipIssue", () => {
  it("creates a CAT-2 visit_slip issue keyed by work order", () => {
    const now = 30 * 24 * 60 * 60 * 1000;
    const issue = buildVisitSlipIssue({ workOrderId: 42, type: "spring", scheduledDateMs: now - 14 * 24 * 60 * 60 * 1000, nowMs: now });
    expect(issue.category).toBe("CAT-2");
    expect(issue.source).toBe("visit_slip");
    expect(issue.dedupeKey).toBe("visit_slip:wo:42");
    expect(visitSlipDedupeKey(42)).toBe("visit_slip:wo:42");
    expect(issue.title).toContain("14 days");
    expect(issue.title).toContain("spring");
  });
});
