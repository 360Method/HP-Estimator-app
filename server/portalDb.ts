/**
 * Portal DB helpers — query functions for the customer portal tables.
 * All functions return raw Drizzle rows.
 */
import { getDb } from "./db";
import { eq, and, gt, desc } from "drizzle-orm";
import {
  portalCustomers,
  portalTokens,
  portalSessions,
  portalEstimates,
  portalInvoices,
  portalAppointments,
  portalMessages,
  portalGallery,
  portalReferrals,
  type InsertPortalCustomer,
  type InsertPortalToken,
  type InsertPortalSession,
  type InsertPortalEstimate,
  type InsertPortalInvoice,
  type InsertPortalAppointment,
  type InsertPortalMessage,
  type InsertPortalGalleryItem,
  type InsertPortalReferral,
} from "../drizzle/schema";

async function d() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db;
}

// ─── CUSTOMERS ────────────────────────────────────────────────────────────────

export async function findPortalCustomerByEmail(email: string) {
  const db = await d();
  const rows = await db
    .select()
    .from(portalCustomers)
    .where(eq(portalCustomers.email, email.toLowerCase().trim()))
    .limit(1);
  return rows[0] ?? null;
}

export async function findPortalCustomerById(id: number) {
  const db = await d();
  const rows = await db
    .select()
    .from(portalCustomers)
    .where(eq(portalCustomers.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function findPortalCustomerByHpId(hpCustomerId: string) {
  const db = await d();
  const rows = await db
    .select()
    .from(portalCustomers)
    .where(eq(portalCustomers.hpCustomerId, hpCustomerId))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertPortalCustomer(data: InsertPortalCustomer) {
  const existing = data.email
    ? await findPortalCustomerByEmail(data.email)
    : null;
  if (existing) {
    const db = await d();
    await db
      .update(portalCustomers)
      .set({ name: data.name, phone: data.phone, address: data.address })
      .where(eq(portalCustomers.id, existing.id));
    return existing;
  }
  const db = await d();
  const result = await db.insert(portalCustomers).values(data);
  const newId = Number((result as any).insertId ?? (result as any)[0]?.insertId);
  return findPortalCustomerById(newId);
}

export async function updatePortalCustomerStripeId(customerId: number, stripeCustomerId: string) {
  const db = await d();
  await db
    .update(portalCustomers)
    .set({ stripeCustomerId })
    .where(eq(portalCustomers.id, customerId));
}

// ─── MAGIC LINK TOKENS ────────────────────────────────────────────────────────

export async function createPortalToken(data: InsertPortalToken) {
  const db = await d();
  await db.insert(portalTokens).values(data);
}

export async function findValidPortalToken(token: string) {
  const db = await d();
  const rows = await db
    .select()
    .from(portalTokens)
    .where(
      and(
        eq(portalTokens.token, token),
        gt(portalTokens.expiresAt, new Date()),
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function markPortalTokenUsed(id: number) {
  const db = await d();
  await db
    .update(portalTokens)
    .set({ usedAt: new Date() })
    .where(eq(portalTokens.id, id));
}

// ─── SESSIONS ─────────────────────────────────────────────────────────────────

export async function createPortalSession(data: InsertPortalSession) {
  const db = await d();
  await db.insert(portalSessions).values(data);
}

export async function findValidPortalSession(sessionToken: string) {
  const db = await d();
  const rows = await db
    .select()
    .from(portalSessions)
    .where(
      and(
        eq(portalSessions.sessionToken, sessionToken),
        gt(portalSessions.expiresAt, new Date()),
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function deletePortalSession(sessionToken: string) {
  const db = await d();
  await db
    .delete(portalSessions)
    .where(eq(portalSessions.sessionToken, sessionToken));
}

// ─── ESTIMATES ────────────────────────────────────────────────────────────────

export async function createPortalEstimate(data: InsertPortalEstimate) {
  const db = await d();
  // Upsert: if an estimate with the same customerId + estimateNumber already exists,
  // update it with the latest structured lineItemsJson and other fields.
  await db
    .insert(portalEstimates)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        title: data.title,
        status: data.status ?? 'sent',
        totalAmount: data.totalAmount,
        depositAmount: data.depositAmount,
        depositPercent: data.depositPercent,
        lineItemsJson: data.lineItemsJson,
        scopeOfWork: data.scopeOfWork,
        expiresAt: data.expiresAt,
        sentAt: data.sentAt ?? new Date(),
        updatedAt: new Date(),
      },
    });
  // Fetch the upserted row
  const rows = await db
    .select()
    .from(portalEstimates)
    .where(
      and(
        eq(portalEstimates.customerId, data.customerId),
        eq(portalEstimates.estimateNumber, data.estimateNumber),
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getPortalEstimatesByCustomer(customerId: number) {
  const db = await d();
  return db
    .select()
    .from(portalEstimates)
    .where(eq(portalEstimates.customerId, customerId))
    .orderBy(desc(portalEstimates.sentAt));
}

export async function getPortalEstimateById(id: number) {
  const db = await d();
  const rows = await db
    .select()
    .from(portalEstimates)
    .where(eq(portalEstimates.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function updatePortalEstimateStatus(
  id: number,
  status: string,
  extra?: Partial<typeof portalEstimates.$inferInsert>
) {
  const db = await d();
  await db
    .update(portalEstimates)
    .set({ status, ...extra })
    .where(eq(portalEstimates.id, id));
}

export async function markPortalEstimateViewed(id: number) {
  const est = await getPortalEstimateById(id);
  if (est && !est.viewedAt) {
    const db = await d();
    await db
      .update(portalEstimates)
      .set({ viewedAt: new Date(), status: "viewed" })
      .where(eq(portalEstimates.id, id));
  }
}

// ─── INVOICES ─────────────────────────────────────────────────────────────────

export async function createPortalInvoice(data: InsertPortalInvoice) {
  const db = await d();
  const result = await db.insert(portalInvoices).values(data);
  const newId = Number((result as any).insertId ?? (result as any)[0]?.insertId);
  return getPortalInvoiceById(newId);
}

export async function getPortalInvoicesByCustomer(customerId: number) {
  const db = await d();
  return db
    .select()
    .from(portalInvoices)
    .where(eq(portalInvoices.customerId, customerId))
    .orderBy(desc(portalInvoices.sentAt));
}

export async function getPortalInvoiceById(id: number) {
  const db = await d();
  const rows = await db
    .select()
    .from(portalInvoices)
    .where(eq(portalInvoices.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function updatePortalInvoicePaid(
  id: number,
  amountPaid: number,
  stripePaymentIntentId?: string
) {
  const db = await d();
  await db
    .update(portalInvoices)
    .set({
      status: "paid",
      amountPaid,
      paidAt: new Date(),
      ...(stripePaymentIntentId ? { stripePaymentIntentId } : {}),
    })
    .where(eq(portalInvoices.id, id));
}

export async function getPortalInvoiceByStripePaymentIntentId(piId: string) {
  const db = await d();
  const rows = await db
    .select()
    .from(portalInvoices)
    .where(eq(portalInvoices.stripePaymentIntentId, piId))
    .limit(1);
  return rows[0] ?? null;
}

export async function markPortalInvoiceViewed(id: number) {
  const inv = await getPortalInvoiceById(id);
  if (inv && !inv.viewedAt) {
    const db = await d();
    await db
      .update(portalInvoices)
      .set({ viewedAt: new Date() })
      .where(eq(portalInvoices.id, id));
  }
}

// ─── APPOINTMENTS ─────────────────────────────────────────────────────────────

export async function createPortalAppointment(data: InsertPortalAppointment) {
  const db = await d();
  const result = await db.insert(portalAppointments).values(data);
  const newId = Number((result as any).insertId ?? (result as any)[0]?.insertId);
  const rows = await db
    .select()
    .from(portalAppointments)
    .where(eq(portalAppointments.id, newId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getPortalAppointmentsByCustomer(customerId: number) {
  const db = await d();
  return db
    .select()
    .from(portalAppointments)
    .where(eq(portalAppointments.customerId, customerId))
    .orderBy(desc(portalAppointments.scheduledAt));
}

// ─── MESSAGES ─────────────────────────────────────────────────────────────────

export async function createPortalMessage(data: InsertPortalMessage) {
  const db = await d();
  await db.insert(portalMessages).values(data);
}

export async function getPortalMessagesByCustomer(customerId: number) {
  const db = await d();
  return db
    .select()
    .from(portalMessages)
    .where(eq(portalMessages.customerId, customerId))
    .orderBy(portalMessages.createdAt);
}

export async function getUnreadPortalMessageCount(customerId: number) {
  const db = await d();
  const rows = await db
    .select()
    .from(portalMessages)
    .where(
      and(
        eq(portalMessages.customerId, customerId),
        eq(portalMessages.senderRole, "customer"),
      )
    );
  return rows.filter((m) => !m.readAt).length;
}

// ─── GALLERY ──────────────────────────────────────────────────────────────────

export async function addPortalGalleryItem(data: InsertPortalGalleryItem) {
  const db = await d();
  await db.insert(portalGallery).values(data);
}

export async function getPortalGalleryByCustomer(customerId: number) {
  const db = await d();
  return db
    .select()
    .from(portalGallery)
    .where(eq(portalGallery.customerId, customerId))
    .orderBy(desc(portalGallery.createdAt));
}

// ─── REFERRALS ────────────────────────────────────────────────────────────────

export async function createPortalReferral(data: InsertPortalReferral) {
  const db = await d();
  await db.insert(portalReferrals).values(data);
}

export async function getPortalReferralsByReferrer(referrerId: number) {
  const db = await d();
  return db
    .select()
    .from(portalReferrals)
    .where(eq(portalReferrals.referrerId, referrerId))
    .orderBy(desc(portalReferrals.createdAt));
}

export async function generateReferralCode(name: string): Promise<string> {
  const base = name
    .split(" ")[0]
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
  const suffix = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `${base}-${suffix}`;
}
export async function updatePortalCustomerProfile(
  id: number,
  data: { name?: string; phone?: string; address?: string }
) {
  const db = await d();
  await db.update(portalCustomers).set(data).where(eq(portalCustomers.id, id));
  return findPortalCustomerById(id);
}

// ─── SERVICE REQUESTS ─────────────────────────────────────────────────────────
import {
  portalServiceRequests,
  type InsertPortalServiceRequest,
} from "../drizzle/schema";

export async function createPortalServiceRequest(data: InsertPortalServiceRequest) {
  const db = await d();
  const result = await db.insert(portalServiceRequests).values(data);
  const newId = Number((result as any).insertId ?? (result as any)[0]?.insertId);
  const rows = await db.select().from(portalServiceRequests).where(eq(portalServiceRequests.id, newId)).limit(1);
  return rows[0] ?? null;
}

export async function getPortalServiceRequestsByCustomer(customerId: number) {
  const db = await d();
  return db.select().from(portalServiceRequests).where(eq(portalServiceRequests.customerId, customerId)).orderBy(desc(portalServiceRequests.createdAt));
}

export async function getAllPendingPortalServiceRequests() {
  const db = await d();
  return db.select().from(portalServiceRequests).where(eq(portalServiceRequests.status, 'pending')).orderBy(desc(portalServiceRequests.createdAt));
}

export async function updatePortalServiceRequestStatus(id: number, status: string, leadId?: string) {
  const db = await d();
  await db.update(portalServiceRequests).set({ status, ...(leadId ? { leadId } : {}), readAt: new Date() }).where(eq(portalServiceRequests.id, id));
}

export async function getAllPortalMessages() {
  const db = await d();
  return db.select().from(portalMessages).orderBy(desc(portalMessages.createdAt));
}
