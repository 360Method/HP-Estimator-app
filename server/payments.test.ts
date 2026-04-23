// payments.test.ts — Validate payments router procedures are wired correctly
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("payments router", () => {
  it("getStripePublishableKey returns a publishable key when VITE_STRIPE_PUBLISHABLE_KEY is set", async () => {
    // Only run if the env var is set (CI/sandbox may not have it)
    if (!process.env.VITE_STRIPE_PUBLISHABLE_KEY) {
      console.log("[skip] VITE_STRIPE_PUBLISHABLE_KEY not set");
      return;
    }
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.payments.getStripePublishableKey();
    expect(result).toHaveProperty("publishableKey");
    expect(typeof result.publishableKey).toBe("string");
    expect(result.publishableKey.startsWith("pk_")).toBe(true);
  });

  it("getPaypalClientId returns clientId (null if not configured)", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.payments.getPaypalClientId();
    expect(result).toHaveProperty("clientId");
    // clientId can be null if not configured, or a string if configured
    expect(result.clientId === null || typeof result.clientId === "string").toBe(true);
  });
});
