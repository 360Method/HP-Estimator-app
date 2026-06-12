import { describe, expect, it } from "vitest";
import {
  computeQuickQuote,
  presetFromRow,
  roundToHundred,
  type QuotePreset,
} from "./remodelQuickQuote";

const bath: QuotePreset = {
  presetKey: "bath-full",
  label: "Full bathroom remodel",
  description: "Tear-out to turnkey.",
  unitType: "sqft",
  tiers: {
    good: { rateLow: 250, rateHigh: 350, name: "Good", desc: "Solid stock materials." },
    better: { rateLow: 350, rateHigh: 475, name: "Better", desc: "Upgraded tile and fixtures." },
    best: { rateLow: 475, rateHigh: 650, name: "Best", desc: "Custom tile, premium fixtures." },
  },
  lfAddons: [{ key: "vanity-run", label: "Vanity and counter run", rateLow: 350, rateHigh: 600 }],
  baseFeeLow: 9000,
  baseFeeHigh: 11000,
  minSqft: 35,
};

describe("computeQuickQuote", () => {
  it("prices a typical room across all three tiers, low <= high, rounded to hundreds", () => {
    const q = computeQuickQuote(bath, { sqft: 40 });
    expect(q.tiers.map((t) => t.tier)).toEqual(["good", "better", "best"]);
    for (const t of q.tiers) {
      expect(t.low).toBeLessThanOrEqual(t.high);
      expect(t.low % 100).toBe(0);
      expect(t.high % 100).toBe(0);
    }
    // good: 250*40=10000 low, 350*40=14000 high
    expect(q.tiers[0].low).toBe(10000);
    expect(q.tiers[0].high).toBe(14000);
    // tiers escalate
    expect(q.tiers[1].low).toBeGreaterThan(q.tiers[0].low);
    expect(q.tiers[2].low).toBeGreaterThan(q.tiers[1].low);
  });

  it("applies the base fee floor on tiny rooms and flags below-min sqft", () => {
    const q = computeQuickQuote(bath, { sqft: 20 });
    // good low: max(9000, 250*20=5000) = 9000
    expect(q.tiers[0].low).toBe(9000);
    expect(q.belowMinSqft).toBe(true);
  });

  it("adds lineal-foot addons on top of the area price", () => {
    const withVanity = computeQuickQuote(bath, { sqft: 40, lfByAddon: { "vanity-run": 6 } });
    const without = computeQuickQuote(bath, { sqft: 40 });
    // 6 lf * 350 = 2100 low, 6 * 600 = 3600 high
    expect(withVanity.tiers[0].low - without.tiers[0].low).toBe(2100);
    expect(withVanity.tiers[0].high - without.tiers[0].high).toBe(3600);
  });

  it("ignores unknown or zero addon entries", () => {
    const q = computeQuickQuote(bath, { sqft: 40, lfByAddon: { nonsense: 10, "vanity-run": 0 } });
    expect(q.tiers[0].low).toBe(10000);
  });

  it("shows member savings without changing the quoted range", () => {
    const member = computeQuickQuote(bath, { sqft: 40 }, "silver");
    const guest = computeQuickQuote(bath, { sqft: 40 });
    expect(member.tiers[0].low).toBe(guest.tiers[0].low);
    expect(member.tiers[0].memberSavingsLow).toBeGreaterThan(0);
    expect(member.tiers[0].memberSavingsHigh!).toBeGreaterThanOrEqual(member.tiers[0].memberSavingsLow!);
    expect(guest.tiers[0].memberSavingsLow).toBeUndefined();
  });

  it("never lets a rounded high fall below the low", () => {
    const narrow: QuotePreset = {
      ...bath,
      tiers: { ...bath.tiers, good: { ...bath.tiers.good, rateLow: 250, rateHigh: 250.4 } },
    };
    const q = computeQuickQuote(narrow, { sqft: 40 });
    expect(q.tiers[0].high).toBeGreaterThanOrEqual(q.tiers[0].low);
  });

  it("clamps negative sqft to zero (base fee floor carries the price)", () => {
    const q = computeQuickQuote(bath, { sqft: -5 });
    expect(q.tiers[0].low).toBe(9000);
    expect(q.belowMinSqft).toBe(false);
  });
});

describe("presetFromRow", () => {
  it("parses a DB row with numeric strings", () => {
    const preset = presetFromRow({
      presetKey: "bath-full",
      label: "Full bathroom remodel",
      description: "desc",
      unitType: "sqft",
      tiersJson: JSON.stringify(bath.tiers),
      lfAddonsJson: JSON.stringify(bath.lfAddons),
      baseFeeLow: "9000",
      baseFeeHigh: "11000",
      minSqft: "35",
    });
    expect(preset).not.toBeNull();
    expect(preset!.baseFeeLow).toBe(9000);
    expect(preset!.lfAddons).toHaveLength(1);
  });

  it("returns null on malformed or incomplete tiers", () => {
    expect(
      presetFromRow({
        presetKey: "x",
        label: "x",
        description: null,
        unitType: "sqft",
        tiersJson: JSON.stringify({ good: bath.tiers.good }),
        lfAddonsJson: null,
        baseFeeLow: 0,
        baseFeeHigh: 0,
        minSqft: 0,
      }),
    ).toBeNull();
    expect(
      presetFromRow({
        presetKey: "x",
        label: "x",
        description: null,
        unitType: "sqft",
        tiersJson: "not json",
        lfAddonsJson: null,
        baseFeeLow: 0,
        baseFeeHigh: 0,
        minSqft: 0,
      }),
    ).toBeNull();
  });
});

describe("roundToHundred", () => {
  it("rounds to the nearest hundred", () => {
    expect(roundToHundred(10049)).toBe(10000);
    expect(roundToHundred(10050)).toBe(10100);
  });
});
