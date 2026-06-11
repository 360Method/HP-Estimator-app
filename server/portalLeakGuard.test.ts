/**
 * Integration test for the portal leak-guard tRPC middleware. Builds a minimal
 * router whose resolvers return leaking and clean payloads, then exercises the
 * guard through a real tRPC caller — proving the middleware (not just the raw
 * scanner) blocks internal economics on the wire.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { router, publicProcedure } from "./_core/trpc";
import { portalLeakGuard } from "./_core/portalLeakGuard";

const guarded = publicProcedure.use(portalLeakGuard);

const testRouter = router({
  clean: guarded.query(() => ({ totalAmount: 1200_00, depositAmount: 300_00 })),
  leaky: guarded.query(() => ({ totalAmount: 1200_00, hardCostCents: 800_00 })),
  nestedLeak: guarded.query(() => ({
    estimate: { lineItems: [{ unitPrice: 150_00, grossMarginBps: 3000 }] },
  })),
});

// The guard ignores ctx; an empty object is enough for the caller.
const caller = testRouter.createCaller({} as any);

describe("portalLeakGuard middleware", () => {
  const prev = { node: process.env.NODE_ENV, svc: process.env.RAILWAY_SERVICE_NAME };
  beforeEach(() => {
    delete process.env.RAILWAY_SERVICE_NAME;
  });
  afterEach(() => {
    process.env.NODE_ENV = prev.node;
    if (prev.svc === undefined) delete process.env.RAILWAY_SERVICE_NAME;
    else process.env.RAILWAY_SERVICE_NAME = prev.svc;
  });

  it("lets a clean payload through", async () => {
    await expect(caller.clean()).resolves.toEqual({
      totalAmount: 1200_00,
      depositAmount: 300_00,
    });
  });

  it("throws on a leak when not the live prod service (local/test)", async () => {
    process.env.NODE_ENV = "test";
    await expect(caller.leaky()).rejects.toThrow(/hardCostCents/);
  });

  it("throws on a leak on the staging service (NODE_ENV=production but staging)", async () => {
    process.env.NODE_ENV = "production";
    process.env.RAILWAY_SERVICE_NAME = "hp-estimator-staging";
    await expect(caller.nestedLeak()).rejects.toThrow(/grossMarginBps/);
  });

  it("strips and logs (does not throw) on the live prod service", async () => {
    process.env.NODE_ENV = "production";
    process.env.RAILWAY_SERVICE_NAME = "HP-Estimator-app";
    await expect(caller.leaky()).resolves.toEqual({ totalAmount: 1200_00 });
  });
});
