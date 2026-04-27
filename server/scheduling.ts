/**
 * server/scheduling.ts
 *
 * Customer scheduling widget — slot availability + booking lifecycle.
 *
 * Default availability seed: M-F 8am-6pm Pacific, 60-min slots, 30 days out.
 * `ensureSchedulingTables` runs at boot, creates the tables if missing, and
 * fills the next 30 days of default slots whenever the slot table is empty.
 */

import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  customers,
  scheduledBookings,
  schedulingSlots,
  type DbScheduledBooking,
  type DbSchedulingSlot,
  type InsertDbScheduledBooking,
} from "../drizzle/schema";

const PACIFIC_TZ = "America/Los_Angeles";

// ─── Boot: ensure tables + default availability ─────────────────────────────

export async function ensureSchedulingTables(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS \`scheduling_slots\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`startAt\` timestamp NOT NULL,
      \`endAt\` timestamp NOT NULL,
      \`capacity\` int NOT NULL DEFAULT 1,
      \`bookedCount\` int NOT NULL DEFAULT 0,
      \`blocked\` boolean NOT NULL DEFAULT false,
      \`notes\` varchar(255),
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`scheduling_slots_id\` PRIMARY KEY(\`id\`)
    )`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS \`scheduled_bookings\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`customerId\` varchar(64) NOT NULL,
      \`slotId\` int NOT NULL,
      \`visitType\` enum('consultation','baseline','seasonal','project') NOT NULL DEFAULT 'consultation',
      \`status\` enum('confirmed','rescheduled','cancelled','completed','no_show') NOT NULL DEFAULT 'confirmed',
      \`notes\` text,
      \`bookedBy\` varchar(64) NOT NULL DEFAULT 'customer',
      \`confirmationCode\` varchar(16),
      \`cancelledAt\` timestamp NULL,
      \`cancelReason\` varchar(255),
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`scheduled_bookings_id\` PRIMARY KEY(\`id\`)
    )`);
    // Seed default availability if the slot table is empty.
    const [existing] = await db.select({ id: schedulingSlots.id }).from(schedulingSlots).limit(1);
    if (!existing) {
      const seeded = buildDefaultSlots(30);
      if (seeded.length > 0) {
        await db.insert(schedulingSlots).values(seeded);
        console.log(`[Scheduling] Seeded ${seeded.length} default slots (M-F 8a-6p PT × 30 days).`);
      }
    }
  } catch (err) {
    console.warn("[Scheduling] ensureSchedulingTables failed (non-fatal):", err);
  }
}

/** M-F 8am-6pm Pacific, 60-min slots, capacity=1, for the next `days` days. */
export function buildDefaultSlots(days: number, fromDate: Date = new Date()) {
  const out: { startAt: Date; endAt: Date; capacity: number }[] = [];
  for (let d = 1; d <= days; d++) {
    const day = new Date(fromDate);
    day.setUTCDate(day.getUTCDate() + d);
    // Resolve PT weekday for `day`.
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: PACIFIC_TZ, weekday: "short" })
      .format(day);
    if (weekday === "Sat" || weekday === "Sun") continue;
    // Resolve PT calendar y/m/d for that UTC day.
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: PACIFIC_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(day); // YYYY-MM-DD
    for (let hr = 8; hr < 18; hr++) {
      const startAt = pacificDateToUtc(ymd, hr, 0);
      const endAt = pacificDateToUtc(ymd, hr + 1, 0);
      out.push({ startAt, endAt, capacity: 1 });
    }
  }
  return out;
}

/** Returns a UTC Date corresponding to the given Pacific local YYYY-MM-DD HH:MM. */
function pacificDateToUtc(ymd: string, hour: number, minute: number): Date {
  // Probe two possible UTC times (PST = UTC-8, PDT = UTC-7) and pick the one
  // whose Pacific projection matches the desired hour. Cheap, no tz lib dep.
  const [y, m, d] = ymd.split("-").map(Number);
  for (const offset of [8, 7]) {
    const probe = new Date(Date.UTC(y, m - 1, d, hour + offset, minute, 0, 0));
    const probeHour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: PACIFIC_TZ,
        hour: "2-digit",
        hour12: false,
      })
        .format(probe)
        .replace(/[^0-9]/g, ""),
    );
    if (probeHour === hour) return probe;
  }
  return new Date(Date.UTC(y, m - 1, d, hour + 8, minute, 0, 0));
}

// ─── Slot operations ─────────────────────────────────────────────────────────

export async function listAvailableSlots(opts: { from?: Date; to?: Date; limit?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  const from = opts.from ?? new Date();
  const conds = [
    gte(schedulingSlots.startAt, from),
    eq(schedulingSlots.blocked, false),
  ];
  if (opts.to) conds.push(lte(schedulingSlots.startAt, opts.to));
  const rows = await db
    .select()
    .from(schedulingSlots)
    .where(and(...conds))
    .orderBy(asc(schedulingSlots.startAt))
    .limit(opts.limit ?? 200);
  return rows.filter((s) => s.bookedCount < s.capacity);
}

export async function listAllSlots(opts: { from?: Date; to?: Date; limit?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  const conds = [];
  if (opts.from) conds.push(gte(schedulingSlots.startAt, opts.from));
  if (opts.to) conds.push(lte(schedulingSlots.startAt, opts.to));
  const q =
    conds.length > 0
      ? db.select().from(schedulingSlots).where(and(...conds))
      : db.select().from(schedulingSlots);
  return (q as any).orderBy(asc(schedulingSlots.startAt)).limit(opts.limit ?? 500);
}

export async function getSlot(id: number): Promise<DbSchedulingSlot | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(schedulingSlots).where(eq(schedulingSlots.id, id)).limit(1);
  return row ?? null;
}

export async function setSlotBlocked(id: number, blocked: boolean): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(schedulingSlots).set({ blocked }).where(eq(schedulingSlots.id, id));
}

// ─── Booking lifecycle ───────────────────────────────────────────────────────

function makeConfirmationCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function createBooking(input: {
  customerId: string;
  slotId: number;
  visitType?: InsertDbScheduledBooking["visitType"];
  notes?: string;
  bookedBy?: string;
}): Promise<DbScheduledBooking> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const slot = await getSlot(input.slotId);
  if (!slot) throw new Error(`Slot ${input.slotId} not found`);
  if (slot.blocked) throw new Error("Slot is blocked");
  if (slot.bookedCount >= slot.capacity) throw new Error("Slot is fully booked");
  if (new Date(slot.startAt).getTime() <= Date.now()) throw new Error("Slot is in the past");

  const confirmationCode = makeConfirmationCode();
  const visitType = input.visitType ?? "consultation";
  const result = (await db.insert(scheduledBookings).values({
    customerId: input.customerId,
    slotId: input.slotId,
    visitType,
    status: "confirmed",
    notes: input.notes,
    bookedBy: input.bookedBy ?? "customer",
    confirmationCode,
  })) as unknown as { insertId: number | string };

  await db
    .update(schedulingSlots)
    .set({ bookedCount: slot.bookedCount + 1 })
    .where(eq(schedulingSlots.id, slot.id));

  const id = Number(result.insertId);
  const [row] = await db.select().from(scheduledBookings).where(eq(scheduledBookings.id, id)).limit(1);
  return row;
}

export async function cancelBooking(id: number, reason?: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [row] = await db.select().from(scheduledBookings).where(eq(scheduledBookings.id, id)).limit(1);
  if (!row) throw new Error("Booking not found");
  if (row.status === "cancelled") return;
  await db
    .update(scheduledBookings)
    .set({ status: "cancelled", cancelledAt: new Date(), cancelReason: reason ?? null })
    .where(eq(scheduledBookings.id, id));
  // Free the slot
  const slot = await getSlot(row.slotId);
  if (slot && slot.bookedCount > 0) {
    await db
      .update(schedulingSlots)
      .set({ bookedCount: Math.max(0, slot.bookedCount - 1) })
      .where(eq(schedulingSlots.id, slot.id));
  }
}

export async function rescheduleBooking(id: number, newSlotId: number): Promise<DbScheduledBooking> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [row] = await db.select().from(scheduledBookings).where(eq(scheduledBookings.id, id)).limit(1);
  if (!row) throw new Error("Booking not found");
  if (row.status === "cancelled") throw new Error("Cannot reschedule a cancelled booking");
  if (newSlotId === row.slotId) return row;

  const newSlot = await getSlot(newSlotId);
  if (!newSlot) throw new Error("New slot not found");
  if (newSlot.blocked) throw new Error("New slot is blocked");
  if (newSlot.bookedCount >= newSlot.capacity) throw new Error("New slot is fully booked");

  // Free old, take new
  const oldSlot = await getSlot(row.slotId);
  if (oldSlot && oldSlot.bookedCount > 0) {
    await db
      .update(schedulingSlots)
      .set({ bookedCount: Math.max(0, oldSlot.bookedCount - 1) })
      .where(eq(schedulingSlots.id, oldSlot.id));
  }
  await db
    .update(schedulingSlots)
    .set({ bookedCount: newSlot.bookedCount + 1 })
    .where(eq(schedulingSlots.id, newSlot.id));

  await db
    .update(scheduledBookings)
    .set({ slotId: newSlotId, status: "rescheduled" })
    .where(eq(scheduledBookings.id, id));

  const [updated] = await db
    .select()
    .from(scheduledBookings)
    .where(eq(scheduledBookings.id, id))
    .limit(1);
  return updated;
}

export async function listBookings(opts: {
  customerId?: string;
  status?: DbScheduledBooking["status"];
  upcomingOnly?: boolean;
  limit?: number;
} = {}) {
  const db = await getDb();
  if (!db) return [];
  const conds = [];
  if (opts.customerId) conds.push(eq(scheduledBookings.customerId, opts.customerId));
  if (opts.status) conds.push(eq(scheduledBookings.status, opts.status));
  const q =
    conds.length > 0
      ? db.select().from(scheduledBookings).where(and(...conds))
      : db.select().from(scheduledBookings);
  const rows = await (q as any)
    .orderBy(desc(scheduledBookings.createdAt))
    .limit(opts.limit ?? 200);
  if (opts.upcomingOnly) {
    const now = Date.now();
    const futureSlotIds = await db
      .select({ id: schedulingSlots.id, startAt: schedulingSlots.startAt })
      .from(schedulingSlots);
    const futureSet = new Set(
      futureSlotIds
        .filter((s) => new Date(s.startAt).getTime() > now)
        .map((s) => s.id),
    );
    return rows.filter((b: DbScheduledBooking) => futureSet.has(b.slotId));
  }
  return rows;
}

export async function getBookingWithSlot(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [b] = await db.select().from(scheduledBookings).where(eq(scheduledBookings.id, id)).limit(1);
  if (!b) return null;
  const [s] = await db.select().from(schedulingSlots).where(eq(schedulingSlots.id, b.slotId)).limit(1);
  const [c] = await db.select().from(customers).where(eq(customers.id, b.customerId)).limit(1);
  return { booking: b, slot: s ?? null, customer: c ?? null };
}
