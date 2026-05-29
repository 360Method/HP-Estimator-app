import { describe, expect, it } from "vitest";
import {
  HOMEOWNER_TIERS,
  PORTFOLIO_TIERS,
  BILLING_CADENCES,
  homeownerPriceEnvKey,
  portfolioPriceEnvKey,
  INTERIOR_ADDON_PRICE_ENV_KEY,
  requiredMembershipPriceEnvKeys,
  isHomeownerTier,
  isPortfolioTier,
} from "../shared/threeSixtyContract";
import { ALL_TIERS } from "../shared/threeSixtyTiers";

describe("360 wire contract — tier vocabularies", () => {
  it("homeowner tiers are bronze/silver/gold and match threeSixtyTiers", () => {
    expect([...HOMEOWNER_TIERS]).toEqual(["bronze", "silver", "gold"]);
    // The homeowner contract must equal the canonical tier definitions.
    expect([...HOMEOWNER_TIERS].sort()).toEqual([...ALL_TIERS].sort());
  });
  it("portfolio tiers are a DIFFERENT vocabulary (the bug was mixing them)", () => {
    expect([...PORTFOLIO_TIERS]).toEqual(["exterior_shield", "full_coverage", "max"]);
    // No overlap between the two vocabularies.
    for (const t of PORTFOLIO_TIERS) expect(isHomeownerTier(t)).toBe(false);
    for (const t of HOMEOWNER_TIERS) expect(isPortfolioTier(t)).toBe(false);
  });
  it("cadences are monthly/quarterly/annual", () => {
    expect([...BILLING_CADENCES]).toEqual(["monthly", "quarterly", "annual"]);
  });
});

describe("360 wire contract — Stripe price env keys", () => {
  it("builds the exact homeowner key names the backend resolves", () => {
    expect(homeownerPriceEnvKey("bronze", "monthly")).toBe("STRIPE_PRICE_BRONZE_MONTHLY");
    expect(homeownerPriceEnvKey("gold", "annual")).toBe("STRIPE_PRICE_GOLD_ANNUAL");
  });
  it("builds the exact portfolio key names the backend resolves", () => {
    expect(portfolioPriceEnvKey("exterior_shield", "monthly")).toBe("STRIPE_PRICE_PORTFOLIO_EXTERIOR_MONTHLY");
    expect(portfolioPriceEnvKey("full_coverage", "quarterly")).toBe("STRIPE_PRICE_PORTFOLIO_FULL_QUARTERLY");
    expect(portfolioPriceEnvKey("max", "annual")).toBe("STRIPE_PRICE_PORTFOLIO_MAX_ANNUAL");
  });
  it("requires exactly 19 membership price keys (9 + 9 + 1)", () => {
    const keys = requiredMembershipPriceEnvKeys();
    expect(keys.length).toBe(19);
    expect(new Set(keys).size).toBe(19); // no dupes
    expect(keys).toContain(INTERIOR_ADDON_PRICE_ENV_KEY);
  });
  it("pins the full required key set (regression guard)", () => {
    expect(requiredMembershipPriceEnvKeys().sort()).toEqual(
      [
        "STRIPE_PRICE_BRONZE_MONTHLY",
        "STRIPE_PRICE_BRONZE_QUARTERLY",
        "STRIPE_PRICE_BRONZE_ANNUAL",
        "STRIPE_PRICE_SILVER_MONTHLY",
        "STRIPE_PRICE_SILVER_QUARTERLY",
        "STRIPE_PRICE_SILVER_ANNUAL",
        "STRIPE_PRICE_GOLD_MONTHLY",
        "STRIPE_PRICE_GOLD_QUARTERLY",
        "STRIPE_PRICE_GOLD_ANNUAL",
        "STRIPE_PRICE_PORTFOLIO_EXTERIOR_MONTHLY",
        "STRIPE_PRICE_PORTFOLIO_EXTERIOR_QUARTERLY",
        "STRIPE_PRICE_PORTFOLIO_EXTERIOR_ANNUAL",
        "STRIPE_PRICE_PORTFOLIO_FULL_MONTHLY",
        "STRIPE_PRICE_PORTFOLIO_FULL_QUARTERLY",
        "STRIPE_PRICE_PORTFOLIO_FULL_ANNUAL",
        "STRIPE_PRICE_PORTFOLIO_MAX_MONTHLY",
        "STRIPE_PRICE_PORTFOLIO_MAX_QUARTERLY",
        "STRIPE_PRICE_PORTFOLIO_MAX_ANNUAL",
        "STRIPE_PRICE_INTERIOR_ADDON_ANNUAL_PER_DOOR",
      ].sort(),
    );
  });
});
