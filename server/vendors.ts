/**
 * server/vendors.ts
 *
 * Vendor network CRM. Trade-keyed contractor roster, onboarding workflow,
 * job assignments, communications log, and a ranking helper for matching
 * vendors to opportunities by trade + tier + recency + rating.
 *
 * `ensureVendorTables` runs at boot, creates tables if missing, and seeds
 * the canonical 20-trade catalog when the trades table is empty.
 */

import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  trades,
  vendorCommunications,
  vendorJobs,
  vendorOnboardingSteps,
  vendorTrades,
  vendors,
  type DbVendor,
  type InsertDbVendor,
  type InsertDbVendorCommunication,
  type InsertDbVendorOnboardingStep,
} from "../drizzle/schema";

// ─── Trade catalog (seed) ────────────────────────────────────────────────────
// Twenty common residential service trades. Slugs are stable IDs used by the
// agent layer; names are operator-facing.

const TRADE_SEED: { slug: string; name: string; category: string; description: string }[] = [
  { slug: "general_handyman", name: "General Handyman", category: "general", description: "Multi-trade light fabrication, mounting, assembly." },
  { slug: "carpentry", name: "Carpentry & Trim", category: "interior", description: "Finish carpentry, baseboard, casing, built-ins." },
  { slug: "painting", name: "Painting", category: "interior", description: "Interior + exterior paint, drywall touch-up, sealing." },
  { slug: "drywall", name: "Drywall", category: "interior", description: "Patches, full sheets, tape and texture." },
  { slug: "plumbing", name: "Plumbing", category: "mechanical", description: "Licensed plumber for fixtures, supply, drain, water heaters." },
  { slug: "electrical", name: "Electrical", category: "mechanical", description: "Licensed electrician for outlets, fixtures, panels." },
  { slug: "hvac", name: "HVAC", category: "mechanical", description: "Heating, cooling, ductwork, mini-splits." },
  { slug: "roofing", name: "Roofing", category: "exterior", description: "Composition shingles, flat roofs, gutter integration." },
  { slug: "gutters", name: "Gutters", category: "exterior", description: "Gutter cleaning, repair, downspout routing, leaf guards." },
  { slug: "landscaping", name: "Landscaping", category: "exterior", description: "Soft-scape, lawn care, planting, irrigation tuning." },
  { slug: "hardscaping", name: "Hardscaping", category: "exterior", description: "Stone, paver, concrete walkways, retaining walls." },
  { slug: "tile", name: "Tile & Stone", category: "interior", description: "Bath surround, kitchen backsplash, floor tile." },
  { slug: "flooring", name: "Flooring", category: "interior", description: "Hardwood, LVP, refinishing, transitions." },
  { slug: "windows_doors", name: "Windows & Doors", category: "exterior", description: "Replacement windows, exterior doors, weather stripping." },
  { slug: "fencing", name: "Fencing", category: "exterior", description: "Wood, vinyl, ornamental fence build + repair." },
  { slug: "deck_patio", name: "Decks & Patios", category: "exterior", description: "Composite, cedar, redwood deck builds and refinishes." },
  { slug: "pressure_washing", name: "Pressure Washing", category: "exterior", description: "Driveway, siding, deck, walkway cleaning." },
  { slug: "pest_control", name: "Pest Control", category: "specialty", description: "Recurring quarterly pest, termite inspections." },
  { slug: "chimney_fireplace", name: "Chimney & Fireplace", category: "specialty", description: "Sweep, cap, liner, gas insert install." },
  { slug: "appliance_repair", name: "Appliance Repair", category: "specialty", description: "Major appliance diagnostic + repair." },
];

// ─── Boot: ensure tables + seed trades ───────────────────────────────────────

export async function ensureVendorTables(): Promise<void> {
  // boot-time MySQL DDL removed; tables now created by drizzle Postgres migrations
  return;
}

// ─── Trades ──────────────────────────────────────────────────────────────────

export async function listTrades() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(trades).orderBy(asc(trades.name));
}

export async function getTradeBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(trades).where(eq(trades.slug, slug)).limit(1);
  return row ?? null;
}

// ─── Vendors ─────────────────────────────────────────────────────────────────

export async function listVendors(opts: {
  status?: DbVendor["status"];
  tier?: DbVendor["tier"];
  tradeSlug?: string;
  limit?: number;
} = {}) {
  const db = await getDb();
  if (!db) return [];

  let vendorIdFilter: number[] | null = null;
  if (opts.tradeSlug) {
    const trade = await getTradeBySlug(opts.tradeSlug);
    if (!trade) return [];
    const links = await db
      .select({ vendorId: vendorTrades.vendorId })
      .from(vendorTrades)
      .where(eq(vendorTrades.tradeId, trade.id));
    vendorIdFilter = links.map((l) => l.vendorId);
    if (vendorIdFilter.length === 0) return [];
  }

  const conds = [];
  if (opts.status) conds.push(eq(vendors.status, opts.status));
  if (opts.tier) conds.push(eq(vendors.tier, opts.tier));
  if (vendorIdFilter) conds.push(inArray(vendors.id, vendorIdFilter));

  const q =
    conds.length > 0
      ? db.select().from(vendors).where(and(...conds))
      : db.select().from(vendors);
  return (q as any).orderBy(desc(vendors.updatedAt)).limit(opts.limit ?? 200);
}

export async function getVendor(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [v] = await db.select().from(vendors).where(eq(vendors.id, id)).limit(1);
  if (!v) return null;
  const tradeLinks = await db
    .select({
      tradeId: vendorTrades.tradeId,
      proficiency: vendorTrades.proficiency,
      slug: trades.slug,
      name: trades.name,
    })
    .from(vendorTrades)
    .innerJoin(trades, eq(trades.id, vendorTrades.tradeId))
    .where(eq(vendorTrades.vendorId, id));
  const onboarding = await db
    .select()
    .from(vendorOnboardingSteps)
    .where(eq(vendorOnboardingSteps.vendorId, id))
    .orderBy(asc(vendorOnboardingSteps.createdAt));
  const recentJobs = await db
    .select()
    .from(vendorJobs)
    .where(eq(vendorJobs.vendorId, id))
    .orderBy(desc(vendorJobs.createdAt))
    .limit(20);
  const recentComms = await db
    .select()
    .from(vendorCommunications)
    .where(eq(vendorCommunications.vendorId, id))
    .orderBy(desc(vendorCommunications.createdAt))
    .limit(50);
  return { vendor: v, trades: tradeLinks, onboarding, recentJobs, recentComms };
}

export async function createVendor(input: InsertDbVendor & { tradeSlugs?: string[] }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const { tradeSlugs, ...payload } = input;
  const [result] = await db.insert(vendors).values(payload).returning({ id: vendors.id });
  const id = Number(result?.id ?? 0);
  if (tradeSlugs && tradeSlugs.length > 0) {
    await setVendorTrades(id, tradeSlugs);
  }
  return getVendor(id);
}

export async function updateVendor(id: number, patch: Partial<InsertDbVendor>) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(vendors).set(patch).where(eq(vendors.id, id));
  return getVendor(id);
}

export async function setVendorTrades(vendorId: number, tradeSlugs: string[]) {
  const db = await getDb();
  if (!db) return;
  const matched = tradeSlugs.length === 0
    ? []
    : await db.select().from(trades).where(inArray(trades.slug, tradeSlugs));
  await db.delete(vendorTrades).where(eq(vendorTrades.vendorId, vendorId));
  if (matched.length > 0) {
    await db.insert(vendorTrades).values(
      matched.map((t) => ({ vendorId, tradeId: t.id, proficiency: "primary" as const })),
    );
  }
}

// ─── Communications ──────────────────────────────────────────────────────────

export async function logCommunication(input: InsertDbVendorCommunication) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [result] = await db.insert(vendorCommunications).values(input).returning({ id: vendorCommunications.id });
  const id = Number(result?.id ?? 0);
  const [row] = await db
    .select()
    .from(vendorCommunications)
    .where(eq(vendorCommunications.id, id))
    .limit(1);
  return row;
}

export async function listVendorCommunications(vendorId: number, limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(vendorCommunications)
    .where(eq(vendorCommunications.vendorId, vendorId))
    .orderBy(desc(vendorCommunications.createdAt))
    .limit(limit);
}

// ─── Onboarding ──────────────────────────────────────────────────────────────

export async function createOnboardingStep(input: InsertDbVendorOnboardingStep) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [result] = await db.insert(vendorOnboardingSteps).values(input).returning({ id: vendorOnboardingSteps.id });
  const id = Number(result?.id ?? 0);
  const [row] = await db
    .select()
    .from(vendorOnboardingSteps)
    .where(eq(vendorOnboardingSteps.id, id))
    .limit(1);
  return row;
}

export async function updateOnboardingStep(
  id: number,
  patch: Partial<InsertDbVendorOnboardingStep>,
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(vendorOnboardingSteps).set(patch).where(eq(vendorOnboardingSteps.id, id));
}

// ─── Jobs ────────────────────────────────────────────────────────────────────

export async function listVendorJobs(opts: { vendorId?: number; opportunityId?: string; limit?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  const conds = [];
  if (opts.vendorId) conds.push(eq(vendorJobs.vendorId, opts.vendorId));
  if (opts.opportunityId) conds.push(eq(vendorJobs.opportunityId, opts.opportunityId));
  const q =
    conds.length > 0
      ? db.select().from(vendorJobs).where(and(...conds))
      : db.select().from(vendorJobs);
  return (q as any).orderBy(desc(vendorJobs.createdAt)).limit(opts.limit ?? 100);
}

// ─── Ranking ─────────────────────────────────────────────────────────────────

const TIER_SCORE: Record<DbVendor["tier"], number> = {
  preferred: 100,
  approved: 70,
  trial: 40,
  probation: 10,
};
const STATUS_SCORE: Record<DbVendor["status"], number> = {
  active: 100,
  onboarding: 50,
  prospect: 25,
  paused: 5,
  retired: 0,
};

export async function rankVendorsForOpportunity(opts: {
  tradeSlug: string;
  opportunityId?: string;
  limit?: number;
}): Promise<
  Array<{
    vendor: DbVendor;
    score: number;
    breakdown: { tier: number; status: number; rating: number; recency: number; load: number };
  }>
> {
  const db = await getDb();
  if (!db) return [];
  const trade = await getTradeBySlug(opts.tradeSlug);
  if (!trade) return [];
  const links = await db
    .select({ vendorId: vendorTrades.vendorId })
    .from(vendorTrades)
    .where(eq(vendorTrades.tradeId, trade.id));
  if (links.length === 0) return [];
  const vendorIds = links.map((l) => l.vendorId);
  const candidates = await db
    .select()
    .from(vendors)
    .where(and(inArray(vendors.id, vendorIds), eq(vendors.status, "active")));

  // Active load: count of in-progress jobs per vendor
  const activeJobs =
    candidates.length === 0
      ? []
      : await db
          .select({ vendorId: vendorJobs.vendorId, status: vendorJobs.status })
          .from(vendorJobs)
          .where(
            and(
              inArray(vendorJobs.vendorId, candidates.map((c) => c.id)),
              inArray(vendorJobs.status, ["proposed", "accepted", "in_progress"]),
            ),
          );
  const loadByVendor = new Map<number, number>();
  for (const j of activeJobs) {
    loadByVendor.set(j.vendorId, (loadByVendor.get(j.vendorId) ?? 0) + 1);
  }

  const now = Date.now();
  const ranked = candidates.map((v) => {
    const tier = TIER_SCORE[v.tier] ?? 0;
    const status = STATUS_SCORE[v.status] ?? 0;
    const ratingNum = v.rating ? Number(v.rating) : 0;
    const rating = Math.min(50, ratingNum * 10); // 5.0 → 50
    let recency = 0;
    if (v.lastJobAt) {
      const days = Math.max(1, (now - new Date(v.lastJobAt).getTime()) / 86_400_000);
      recency = Math.max(0, 30 - Math.min(30, days)); // recent = high; >30d = 0
    }
    const load = -10 * (loadByVendor.get(v.id) ?? 0); // each active job costs 10
    const score = tier + status + rating + recency + load;
    return { vendor: v, score, breakdown: { tier, status, rating, recency, load } };
  });
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, opts.limit ?? 10);
}
