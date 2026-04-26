import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { aiAgents, agentCharters, agentKpis } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export const agentsRouter = router({
  /** List all agent seats, optionally filtered by department */
  list: protectedProcedure
    .input(z.object({ department: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      return input?.department
        ? db.select().from(aiAgents).where(eq(aiAgents.department, input.department as any))
        : db.select().from(aiAgents);
    }),

  /** Get a single agent by seatName */
  get: protectedProcedure
    .input(z.object({ seatName: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [row] = await db.select().from(aiAgents).where(eq(aiAgents.seatName, input.seatName));
      return row ?? null;
    }),

  /** Status endpoint — charterLoaded, kpiCount, playbookCount per seat */
  status: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const rows = await db
      .select({
        seatName:       aiAgents.seatName,
        department:     aiAgents.department,
        status:         aiAgents.status,
        isDepartmentHead: aiAgents.isDepartmentHead,
        charterLoaded:  (aiAgents as any).charterLoaded,
        kpiCount:       (aiAgents as any).kpiCount,
        playbookCount:  (aiAgents as any).playbookCount,
      })
      .from(aiAgents);
    return rows.map(r => ({
      ...r,
      operational:
        r.charterLoaded &&
        (r.kpiCount > 0 && r.playbookCount > 0),
    }));
  }),

  /** List all charters */
  listCharters: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    return db.select({
      id:         agentCharters.id,
      department: agentCharters.department,
      version:    agentCharters.version,
      updatedAt:  agentCharters.updatedAt,
    }).from(agentCharters);
  }),

  /** Get charter for a department */
  getCharter: protectedProcedure
    .input(z.object({ department: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [row] = await db
        .select()
        .from(agentCharters)
        .where(eq(agentCharters.department, input.department));
      return row ?? null;
    }),

  /** Update charter markdown — admin only, bumps version */
  updateCharter: adminProcedure
    .input(z.object({
      department:      z.string(),
      markdownContent: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [existing] = await db
        .select()
        .from(agentCharters)
        .where(eq(agentCharters.department, input.department));

      if (existing) {
        await db
          .update(agentCharters)
          .set({
            markdownContent:  input.markdownContent,
            version:          existing.version + 1,
            updatedByStaffId: ctx.user.id ?? null,
          })
          .where(eq(agentCharters.department, input.department));
        return { version: existing.version + 1 };
      } else {
        await db.insert(agentCharters).values({
          department:      input.department,
          markdownContent: input.markdownContent,
          version:         1,
        });
        return { version: 1 };
      }
    }),

  /** List KPIs for a scope */
  listKpis: protectedProcedure
    .input(z.object({
      scopeId:   z.string().optional(),
      scopeType: z.enum(["seat", "department", "company"]).optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      if (input?.scopeId) {
        return db.select().from(agentKpis).where(eq(agentKpis.scopeId, input.scopeId));
      }
      if (input?.scopeType) {
        return db.select().from(agentKpis).where(eq(agentKpis.scopeType, input.scopeType));
      }
      return db.select().from(agentKpis);
    }),

  /** Update a KPI — admin only */
  updateKpi: adminProcedure
    .input(z.object({
      id:        z.number(),
      label:     z.string().optional(),
      targetMin: z.number().nullable().optional(),
      targetMax: z.number().nullable().optional(),
      unit:      z.string().optional(),
      period:    z.enum(["daily", "weekly", "monthly", "quarterly"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const { id, ...updates } = input;
      const filteredUpdates = Object.fromEntries(
        Object.entries(updates).filter(([, v]) => v !== undefined)
      );
      if (Object.keys(filteredUpdates).length === 0) return { success: true };
      await db.update(agentKpis).set(filteredUpdates).where(eq(agentKpis.id, id));
      return { success: true };
    }),
});
