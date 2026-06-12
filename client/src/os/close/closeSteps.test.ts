import { describe, expect, it } from "vitest";
import { deriveCloseSteps, normalizeStep, nextStep, prevStep } from "./closeSteps";

const base = {
  hasRoadmap: true,
  alreadyMember: false,
  estimateStatus: "sent" as string | null,
  depositAmountCents: 75000,
  depositInvoiceStatus: null as string | null,
};

describe("deriveCloseSteps", () => {
  it("full sequence for a non-member with roadmap, estimate, and deposit", () => {
    expect(deriveCloseSteps(base)).toEqual([
      "preflight", "roadmap", "membership", "estimate", "sign", "pay", "done",
    ]);
  });

  it("skips membership when the property is already enrolled", () => {
    expect(deriveCloseSteps({ ...base, alreadyMember: true })).toEqual([
      "preflight", "roadmap", "estimate", "sign", "pay", "done",
    ]);
  });

  it("skips roadmap when there are no deliverables", () => {
    expect(deriveCloseSteps({ ...base, hasRoadmap: false })).toEqual([
      "preflight", "membership", "estimate", "sign", "pay", "done",
    ]);
  });

  it("skips pay when the deposit is zero", () => {
    expect(deriveCloseSteps({ ...base, depositAmountCents: 0 })).toEqual([
      "preflight", "roadmap", "membership", "estimate", "sign", "done",
    ]);
  });

  it("re-entry after approval keeps sign (banner) and pay while the deposit is unpaid", () => {
    expect(deriveCloseSteps({ ...base, estimateStatus: "approved", depositInvoiceStatus: "due" })).toEqual([
      "preflight", "roadmap", "membership", "estimate", "sign", "pay", "done",
    ]);
  });

  it("drops pay once the deposit invoice is paid", () => {
    expect(deriveCloseSteps({ ...base, estimateStatus: "approved", depositInvoiceStatus: "paid" })).toEqual([
      "preflight", "roadmap", "membership", "estimate", "sign", "done",
    ]);
  });

  it("skips estimate, sign, and pay when nothing is synced to the portal", () => {
    expect(deriveCloseSteps({ ...base, estimateStatus: null })).toEqual([
      "preflight", "roadmap", "membership", "done",
    ]);
  });
});

describe("step navigation helpers", () => {
  const steps = deriveCloseSteps(base);

  it("normalizeStep echoes a valid ?step= and falls back to preflight otherwise", () => {
    expect(normalizeStep(steps, "sign")).toBe("sign");
    expect(normalizeStep(steps, "bogus")).toBe("preflight");
    expect(normalizeStep(steps, null)).toBe("preflight");
    // A step that exists in general but was skipped in this derivation
    const memberSteps = deriveCloseSteps({ ...base, alreadyMember: true });
    expect(normalizeStep(memberSteps, "membership")).toBe("preflight");
  });

  it("nextStep and prevStep walk the derived sequence", () => {
    expect(nextStep(steps, "preflight")).toBe("roadmap");
    expect(nextStep(steps, "done")).toBeNull();
    expect(prevStep(steps, "roadmap")).toBe("preflight");
    expect(prevStep(steps, "preflight")).toBeNull();
  });
});
