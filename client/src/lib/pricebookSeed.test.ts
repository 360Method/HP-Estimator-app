/**
 * Anti-drift guard: the committed pricebook-seed.json must stay in sync with
 * the hard-coded catalog (ALL_PHASES) until cutover. If phases.ts changes,
 * re-run: npx tsx scripts/build-pricebook-seed.ts
 */
import { describe, expect, it } from "vitest";
import { ALL_PHASES } from "./phases";
import seed from "../../../server/osCore/seed/pricebook-seed.json";

type SeedItem = {
  itemKey: string;
  kind: string;
  phase: number | null;
  category: string;
  laborMode: string;
  laborRate: number;
  hrsPerUnit: number;
};

const items = (seed as { items: SeedItem[] }).items;
const remodelSeed = items.filter((i) => i.kind === "remodel_stage");
const maintenanceSeed = items.filter((i) => i.kind === "maintenance");

describe("pricebook seed", () => {
  it("contains every catalog item from ALL_PHASES, and nothing extra", () => {
    const catalogIds = new Set(ALL_PHASES.flatMap((p) => p.items.map((i) => i.id)));
    const seedIds = new Set(remodelSeed.map((i) => i.itemKey));
    const missing = [...catalogIds].filter((id) => !seedIds.has(id));
    const extra = [...seedIds].filter((id) => !catalogIds.has(id));
    expect(missing, `catalog items missing from seed (re-run build-pricebook-seed): ${missing.join(", ")}`).toEqual([]);
    expect(extra, `seed items not in catalog: ${extra.join(", ")}`).toEqual([]);
  });

  it("remodel seed rates match the catalog", () => {
    const byId = new Map(ALL_PHASES.flatMap((p) => p.items.map((i) => [i.id, i] as const)));
    for (const s of remodelSeed) {
      const cat = byId.get(s.itemKey);
      expect(cat, s.itemKey).toBeDefined();
      expect(s.laborRate, `${s.itemKey} laborRate`).toBe(cat!.laborRate);
      expect(s.hrsPerUnit, `${s.itemKey} hrsPerUnit`).toBe(cat!.hrsPerUnit);
    }
  });

  it("maintenance items are well-formed", () => {
    expect(maintenanceSeed.length).toBeGreaterThan(0);
    for (const m of maintenanceSeed) {
      expect(m.itemKey.startsWith("maint-"), `${m.itemKey} key prefix`).toBe(true);
      expect(m.phase, `${m.itemKey} phase must be null`).toBeNull();
      expect(m.category.length).toBeGreaterThan(0);
    }
  });
});
