/**
 * scripts/build-pricebook-seed.ts
 *
 * Flattens the hard-coded estimate catalog (client/src/lib/phases.ts — still
 * the seed source of truth until cutover) plus the maintenance starter list
 * below into server/osCore/seed/pricebook-seed.json. The committed JSON is
 * applied at boot by server/osCore/priceBookSeed.ts with the never-clobber
 * rule: rows the owner edited (source='human') are never overwritten.
 *
 * Run after any phases.ts catalog change:
 *   npx tsx scripts/build-pricebook-seed.ts
 *
 * All rates here are INTERNAL COST figures (sub/tech rates) — margin is
 * applied by the calc engine, never stored here.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_PHASES } from "../client/src/lib/phases";
import { DEFAULT_INTERNAL_LABOR_COST_RATE } from "../client/src/lib/productionRateAudit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../server/osCore/seed/pricebook-seed.json");

type SeedItem = {
  itemKey: string;
  kind: "remodel_stage" | "maintenance";
  phase: number | null;
  category: string;
  name: string;
  shortName: string;
  unitType: string;
  laborMode: "hr" | "flat";
  laborRate: number;
  hrsPerUnit: number;
  flatRatePerUnit: number;
  hasTiers: boolean;
  tiersJson: string | null;
  wastePct: number;
  hasPaintPrep: boolean;
  defaultQty: number;
  salesDesc: string;
  sowTemplate: string;
  active: boolean;
  sortOrder: number;
};

// ─── Remodel items, straight from the live catalog ───────────────────────────
const remodel: SeedItem[] = [];
let sort = 0;
for (const phase of ALL_PHASES) {
  for (const item of phase.items) {
    remodel.push({
      itemKey: item.id,
      kind: "remodel_stage",
      phase: phase.id,
      category: phase.name,
      name: item.name,
      shortName: item.shortName,
      unitType: item.unitType,
      laborMode: item.laborMode,
      laborRate: item.laborRate,
      hrsPerUnit: item.hrsPerUnit,
      flatRatePerUnit: item.flatRatePerUnit,
      hasTiers: item.hasTiers,
      tiersJson: item.hasTiers ? JSON.stringify(item.tiers) : null,
      wastePct: item.wastePct,
      hasPaintPrep: item.hasPaintPrep,
      defaultQty: 0,
      salesDesc: item.salesDesc,
      sowTemplate: item.sowTemplate,
      active: true,
      sortOrder: sort++,
    });
  }
}

// ─── Maintenance starter list ─────────────────────────────────────────────────
// Hours are conservative tech estimates at the internal labor cost rate.
// Owner reviews and reprices these from /os/pricebook.
const HR = DEFAULT_INTERNAL_LABOR_COST_RATE; // 100 — internal tech cost $/hr
function maint(
  key: string, category: string, name: string, shortName: string,
  unitType: string, hrsPerUnit: number, defaultQty: number,
  salesDesc: string, sowTemplate: string,
): SeedItem {
  return {
    itemKey: key, kind: "maintenance", phase: null, category,
    name, shortName, unitType,
    laborMode: "hr", laborRate: HR, hrsPerUnit, flatRatePerUnit: 0,
    hasTiers: false, tiersJson: null, wastePct: 0, hasPaintPrep: false,
    defaultQty, salesDesc, sowTemplate, active: true, sortOrder: sort++,
  };
}

const maintenance: SeedItem[] = [
  // Exterior upkeep
  maint("maint-gutter-clean", "Exterior Upkeep", "Gutter Cleaning", "Gutter cleaning", "lf", 0.025, 0,
    "Clear gutters and check flow so water drains away from the home.",
    "Gutter cleaning and flow check — {qty} lf"),
  maint("maint-downspout-flush", "Exterior Upkeep", "Downspout Flush & Check", "Downspout flush", "unit", 0.25, 1,
    "Flush downspouts and confirm water discharges away from the foundation.",
    "Downspout flush and discharge check — {qty} downspout(s)"),
  maint("maint-pressure-wash", "Exterior Upkeep", "Pressure Washing", "Pressure wash", "sqft", 0.008, 0,
    "Pressure wash siding, walkways, or decking to remove buildup.",
    "Pressure washing — {qty} sqft"),
  maint("maint-ext-caulk", "Exterior Upkeep", "Exterior Caulking & Sealing", "Exterior caulking", "lf", 0.05, 0,
    "Re-seal exterior gaps and joints to keep water and drafts out.",
    "Exterior caulking and sealing — {qty} lf"),
  maint("maint-screen-repair", "Exterior Upkeep", "Window Screen Repair", "Screen repair", "unit", 0.5, 1,
    "Re-screen or repair damaged window screens.",
    "Window screen repair — {qty} screen(s)"),
  maint("maint-deck-seal", "Exterior Upkeep", "Deck Cleaning & Re-Seal", "Deck re-seal", "sqft", 0.015, 0,
    "Clean and re-seal deck surfaces to protect the wood.",
    "Deck cleaning and re-seal — {qty} sqft"),

  // Interior care
  maint("maint-tub-recaulk", "Interior Care", "Tub / Shower Re-Caulk", "Tub re-caulk", "unit", 1.5, 1,
    "Strip failing caulk and re-seal the tub or shower surround.",
    "Tub/shower re-caulk — {qty} surround(s)"),
  maint("maint-int-caulk", "Interior Care", "Interior Caulk Touch-Up", "Interior caulk", "lf", 0.04, 0,
    "Touch up interior caulk lines at counters, trim, and fixtures.",
    "Interior caulk touch-up — {qty} lf"),
  maint("maint-door-adjust", "Interior Care", "Door Adjustment & Hardware", "Door adjustment", "unit", 0.5, 1,
    "Adjust sticking doors and tighten hinges, knobs, and strike plates.",
    "Door adjustment and hardware tune-up — {qty} door(s)"),
  maint("maint-weatherstrip", "Interior Care", "Weatherstripping Replacement", "Weatherstripping", "unit", 0.75, 1,
    "Replace worn weatherstripping to stop drafts and energy loss.",
    "Weatherstripping replacement — {qty} door(s)"),
  maint("maint-drywall-patch", "Interior Care", "Drywall Patch (Small)", "Drywall patch", "unit", 1.0, 1,
    "Patch, texture, and ready-for-paint small drywall damage.",
    "Small drywall patch and texture — {qty} patch(es)"),
  maint("maint-grout-touchup", "Interior Care", "Grout Touch-Up", "Grout touch-up", "sqft", 0.2, 0,
    "Repair and refresh failing grout lines in tiled areas.",
    "Grout touch-up — {qty} sqft"),

  // Safety & systems
  maint("maint-detector", "Safety & Systems", "Smoke / CO Detector Replacement", "Detector swap", "unit", 0.3, 1,
    "Replace aging smoke and CO detectors and verify operation.",
    "Smoke/CO detector replacement — {qty} unit(s)"),
  maint("maint-furnace-filter", "Safety & Systems", "Furnace Filter Replacement", "Furnace filter", "unit", 0.25, 1,
    "Swap the furnace filter to keep the HVAC system breathing.",
    "Furnace filter replacement — {qty} filter(s)"),
  maint("maint-dryer-vent", "Safety & Systems", "Dryer Vent Cleaning", "Dryer vent", "unit", 1.0, 1,
    "Clean the dryer vent run to cut fire risk and dry times.",
    "Dryer vent cleaning — {qty} run(s)"),
  maint("maint-wh-flush", "Safety & Systems", "Water Heater Flush", "Water heater flush", "unit", 1.25, 1,
    "Flush sediment from the water heater to extend its life.",
    "Water heater flush — {qty} unit(s)"),
  maint("maint-gfci", "Safety & Systems", "GFCI Outlet Replacement", "GFCI replace", "unit", 0.5, 1,
    "Replace worn or non-tripping GFCI outlets.",
    "GFCI outlet replacement — {qty} outlet(s)"),
  maint("maint-light-fixture", "Safety & Systems", "Light Fixture Swap", "Fixture swap", "unit", 0.75, 1,
    "Remove the old fixture and install a customer-supplied replacement.",
    "Light fixture swap — {qty} fixture(s)"),
  maint("maint-ceiling-fan", "Safety & Systems", "Ceiling Fan Install", "Ceiling fan", "unit", 1.5, 1,
    "Install a customer-supplied ceiling fan on an existing rated box.",
    "Ceiling fan install — {qty} fan(s)"),
  maint("maint-disposal", "Safety & Systems", "Garbage Disposal Replacement", "Disposal replace", "unit", 1.25, 1,
    "Swap out a failed garbage disposal with a like-for-like unit.",
    "Garbage disposal replacement — {qty} unit(s)"),
  maint("maint-toilet-rebuild", "Safety & Systems", "Toilet Internals Rebuild", "Toilet rebuild", "unit", 1.0, 1,
    "Replace flapper, fill valve, and supply line to stop running water.",
    "Toilet internals rebuild — {qty} toilet(s)"),
  maint("maint-faucet", "Safety & Systems", "Faucet Replacement", "Faucet replace", "unit", 1.25, 1,
    "Replace a worn faucet with a customer-supplied fixture.",
    "Faucet replacement — {qty} faucet(s)"),
];

const bundle = {
  generatedAt: new Date().toISOString(),
  counts: { remodel: remodel.length, maintenance: maintenance.length },
  items: [...remodel, ...maintenance],
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(bundle, null, 2));
console.log(`pricebook-seed.json written: ${remodel.length} remodel + ${maintenance.length} maintenance items`);
