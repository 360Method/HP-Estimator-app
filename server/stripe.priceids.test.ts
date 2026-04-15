import { describe, it, expect } from "vitest";

/**
 * Validates that all required Stripe price ID env vars are set.
 * These are injected at runtime from the platform secrets store.
 * In CI / test mode they may be absent; we skip rather than fail.
 */
const REQUIRED_PRICE_IDS = [
  // 360° membership tiers
  "STRIPE_PRICE_BRONZE_MONTHLY",
  "STRIPE_PRICE_BRONZE_QUARTERLY",
  "STRIPE_PRICE_BRONZE_ANNUAL",
  "STRIPE_PRICE_SILVER_MONTHLY",
  "STRIPE_PRICE_SILVER_QUARTERLY",
  "STRIPE_PRICE_SILVER_ANNUAL",
  "STRIPE_PRICE_GOLD_MONTHLY",
  "STRIPE_PRICE_GOLD_QUARTERLY",
  "STRIPE_PRICE_GOLD_ANNUAL",
  // Portfolio tiers
  "STRIPE_PRICE_PORTFOLIO_EXTERIOR_MONTHLY",
  "STRIPE_PRICE_PORTFOLIO_EXTERIOR_QUARTERLY",
  "STRIPE_PRICE_PORTFOLIO_EXTERIOR_ANNUAL",
  "STRIPE_PRICE_PORTFOLIO_FULL_MONTHLY",
  "STRIPE_PRICE_PORTFOLIO_FULL_QUARTERLY",
  "STRIPE_PRICE_PORTFOLIO_FULL_ANNUAL",
  "STRIPE_PRICE_PORTFOLIO_MAX_MONTHLY",
  "STRIPE_PRICE_PORTFOLIO_MAX_QUARTERLY",
  "STRIPE_PRICE_PORTFOLIO_MAX_ANNUAL",
  // Interior add-on
  "STRIPE_PRICE_INTERIOR_ADDON_ANNUAL_PER_DOOR",
  // Turnover — member
  "STRIPE_PRICE_TURNOVER_STUDIO_MEMBER",
  "STRIPE_PRICE_TURNOVER_2BD1BA_MEMBER",
  "STRIPE_PRICE_TURNOVER_2BD2BA_MEMBER",
  "STRIPE_PRICE_TURNOVER_3BD2BA_MEMBER",
  "STRIPE_PRICE_TURNOVER_4BD_MEMBER",
  // Turnover — non-member
  "STRIPE_PRICE_TURNOVER_STUDIO_NONMEMBER",
  "STRIPE_PRICE_TURNOVER_2BD1BA_NONMEMBER",
  "STRIPE_PRICE_TURNOVER_2BD2BA_NONMEMBER",
  "STRIPE_PRICE_TURNOVER_3BD2BA_NONMEMBER",
  "STRIPE_PRICE_TURNOVER_4BD_NONMEMBER",
];

describe("Stripe price ID env vars", () => {
  it("all required price IDs are present and start with price_", () => {
    const missing: string[] = [];
    const malformed: string[] = [];

    for (const key of REQUIRED_PRICE_IDS) {
      const val = process.env[key];
      if (!val) {
        missing.push(key);
      } else if (!val.startsWith("price_")) {
        malformed.push(`${key}=${val}`);
      }
    }

    if (missing.length > 0 || malformed.length > 0) {
      // In CI without secrets, skip gracefully
      const allMissing = missing.length === REQUIRED_PRICE_IDS.length;
      if (allMissing) {
        console.warn("[stripe.priceids.test] No Stripe price IDs found — skipping (CI mode)");
        return;
      }
      throw new Error(
        [
          missing.length ? `Missing: ${missing.join(", ")}` : "",
          malformed.length ? `Malformed: ${malformed.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      );
    }
  });
});
