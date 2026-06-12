/**
 * server/osCore/quickQuoteSeed.ts
 *
 * Applies the committed quickquote-seed.json at boot. Same never-clobber
 * contract as priceBookSeed.ts: insert missing presets, refresh presets still
 * owned by the seed (source='seed'), never touch presets a human edited
 * (source='human').
 */
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { osRemodelQuotePresets } from "../../drizzle/schema";

type SeedPreset = {
  presetKey: string;
  label: string;
  description: string;
  unitType: string;
  tiers: unknown;
  lfAddons: unknown[];
  baseFeeLow: number;
  baseFeeHigh: number;
  minSqft: number;
  sortOrder: number;
};

function findSeedFile(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "server/osCore/seed/quickquote-seed.json"),
    path.resolve(import.meta.dirname ?? __dirname, "seed/quickquote-seed.json"),
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

export async function importQuickQuoteSeed(): Promise<void> {
  const seedPath = findSeedFile();
  if (!seedPath) return;
  const db = await getDb();
  if (!db) return;

  let presets: SeedPreset[];
  try {
    const bundle = JSON.parse(fs.readFileSync(seedPath, "utf-8")) as { presets: SeedPreset[] };
    presets = bundle.presets ?? [];
  } catch (err) {
    console.warn("[quickQuote] seed unreadable, skipping:", err);
    return;
  }

  const report = { created: 0, refreshed: 0, kept: 0 };
  try {
    const existing = await db
      .select({ presetKey: osRemodelQuotePresets.presetKey, source: osRemodelQuotePresets.source })
      .from(osRemodelQuotePresets);
    const byKey = new Map(existing.map((r) => [r.presetKey, r.source]));

    for (const p of presets) {
      const values = {
        presetKey: p.presetKey,
        label: p.label,
        description: p.description,
        unitType: p.unitType,
        tiersJson: JSON.stringify(p.tiers),
        lfAddonsJson: JSON.stringify(p.lfAddons ?? []),
        baseFeeLow: String(p.baseFeeLow),
        baseFeeHigh: String(p.baseFeeHigh),
        minSqft: String(p.minSqft),
        sortOrder: p.sortOrder,
        active: true,
        source: "seed" as const,
      };
      const owner = byKey.get(p.presetKey);
      if (owner === undefined) {
        await db.insert(osRemodelQuotePresets).values(values);
        report.created++;
      } else if (owner === "seed") {
        await db
          .update(osRemodelQuotePresets)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(osRemodelQuotePresets.presetKey, p.presetKey));
        report.refreshed++;
      } else {
        report.kept++; // human-owned, never clobber
      }
    }
    if (report.created > 0 || report.refreshed > 0) {
      console.log(
        `[quickQuote] seed applied: +${report.created} created, ${report.refreshed} refreshed, ${report.kept} kept (edited in app)`,
      );
    }
  } catch (err) {
    console.warn("[quickQuote] seed import failed (non-fatal):", err);
  }
}
