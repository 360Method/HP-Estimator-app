import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { automationRules, automationRuleLogs } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";

const conditionSchema = z.object({
  field: z.string(),
  operator: z.enum(["eq", "neq", "contains", "gt", "lt"]),
  value: z.union([z.string(), z.number()]),
});

const actionPayloadSchema = z.union([
  z.object({ messageTemplate: z.string() }),
  z.object({ subject: z.string(), bodyTemplate: z.string() }),
  z.object({ title: z.string(), contentTemplate: z.string() }),
  z.object({ noteTemplate: z.string() }),
]);

export const automationRulesRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    const rules = await db
      .select()
      .from(automationRules)
      .orderBy(automationRules.sortOrder, automationRules.createdAt);
    return rules.map((r) => ({
      ...r,
      conditions: r.conditions ? JSON.parse(r.conditions) : [],
      actionPayload: r.actionPayload ? JSON.parse(r.actionPayload) : {},
    }));
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120),
        trigger: z.string().max(60),
        conditions: z.array(conditionSchema).optional().default([]),
        actionType: z.enum(["send_sms", "send_email", "notify_owner", "create_note"]),
        actionPayload: actionPayloadSchema,
        delayMinutes: z.number().int().min(0).default(0),
        enabled: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const result = await db.insert(automationRules).values({
        name: input.name,
        trigger: input.trigger,
        conditions: JSON.stringify(input.conditions),
        actionType: input.actionType,
        actionPayload: JSON.stringify(input.actionPayload),
        delayMinutes: input.delayMinutes,
        enabled: input.enabled,
        sortOrder: 0,
      });
      return { id: (result as any).insertId };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        name: z.string().min(1).max(120).optional(),
        trigger: z.string().max(60).optional(),
        conditions: z.array(conditionSchema).optional(),
        actionType: z.enum(["send_sms", "send_email", "notify_owner", "create_note"]).optional(),
        actionPayload: actionPayloadSchema.optional(),
        delayMinutes: z.number().int().min(0).optional(),
        enabled: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      const { id, conditions, actionPayload, ...rest } = input;
      const patch: Record<string, unknown> = { ...rest };
      if (conditions !== undefined) patch.conditions = JSON.stringify(conditions);
      if (actionPayload !== undefined) patch.actionPayload = JSON.stringify(actionPayload);
      await db.update(automationRules).set(patch).where(eq(automationRules.id, id));
      return { ok: true };
    }),

  toggle: protectedProcedure
    .input(z.object({ id: z.number().int(), enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.update(automationRules).set({ enabled: input.enabled }).where(eq(automationRules.id, input.id));
      return { ok: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db.delete(automationRules).where(eq(automationRules.id, input.id));
      return { ok: true };
    }),

  getLogs: protectedProcedure
    .input(z.object({ ruleId: z.number().int(), limit: z.number().int().max(50).default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db
        .select()
        .from(automationRuleLogs)
        .where(eq(automationRuleLogs.ruleId, input.ruleId))
        .orderBy(desc(automationRuleLogs.executedAt))
        .limit(input.limit);
    }),
});
