/**
 * Schedule router — DB-backed CRUD for schedule events.
 * Replaces the localStorage scheduleEvents[] array in EstimatorContext.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import {
  listScheduleEvents,
  getScheduleEventById,
  createScheduleEvent,
  updateScheduleEvent,
  deleteScheduleEvent,
  deleteScheduleEventsByOpportunity,
} from "../db";

const RecurrenceRuleInput = z.object({
  freq: z.enum(["daily", "weekly", "biweekly", "monthly"]),
  interval: z.number().optional(),
  until: z.string().optional(),
  count: z.number().optional(),
  byDay: z.array(z.string()).optional(),
}).optional();

const ScheduleEventInput = z.object({
  id: z.string(),
  type: z.string().default("task"),
  title: z.string(),
  start: z.string(),
  end: z.string(),
  allDay: z.boolean().default(false),
  opportunityId: z.string().optional(),
  customerId: z.string().optional(),
  assignedTo: z.string().optional(),   // JSON string[]
  notes: z.string().optional(),
  color: z.string().optional(),
  recurrence: z.string().optional(),   // JSON RecurrenceRule
  parentEventId: z.string().optional(),
  completed: z.boolean().default(false),
  completedAt: z.string().optional(),
});

export const scheduleRouter = router({
  /** List all schedule events, optionally filtered */
  list: protectedProcedure
    .input(z.object({
      customerId: z.string().optional(),
      opportunityId: z.string().optional(),
      limit: z.number().default(500),
    }).optional())
    .query(async ({ input }) => {
      return listScheduleEvents(input ?? {});
    }),

  /** Get a single event */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const ev = await getScheduleEventById(input.id);
      if (!ev) throw new TRPCError({ code: "NOT_FOUND" });
      return ev;
    }),

  /** Create a new schedule event */
  create: protectedProcedure
    .input(ScheduleEventInput)
    .mutation(async ({ input }) => {
      return createScheduleEvent(input);
    }),

  /** Update an existing event */
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      data: ScheduleEventInput.partial().omit({ id: true }),
    }))
    .mutation(async ({ input }) => {
      const existing = await getScheduleEventById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await updateScheduleEvent(input.id, input.data);
      return getScheduleEventById(input.id);
    }),

  /** Mark an event complete */
  complete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await updateScheduleEvent(input.id, {
        completed: true,
        completedAt: new Date().toISOString(),
      });
      return getScheduleEventById(input.id);
    }),

  /** Delete a single event */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await deleteScheduleEvent(input.id);
    }),

  /** Delete all events for an opportunity (e.g., when job is archived) */
  deleteByOpportunity: protectedProcedure
    .input(z.object({ opportunityId: z.string() }))
    .mutation(async ({ input }) => {
      await deleteScheduleEventsByOpportunity(input.opportunityId);
    }),

  /** Bulk upsert — used for migrating localStorage data to DB */
  bulkUpsert: protectedProcedure
    .input(z.array(ScheduleEventInput))
    .mutation(async ({ input }) => {
      for (const ev of input) {
        const existing = await getScheduleEventById(ev.id);
        if (existing) {
          await updateScheduleEvent(ev.id, ev);
        } else {
          await createScheduleEvent(ev);
        }
      }
      return { count: input.length };
    }),
});
