import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { automationRules, automationRuleLogs } from "../../drizzle/schema";
import { eq, desc, sql } from "drizzle-orm";

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

const categoryEnum = z.enum([
  "lead_intake",
  "estimate_followup",
  "job_lifecycle",
  "invoice_payment",
  "review_retention",
]);

export const automationRulesRouter = router({
  list: protectedProcedure
    .input(z.object({ category: categoryEnum.optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const base = db.select().from(automationRules);
      const rules = input?.category
        ? await base
            .where(eq(automationRules.category, input.category))
            .orderBy(automationRules.sortOrder, automationRules.createdAt)
        : await base.orderBy(automationRules.sortOrder, automationRules.createdAt);
      return rules.map((r) => ({
        ...r,
        conditions: r.conditions ? JSON.parse(r.conditions) : [],
        actionPayload: r.actionPayload ? JSON.parse(r.actionPayload) : {},
      }));
    }),

  /** Returns [{category, count}] rows so the UI can render category pills. */
  countsByCategory: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const rows = await db
      .select({
        category: automationRules.category,
        count: sql<number>`count(*)::int`,
        enabledCount: sql<number>`sum(case when ${automationRules.enabled} then 1 else 0 end)::int`,
      })
      .from(automationRules)
      .groupBy(automationRules.category);
    return rows;
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
        category: categoryEnum.optional().default("lead_intake"),
        emailTemplateId: z.number().int().nullable().optional(),
        stage: z.string().max(30).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [result] = await db.insert(automationRules).values({
        name: input.name,
        trigger: input.trigger,
        conditions: JSON.stringify(input.conditions),
        actionType: input.actionType,
        actionPayload: JSON.stringify(input.actionPayload),
        delayMinutes: input.delayMinutes,
        enabled: input.enabled,
        sortOrder: 0,
        category: input.category,
        emailTemplateId: input.emailTemplateId ?? null,
        stage: input.stage ?? "lead",
      }).returning({ id: automationRules.id });
      return { id: result.id };
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
        category: categoryEnum.optional(),
        emailTemplateId: z.number().int().nullable().optional(),
        stage: z.string().max(30).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { id, conditions, actionPayload, ...rest } = input;
      const patch: Record<string, unknown> = { ...rest, updatedAt: new Date() };
      if (conditions !== undefined) patch.conditions = JSON.stringify(conditions);
      if (actionPayload !== undefined) patch.actionPayload = JSON.stringify(actionPayload);
      await db.update(automationRules).set(patch).where(eq(automationRules.id, id));
      return { ok: true };
    }),

  toggle: protectedProcedure
    .input(z.object({ id: z.number().int(), enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.update(automationRules).set({ enabled: input.enabled }).where(eq(automationRules.id, input.id));
      return { ok: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.delete(automationRules).where(eq(automationRules.id, input.id));
      return { ok: true };
    }),

  getLogs: protectedProcedure
    .input(z.object({ ruleId: z.number().int(), limit: z.number().int().max(50).default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      return db
        .select()
        .from(automationRuleLogs)
        .where(eq(automationRuleLogs.ruleId, input.ruleId))
        .orderBy(desc(automationRuleLogs.executedAt))
        .limit(input.limit);
    }),
});
