/**
 * scripts/build-quickquote-seed.ts
 *
 * Builds server/osCore/seed/quickquote-seed.json: the default remodel
 * quick-quote presets (360 Method Step 8). Applied at boot by
 * server/osCore/quickQuoteSeed.ts with the never-clobber rule: presets the
 * owner edited in /os/pricebook (source='human') are never overwritten.
 *
 * Run after editing the defaults below:
 *   npx tsx scripts/build-quickquote-seed.ts
 *
 * Every figure here is RETAIL (customer price, margin already inside),
 * unlike pricebook-seed.json which is internal cost. Derivation: anchored to
 * representative compositions of the phases.ts catalog (demo, framing,
 * drywall, surfaces, fixtures, paint at each material tier plus labor at
 * billed rates, margin applied), then rounded to market-recognizable
 * Vancouver WA ranges. These are starting defaults; the owner tunes them in
 * /os/pricebook and tuned rows stick.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "../server/osCore/seed/quickquote-seed.json");

type TierDef = { rateLow: number; rateHigh: number; name: string; desc: string };

type SeedPreset = {
  presetKey: string;
  label: string;
  description: string;
  unitType: "sqft";
  tiers: { good: TierDef; better: TierDef; best: TierDef };
  lfAddons: { key: string; label: string; rateLow: number; rateHigh: number }[];
  baseFeeLow: number;
  baseFeeHigh: number;
  minSqft: number;
  sortOrder: number;
};

const presets: SeedPreset[] = [
  {
    presetKey: "bath-full",
    label: "Full bathroom remodel",
    description: "Tear-out to turnkey: demo, surfaces, fixtures, finish.",
    unitType: "sqft",
    tiers: {
      good: {
        rateLow: 250,
        rateHigh: 350,
        name: "Good",
        desc: "Quality stock fixtures and durable surfaces. A clean, solid bathroom built to last.",
      },
      better: {
        rateLow: 350,
        rateHigh: 475,
        name: "Better",
        desc: "Upgraded tile, name-brand fixtures, and nicer lighting. The noticeable step up.",
      },
      best: {
        rateLow: 475,
        rateHigh: 650,
        name: "Best",
        desc: "Custom tile work, premium fixtures, frameless glass. Magazine-page finish.",
      },
    },
    lfAddons: [
      { key: "vanity-run", label: "Vanity and counter run", rateLow: 350, rateHigh: 600 },
    ],
    baseFeeLow: 9000,
    baseFeeHigh: 11000,
    minSqft: 35,
    sortOrder: 1,
  },
  {
    presetKey: "kitchen-full",
    label: "Full kitchen remodel",
    description: "Cabinets, counters, surfaces, lighting, and finish.",
    unitType: "sqft",
    tiers: {
      good: {
        rateLow: 175,
        rateHigh: 250,
        name: "Good",
        desc: "Stock cabinets, quality laminate or entry stone counters, fresh surfaces throughout.",
      },
      better: {
        rateLow: 250,
        rateHigh: 350,
        name: "Better",
        desc: "Semi-custom cabinets, quartz counters, tile backsplash, upgraded lighting.",
      },
      best: {
        rateLow: 350,
        rateHigh: 500,
        name: "Best",
        desc: "Custom cabinetry, premium stone, designer fixtures and appliance-ready layout work.",
      },
    },
    lfAddons: [
      { key: "cabinet-run", label: "Cabinet run", rateLow: 350, rateHigh: 700 },
      { key: "counter-run", label: "Countertop run", rateLow: 90, rateHigh: 250 },
    ],
    baseFeeLow: 18000,
    baseFeeHigh: 22000,
    minSqft: 100,
    sortOrder: 2,
  },
  {
    presetKey: "flooring",
    label: "Flooring replacement",
    description: "Tear-out, prep, and new flooring across the measured area.",
    unitType: "sqft",
    tiers: {
      good: {
        rateLow: 9,
        rateHigh: 13,
        name: "Good",
        desc: "Quality LVP or carpet. Durable, water-resistant, family-proof.",
      },
      better: {
        rateLow: 13,
        rateHigh: 19,
        name: "Better",
        desc: "Premium LVP, engineered hardwood, or tile in key areas.",
      },
      best: {
        rateLow: 19,
        rateHigh: 28,
        name: "Best",
        desc: "Solid hardwood or large-format tile with upgraded prep and transitions.",
      },
    },
    lfAddons: [
      { key: "trim-base", label: "New baseboard and trim", rateLow: 6, rateHigh: 12 },
    ],
    baseFeeLow: 1200,
    baseFeeHigh: 1600,
    minSqft: 100,
    sortOrder: 3,
  },
  {
    presetKey: "basement-finish",
    label: "Basement finish",
    description: "Framing, insulation, drywall, flooring, lighting, and finish.",
    unitType: "sqft",
    tiers: {
      good: {
        rateLow: 65,
        rateHigh: 90,
        name: "Good",
        desc: "Clean finished space: framed, insulated, drywalled, painted, durable flooring.",
      },
      better: {
        rateLow: 90,
        rateHigh: 130,
        name: "Better",
        desc: "Adds a finished ceiling system, upgraded flooring, and built-in lighting design.",
      },
      best: {
        rateLow: 130,
        rateHigh: 185,
        name: "Best",
        desc: "Full living space: wet bar rough-in, premium finishes, custom built-ins.",
      },
    },
    lfAddons: [],
    baseFeeLow: 15000,
    baseFeeHigh: 19000,
    minSqft: 200,
    sortOrder: 4,
  },
  {
    presetKey: "interior-paint",
    label: "Interior repaint",
    description: "Walls, trim, and ceilings across the measured floor area.",
    unitType: "sqft",
    tiers: {
      good: {
        rateLow: 3.5,
        rateHigh: 5,
        name: "Good",
        desc: "Walls in quality washable paint, standard prep.",
      },
      better: {
        rateLow: 5,
        rateHigh: 7,
        name: "Better",
        desc: "Walls plus trim and doors, upgraded prep and caulking.",
      },
      best: {
        rateLow: 7,
        rateHigh: 10,
        name: "Best",
        desc: "Walls, trim, doors, and ceilings with premium paint and full surface repair.",
      },
    },
    lfAddons: [],
    baseFeeLow: 900,
    baseFeeHigh: 1300,
    minSqft: 150,
    sortOrder: 5,
  },
];

// Sanity: every tier range must be coherent before we write the file.
for (const p of presets) {
  for (const tier of Object.values(p.tiers)) {
    if (tier.rateLow > tier.rateHigh) {
      throw new Error(`${p.presetKey}: rateLow > rateHigh in tier ${tier.name}`);
    }
  }
  if (p.baseFeeLow > p.baseFeeHigh) throw new Error(`${p.presetKey}: baseFeeLow > baseFeeHigh`);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ builtAt: new Date().toISOString(), presets }, null, 2) + "\n");
console.log(`quickquote-seed.json written: ${presets.length} presets`);
