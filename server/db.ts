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

export async function listConversations(limit = 50, offset = 0, customerOnly = true) {
  const db = await getDb();
  if (!db) return [];
  const q = db.select().from(conversations);
  if (customerOnly) {
    return q
      .where(sql`${conversations.customerId} IS NOT NULL`)
      .orderBy(desc(conversations.lastMessageAt))
      .limit(limit)
      .offset(offset);
  }
  return q.orderBy(desc(conversations.lastMessageAt)).limit(limit).offset(offset);
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

// ─── CUSTOMER DEDUPLICATION & MERGE HELPERS ───────────────────────────────────

export interface DuplicateGroup {
  reason: 'email' | 'phone' | 'name_zip';
  customers: DbCustomer[];
}

/**
 * Detect likely duplicate customers.
 * Groups by: same non-empty email, same non-empty mobilePhone, or same lastName+zip.
 * Excludes already-merged records (mergedIntoId IS NOT NULL).
 */
export async function detectDuplicates(): Promise<DuplicateGroup[]> {
  const db = await getDb();
  if (!db) return [];

  const all = await db.select().from(customers)
    .where(sql`${customers.mergedIntoId} IS NULL`)
    .orderBy(asc(customers.lastName));

  const groups: DuplicateGroup[] = [];

  // Group by email
  const byEmail = new Map<string, DbCustomer[]>();
  for (const c of all) {
    const key = c.email?.toLowerCase().trim();
    if (!key) continue;
    if (!byEmail.has(key)) byEmail.set(key, []);
    byEmail.get(key)!.push(c);
  }
  for (const [, group] of byEmail) {
    if (group.length > 1) groups.push({ reason: 'email', customers: group });
  }

  // Group by mobilePhone
  const byPhone = new Map<string, DbCustomer[]>();
  for (const c of all) {
    const key = c.mobilePhone?.replace(/\D/g, '');
    if (!key || key.length < 7) continue;
    if (!byPhone.has(key)) byPhone.set(key, []);
    byPhone.get(key)!.push(c);
  }
  for (const [, group] of byPhone) {
    if (group.length > 1) {
      // Avoid double-reporting if already captured by email
      const ids = new Set(group.map(c => c.id));
      const alreadyReported = groups.some(g => g.customers.some(c => ids.has(c.id)));
      if (!alreadyReported) groups.push({ reason: 'phone', customers: group });
    }
  }

  // Group by lastName + zip
  const byNameZip = new Map<string, DbCustomer[]>();
  for (const c of all) {
    const lastName = c.lastName?.toLowerCase().trim();
    const zip = c.zip?.trim();
    if (!lastName || !zip) continue;
    const key = `${lastName}|${zip}`;
    if (!byNameZip.has(key)) byNameZip.set(key, []);
    byNameZip.get(key)!.push(c);
  }
  for (const [, group] of byNameZip) {
    if (group.length > 1) {
      const ids = new Set(group.map(c => c.id));
      const alreadyReported = groups.some(g => g.customers.some(c => ids.has(c.id)));
      if (!alreadyReported) groups.push({ reason: 'name_zip', customers: group });
    }
  }

  return groups;
}

/**
 * Merge sourceId into targetId:
 * 1. Re-parent all opportunities, customerAddresses, conversations from source → target.
 * 2. Merge tags from source into target (union).
 * 3. Set source.mergedIntoId = targetId (soft-delete).
 */
export async function mergeCustomers(sourceId: string, targetId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Re-parent opportunities
  await db.update(opportunities)
    .set({ customerId: targetId })
    .where(eq(opportunities.customerId, sourceId));

  // Re-parent customer addresses
  await db.update(customerAddresses)
    .set({ customerId: targetId })
    .where(eq(customerAddresses.customerId, sourceId));

  // Re-parent conversations
  await db.update(conversations)
    .set({ customerId: targetId })
    .where(eq(conversations.customerId, sourceId));

  // Merge tags
  const [src, tgt] = await Promise.all([
    getCustomerById(sourceId),
    getCustomerById(targetId),
  ]);
  if (src && tgt) {
    const srcTags: string[] = src.tags ? JSON.parse(src.tags as unknown as string) : [];
    const tgtTags: string[] = tgt.tags ? JSON.parse(tgt.tags as unknown as string) : [];
    const merged = Array.from(new Set([...tgtTags, ...srcTags]));
    await db.update(customers)
      .set({ tags: JSON.stringify(merged) })
      .where(eq(customers.id, targetId));
  }

  // Soft-delete source
  await db.update(customers)
    .set({ mergedIntoId: targetId })
    .where(eq(customers.id, sourceId));
}

/**
 * Add a tag to multiple customers (union — does not remove existing tags).
 */
export async function bulkAddTag(customerIds: string[], tag: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const rows = await db.select({ id: customers.id, tags: customers.tags })
    .from(customers)
    .where(sql`${customers.id} IN ${customerIds}`);
  for (const row of rows) {
    const existing: string[] = row.tags ? JSON.parse(row.tags as unknown as string) : [];
    if (!existing.includes(tag)) {
      existing.push(tag);
      await db.update(customers)
        .set({ tags: JSON.stringify(existing) })
        .where(eq(customers.id, row.id));
    }
  }
}

/**
 * Update a customer address (all fields optional).
 */
export async function updateCustomerAddress(
  id: string,
  data: Partial<Omit<DbCustomerAddress, 'id' | 'customerId' | 'createdAt'>>,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(customerAddresses).set(data).where(eq(customerAddresses.id, id));
}

/**
 * List customers with optional filters for the advanced filter bar.
 */
export async function listCustomersFiltered(opts: {
  search?: string;
  customerType?: string;
  leadSource?: string;
  tags?: string[];
  city?: string;
  zip?: string;
  sortBy?: 'lastName' | 'city' | 'createdAt' | 'lifetimeValue';
  sortDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}): Promise<DbCustomer[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions: ReturnType<typeof eq>[] = [
    sql`${customers.mergedIntoId} IS NULL` as any,
  ];

  if (opts.search) {
    const s = `%${opts.search}%`;
    conditions.push(
      or(
        like(customers.firstName, s),
        like(customers.lastName, s),
        like(customers.email, s),
        like(customers.mobilePhone, s),
        like(customers.company, s),
        like(customers.displayName, s),
      ) as any
    );
  }
  if (opts.customerType) {
    conditions.push(eq(customers.customerType, opts.customerType) as any);
  }
  if (opts.leadSource) {
    conditions.push(eq(customers.leadSource, opts.leadSource) as any);
  }
  if (opts.city) {
    conditions.push(like(customers.city, `%${opts.city}%`) as any);
  }
  if (opts.zip) {
    conditions.push(like(customers.zip, `%${opts.zip}%`) as any);
  }

  let q = db.select().from(customers).where(and(...conditions));

  const sortField = {
    lastName: customers.lastName,
    city: customers.city,
    createdAt: customers.createdAt,
    lifetimeValue: customers.lifetimeValue,
  }[opts.sortBy ?? 'lastName'] ?? customers.lastName;

  const sortFn = opts.sortDir === 'desc' ? desc : asc;
  const result = await (q as any).orderBy(sortFn(sortField))
    .limit(opts.limit ?? 300)
    .offset(opts.offset ?? 0);

  // Client-side tag filter (tags stored as JSON string)
  if (opts.tags && opts.tags.length > 0) {
    return result.filter((c: DbCustomer) => {
      const cTags: string[] = c.tags ? JSON.parse(c.tags as unknown as string) : [];
      return opts.tags!.every(t => cTags.includes(t));
    });
  }

  return result;
}
