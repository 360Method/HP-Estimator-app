/**
 * Home-size band resolution — edge cases for the roadmap-funnel OTO.
 * Bands are internal: <2,000 standard · 2,000–3,500 large · 3,500–5,000 estate · 5,000+ grand.
 */
import { describe, it, expect } from "vitest";
import { bandForSqft, sizedBuynowPriceEnvKey, HOME_SIZE_BANDS } from "../shared/threeSixtyContract";

describe("bandForSqft", () => {
  it("maps band boundaries correctly", () => {
    expect(bandForSqft(800)).toBe("standard");
    expect(bandForSqft(1999)).toBe("standard");
    expect(bandForSqft(2000)).toBe("large");
    expect(bandForSqft(3499)).toBe("large");
    expect(bandForSqft(3500)).toBe("estate");
    expect(bandForSqft(4999)).toBe("estate");
    expect(bandForSqft(5000)).toBe("grand");
    expect(bandForSqft(12000)).toBe("grand");
  });

  it("lands missing or invalid sqft in the standard (floor) band", () => {
    expect(bandForSqft(null)).toBe("standard");
    expect(bandForSqft(undefined)).toBe("standard");
    expect(bandForSqft(0)).toBe("standard");
    expect(bandForSqft(-100)).toBe("standard");
  });
});

describe("sizedBuynowPriceEnvKey", () => {
  it("uses the customer-facing MAX vocabulary, not the internal metal code", () => {
    for (const band of HOME_SIZE_BANDS) {
      const key = sizedBuynowPriceEnvKey(band);
      expect(key).toBe(`STRIPE_PRICE_MAX_ANNUAL_BUYNOW_${band.toUpperCase()}`);
      expect(key).not.toContain("GOLD");
    }
  });
});
