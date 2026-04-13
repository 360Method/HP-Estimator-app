/**
 * Portal DB helpers — query functions for the customer portal tables.
 * All functions return raw Drizzle rows.
 */
import { getDb } from "./db";
import { eq, and, gt, lt, or, isNull, desc, inArray, sql, sum } from "drizzle-orm";
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
  portalJobMilestones,
  portalJobUpdates,
  portalJobSignOffs,
  portalChangeOrders,
  type InsertPortalCustomer,
  type InsertPortalToken,
  type InsertPortalSession,
  type InsertPortalEstimate,
  type InsertPortalInvoice,
  type InsertPortalAppointment,
  type InsertPortalMessage,
  type InsertPortalGalleryItem,
  type InsertPortalReferral,
  type InsertPortalJobMilestone,
  type InsertPortalJobUpdate,
  type InsertPortalJobSignOff,
  type InsertPortalChangeOrder,
  type PortalChangeOrder,
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

export async function getPortalEstimateByOpportunityId(hpOpportunityId: string) {
  const db = await d();
  const rows = await db
    .select()
    .from(portalEstimates)
    .where(eq(portalEstimates.hpOpportunityId, hpOpportunityId))
    .orderBy(desc(portalEstimates.createdAt))
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

// ─── INVOICE CHECKOUT SESSION HELPERS ────────────────────────────────────────

export async function getPortalInvoiceByCheckoutSessionId(sessionId: string) {
  const db = await d();
  const rows = await db
    .select()
    .from(portalInvoices)
    .where(eq(portalInvoices.stripeCheckoutSessionId, sessionId))
    .limit(1);
  return rows[0] ?? null;
}

export async function updatePortalInvoiceCheckoutSessionId(
  id: number,
  checkoutSessionId: string
) {
  const db = await d();
  await db
    .update(portalInvoices)
    .set({ stripeCheckoutSessionId: checkoutSessionId })
    .where(eq(portalInvoices.id, id));
}

// ─── BULK LOOKUP BY INVOICE NUMBER (for pro-side payment sync) ────────────────

/**
 * Given a list of invoice numbers (e.g. ["INV-2026-001", "INV-2026-002"]),
 * returns portal invoice rows that have been paid, keyed by invoiceNumber.
 * Used by the HP-side estimator to show "Paid via Portal" badges.
 */
export async function getPortalInvoicePaymentStatusByNumbers(
  invoiceNumbers: string[]
): Promise<Record<string, { paidAt: Date | null; amountPaid: number; status: string }>> {
  if (!invoiceNumbers.length) return {};
  const db = await d();
  const rows = await db
    .select({
      invoiceNumber: portalInvoices.invoiceNumber,
      paidAt: portalInvoices.paidAt,
      amountPaid: portalInvoices.amountPaid,
      status: portalInvoices.status,
    })
    .from(portalInvoices)
    .where(inArray(portalInvoices.invoiceNumber, invoiceNumbers));
  const result: Record<string, { paidAt: Date | null; amountPaid: number; status: string }> = {};
  for (const row of rows) {
    result[row.invoiceNumber] = {
      paidAt: row.paidAt,
      amountPaid: row.amountPaid,
      status: row.status,
    };
  }
  return result;
}

// ─── OVERDUE REMINDERS ────────────────────────────────────────────────────────

/**
 * Returns all portal invoices that are overdue and eligible for a reminder email.
 * Eligible = dueDate < now AND status != 'paid' AND (lastReminderSentAt IS NULL OR lastReminderSentAt < 3 days ago).
 * Includes the customer row so the caller can address the email.
 */
export async function getOverdueInvoicesForReminder() {
  const db = await d();
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      invoice: portalInvoices,
      customer: portalCustomers,
    })
    .from(portalInvoices)
    .innerJoin(portalCustomers, eq(portalInvoices.customerId, portalCustomers.id))
    .where(
      and(
        lt(portalInvoices.dueDate, now),
        // status not paid — MySQL doesn't have ne(), use sql
        sql`${portalInvoices.status} != 'paid'`,
        or(
          isNull(portalInvoices.lastReminderSentAt),
          lt(portalInvoices.lastReminderSentAt, threeDaysAgo)
        )
      )
    );

  return rows;
}

/**
 * Stamps lastReminderSentAt = now on a portal invoice after a reminder is sent.
 */
export async function markPortalInvoiceReminderSent(id: number) {
  const db = await d();
  await db
    .update(portalInvoices)
    .set({ lastReminderSentAt: new Date() })
    .where(eq(portalInvoices.id, id));
}

// ─── REVENUE STATS ────────────────────────────────────────────────────────────

/**
 * Returns total collected (sum of amountPaid on paid invoices) and
 * total outstanding (sum of amountDue - amountPaid on unpaid invoices),
 * both in cents.
 */
export async function getPortalRevenueStats(): Promise<{
  totalCollectedCents: number;
  totalOutstandingCents: number;
}> {
  const db = await d();

  const [collected] = await db
    .select({ total: sum(portalInvoices.amountPaid) })
    .from(portalInvoices)
    .where(eq(portalInvoices.status, "paid"));

  const unpaidRows = await db
    .select({
      amountDue: portalInvoices.amountDue,
      amountPaid: portalInvoices.amountPaid,
    })
    .from(portalInvoices)
    .where(sql`${portalInvoices.status} != 'paid'`);

  const totalOutstandingCents = unpaidRows.reduce(
    (acc, r) => acc + Math.max(0, r.amountDue - r.amountPaid),
    0
  );

  return {
    totalCollectedCents: Number(collected?.total ?? 0),
    totalOutstandingCents,
  };
}

// ─── JOB MILESTONES ──────────────────────────────────────────────────────────

export async function getMilestonesByJob(hpOpportunityId: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(portalJobMilestones)
    .where(eq(portalJobMilestones.hpOpportunityId, hpOpportunityId))
    .orderBy(portalJobMilestones.sortOrder, portalJobMilestones.createdAt);
}

export async function upsertMilestone(data: InsertPortalJobMilestone & { id?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.id) {
    await db
      .update(portalJobMilestones)
      .set({
        title: data.title,
        description: data.description ?? null,
        status: data.status ?? "pending",
        scheduledDate: data.scheduledDate ?? null,
        completedAt: data.status === "complete" ? new Date() : null,
        sortOrder: data.sortOrder ?? 0,
      })
      .where(eq(portalJobMilestones.id, data.id));
    return data.id;
  }
  const [result] = await db.insert(portalJobMilestones).values({
    hpOpportunityId: data.hpOpportunityId,
    title: data.title,
    description: data.description ?? null,
    status: data.status ?? "pending",
    scheduledDate: data.scheduledDate ?? null,
    completedAt: data.status === "complete" ? new Date() : null,
    sortOrder: data.sortOrder ?? 0,
  });
  return (result as any).insertId as number;
}

export async function deleteMilestone(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(portalJobMilestones).where(eq(portalJobMilestones.id, id));
}

// ─── JOB UPDATES ─────────────────────────────────────────────────────────────

export async function getUpdatesByJob(hpOpportunityId: string) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(portalJobUpdates)
    .where(eq(portalJobUpdates.hpOpportunityId, hpOpportunityId))
    .orderBy(desc(portalJobUpdates.createdAt));
}

export async function createJobUpdate(data: InsertPortalJobUpdate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(portalJobUpdates).values({
    hpOpportunityId: data.hpOpportunityId,
    message: data.message,
    photoUrl: data.photoUrl ?? null,
    postedBy: data.postedBy ?? null,
  });
  return (result as any).insertId as number;
}

export async function deleteJobUpdate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(portalJobUpdates).where(eq(portalJobUpdates.id, id));
}

// ─── JOB SIGN-OFFS ────────────────────────────────────────────────────────────

export async function getJobSignOff(hpOpportunityId: string) {
  const db = await d();
  const rows = await db
    .select()
    .from(portalJobSignOffs)
    .where(eq(portalJobSignOffs.hpOpportunityId, hpOpportunityId))
    .limit(1);
  return rows[0] ?? null;
}

export async function createJobSignOff(data: InsertPortalJobSignOff) {
  const db = await d();
  // Upsert: if a sign-off already exists for this job, update it
  await db
    .insert(portalJobSignOffs)
    .values(data)
    .onDuplicateKeyUpdate({
      set: {
        signatureDataUrl: data.signatureDataUrl,
        signerName: data.signerName,
        signedAt: data.signedAt,
        workSummary: data.workSummary ?? null,
        finalInvoiceId: data.finalInvoiceId ?? null,
      },
    });
  return getJobSignOff(data.hpOpportunityId);
}

// ─── CHANGE ORDERS ────────────────────────────────────────────────────────────
export async function getPortalChangeOrderById(id: number) {
  const db = await d();
  const rows = await db.select().from(portalChangeOrders).where(eq(portalChangeOrders.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getPortalChangeOrdersByJob(hpOpportunityId: string) {
  const db = await d();
  return db
    .select()
    .from(portalChangeOrders)
    .where(eq(portalChangeOrders.hpOpportunityId, hpOpportunityId))
    .orderBy(desc(portalChangeOrders.createdAt));
}

export async function getPortalChangeOrdersByCustomer(customerId: number) {
  const db = await d();
  return db
    .select()
    .from(portalChangeOrders)
    .where(eq(portalChangeOrders.customerId, customerId))
    .orderBy(desc(portalChangeOrders.createdAt));
}

export async function createPortalChangeOrder(data: InsertPortalChangeOrder) {
  const db = await d();
  const result = await db.insert(portalChangeOrders).values(data);
  const insertId = (result as unknown as { insertId: number }).insertId;
  return getPortalChangeOrderById(insertId);
}

export async function updatePortalChangeOrderStatus(
  id: number,
  status: PortalChangeOrder['status'],
  extra?: Partial<Pick<PortalChangeOrder, 'viewedAt' | 'approvedAt' | 'signatureDataUrl' | 'signerName' | 'declinedAt' | 'declineReason' | 'invoiceId'>>
) {
  const db = await d();
  await db
    .update(portalChangeOrders)
    .set({ status, ...extra })
    .where(eq(portalChangeOrders.id, id));
  return getPortalChangeOrderById(id);
}

// ─── REVIEW REQUESTS ──────────────────────────────────────────────────────────
/** Returns sign-offs eligible for the INITIAL review request email (not yet sent, not skipped, signed). */
export async function getSignOffsEligibleForReviewRequest() {
  const db = await d();
  return db
    .select()
    .from(portalJobSignOffs)
    .where(
      and(
        eq(portalJobSignOffs.skipReviewRequest, false),
        isNull(portalJobSignOffs.reviewRequestSentAt)
      )
    );
}

/** Returns sign-offs eligible for the 48h REMINDER review request email. */
export async function getSignOffsEligibleForReviewReminder() {
  const db = await d();
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  return db
    .select()
    .from(portalJobSignOffs)
    .where(
      and(
        eq(portalJobSignOffs.skipReviewRequest, false),
        isNull(portalJobSignOffs.reviewReminderSentAt),
        // Initial request was already sent
        sql`${portalJobSignOffs.reviewRequestSentAt} IS NOT NULL`,
        // Signed at least 48h ago
        lt(portalJobSignOffs.createdAt, cutoff)
      )
    );
}

export async function markReviewRequestSent(id: number) {
  const db = await d();
  await db
    .update(portalJobSignOffs)
    .set({ reviewRequestSentAt: new Date() })
    .where(eq(portalJobSignOffs.id, id));
}

export async function markReviewReminderSent(id: number) {
  const db = await d();
  await db
    .update(portalJobSignOffs)
    .set({ reviewReminderSentAt: new Date() })
    .where(eq(portalJobSignOffs.id, id));
}

export async function setSkipReviewRequest(hpOpportunityId: string, skip: boolean) {
  const db = await d();
  await db
    .update(portalJobSignOffs)
    .set({ skipReviewRequest: skip })
    .where(eq(portalJobSignOffs.hpOpportunityId, hpOpportunityId));
}
