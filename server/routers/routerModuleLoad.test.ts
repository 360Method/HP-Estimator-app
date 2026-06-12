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

  it("commissions router module imports cleanly", async () => {
    const mod = await import("./commissions");
    expect(mod.commissionsRouter).toBeDefined();
  });
});
