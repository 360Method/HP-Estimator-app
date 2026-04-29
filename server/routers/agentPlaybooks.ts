/**
 * nurturerPlaybooks router — operator-editable cadence definitions.
 *
 * Marcin (or future CX Lead) tunes timing + voice prompts in
 * /admin/agents/playbooks. The Lead Nurturer reads from this table at
 * dispatch time, so changes apply on the next scheduled draft generation
 * without a redeploy.
 */
import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { nurturerPlaybooks } from "../../drizzle/schema";

const stepSchema = z.object({
  key: z.string().min(1).max(64),
  channel: z.enum(["sms", "email"]),
  delayMinutes: z.number().int().min(0).max(60 * 24 * 365),
  label: z.string().min(1).max(255),
  voicePrompt: z.string().min(1).max(2000),
});

const voiceRulesSchema = z.object({
  bannedWords: z.array(z.string()),
  tone: z.string(),
  formality: z.string(),
  brand: z.string().optional(),
});

export const nurturerPlaybooksRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(nurturerPlaybooks).orderBy(nurturerPlaybooks.key);
  }),

  get: protectedProcedure.input(z.object({ key: z.string() })).query(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const rows = await db.select().from(nurturerPlaybooks).where(eq(nurturerPlaybooks.key, input.key)).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
    return rows[0];
  }),

  update: protectedProcedure
    .input(
      z.object({
        key: z.string(),
        displayName: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        enabled: z.boolean().optional(),
        steps: z.array(stepSchema).optional(),
        voiceRules: voiceRulesSchema.optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const patch: Record<string, unknown> = {};
      if (input.displayName !== undefined) patch.displayName = input.displayName;
      if (input.description !== undefined) patch.description = input.description;
      if (input.enabled !== undefined) patch.enabled = input.enabled;
      if (input.steps !== undefined) patch.stepsJson = JSON.stringify(input.steps);
      if (input.voiceRules !== undefined) patch.voiceRulesJson = JSON.stringify(input.voiceRules);
      if (Object.keys(patch).length === 0) return { ok: true };
      await db.update(nurturerPlaybooks).set(patch).where(eq(nurturerPlaybooks.key, input.key));
      return { ok: true };
    }),
});
