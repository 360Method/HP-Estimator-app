import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { aiAgents, agentCharters, agentKpis, agentPlaybooks } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

export const agentsRouter = router({
  /** List all agent seats, optionally filtered by department */
  list: protectedProcedure
    .input(z.object({ department: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const rows = input?.department
        ? await db.select().from(aiAgents).where(eq(aiAgents.department, input.department))
        : await db.select().from(aiAgents);
      return rows.map(r => ({
        ...r,
        tools:              r.tools              ? JSON.parse(r.tools)              : [],
        eventSubscriptions: r.eventSubscriptions ? JSON.parse(r.eventSubscriptions) : [],
        schedules:          r.schedules          ? JSON.parse(r.schedules)          : [],
      }));
    }),

  /** Get a single agent by seatName */
  get: protectedProcedure
    .input(z.object({ seatName: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const [row] = await db.select().from(aiAgents).where(eq(aiAgents.seatName, input.seatName));
      if (!row) return null;
      return {
        ...row,
        tools:              row.tools              ? JSON.parse(row.tools)              : [],
        eventSubscriptions: row.eventSubscriptions ? JSON.parse(row.eventSubscriptions) : [],
        schedules:          row.schedules          ? JSON.parse(row.schedules)          : [],
      };
    }),

  /** Status endpoint — charterLoaded, kpiCount, playbookCount per seat */
  status: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const rows = await db
      .select({
        seatName:      aiAgents.seatName,
        name:          aiAgents.name,
        department:    aiAgents.department,
        agentType:     aiAgents.agentType,
        status:        aiAgents.status,
        charterLoaded: aiAgents.charterLoaded,
        kpiCount:      aiAgents.kpiCount,
        playbookCount: aiAgents.playbookCount,
      })
      .from(aiAgents);
    return rows.map(r => ({
      ...r,
      operational:
        r.charterLoaded &&
        (r.agentType === 'human' || (r.kpiCount > 0 && r.playbookCount > 0)),
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
