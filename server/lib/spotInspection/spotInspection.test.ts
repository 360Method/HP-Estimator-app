import { describe, expect, it } from "vitest";
import { validateMiniRoadmap } from "./processor";
import { canTransition, canApprove, assertTransition } from "./status";
import { roadmapRowVisibleToPortal } from "../../routers/portalRoadmap";
import { extractJson } from "../priorityTranslation/processor";

const goodFinding = {
  category: "Roof and Gutters",
  finding: "Moss buildup along the north slope.",
  urgency: "SOON",
  investment_range_low_usd: 300,
  investment_range_high_usd: 800,
  reasoning: "Moss holds moisture against the shingles.",
};

describe("validateMiniRoadmap", () => {
  it("accepts a well-shaped response and coerces numeric ranges", () => {
    const r = validateMiniRoadmap({
      summary_1_paragraph: "We looked at the roof.",
      findings: [{ ...goodFinding, investment_range_low_usd: "300", investment_range_high_usd: "800" }],
    });
    expect(r.findings[0].investment_range_low_usd).toBe(300);
    expect(r.findings[0].investment_range_high_usd).toBe(800);
  });

  it("rejects missing summary, empty findings, bad urgency, inverted ranges", () => {
    expect(() => validateMiniRoadmap({ findings: [goodFinding] })).toThrow(/summary/i);
    expect(() => validateMiniRoadmap({ summary_1_paragraph: "x", findings: [] })).toThrow(/no findings/i);
    expect(() =>
      validateMiniRoadmap({ summary_1_paragraph: "x", findings: [{ ...goodFinding, urgency: "MAYBE" }] }),
    ).toThrow(/urgency/i);
    expect(() =>
      validateMiniRoadmap({
        summary_1_paragraph: "x",
        findings: [{ ...goodFinding, investment_range_low_usd: 900, investment_range_high_usd: 100 }],
      }),
    ).toThrow(/range/i);
  });

  it("trims an over-long findings list to ten", () => {
    const r = validateMiniRoadmap({
      summary_1_paragraph: "x",
      findings: Array.from({ length: 14 }, (_, i) => ({ ...goodFinding, category: `Area ${i}` })),
    });
    expect(r.findings).toHaveLength(10);
  });

  it("parses a fenced Claude response end to end", () => {
    const text = '```json\n{"summary_1_paragraph":"ok","findings":[' + JSON.stringify(goodFinding) + "]}\n```";
    const r = validateMiniRoadmap(extractJson(text));
    expect(r.findings).toHaveLength(1);
  });
});

describe("spot inspection lifecycle", () => {
  it("follows the happy path", () => {
    expect(canTransition("submitted", "processing")).toBe(true);
    expect(canTransition("processing", "awaiting_review")).toBe(true);
    expect(canTransition("awaiting_review", "completed")).toBe(true);
  });

  it("allows regenerate before approval and retry after failure", () => {
    expect(canTransition("awaiting_review", "processing")).toBe(true);
    expect(canTransition("failed", "processing")).toBe(true);
  });

  it("blocks every shortcut to customer visibility", () => {
    expect(canTransition("submitted", "completed")).toBe(false);
    expect(canTransition("processing", "completed")).toBe(false);
    expect(canTransition("failed", "completed")).toBe(false);
    expect(canTransition("completed", "processing")).toBe(false);
    expect(() => assertTransition("submitted", "completed")).toThrow();
    expect(canApprove("awaiting_review")).toBe(true);
    expect(canApprove("processing")).toBe(false);
  });
});

describe("roadmapRowVisibleToPortal", () => {
  it("hides spot inspection drafts from the portal until completed", () => {
    expect(roadmapRowVisibleToPortal({ source: "spot_inspection", status: "awaiting_review" })).toBe(false);
    expect(roadmapRowVisibleToPortal({ source: "spot_inspection", status: "processing" })).toBe(false);
    expect(roadmapRowVisibleToPortal({ source: "spot_inspection", status: "failed" })).toBe(false);
    expect(roadmapRowVisibleToPortal({ source: "spot_inspection", status: "completed" })).toBe(true);
  });

  it("keeps the funnel's historical behavior, including legacy rows without a source", () => {
    expect(roadmapRowVisibleToPortal({ source: "roadmap_funnel", status: "processing" })).toBe(true);
    expect(roadmapRowVisibleToPortal({ source: null, status: "submitted" })).toBe(true);
    expect(roadmapRowVisibleToPortal({ status: "completed" })).toBe(true);
  });
});
