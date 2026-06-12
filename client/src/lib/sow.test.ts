/**
 * buildPortalPhases — the wizard and the full builder both serialize the
 * customer-facing estimate through this. Custom/maintenance items must ship
 * as their own group so portal line items always sum to the charged total,
 * and nothing cost-side may leak into the output.
 */
import { describe, expect, it } from "vitest";
import { ALL_PHASES } from "./phases";
import { calcCustomItem, calcPhase, calcTotals } from "./calc";
import { buildPortalPhases, buildSowBullets, CUSTOM_ITEMS_PHASE_NAME } from "./sow";
import type { CustomLineItem, GlobalSettings } from "./types";

const GLOBAL: GlobalSettings = {
  markupPct: 50, laborRate: 100, paintRate: 80,
  taxEnabled: false, taxRateCode: "0603", customTaxPct: 8.9,
} as GlobalSettings;

function maintenanceItem(over: Partial<CustomLineItem> = {}): CustomLineItem {
  return {
    id: "ci1", phaseId: 0, description: "Gutter Cleaning", unitType: "lf",
    qty: 120, matCostPerUnit: 0, laborHrsPerUnit: 0.025, laborRate: 100,
    notes: "pricebook:maint-gutter-clean", markupPct: null,
    ...over,
  };
}

describe("buildPortalPhases", () => {
  it("ships custom/maintenance items as their own group that sums to the total", () => {
    const phases = ALL_PHASES.map((p) => ({
      ...p,
      items: p.items.map((i) =>
        i.id === "p1-site" ? { ...i, enabled: true, qty: 2 } : i,
      ),
    }));
    const customItems = [maintenanceItem()];
    const phaseResults = phases.map((p) => calcPhase(p, GLOBAL));
    const customResults = customItems.map((ci) => calcCustomItem(ci, GLOBAL));
    const totals = calcTotals(phaseResults, customResults);

    const active = phases
      .map((phase, idx) => {
        const activeItems = phase.items.filter((i) => i.enabled && i.qty > 0);
        if (activeItems.length === 0) return null;
        return { phase, result: phaseResults[idx], activeItems, bullets: buildSowBullets(phase, activeItems) };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);

    const portal = buildPortalPhases(active, customItems, customResults);

    const maintGroup = portal.find((p) => p.phaseName === CUSTOM_ITEMS_PHASE_NAME);
    expect(maintGroup).toBeDefined();
    expect(maintGroup!.items).toHaveLength(1);
    expect(maintGroup!.items[0].name).toBe("Gutter Cleaning");

    const lineSum = portal.reduce((s, p) => s + p.items.reduce((a, i) => a + i.amount, 0), 0);
    expect(Math.abs(lineSum - totals.totalPrice)).toBeLessThan(1); // rounding cents
  });

  it("omits the custom group when there are no custom items", () => {
    const portal = buildPortalPhases([], [], []);
    expect(portal.find((p) => p.phaseName === CUSTOM_ITEMS_PHASE_NAME)).toBeUndefined();
  });

  it("never leaks cost-side fields", () => {
    const customItems = [maintenanceItem()];
    const customResults = customItems.map((ci) => calcCustomItem(ci, GLOBAL));
    const portal = buildPortalPhases([], customItems, customResults);
    const json = JSON.stringify(portal);
    for (const banned of ["hardCost", "laborCost", "matCost", "markup", "gm", "laborHrs"]) {
      expect(json.includes(banned), `output must not contain ${banned}`).toBe(false);
    }
  });
});
