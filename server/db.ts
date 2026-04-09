import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  adminAllowlist,
  callLogs,
  conversations,
  customerAddresses,
  customers,
  DbCustomer,
  DbCustomerAddress,
  DbOpportunity,
  gmailTokens,
  InsertCallLog,
  InsertConversation,
  InsertDbCustomer,
  InsertDbCustomerAddress,
  InsertDbOpportunity,
  InsertMessage,
  InsertUser,
  messages,
  opportunities,
  users,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── USER HELPERS ─────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── INBOX: CONVERSATION HELPERS ─────────────────────────────────────────────

export async function listConversations(limit = 50, offset = 0) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.lastMessageAt))
    .limit(limit)
    .offset(offset);
}

export async function listConversationsByCustomer(customerId: string, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.customerId, customerId))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(limit);
}

export async function getConversationById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function findOrCreateConversation(
  contactPhone: string | null,
  contactEmail: string | null,
  contactName: string | null,
  customerId?: string,
): Promise<typeof conversations.$inferSelect> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Try to find by phone first, then email
  let existing = null;
  if (contactPhone) {
    const rows = await db.select().from(conversations).where(eq(conversations.contactPhone, contactPhone)).limit(1);
    existing = rows[0] ?? null;
  }
  if (!existing && contactEmail) {
    const rows = await db.select().from(conversations).where(eq(conversations.contactEmail, contactEmail)).limit(1);
    existing = rows[0] ?? null;
  }
  if (existing) return existing;

  // Create new
  const insert: InsertConversation = {
    contactPhone: contactPhone ?? undefined,
    contactEmail: contactEmail ?? undefined,
    contactName: contactName ?? undefined,
    customerId: customerId ?? undefined,
    lastMessageAt: new Date(),
    unreadCount: 0,
    channels: "note",
  };
  await db.insert(conversations).values(insert);
  const created = await db.select().from(conversations)
    .orderBy(desc(conversations.id)).limit(1);
  return created[0];
}

export async function updateConversationLastMessage(
  conversationId: number,
  preview: string,
  channel: string,
) {
  const db = await getDb();
  if (!db) return;
  // Add channel to channels list if not present
  await db.update(conversations)
    .set({
      lastMessageAt: new Date(),
      lastMessagePreview: preview.slice(0, 255),
    })
    .where(eq(conversations.id, conversationId));
}

export async function markConversationRead(conversationId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(conversations)
    .set({ unreadCount: 0 })
    .where(eq(conversations.id, conversationId));
  await db.update(messages)
    .set({ readAt: new Date() })
    .where(and(eq(messages.conversationId, conversationId), sql`${messages.readAt} IS NULL`));
}

export async function incrementUnread(conversationId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(conversations)
    .set({ unreadCount: sql`${conversations.unreadCount} + 1` })
    .where(eq(conversations.id, conversationId));
}

// ─── INBOX: MESSAGE HELPERS ──────────────────────────────────────────────────

export async function listMessages(conversationId: number, limit = 100, offset = 0) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.sentAt))
    .limit(limit)
    .offset(offset);
}

export async function insertMessage(msg: InsertMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(messages).values(msg);
  const created = await db.select().from(messages)
    .orderBy(desc(messages.id)).limit(1);
  return created[0];
}

// ─── INBOX: CALL LOG HELPERS ─────────────────────────────────────────────────

export async function listCallLogs(limit = 100, offset = 0) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(callLogs).orderBy(desc(callLogs.startedAt)).limit(limit).offset(offset);
}

export async function insertCallLog(log: InsertCallLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(callLogs).values(log);
  const created = await db.select().from(callLogs)
    .orderBy(desc(callLogs.id)).limit(1);
  return created[0];
}

export async function getCallLogByTwilioSid(sid: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(callLogs).where(eq(callLogs.twilioCallSid, sid)).limit(1);
  return rows[0] ?? null;
}

// ─── GMAIL TOKEN HELPERS ─────────────────────────────────────────────────────

export async function getGmailToken(email: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(gmailTokens).where(eq(gmailTokens.email, email)).limit(1);
  return rows[0] ?? null;
}

/** Return the first connected Gmail account (used at startup to restore GMAIL_CONNECTED_EMAIL) */
export async function getFirstGmailToken() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(gmailTokens).limit(1);
  return rows[0] ?? null;
}

export async function upsertGmailToken(
  email: string,
  accessToken: string,
  refreshToken: string | null,
  expiresAt: number,
) {
  const db = await getDb();
  if (!db) return;
  await db.insert(gmailTokens)
    .values({ email, accessToken, refreshToken: refreshToken ?? undefined, expiresAt })
    .onDuplicateKeyUpdate({ set: { accessToken, refreshToken: refreshToken ?? undefined, expiresAt } });
}

// ─── ADMIN ALLOWLIST ─────────────────────────────────────────────────────────

export async function getAdminAllowlist() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(adminAllowlist).orderBy(adminAllowlist.createdAt);
}

/**
 * Returns true if the email is allowed to access the admin app.
 * If the allowlist is empty, all authenticated users are allowed (open mode).
 */
export async function isEmailAllowed(email: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return true; // fail-open if DB unavailable
  const rows = await db.select({ id: adminAllowlist.id }).from(adminAllowlist).limit(1);
  if (rows.length === 0) return true; // empty list = open mode
  const match = await db
    .select({ id: adminAllowlist.id })
    .from(adminAllowlist)
    .where(eq(adminAllowlist.email, email.toLowerCase().trim()))
    .limit(1);
  return match.length > 0;
}

export async function addAdminAllowlistEmail(email: string, addedBy?: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(adminAllowlist)
    .values({ email: email.toLowerCase().trim(), addedBy })
    .onDuplicateKeyUpdate({ set: { addedBy } });
}

export async function removeAdminAllowlistEmail(email: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(adminAllowlist).where(eq(adminAllowlist.email, email.toLowerCase().trim()));
}

// ─── CUSTOMER HELPERS ─────────────────────────────────────────────────────────

export async function listCustomers(search?: string, limit = 200, offset = 0): Promise<DbCustomer[]> {
  const db = await getDb();
  if (!db) return [];
  const q = db.select().from(customers);
  if (search) {
    const s = `%${search}%`;
    return q.where(
      or(
        like(customers.firstName, s),
        like(customers.lastName, s),
        like(customers.email, s),
        like(customers.mobilePhone, s),
        like(customers.company, s),
      )
    ).orderBy(asc(customers.lastName)).limit(limit).offset(offset);
  }
  return q.orderBy(asc(customers.lastName)).limit(limit).offset(offset);
}

export async function getCustomerById(id: string): Promise<DbCustomer | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function findCustomerByEmail(email: string): Promise<DbCustomer | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(customers)
    .where(eq(customers.email, email.toLowerCase().trim()))
    .limit(1);
  return rows[0] ?? null;
}

export async function createCustomer(data: InsertDbCustomer): Promise<DbCustomer> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(customers).values(data);
  const created = await db.select().from(customers)
    .where(eq(customers.id, data.id!))
    .limit(1);
  return created[0];
}

export async function updateCustomer(id: string, data: Partial<InsertDbCustomer>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(customers).set(data).where(eq(customers.id, id));
}

export async function deleteCustomer(id: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(customers).where(eq(customers.id, id));
}

// ─── CUSTOMER ADDRESS HELPERS ─────────────────────────────────────────────────

export async function listCustomerAddresses(customerId: string): Promise<DbCustomerAddress[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(customerAddresses)
    .where(eq(customerAddresses.customerId, customerId))
    .orderBy(asc(customerAddresses.label));
}

export async function createCustomerAddress(data: InsertDbCustomerAddress): Promise<DbCustomerAddress> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(customerAddresses).values(data);
  const created = await db.select().from(customerAddresses)
    .where(eq(customerAddresses.id, data.id!))
    .limit(1);
  return created[0];
}

export async function deleteCustomerAddress(id: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(customerAddresses).where(eq(customerAddresses.id, id));
}

// ─── OPPORTUNITY HELPERS ──────────────────────────────────────────────────────

export async function listOpportunities(
  area?: string,
  customerId?: string,
  archived = false,
  limit = 500,
): Promise<DbOpportunity[]> {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(opportunities.archived, archived)];
  if (area) conditions.push(eq(opportunities.area, area));
  if (customerId) conditions.push(eq(opportunities.customerId, customerId));
  return db.select().from(opportunities)
    .where(and(...conditions))
    .orderBy(desc(opportunities.createdAt))
    .limit(limit);
}

export async function getOpportunityById(id: string): Promise<DbOpportunity | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(opportunities).where(eq(opportunities.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createOpportunity(data: InsertDbOpportunity): Promise<DbOpportunity> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(opportunities).values(data);
  const created = await db.select().from(opportunities)
    .where(eq(opportunities.id, data.id!))
    .limit(1);
  return created[0];
}

export async function updateOpportunity(id: string, data: Partial<InsertDbOpportunity>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(opportunities).set(data).where(eq(opportunities.id, id));
}

export async function deleteOpportunity(id: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(opportunities).where(eq(opportunities.id, id));
}

// ─── SERVICE ZIP CODE HELPERS ─────────────────────────────────────────────────

export async function listServiceZipCodes() {
  const db = await getDb();
  if (!db) return [];
  const { serviceZipCodes } = await import("../drizzle/schema");
  return db.select().from(serviceZipCodes).orderBy(asc(serviceZipCodes.zip));
}

export async function isZipCodeAllowed(zip: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return true; // fail-open
  const { serviceZipCodes } = await import("../drizzle/schema");
  const rows = await db.select({ id: serviceZipCodes.id }).from(serviceZipCodes).limit(1);
  if (rows.length === 0) return true; // empty list = serve all zips
  const match = await db.select({ id: serviceZipCodes.id })
    .from(serviceZipCodes)
    .where(eq(serviceZipCodes.zip, zip.trim()))
    .limit(1);
  return match.length > 0;
}

export async function addServiceZipCode(zip: string) {
  const db = await getDb();
  if (!db) return;
  const { serviceZipCodes } = await import("../drizzle/schema");
  await db.insert(serviceZipCodes).values({ zip: zip.trim() }).onDuplicateKeyUpdate({ set: { zip: zip.trim() } });
}

export async function removeServiceZipCode(zip: string) {
  const db = await getDb();
  if (!db) return;
  const { serviceZipCodes } = await import("../drizzle/schema");
  await db.delete(serviceZipCodes).where(eq(serviceZipCodes.zip, zip.trim()));
}

// ─── ONLINE REQUEST HELPERS ───────────────────────────────────────────────────

export async function createOnlineRequest(data: {
  zip: string;
  serviceType: string;
  description: string;
  timeline: string;
  photoUrls: string[];
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  street: string;
  unit?: string;
  city: string;
  state: string;
  smsConsent: boolean;
  customerId?: string;
  leadId?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { onlineRequests } = await import("../drizzle/schema");
  await db.insert(onlineRequests).values({
    ...data,
    photoUrls: JSON.stringify(data.photoUrls),
  });
  const created = await db.select().from(onlineRequests)
    .orderBy(desc(onlineRequests.id)).limit(1);
  return created[0];
}

export async function listOnlineRequests(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  const { onlineRequests } = await import("../drizzle/schema");
  return db.select().from(onlineRequests).orderBy(desc(onlineRequests.createdAt)).limit(limit);
}

export async function markOnlineRequestRead(id: number) {
  const db = await getDb();
  if (!db) return;
  const { onlineRequests } = await import("../drizzle/schema");
  await db.update(onlineRequests)
    .set({ readAt: new Date() })
    .where(eq(onlineRequests.id, id));
}

export async function countUnreadOnlineRequests() {
  const db = await getDb();
  if (!db) return 0;
  const { onlineRequests } = await import("../drizzle/schema");
  const rows = await db.select({ id: onlineRequests.id })
    .from(onlineRequests)
    .where(sql`${onlineRequests.readAt} IS NULL`);
  return rows.length;
}

export async function getOnlineRequestById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const { onlineRequests } = await import("../drizzle/schema");
  const rows = await db.select().from(onlineRequests).where(eq(onlineRequests.id, id)).limit(1);
  return rows[0] ?? null;
}
