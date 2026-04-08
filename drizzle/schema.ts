import {
  bigint,
  boolean,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── INBOX: CONVERSATIONS ─────────────────────────────────────────────────────
// One row per contact. Aggregates all channels into a single thread.
export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  /** Link to the HP customer record (optional — may be unknown contact) */
  customerId: varchar("customerId", { length: 64 }),
  contactName: varchar("contactName", { length: 255 }),
  contactPhone: varchar("contactPhone", { length: 32 }),
  contactEmail: varchar("contactEmail", { length: 320 }),
  /** Comma-separated active channels: sms,email,call,note */
  channels: varchar("channels", { length: 64 }).default("note").notNull(),
  lastMessageAt: timestamp("lastMessageAt").defaultNow().notNull(),
  lastMessagePreview: varchar("lastMessagePreview", { length: 255 }),
  unreadCount: int("unreadCount").default(0).notNull(),
  /** Twilio conversation SID if using Twilio Conversations API */
  twilioConversationSid: varchar("twilioConversationSid", { length: 64 }),
  /** Gmail thread ID for email threading */
  gmailThreadId: varchar("gmailThreadId", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

// ─── INBOX: MESSAGES ─────────────────────────────────────────────────────────
// Every message in a conversation thread, regardless of channel.
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  /** Channel this message was sent/received on */
  channel: mysqlEnum("channel", ["sms", "email", "call", "note"]).notNull(),
  /** inbound = from contact, outbound = from HP team */
  direction: mysqlEnum("direction", ["inbound", "outbound"]).notNull(),
  body: text("body"),
  subject: varchar("subject", { length: 512 }),
  /** sent / delivered / failed / read */
  status: varchar("status", { length: 32 }).default("sent").notNull(),
  /** Twilio message SID for SMS */
  twilioSid: varchar("twilioSid", { length: 64 }),
  /** Gmail message ID for email */
  gmailMessageId: varchar("gmailMessageId", { length: 128 }),
  /** S3 URL for any attached file */
  attachmentUrl: text("attachmentUrl"),
  attachmentMime: varchar("attachmentMime", { length: 128 }),
  /** Internal notes are not visible to the customer */
  isInternal: boolean("isInternal").default(false).notNull(),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  readAt: timestamp("readAt"),
  /** HP user who sent this (null for inbound) */
  sentByUserId: int("sentByUserId"),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

// ─── INBOX: CALL LOGS ────────────────────────────────────────────────────────
// Extended metadata for call-type messages.
export const callLogs = mysqlTable("callLogs", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  /** References the messages row of channel='call' */
  messageId: int("messageId"),
  twilioCallSid: varchar("twilioCallSid", { length: 64 }),
  direction: mysqlEnum("direction", ["inbound", "outbound"]).notNull(),
  /** answered / missed / voicemail / busy / no-answer */
  status: varchar("status", { length: 32 }).default("answered").notNull(),
  /** Duration in seconds */
  durationSecs: int("durationSecs").default(0).notNull(),
  recordingUrl: text("recordingUrl"),
  voicemailUrl: text("voicemailUrl"),
  callerPhone: varchar("callerPhone", { length: 32 }),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  endedAt: timestamp("endedAt"),
});

export type CallLog = typeof callLogs.$inferSelect;
export type InsertCallLog = typeof callLogs.$inferInsert;

// ─── INBOX: GMAIL OAUTH TOKENS ───────────────────────────────────────────────
// Stores the Gmail OAuth refresh token for the connected workspace account.
export const gmailTokens = mysqlTable("gmailTokens", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  expiresAt: bigint("expiresAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GmailToken = typeof gmailTokens.$inferSelect;
