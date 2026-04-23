import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { emailTemplates } from "../../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { renderTemplate } from "../emailTemplates";

const TENANT_ID = 1;

export const emailTemplatesRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    return db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.tenantId, TENANT_ID))
      .orderBy(emailTemplates.key);
  }),

  get: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [row] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: `Template ${input.id} not found` });
      return row;
    }),

  getByKey: protectedProcedure
    .input(z.object({ key: z.string().min(1).max(80) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [row] = await db
        .select()
        .from(emailTemplates)
        .where(and(eq(emailTemplates.tenantId, TENANT_ID), eq(emailTemplates.key, input.key)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: `Template "${input.key}" not found` });
      return row;
    }),

  create: protectedProcedure
    .input(
      z.object({
        key: z.string().min(1).max(80),
        name: z.string().max(160).default(""),
        subject: z.string().max(300).default(""),
        preheader: z.string().max(300).optional(),
        html: z.string().default(""),
        text: z.string().optional(),
        mergeTagSchema: z.array(z.object({ tag: z.string(), description: z.string() })).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [row] = await db
        .insert(emailTemplates)
        .values({
          tenantId: TENANT_ID,
          key: input.key,
          name: input.name,
          subject: input.subject,
          preheader: input.preheader,
          html: input.html,
          text: input.text,
          mergeTagSchema: input.mergeTagSchema ? JSON.stringify(input.mergeTagSchema) : null,
        })
        .returning();
      return row;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        name: z.string().max(160).optional(),
        subject: z.string().max(300).optional(),
        preheader: z.string().max(300).optional(),
        html: z.string().optional(),
        text: z.string().optional(),
        mergeTagSchema: z.array(z.object({ tag: z.string(), description: z.string() })).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { id, mergeTagSchema, ...rest } = input;
      const patch: Record<string, unknown> = { ...rest, updatedAt: new Date() };
      if (mergeTagSchema !== undefined) patch.mergeTagSchema = JSON.stringify(mergeTagSchema);
      await db.update(emailTemplates).set(patch).where(eq(emailTemplates.id, id));
      return { ok: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      await db.delete(emailTemplates).where(eq(emailTemplates.id, input.id));
      return { ok: true };
    }),

  /**
   * Render a template server-side, applying merge vars.
   * Returns the rendered {subject, html, text}. Caller sends via its preferred transport.
   */
  render: protectedProcedure
    .input(
      z.object({
        id: z.number().int().optional(),
        key: z.string().min(1).max(80).optional(),
        mergeVars: z.record(z.union([z.string(), z.number()])).default({}),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      let row: typeof emailTemplates.$inferSelect | undefined;
      if (input.id !== undefined) {
        const result = await db.select().from(emailTemplates).where(eq(emailTemplates.id, input.id)).limit(1);
        row = result[0];
      } else if (input.key) {
        const result = await db
          .select()
          .from(emailTemplates)
          .where(and(eq(emailTemplates.tenantId, TENANT_ID), eq(emailTemplates.key, input.key)))
          .limit(1);
        row = result[0];
      } else {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Either id or key is required" });
      }
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      return {
        subject: renderTemplate(row.subject, input.mergeVars),
        html: renderTemplate(row.html, input.mergeVars),
        text: renderTemplate(row.text ?? "", input.mergeVars),
        preheader: renderTemplate(row.preheader ?? "", input.mergeVars),
      };
    }),
});
