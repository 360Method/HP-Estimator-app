import { describe, it, expect } from "vitest";
import {
  COMMISSION_GATE_GM_BPS,
  MAX_COMMISSION_RATE_BPS,
  commissionStatus,
  commissionCents,
} from "./commission";

describe("commissionStatus", () => {
  it("is ineligible below the 40% gate, eligible at exactly 4000 bps", () => {
    expect(commissionStatus({ grossMarginBps: 3999, fullyPaid: true, commissionPaidAt: null })).toBe("ineligible");
    expect(commissionStatus({ grossMarginBps: 4000, fullyPaid: true, commissionPaidAt: null })).toBe("payable");
    expect(COMMISSION_GATE_GM_BPS).toBe(4000);
  });

  it("is ineligible when GM was never audited (null/undefined)", () => {
    expect(commissionStatus({ grossMarginBps: null, fullyPaid: true, commissionPaidAt: null })).toBe("ineligible");
    expect(commissionStatus({ grossMarginBps: undefined, fullyPaid: true, commissionPaidAt: null })).toBe("ineligible");
  });

  it("awaits payment until fully collected", () => {
    expect(commissionStatus({ grossMarginBps: 4500, fullyPaid: false, commissionPaidAt: null })).toBe("awaiting_payment");
    expect(commissionStatus({ grossMarginBps: 4500, fullyPaid: true, commissionPaidAt: null })).toBe("payable");
  });

  it("paid_out wins once commissionPaidAt is set", () => {
    expect(commissionStatus({ grossMarginBps: 4500, fullyPaid: true, commissionPaidAt: new Date() })).toBe("paid_out");
    expect(commissionStatus({ grossMarginBps: 4500, fullyPaid: false, commissionPaidAt: "2026-06-11T00:00:00Z" })).toBe("paid_out");
    // but an ineligible job stays ineligible even if someone marked it paid
    expect(commissionStatus({ grossMarginBps: 3000, fullyPaid: true, commissionPaidAt: new Date() })).toBe("ineligible");
  });
});

describe("commissionCents", () => {
  it("computes the SOP's worked example: $10,000 at 8% = $800", () => {
    expect(commissionCents(1_000_000, 800)).toBe(80_000);
  });

  it("rounds to the nearest cent", () => {
    // $123.45 job at 3.33% = 411.0885 cents -> 411
    expect(commissionCents(12_345, 333)).toBe(411);
    // half-cent rounds up: 150 cents at 1% = 1.5 -> 2
    expect(commissionCents(150, 100)).toBe(2);
  });

  it("pays zero at or above the 10% rate cap (misconfiguration guard)", () => {
    expect(commissionCents(1_000_000, MAX_COMMISSION_RATE_BPS)).toBe(0);
    expect(commissionCents(1_000_000, 1500)).toBe(0);
    expect(commissionCents(1_000_000, 999)).toBe(99_900);
  });

  it("pays zero on zero/negative/garbage inputs", () => {
    expect(commissionCents(0, 800)).toBe(0);
    expect(commissionCents(-500, 800)).toBe(0);
    expect(commissionCents(1_000_000, 0)).toBe(0);
    expect(commissionCents(1_000_000, -100)).toBe(0);
    expect(commissionCents(NaN, 800)).toBe(0);
    expect(commissionCents(1_000_000, NaN)).toBe(0);
  });
});
