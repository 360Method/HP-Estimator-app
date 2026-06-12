/**
 * Module-load smoke test for routers with zod schema composition.
 *
 * zod 4 throws AT IMPORT TIME for some compositions (e.g. .extend() on a
 * schema carrying an object-level .refine()), which tsc cannot catch; one of
 * those took the staging deploy down on 2026-06-12. Importing the router
 * modules here makes that class of failure a red test instead of a dead
 * server.
 */
import { describe, expect, it } from "vitest";

describe("router modules load", () => {
  it("priceBook router module imports cleanly", async () => {
    const mod = await import("./priceBook");
    expect(mod.priceBookRouter).toBeDefined();
  });

  it("spotInspection router module imports cleanly", async () => {
    const mod = await import("./spotInspection");
    expect(mod.spotInspectionRouter).toBeDefined();
  });


  it("quickQuote router module imports cleanly", async () => {
    const mod = await import("./quickQuote");
    expect(mod.quickQuoteRouter).toBeDefined();
  });

  it("commissions router module imports cleanly", async () => {
    const mod = await import("./commissions");
    expect(mod.commissionsRouter).toBeDefined();
  });

  it("threeSixtyJourney router exposes forCustomer and forProperty", async () => {
    const mod = await import("./threeSixtyJourney");
    expect(mod.journeyRouter).toBeDefined();
    const procs = mod.journeyRouter._def.procedures as Record<string, unknown>;
    expect(procs.forCustomer).toBeDefined();
    expect(procs.forProperty).toBeDefined();
  });

  it("properties router module imports cleanly", async () => {
    const mod = await import("./properties");
    expect(mod.propertiesRouter).toBeDefined();
  });

  it("closeFlow router exposes the in-person approval", async () => {
    const mod = await import("./closeFlow");
    expect(mod.closeFlowRouter).toBeDefined();
    const procs = mod.closeFlowRouter._def.procedures as Record<string, unknown>;
    expect(procs.approveEstimateInPerson).toBeDefined();
  });
});
