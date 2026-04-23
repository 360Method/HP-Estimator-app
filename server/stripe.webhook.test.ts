import { describe, it, expect } from "vitest";
import Stripe from "stripe";

describe("Stripe webhook secrets", () => {
  it("STRIPE_WEBHOOK_SECRET is set and has correct format", () => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    expect(secret).toBeDefined();
    expect(secret).toMatch(/^whsec_/);
  });

  it("STRIPE_WEBHOOK_SECRET_FALLBACK is set and has correct format", () => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET_FALLBACK;
    expect(secret).toBeDefined();
    expect(secret).toMatch(/^whsec_/);
  });

  it("both secrets are different (primary vs fallback)", () => {
    const primary = process.env.STRIPE_WEBHOOK_SECRET;
    const fallback = process.env.STRIPE_WEBHOOK_SECRET_FALLBACK;
    expect(primary).not.toEqual(fallback);
  });

  it("STRIPE_SECRET_KEY is set", () => {
    const key = process.env.STRIPE_SECRET_KEY;
    expect(key).toBeDefined();
    expect(key!.length).toBeGreaterThan(10);
  });
});
