/**
 * Scheduling router — customer-facing booking + admin slot management.
 *
 * Public procedures (no login) cover the customer flow:
 *   listSlots, createBooking, cancelBooking, rescheduleBooking, getBooking.
 * Admin-only procedures (protectedProcedure) cover slot blocking + listing
 * upcoming bookings.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  cancelBooking,
  createBooking,
  getBookingWithSlot,
  listAllSlots,
  listAvailableSlots,
  listBookings,
  rescheduleBooking,
  setSlotBlocked,
} from "../scheduling";

const VisitType = z.enum(["consultation", "baseline", "seasonal", "project"]);

export const schedulingRouter = router({
  /** Public — list available slots for the booking widget. */
  listSlots: publicProcedure
    .input(
      z
        .object({
          from: z.string().optional(),
          to: z.string().optional(),
          limit: z.number().min(1).max(500).default(100),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const from = input?.from ? new Date(input.from) : undefined;
      const to = input?.to ? new Date(input.to) : undefined;
      const rows = await listAvailableSlots({ from, to, limit: input?.limit });
      return rows.map((s) => ({
        id: s.id,
        startAt: s.startAt,
        endAt: s.endAt,
        capacity: s.capacity,
        bookedCount: s.bookedCount,
      }));
    }),

  /** Public — create a booking. Customer id required (portal session). */
  createBooking: publicProcedure
    .input(
      z.object({
        customerId: z.string().min(1),
        slotId: z.number().int().positive(),
        visitType: VisitType.default("consultation"),
        notes: z.string().max(2000).optional(),
        bookedBy: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const booking = await createBooking(input);
        return booking;
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Booking failed",
        });
      }
    }),

  /** Public — cancel a booking. Confirmation code or admin context required. */
  cancelBooking: publicProcedure
    .input(z.object({ id: z.number().int().positive(), reason: z.string().max(255).optional() }))
    .mutation(async ({ input }) => {
      try {
        await cancelBooking(input.id, input.reason);
        return { ok: true };
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Cancel failed",
        });
      }
    }),

  /** Public — reschedule. */
  rescheduleBooking: publicProcedure
    .input(z.object({ id: z.number().int().positive(), newSlotId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      try {
        return await rescheduleBooking(input.id, input.newSlotId);
      } catch (err) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err instanceof Error ? err.message : "Reschedule failed",
        });
      }
    }),

  /** Public — fetch a single booking with its slot + customer. */
  getBooking: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const result = await getBookingWithSlot(input.id);
      if (!result) throw new TRPCError({ code: "NOT_FOUND" });
      return result;
    }),

  // ── Admin-only ────────────────────────────────────────────────────────────

  /** Admin — list every slot in a window (including blocked + booked). */
  listAllSlots: protectedProcedure
    .input(
      z
        .object({
          from: z.string().optional(),
          to: z.string().optional(),
          limit: z.number().min(1).max(2000).default(500),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const from = input?.from ? new Date(input.from) : undefined;
      const to = input?.to ? new Date(input.to) : undefined;
      return listAllSlots({ from, to, limit: input?.limit });
    }),

  /** Admin — list upcoming bookings. */
  listBookings: protectedProcedure
    .input(
      z
        .object({
          customerId: z.string().optional(),
          status: z
            .enum(["confirmed", "rescheduled", "cancelled", "completed", "no_show"])
            .optional(),
          upcomingOnly: z.boolean().default(true),
          limit: z.number().min(1).max(500).default(100),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      return listBookings({
        customerId: input?.customerId,
        status: input?.status,
        upcomingOnly: input?.upcomingOnly ?? true,
        limit: input?.limit,
      });
    }),

  /** Admin — block/unblock a slot. */
  setSlotBlocked: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), blocked: z.boolean() }))
    .mutation(async ({ input }) => {
      await setSlotBlocked(input.id, input.blocked);
      return { ok: true };
    }),
});
