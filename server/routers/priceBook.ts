/**
 * priceBook router — the editable estimate catalog (os_price_items).
 *
 * Staff-only surface (/os/pricebook). All money figures here are internal
 * costs; nothing from this router is ever serialized to the portal. Items
 * are never deleted — retire (active=false) keeps old estimates legible.
 * Any human edit flips source to 'human' so the boot seed never overwrites it.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { osPriceItems, osRemodelQuotePresets } from "../../drizzle/schema";

async function db() {
  const d = await getDb();
  if (!d) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return d;
}

const tierSchema = z.object({
  rate: z.number().min(0),
  name: z.string().max(120),
  desc: z.string().max(500),
});

const itemInput = z.object({
  kind: z.enum(["remodel_stage", "maintenance"]),
  phase: z.number().int().min(1).max(17).nullable().optional(),
  category: z.string().min(1).max(120),
  name: z.string().min(1).max(200),
  shortName: z.string().max(80).optional(),
  unitType: z.string().min(1).max(20),
  laborMode: z.enum(["hr", "flat"]),
  laborRate: z.number().min(0),
  hrsPerUnit: z.number().min(0),
  flatRatePerUnit: z.number().min(0),
  hasTiers: z.boolean(),
  tiers: z.object({ good: tierSchema, better: tierSchema, best: tierSchema }).nullable().optional(),
  wastePct: z.number().min(0).max(100).optional(),
  hasPaintPrep: z.boolean().optional(),
  defaultQty: z.number().min(0).optional(),
  salesDesc: z.string().max(1000).optional(),
  sowTemplate: z.string().max(1000).optional(),
});

const presetTierSchema = z
  .object({
    rateLow: z.number().min(0),
    rateHigh: z.number().min(0),
    name: z.string().max(120),
    desc: z.string().max(500),
  })
  .refine((t) => t.rateLow <= t.rateHigh, { message: "rateLow must be at or below rateHigh" });

const presetInput = z.object({
  label: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  unitType: z.string().min(1).max(10).default("sqft"),
  tiers: z.object({ good: presetTierSchema, better: presetTierSchema, best: presetTierSchema }),
  lfAddons: z
    .array(
      z
        .object({
          key: z.string().min(1).max(40),
          label: z.string().min(1).max(120),
          rateLow: z.number().min(0),
          rateHigh: z.number().min(0),
        })
        .refine((a) => a.rateLow <= a.rateHigh, { message: "rateLow must be at or below rateHigh" }),
    )
    .default([]),
  baseFeeLow: z.number().min(0),
  baseFeeHigh: z.number().min(0),
  minSqft: z.number().min(0),
  sortOrder: z.number().int().min(0).default(0),
}).refine((p) => p.baseFeeLow <= p.baseFeeHigh, { message: "baseFeeLow must be at or below baseFeeHigh" });

function presetToRow(input: z.infer<typeof presetInput>) {
  return {
    label: input.label,
    description: input.description ?? "",
    unitType: input.unitType,
    tiersJson: JSON.stringify(input.tiers),
    lfAddonsJson: JSON.stringify(input.lfAddons),
    baseFeeLow: String(input.baseFeeLow),
    baseFeeHigh: String(input.baseFeeHigh),
    minSqft: String(input.minSqft),
    sortOrder: input.sortOrder,
  };
}

function toRow(input: z.infer<typeof itemInput>) {
  return {
    kind: input.kind,
    phase: input.kind === "remodel_stage" ? (input.phase ?? null) : null,
    category: input.category,
    name: input.name,
    shortName: input.shortName ?? "",
    unitType: input.unitType,
    laborMode: input.laborMode,
    laborRate: String(input.laborRate),
    hrsPerUnit: String(input.hrsPerUnit),
    flatRatePerUnit: String(input.flatRatePerUnit),
    hasTiers: input.hasTiers,
    tiersJson: input.hasTiers && input.tiers ? JSON.stringify(input.tiers) : null,
    wastePct: String(input.wastePct ?? 0),
    hasPaintPrep: input.hasPaintPrep ?? false,
    defaultQty: String(input.defaultQty ?? 0),
    salesDesc: input.salesDesc ?? "",
    sowTemplate: input.sowTemplate ?? "",
  };
}

export const priceBookRouter = router({
  list: adminProcedure
    .input(
      z
        .object({
          kind: z.enum(["remodel_stage", "maintenance"]).optional(),
          includeInactive: z.boolean().optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const d = await db();
      const conds = [];
      if (input?.kind) conds.push(eq(osPriceItems.kind, input.kind));
      if (!input?.includeInactive) conds.push(eq(osPriceItems.active, true));
      const rows = await d
        .select()
        .from(osPriceItems)
        .where(conds.length > 0 ? and(...conds) : undefined)
        .orderBy(asc(osPriceItems.sortOrder), asc(osPriceItems.id));
      return rows;
    }),

  create: adminProcedure
    .input(itemInput)
    .mutation(async ({ input }) => {
      const d = await db();
      const prefix = input.kind === "maintenance" ? "maint-c" : "custom-c";
      const itemKey = `${prefix}${Date.now().toString(36)}`;
      const [inserted] = await d
        .insert(osPriceItems)
        .values({ ...toRow(input), itemKey, source: "human", active: true })
        .returning({ id: osPriceItems.id, itemKey: osPriceItems.itemKey });
      return inserted;
    }),

  update: adminProcedure
    .input(itemInput.extend({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const d = await db();
      const { id, ...rest } = input;
      await d
        .update(osPriceItems)
        .set({ ...toRow(rest), source: "human", updatedAt: new Date() })
        .where(eq(osPriceItems.id, id));
      return { ok: true };
    }),

  setActive: adminProcedure
    .input(z.object({ id: z.number().int(), active: z.boolean() }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d
        .update(osPriceItems)
        .set({ active: input.active, source: "human", updatedAt: new Date() })
        .where(eq(osPriceItems.id, input.id));
      return { ok: true };
    }),

  // ── Remodel quick-quote presets ─────────────────────────────────────────
  // RETAIL room-rate ranges for the Step 8 on-site consultation. Unlike the
  // catalog above, these figures are customer prices with margin baked in.

  listPresets: protectedProcedure
    .input(z.object({ includeInactive: z.boolean().optional() }).optional())
    .query(async ({ input }) => {
      const d = await db();
      const rows = await d
        .select()
        .from(osRemodelQuotePresets)
        .where(input?.includeInactive ? undefined : eq(osRemodelQuotePresets.active, true))
        .orderBy(asc(osRemodelQuotePresets.sortOrder), asc(osRemodelQuotePresets.id));
      return rows;
    }),

  createPreset: adminProcedure
    .input(presetInput)
    .mutation(async ({ input }) => {
      const d = await db();
      const presetKey = `custom-q${Date.now().toString(36)}`;
      const [inserted] = await d
        .insert(osRemodelQuotePresets)
        .values({ ...presetToRow(input), presetKey, source: "human", active: true })
        .returning({ id: osRemodelQuotePresets.id, presetKey: osRemodelQuotePresets.presetKey });
      return inserted;
    }),

  updatePreset: adminProcedure
    .input(presetInput.extend({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const d = await db();
      const { id, ...rest } = input;
      await d
        .update(osRemodelQuotePresets)
        .set({ ...presetToRow(rest), source: "human", updatedAt: new Date() })
        .where(eq(osRemodelQuotePresets.id, id));
      return { ok: true };
    }),

  setPresetActive: adminProcedure
    .input(z.object({ id: z.number().int(), active: z.boolean() }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d
        .update(osRemodelQuotePresets)
        .set({ active: input.active, source: "human", updatedAt: new Date() })
        .where(eq(osRemodelQuotePresets.id, input.id));
      return { ok: true };
    }),
});
