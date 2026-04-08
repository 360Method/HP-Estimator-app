import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  callLogs,
  conversations,
  gmailTokens,
  InsertCallLog,
  InsertConversation,
  InsertMessage,
  InsertUser,
  messages,
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
