import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { agentPlaybooks } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

export const playbooksRouter = router({
  /** List playbooks — filter by seat or department */
  list: protectedProcedure
    .input(
      z.object({
        seatName:   z.string().optional(),
        department: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      let query = db.select().from(agentPlaybooks);

      if (input?.seatName) {
        const rows = await query.where(eq(agentPlaybooks.ownerSeatName, input.seatName));
        return rows.map(r => ({ ...r, variables: r.variables ? JSON.parse(r.variables) : [] }));
      }
      if (input?.department) {
        const rows = await query.where(eq(agentPlaybooks.ownerDepartment, input.department));
        return rows.map(r => ({ ...r, variables: r.variables ? JSON.parse(r.variables) : [] }));
      }

      const rows = await query;
      return rows.map(r => ({ ...r, variables: r.variables ? JSON.parse(r.variables) : [] }));
    }),

  /** Fetch a single playbook by slug */
  get: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [row] = await db
        .select()
        .from(agentPlaybooks)
        .where(eq(agentPlaybooks.slug, input.slug));
      if (!row) return null;
      return { ...row, variables: row.variables ? JSON.parse(row.variables) : [] };
    }),

  /** Update playbook content — admin only, bumps version */
  update: adminProcedure
    .input(
      z.object({
        slug:     z.string(),
        name:     z.string().optional(),
        content:  z.string().optional(),
        category: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [existing] = await db
        .select()
        .from(agentPlaybooks)
        .where(eq(agentPlaybooks.slug, input.slug));
      if (!existing) throw new Error(`Playbook "${input.slug}" not found`);

      await db
        .update(agentPlaybooks)
        .set({
          ...(input.name     ? { name: input.name }         : {}),
          ...(input.content  ? { content: input.content }   : {}),
          ...(input.category ? { category: input.category } : {}),
          version:          existing.version + 1,
          updatedByStaffId: ctx.user.id ?? null,
        })
        .where(eq(agentPlaybooks.slug, input.slug));

      return { success: true, version: existing.version + 1 };
    }),
});
