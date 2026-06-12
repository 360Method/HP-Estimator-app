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
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { osPriceItems } from "../../drizzle/schema";

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
});
