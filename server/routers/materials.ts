/**
 * materials router — the field estimate's material catalog (os_materials).
 *
 * Staff surface (/os/materials). Every price is an internal COST per unit
 * by tier (good / better / best / premium); margin is applied by the
 * estimate engine, so nothing here is ever serialized to the portal.
 * Reps read it to pick a material tier on a line; admins populate it.
 * Items are retired (active=false), never deleted, so old estimates stay
 * legible.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { osMaterials } from "../../drizzle/schema";

async function db() {
  const d = await getDb();
  if (!d) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return d;
}

const materialInput = z.object({
  category: z.string().min(1).max(120),
  name: z.string().min(1).max(200),
  unitType: z.string().min(1).max(20),
  supplier: z.enum(["cfm", "home_depot", "other"]),
  goodPrice: z.number().min(0),
  goodLabel: z.string().max(160).optional(),
  betterPrice: z.number().min(0),
  betterLabel: z.string().max(160).optional(),
  bestPrice: z.number().min(0),
  bestLabel: z.string().max(160).optional(),
  premiumPrice: z.number().min(0),
  premiumLabel: z.string().max(160).optional(),
  notes: z.string().max(2000).optional(),
  sortOrder: z.number().int().optional(),
});

function toRow(input: z.infer<typeof materialInput>) {
  return {
    category: input.category.trim(),
    name: input.name.trim(),
    unitType: input.unitType,
    supplier: input.supplier,
    goodPrice: String(input.goodPrice),
    goodLabel: (input.goodLabel ?? "").trim(),
    betterPrice: String(input.betterPrice),
    betterLabel: (input.betterLabel ?? "").trim(),
    bestPrice: String(input.bestPrice),
    bestLabel: (input.bestLabel ?? "").trim(),
    premiumPrice: String(input.premiumPrice),
    premiumLabel: (input.premiumLabel ?? "").trim(),
    notes: input.notes ?? null,
    sortOrder: input.sortOrder ?? 0,
  };
}

export const materialsRouter = router({
  /** Reps + admins read the catalog (to pick a tier on a line). */
  list: protectedProcedure
    .input(z.object({ includeInactive: z.boolean().optional() }).optional())
    .query(async ({ input }) => {
      const d = await db();
      const rows = await d
        .select()
        .from(osMaterials)
        .where(input?.includeInactive ? undefined : eq(osMaterials.active, true))
        .orderBy(asc(osMaterials.category), asc(osMaterials.sortOrder), asc(osMaterials.id));
      return rows;
    }),

  create: adminProcedure
    .input(materialInput)
    .mutation(async ({ input }) => {
      const d = await db();
      const [inserted] = await d
        .insert(osMaterials)
        .values({ ...toRow(input), source: "human", active: true })
        .returning({ id: osMaterials.id });
      return inserted;
    }),

  update: adminProcedure
    .input(materialInput.extend({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const d = await db();
      const { id, ...rest } = input;
      await d
        .update(osMaterials)
        .set({ ...toRow(rest), source: "human", updatedAt: new Date() })
        .where(eq(osMaterials.id, id));
      return { ok: true };
    }),

  setActive: adminProcedure
    .input(z.object({ id: z.number().int(), active: z.boolean() }))
    .mutation(async ({ input }) => {
      const d = await db();
      await d
        .update(osMaterials)
        .set({ active: input.active, source: "human", updatedAt: new Date() })
        .where(eq(osMaterials.id, input.id));
      return { ok: true };
    }),
});
