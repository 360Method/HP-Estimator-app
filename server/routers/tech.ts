/**
 * Tech router — field technician mobile PWA procedures.
 * Powers the /tech/* routes for daily job management, clock-in/out, and job completion.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  scheduleEvents, threeSixtyWorkOrders, timeLogs,
  opportunities, customers,
} from "../../drizzle/schema";
import { eq, and, gte, lt, inArray } from "drizzle-orm";

function todayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start, end, startMs: start.getTime(), endMs: end.getTime() };
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const techRouter = router({

  /** Get today's schedule events + work orders for a given tech name */
  today: protectedProcedure
    .input(z.object({ techName: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { scheduleEvents: [], workOrders: [] };

      const { startMs, endMs } = todayRange();
      const isoToday = todayISO();

      // Fetch all today's schedule events (filter assignedTo in JS)
      const allEvents = await db.select().from(scheduleEvents).where(
        // start field is ISO string — compare first 10 chars
        // We fetch a 3-day window and filter in JS to handle timezone edge cases
        gte(scheduleEvents.start, `${isoToday}T00:00:00`),
      );

      const myEvents = allEvents.filter(ev => {
        if (ev.completed) return false;
        if (!ev.assignedTo) return false;
        try {
          const assigned: string[] = JSON.parse(ev.assignedTo);
          return assigned.some(n => n.toLowerCase() === input.techName.toLowerCase());
        } catch { return false; }
      });

      // Fetch open/scheduled/in_progress work orders for today
      const allWorkOrders = await db.select().from(threeSixtyWorkOrders).where(
        and(
          inArray(threeSixtyWorkOrders.status, ['open', 'scheduled', 'in_progress']),
          gte(threeSixtyWorkOrders.scheduledDate, startMs),
          lt(threeSixtyWorkOrders.scheduledDate, endMs),
        )
      );

      const myWorkOrders = allWorkOrders.filter(wo => {
        if (!wo.assignedTo) return false;
        try {
          const assigned: string[] = JSON.parse(wo.assignedTo);
          return assigned.some(n => n.toLowerCase() === input.techName.toLowerCase());
        } catch { return false; }
      });

      // Enrich events with opportunity + customer data
      const oppIds = myEvents.map(e => e.opportunityId).filter(Boolean) as string[];
      const custIds = [
        ...myEvents.map(e => e.customerId),
        ...myWorkOrders.map(wo => wo.customerId),
      ].filter(Boolean) as string[];

      const [oppRows, custRows] = await Promise.all([
        oppIds.length ? db.select().from(opportunities).where(inArray(opportunities.id, oppIds)) : [],
        custIds.length ? db.select({
          id: customers.id,
          displayName: customers.displayName,
          mobilePhone: customers.mobilePhone,
          email: customers.email,
        }).from(customers).where(inArray(customers.id, custIds)) : [],
      ]);

      const oppMap = new Map(oppRows.map(o => [o.id, o]));
      const custMap = new Map(custRows.map(c => [c.id, c]));

      const enrichedEvents = myEvents.map(ev => ({
        ...ev,
        opportunityData: ev.opportunityId ? (oppMap.get(ev.opportunityId) ?? null) : null,
        customerData: ev.customerId ? (custMap.get(ev.customerId) ?? null) : null,
      }));

      const enrichedWorkOrders = myWorkOrders.map(wo => ({
        ...wo,
        customerData: wo.customerId ? (custMap.get(wo.customerId) ?? null) : null,
      }));

      return { scheduleEvents: enrichedEvents, workOrders: enrichedWorkOrders };
    }),

  /** Clock in to a job */
  clockIn: protectedProcedure
    .input(z.object({
      techName: z.string().min(1),
      workOrderId: z.number().optional(),
      scheduleEventId: z.string().optional(),
      opportunityId: z.string().optional(),
      customerId: z.string().optional(),
      jobTitle: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database unavailable');

      const inserted = await db.insert(timeLogs).values({
        techName: input.techName,
        workOrderId: input.workOrderId ?? null,
        scheduleEventId: input.scheduleEventId ?? null,
        opportunityId: input.opportunityId ?? null,
        customerId: input.customerId ?? null,
        jobTitle: input.jobTitle ?? null,
        clockIn: new Date(),
      });
      const timeLogId = Number((inserted as unknown as { insertId?: number | string }).insertId ?? 0);

      // Mark work order as in_progress
      if (input.workOrderId) {
        await db.update(threeSixtyWorkOrders)
          .set({ status: 'in_progress' })
          .where(eq(threeSixtyWorkOrders.id, input.workOrderId));
      }

      return { timeLogId };
    }),

  /** Clock out of a job */
  clockOut: protectedProcedure
    .input(z.object({
      timeLogId: z.number(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database unavailable');

      const [existing] = await db.select().from(timeLogs).where(eq(timeLogs.id, input.timeLogId));
      if (!existing) throw new Error('Time log not found');

      const now = new Date();
      const durationMins = Math.round((now.getTime() - existing.clockIn.getTime()) / 60000);

      await db.update(timeLogs).set({
        clockOut: now,
        durationMins,
        notes: input.notes ?? null,
      }).where(eq(timeLogs.id, input.timeLogId));

      return { durationMins };
    }),

  /** Mark a job complete */
  completeJob: protectedProcedure
    .input(z.object({
      workOrderId: z.number().optional(),
      scheduleEventId: z.string().optional(),
      technicianNotes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database unavailable');

      if (input.workOrderId) {
        await db.update(threeSixtyWorkOrders).set({
          status: 'completed',
          completedDate: Date.now(),
          technicianNotes: input.technicianNotes ?? null,
        }).where(eq(threeSixtyWorkOrders.id, input.workOrderId));
      }

      if (input.scheduleEventId) {
        await db.update(scheduleEvents).set({
          completed: true,
          completedAt: new Date().toISOString(),
        }).where(eq(scheduleEvents.id, input.scheduleEventId));
      }

      return { success: true };
    }),

  /** Get today's time logs for a tech */
  myTimeLogs: protectedProcedure
    .input(z.object({
      techName: z.string().min(1),
      date: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const dateStr = input.date ?? todayISO();
      const [y, m, d] = dateStr.split('-').map(Number);
      const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
      const dayEnd   = new Date(y, m - 1, d, 23, 59, 59, 999);

      const logs = await db.select().from(timeLogs).where(
        and(
          eq(timeLogs.techName, input.techName),
          gte(timeLogs.clockIn, dayStart),
          lt(timeLogs.clockIn, dayEnd),
        )
      );

      return logs.map(log => ({
        ...log,
        durationMins: log.durationMins
          ?? (log.clockOut ? null : Math.round((Date.now() - log.clockIn.getTime()) / 60000)),
      }));
    }),

  /** Set a work order to in_progress (without clocking in) */
  setWorkOrderInProgress: protectedProcedure
    .input(z.object({ workOrderId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database unavailable');
      await db.update(threeSixtyWorkOrders)
        .set({ status: 'in_progress' })
        .where(eq(threeSixtyWorkOrders.id, input.workOrderId));
      return { success: true };
    }),
});
