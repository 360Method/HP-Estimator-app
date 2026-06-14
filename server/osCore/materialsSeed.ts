/**
 * server/osCore/materialsSeed.ts
 *
 * Starter material catalog, grounded in the real Home Depot cost points from
 * the Matthew Yates kitchen + flooring job (the re-measure notes). Internal
 * COST per unit by tier; the estimate engine adds margin so these never reach
 * the customer.
 *
 * Never-clobber contract: a starter row is inserted only when no material
 * with the same (category, name) already exists. Human edits and additions
 * are never touched, and re-boot never duplicates. Tiers we don't have a real
 * number for are left at 0 for the team to fill from CFM / Home Depot.
 */
import { getDb } from "../db";
import { osMaterials } from "../../drizzle/schema";

type SeedMaterial = {
  category: string;
  name: string;
  unitType: string;
  supplier: "cfm" | "home_depot" | "other";
  good: number; goodLabel?: string;
  better?: number; betterLabel?: string;
  best?: number; bestLabel?: string;
  premium?: number; premiumLabel?: string;
  notes?: string;
};

// Real cost points from Yates 2702 (re-measure notes, East Vancouver HD #4738).
const STARTER: SeedMaterial[] = [
  {
    category: "Flooring", name: "LVP click-lock, waterproof", unitType: "sqft", supplier: "home_depot",
    good: 3.28, goodLabel: "Lifeproof 22 MIL click-lock (attached pad)",
    notes: "Yates kitchen: Lifeproof Sterling Oak, ~$66/20.1 sqft case. Add better/best/premium grades.",
  },
  {
    category: "Flooring", name: "LVP stair nose", unitType: "each", supplier: "home_depot",
    good: 45, goodLabel: "Color-matched stair nose (~94in)",
  },
  {
    category: "Flooring", name: "LVP T-molding", unitType: "each", supplier: "home_depot",
    good: 45, goodLabel: "Color-matched T-molding (~94in)",
  },
  {
    category: "Flooring", name: "Quarter round / shoe molding", unitType: "lf", supplier: "home_depot",
    good: 2, goodLabel: "Color-matched shoe molding",
  },
  {
    category: "Subfloor", name: "OSB subfloor sheet (23/32 T&G, 4x8)", unitType: "each", supplier: "home_depot",
    good: 28, goodLabel: "23/32 in T&G OSB",
  },
  {
    category: "Subfloor", name: "Subfloor screws (1000 ct box)", unitType: "each", supplier: "home_depot",
    good: 13.98, goodLabel: "Grip-Rite #8 collated",
  },
  {
    category: "Subfloor", name: "Self-leveling underlayment (50 lb)", unitType: "each", supplier: "home_depot",
    good: 12.97, goodLabel: "LevelQuik RS",
  },
  {
    category: "Kitchen", name: "Kitchen sink, 33in double bowl", unitType: "each", supplier: "home_depot",
    good: 79, goodLabel: "Glacier Bay 22ga drop-in",
    better: 165, betterLabel: "Stainless undermount 33in double",
    best: 349, bestLabel: "KOHLER Verse",
  },
  {
    category: "Kitchen", name: "Cabinet bar pull, matte black", unitType: "each", supplier: "home_depot",
    good: 2.1, goodLabel: "Liberty Essentials 5-1/16in (24-pack)",
  },
  {
    category: "Kitchen", name: "Stock shaker cabinets (per linear foot)", unitType: "lf", supplier: "home_depot",
    good: 247, goodLabel: "Hampton Bay Satin White, assembled",
    notes: "Yates: ~$2,055 for ~100in run of base + uppers. Add semi-custom / custom as better/best.",
  },
  {
    category: "HVAC", name: "Range hood, 30in ducted", unitType: "each", supplier: "home_depot",
    good: 90, goodLabel: "Broan 40000 series under-cabinet",
  },
];

export async function importMaterialsSeed(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    const existing = await db
      .select({ category: osMaterials.category, name: osMaterials.name })
      .from(osMaterials);
    const have = new Set(existing.map((r) => `${r.category.toLowerCase()}|${r.name.toLowerCase()}`));

    const toInsert = STARTER.filter(
      (m) => !have.has(`${m.category.toLowerCase()}|${m.name.toLowerCase()}`),
    ).map((m, i) => ({
      category: m.category,
      name: m.name,
      unitType: m.unitType,
      supplier: m.supplier,
      goodPrice: String(m.good ?? 0),
      goodLabel: m.goodLabel ?? "",
      betterPrice: String(m.better ?? 0),
      betterLabel: m.betterLabel ?? "",
      bestPrice: String(m.best ?? 0),
      bestLabel: m.bestLabel ?? "",
      premiumPrice: String(m.premium ?? 0),
      premiumLabel: m.premiumLabel ?? "",
      notes: m.notes ?? null,
      active: true,
      sortOrder: i,
      source: "seed" as const,
    }));

    if (toInsert.length > 0) {
      await db.insert(osMaterials).values(toInsert);
      console.log(`[materials] seeded ${toInsert.length} starter material(s)`);
    }
  } catch (err) {
    console.warn("[materials] seed failed (non-fatal):", err);
  }
}
