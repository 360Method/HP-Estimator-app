/**
 * server/osCore/priceBookSeed.ts
 *
 * Applies the committed pricebook-seed.json at boot. Same contract as
 * seedImport.ts: insert missing rows, refresh rows still owned by the seed
 * (source='seed'), and NEVER touch rows a human edited (source='human').
 */
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { osPriceItems } from "../../drizzle/schema";

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

function findSeedFile(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "server/osCore/seed/pricebook-seed.json"),
    path.resolve(import.meta.dirname ?? __dirname, "seed/pricebook-seed.json"),
  ];
  for (const p of candidates) {
    try {
      if (fs.statSync(p).isFile()) return p;
    } catch {
      // try next
    }
  }
  return null;
}

export async function importPriceBookSeed(): Promise<void> {
  const seedPath = findSeedFile();
  if (!seedPath) return; // not built yet; nothing to do
  const db = await getDb();
  if (!db) return;

  let items: SeedItem[];
  try {
    const bundle = JSON.parse(fs.readFileSync(seedPath, "utf-8")) as { items: SeedItem[] };
    items = bundle.items ?? [];
  } catch (err) {
    console.warn("[priceBook] seed unreadable, skipping:", err);
    return;
  }

  const report = { created: 0, refreshed: 0, kept: 0 };
  try {
    const existing = await db
      .select({ itemKey: osPriceItems.itemKey, source: osPriceItems.source })
      .from(osPriceItems);
    const byKey = new Map(existing.map((r) => [r.itemKey, r.source]));

    for (const it of items) {
      const values = {
        itemKey: it.itemKey,
        kind: it.kind,
        phase: it.phase,
        category: it.category,
        name: it.name,
        shortName: it.shortName,
        unitType: it.unitType,
        laborMode: it.laborMode,
        laborRate: String(it.laborRate),
        hrsPerUnit: String(it.hrsPerUnit),
        flatRatePerUnit: String(it.flatRatePerUnit),
        hasTiers: it.hasTiers,
        tiersJson: it.tiersJson,
        wastePct: String(it.wastePct),
        hasPaintPrep: it.hasPaintPrep,
        defaultQty: String(it.defaultQty),
        salesDesc: it.salesDesc,
        sowTemplate: it.sowTemplate,
        active: it.active,
        sortOrder: it.sortOrder,
        source: "seed" as const,
      };
      const owner = byKey.get(it.itemKey);
      if (owner === undefined) {
        await db.insert(osPriceItems).values(values);
        report.created++;
      } else if (owner === "seed") {
        await db
          .update(osPriceItems)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(osPriceItems.itemKey, it.itemKey));
        report.refreshed++;
      } else {
        report.kept++; // human-owned — never clobber
      }
    }
    if (report.created > 0 || report.refreshed > 0) {
      console.log(
        `[priceBook] seed applied: +${report.created} created, ${report.refreshed} refreshed, ${report.kept} kept (edited in app)`,
      );
    }
  } catch (err) {
    console.warn("[priceBook] seed import failed (non-fatal):", err);
  }
}
