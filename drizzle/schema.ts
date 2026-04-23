import {
  bigint,
  boolean,
  date,
  decimal,
  double,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  tinyint,
  uniqueIndex,
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
  /** Link to the portal customer record (optional — set when portal message is bridged) */
  portalCustomerId: int("portalCustomerId"),
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
  /** App S3 URL — downloaded from Twilio and re-uploaded so it plays inline without Twilio auth */
  recordingAppUrl: text("recordingAppUrl"),
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

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOMER PORTAL TABLES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── PORTAL: CUSTOMERS ───────────────────────────────────────────────────────
// One row per customer who has portal access. Created when HP sends first estimate.
export const portalCustomers = mysqlTable("portalCustomers", {
  id: int("id").autoincrement().primaryKey(),
  /** Matches the HP CRM customerId (from EstimatorContext) */
  hpCustomerId: varchar("hpCustomerId", { length: 64 }).unique(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  phone: varchar("phone", { length: 32 }),
  address: text("address"),
  /** Stripe customer ID for saved payment methods */
  stripeCustomerId: varchar("stripeCustomerId", { length: 64 }),
  /** Unique referral code, e.g. "MARCIN-HP" */
  referralCode: varchar("referralCode", { length: 32 }).unique(),
  /** hpCustomerId of who referred this customer */
  referredBy: varchar("referredBy", { length: 64 }),
  /** Set when customer completes the welcome onboarding flow */
  onboardingCompletedAt: timestamp("onboardingCompletedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PortalCustomer = typeof portalCustomers.$inferSelect;
export type InsertPortalCustomer = typeof portalCustomers.$inferInsert;

// ─── PORTAL: MAGIC LINK TOKENS ───────────────────────────────────────────────
// Short-lived tokens emailed to customers for passwordless login.
export const portalTokens = mysqlTable("portalTokens", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  /** Cryptographically random token (64 hex chars) */
  token: varchar("token", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PortalToken = typeof portalTokens.$inferSelect;
export type InsertPortalToken = typeof portalTokens.$inferInsert;

// ─── PORTAL: SESSIONS ────────────────────────────────────────────────────────
// Session tokens set as cookies after magic link verification.
export const portalSessions = mysqlTable("portalSessions", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  /** Cryptographically random session token (64 hex chars) */
  sessionToken: varchar("sessionToken", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PortalSession = typeof portalSessions.$inferSelect;
export type InsertPortalSession = typeof portalSessions.$inferInsert;

// ─── PORTAL: ESTIMATES ────────────────────────────────────────────────────────────────
// Customer-facing estimates sent from the HP estimator.
export const portalEstimates = mysqlTable(
  "portalEstimates",
  {
    id: int("id").autoincrement().primaryKey(),
    customerId: int("customerId").notNull(),
    /** e.g. "HP-2026-042" */
    estimateNumber: varchar("estimateNumber", { length: 64 }).notNull(),
    /** Pro-side opportunity ID (from local state) — used to mark won on approval */
    hpOpportunityId: varchar("hpOpportunityId", { length: 64 }),
    title: varchar("title", { length: 255 }).notNull(),
    /** pending | sent | viewed | approved | declined | expired */
    status: varchar("status", { length: 32 }).default("sent").notNull(),
    totalAmount: int("totalAmount").notNull().default(0), // cents
    depositAmount: int("depositAmount").notNull().default(0), // cents
    depositPercent: int("depositPercent").notNull().default(50),
    /** JSON array of line items */
    lineItemsJson: text("lineItemsJson"),
    /** Full scope of work text */
    scopeOfWork: text("scopeOfWork"),
    /** Expiry date for the estimate */
    expiresAt: timestamp("expiresAt"),
    sentAt: timestamp("sentAt").defaultNow().notNull(),
    viewedAt: timestamp("viewedAt"),
    approvedAt: timestamp("approvedAt"),
    /** Tax snapshot at time of sending */
    taxEnabled: tinyint("taxEnabled").default(0).notNull(),
    taxRateCode: varchar("taxRateCode", { length: 32 }).default('0603').notNull(),
    customTaxPct: int("customTaxPct").default(890).notNull(), // stored as basis points (890 = 8.90%)
    taxAmount: int("taxAmount").default(0).notNull(), // cents
    /** Base64 PNG of customer signature */
    signatureDataUrl: text("signatureDataUrl"),
    signerName: varchar("signerName", { length: 255 }),
    declinedAt: timestamp("declinedAt"),
    declineReason: text("declineReason"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    uniqCustomerEstimate: uniqueIndex("portalEstimates_customer_estimate_uidx").on(
      t.customerId,
      t.estimateNumber,
    ),
  })
);

export type PortalEstimate = typeof portalEstimates.$inferSelect;
export type InsertPortalEstimate = typeof portalEstimates.$inferInsert;

// ─── PORTAL: INVOICES ────────────────────────────────────────────────────────
// Customer-facing invoices sent from the HP estimator.
export const portalInvoices = mysqlTable("portalInvoices", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  /** References portal_estimates.id if this invoice came from an estimate */
  estimateId: int("estimateId"),
  /** e.g. "INV-2026-001" */
  invoiceNumber: varchar("invoiceNumber", { length: 64 }).notNull(),
  /** deposit | final | balance */
  type: varchar("type", { length: 32 }).default("final").notNull(),
  /** draft | sent | due | paid | void | partial */
  status: varchar("status", { length: 32 }).default("sent").notNull(),
  amountDue: int("amountDue").notNull().default(0), // cents
  amountPaid: int("amountPaid").notNull().default(0), // cents
  tipAmount: int("tipAmount").notNull().default(0), // cents
  dueDate: timestamp("dueDate"),
  /** Stripe PaymentIntent ID for tracking */
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 64 }),
  /** Stripe Checkout Session ID for hosted checkout */
  stripeCheckoutSessionId: varchar("stripeCheckoutSessionId", { length: 128 }),
  paidAt: timestamp("paidAt"),
  /** JSON array of line items */
  lineItemsJson: text("lineItemsJson"),
  /** Job title / description */
  jobTitle: varchar("jobTitle", { length: 255 }),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  viewedAt: timestamp("viewedAt"),
  /** Last time an overdue reminder email was sent for this invoice */
  lastReminderSentAt: timestamp("lastReminderSentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PortalInvoice = typeof portalInvoices.$inferSelect;
export type InsertPortalInvoice = typeof portalInvoices.$inferInsert;

// ─── PORTAL: APPOINTMENTS ────────────────────────────────────────────────────
// Scheduled appointments visible to the customer.
export const portalAppointments = mysqlTable("portalAppointments", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  /** estimate | job | follow_up | consultation */
  type: varchar("type", { length: 64 }).default("job").notNull(),
  scheduledAt: timestamp("scheduledAt").notNull(),
  scheduledEndAt: timestamp("scheduledEndAt"),
  address: text("address"),
  techName: varchar("techName", { length: 255 }),
  /** scheduled | completed | cancelled | rescheduled */
  status: varchar("status", { length: 32 }).default("scheduled").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PortalAppointment = typeof portalAppointments.$inferSelect;
export type InsertPortalAppointment = typeof portalAppointments.$inferInsert;

// ─── PORTAL: MESSAGES ────────────────────────────────────────────────────────
// In-portal messaging between customer and HP team.
export const portalMessages = mysqlTable("portalMessages", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  /** customer | hp_team */
  senderRole: mysqlEnum("senderRole", ["customer", "hp_team"]).notNull(),
  senderName: varchar("senderName", { length: 255 }),
  body: text("body").notNull(),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PortalMessage = typeof portalMessages.$inferSelect;
export type InsertPortalMessage = typeof portalMessages.$inferInsert;

// ─── PORTAL: GALLERY ─────────────────────────────────────────────────────────
// Project photos shared with the customer.
export const portalGallery = mysqlTable("portalGallery", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  /** Optional job reference */
  jobId: varchar("jobId", { length: 64 }),
  jobTitle: varchar("jobTitle", { length: 255 }),
  imageUrl: text("imageUrl").notNull(),
  caption: varchar("caption", { length: 512 }),
  /** before | during | after */
  phase: varchar("phase", { length: 32 }).default("after").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PortalGalleryItem = typeof portalGallery.$inferSelect;
export type InsertPortalGalleryItem = typeof portalGallery.$inferInsert;

// ─── PORTAL: REFERRALS ───────────────────────────────────────────────────────
// Referral program tracking.
export const portalReferrals = mysqlTable("portalReferrals", {
  id: int("id").autoincrement().primaryKey(),
  /** customerId of the referrer */
  referrerId: int("referrerId").notNull(),
  /** Email of the referred person */
  referredEmail: varchar("referredEmail", { length: 320 }).notNull(),
  /** customerId once they sign up */
  referredCustomerId: int("referredCustomerId"),
  /** pending | signed_up | job_completed | rewarded */
  status: varchar("status", { length: 32 }).default("pending").notNull(),
  /** Reward amount in cents */
  rewardAmount: int("rewardAmount").default(0).notNull(),
  rewardedAt: timestamp("rewardedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PortalReferral = typeof portalReferrals.$inferSelect;
export type InsertPortalReferral = typeof portalReferrals.$inferInsert;

// ─── Reporting Snapshot Tables ────────────────────────────────────────────────
// These tables receive periodic snapshots of local-state data for reporting.
// They are NOT the source of truth — EstimatorContext is. They exist solely
// to power the Reporting page with DB-backed queries.

export const snapshotOpportunities = mysqlTable("snapshotOpportunities", {
  /** Matches Opportunity.id from local state */
  id: varchar("id", { length: 64 }).primaryKey(),
  area: varchar("area", { length: 16 }).notNull(), // lead | estimate | job
  stage: varchar("stage", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  value: int("value").default(0).notNull(), // cents
  archived: boolean("archived").default(false).notNull(),
  /** ISO string — when the estimate/job was won */
  wonAt: varchar("wonAt", { length: 32 }),
  /** ISO string — when the estimate was sent to the customer */
  sentAt: varchar("sentAt", { length: 32 }),
  /** HP customer ID from local state */
  customerId: varchar("customerId", { length: 64 }),
  customerName: varchar("customerName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const snapshotInvoices = mysqlTable("snapshotInvoices", {
  /** Matches Invoice.id from local state */
  id: varchar("id", { length: 64 }).primaryKey(),
  opportunityId: varchar("opportunityId", { length: 64 }),
  customerId: varchar("customerId", { length: 64 }),
  customerName: varchar("customerName", { length: 255 }),
  status: varchar("status", { length: 32 }).notNull(), // draft | unpaid | partial | paid | void
  /** Total amount in cents */
  total: int("total").default(0).notNull(),
  /** Amount paid in cents */
  amountPaid: int("amountPaid").default(0).notNull(),
  /** Due date ISO string */
  dueDate: varchar("dueDate", { length: 32 }),
  /** Issued date ISO string */
  issuedAt: varchar("issuedAt", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SnapshotOpportunity = typeof snapshotOpportunities.$inferSelect;
export type SnapshotInvoice = typeof snapshotInvoices.$inferSelect;

// ─── ADMIN ALLOWLIST ─────────────────────────────────────────────────────────
// Emails allowed to access the admin app (pro.handypioneers.com).
// If the table is empty, all authenticated users are allowed (open mode).
export const adminAllowlist = mysqlTable("adminAllowlist", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  addedBy: varchar("addedBy", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AdminAllowlistEntry = typeof adminAllowlist.$inferSelect;
export type InsertAdminAllowlistEntry = typeof adminAllowlist.$inferInsert;


// ─── SERVICE ZIP CODES ────────────────────────────────────────────────────────
// Zip codes where Handy Pioneers operates. Managed in Settings → Service Area.
// If the table is empty, all zip codes are accepted (open mode).
export const serviceZipCodes = mysqlTable("serviceZipCodes", {
  id: int("id").autoincrement().primaryKey(),
  zip: varchar("zip", { length: 10 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ServiceZipCode = typeof serviceZipCodes.$inferSelect;
export type InsertServiceZipCode = typeof serviceZipCodes.$inferInsert;

// ─── ONLINE REQUESTS ──────────────────────────────────────────────────────────
// Submitted via the public booking wizard at /book.
// On submit, a customer record and a lead are created automatically.
export const onlineRequests = mysqlTable("onlineRequests", {
  id: int("id").autoincrement().primaryKey(),
  /** Zip code entered at step 1 */
  zip: varchar("zip", { length: 10 }).notNull(),
  /** Always "general" for now */
  serviceType: varchar("serviceType", { length: 64 }).notNull().default("general"),
  /** Free-text description of the work needed */
  description: text("description"),
  /** ASAP | within_week | flexible */
  timeline: varchar("timeline", { length: 32 }),
  /** JSON array of S3 URLs for uploaded photos */
  photoUrls: text("photoUrls"),
  /** Contact info */
  firstName: varchar("firstName", { length: 128 }).notNull(),
  lastName: varchar("lastName", { length: 128 }).notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  /** Service address */
  street: varchar("street", { length: 255 }).notNull(),
  unit: varchar("unit", { length: 64 }),
  city: varchar("city", { length: 128 }).notNull(),
  state: varchar("state", { length: 64 }).notNull(),
  /** SMS marketing consent */
  smsConsent: boolean("smsConsent").default(false).notNull(),
  /** Linked customer ID (set after submit) */
  customerId: varchar("customerId", { length: 64 }),
  /** Linked lead ID (set after submit) */
  leadId: varchar("leadId", { length: 64 }),
  /** Set when an admin opens/views this request — used for unread badge */
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type OnlineRequest = typeof onlineRequests.$inferSelect;
export type InsertOnlineRequest = typeof onlineRequests.$inferInsert;

// ─── CUSTOMERS ────────────────────────────────────────────────────────────────
// Core CRM customer record. Mirrors the Client-side Customer interface.
export const customers = mysqlTable("customers", {
  id: varchar("id", { length: 64 }).primaryKey(), // nanoid
  firstName: varchar("firstName", { length: 128 }).notNull().default(""),
  lastName: varchar("lastName", { length: 128 }).notNull().default(""),
  displayName: varchar("displayName", { length: 255 }).notNull().default(""),
  company: varchar("company", { length: 255 }).notNull().default(""),
  mobilePhone: varchar("mobilePhone", { length: 32 }).notNull().default(""),
  homePhone: varchar("homePhone", { length: 32 }).notNull().default(""),
  workPhone: varchar("workPhone", { length: 32 }).notNull().default(""),
  email: varchar("email", { length: 320 }).notNull().default(""),
  role: varchar("role", { length: 128 }).notNull().default(""),
  customerType: varchar("customerType", { length: 32 }).notNull().default("homeowner"),
  doNotService: boolean("doNotService").default(false).notNull(),
  // Primary address (flat fields for quick access)
  street: varchar("street", { length: 255 }).notNull().default(""),
  unit: varchar("unit", { length: 64 }).notNull().default(""),
  city: varchar("city", { length: 128 }).notNull().default(""),
  state: varchar("state", { length: 64 }).notNull().default(""),
  zip: varchar("zip", { length: 10 }).notNull().default(""),
  addressNotes: text("addressNotes"),
  // Notes & preferences
  customerNotes: text("customerNotes"),
  billsTo: varchar("billsTo", { length: 255 }).notNull().default(""),
  tags: text("tags"), // JSON array of strings
  leadSource: varchar("leadSource", { length: 64 }).notNull().default(""),
  referredBy: varchar("referredBy", { length: 255 }).notNull().default(""),
  sendNotifications: boolean("sendNotifications").default(true).notNull(),
  sendMarketingOptIn: boolean("sendMarketingOptIn").default(false).notNull(),
  defaultTaxCode: varchar("defaultTaxCode", { length: 16 }),
  additionalPhones: text("additionalPhones"), // JSON: [{label, number}]
  additionalEmails: text("additionalEmails"), // JSON: [{label, address}]
  // Financials (computed/cached)
  lifetimeValue: int("lifetimeValue").default(0).notNull(),
  outstandingBalance: int("outstandingBalance").default(0).notNull(),
  // Source tracking
  /** If created from an online request, link to it */
  onlineRequestId: int("onlineRequestId"),
  /** If this customer was merged into another, store the surviving customer id (soft-delete) */
  mergedIntoId: varchar("mergedIntoId", { length: 64 }),
  // QuickBooks sync
  qbCustomerId: varchar("qbCustomerId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DbCustomer = typeof customers.$inferSelect;
export type InsertDbCustomer = typeof customers.$inferInsert;

// ─── PROPERTIES ─────────────────────────────────────────────────────────────
// First-class property records. Each customer can have one or many properties.
// The primary property mirrors the customer's flat street/city/state/zip fields.
// membershipId links to an active threeSixtyMembership for this property.
export const properties = mysqlTable("properties", {
  id: varchar("id", { length: 64 }).primaryKey(), // nanoid
  customerId: varchar("customerId", { length: 64 }).notNull(),
  label: varchar("label", { length: 64 }).notNull().default("Home"),
  street: varchar("street", { length: 255 }).notNull().default(""),
  unit: varchar("unit", { length: 64 }).notNull().default(""),
  city: varchar("city", { length: 128 }).notNull().default(""),
  state: varchar("state", { length: 64 }).notNull().default(""),
  zip: varchar("zip", { length: 10 }).notNull().default(""),
  isPrimary: boolean("isPrimary").default(false).notNull(),
  isBilling: boolean("isBilling").default(false).notNull(),
  propertyNotes: text("propertyNotes"),
  addressNotes: text("addressNotes"),
  lat: text("lat"),
  lng: text("lng"),
  /** FK to threeSixtyMemberships — null means no active membership */
  membershipId: int("membershipId"),
  /** Source of this record: manual | auto-migrated (from flat address fields) */
  source: varchar("source", { length: 32 }).default("manual"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DbProperty = typeof properties.$inferSelect;
export type InsertDbProperty = typeof properties.$inferInsert;

// ─── CUSTOMER ADDRESSES ───────────────────────────────────────────────────────
// Additional service addresses for a customer (beyond the primary flat fields).
export const customerAddresses = mysqlTable("customerAddresses", {
  id: varchar("id", { length: 64 }).primaryKey(),
  customerId: varchar("customerId", { length: 64 }).notNull(),
  label: varchar("label", { length: 64 }).notNull().default("Home"),
  street: varchar("street", { length: 255 }).notNull().default(""),
  unit: varchar("unit", { length: 64 }).notNull().default(""),
  city: varchar("city", { length: 128 }).notNull().default(""),
  state: varchar("state", { length: 64 }).notNull().default(""),
  zip: varchar("zip", { length: 10 }).notNull().default(""),
  isPrimary: boolean("isPrimary").default(false).notNull(),
  lat: text("lat"),
  lng: text("lng"),
  /** Optional notes for this specific property/unit (access instructions, gate codes, etc.) */
  propertyNotes: text("propertyNotes"),
  isBilling: boolean("isBilling").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type DbCustomerAddress = typeof customerAddresses.$inferSelect;
export type InsertDbCustomerAddress = typeof customerAddresses.$inferInsert;

// ─── OPPORTUNITIES ────────────────────────────────────────────────────────────
// Leads, estimates, and jobs — unified pipeline record.
export const opportunities = mysqlTable("opportunities", {
  id: varchar("id", { length: 64 }).primaryKey(),
  customerId: varchar("customerId", { length: 64 }).notNull(),
  area: varchar("area", { length: 16 }).notNull().default("lead"), // lead | estimate | job
  stage: varchar("stage", { length: 64 }).notNull().default("New Lead"),
  title: varchar("title", { length: 255 }).notNull().default(""),
  value: int("value").default(0).notNull(), // cents
  jobNumber: varchar("jobNumber", { length: 64 }),
  notes: text("notes"),
  archived: boolean("archived").default(false).notNull(),
  archivedAt: varchar("archivedAt", { length: 32 }),
  /** Reason for archive: 'manual' | 'auto_lost_30d' — used by auto-archive job to find its own rows */
  archivedReason: varchar("archivedReason", { length: 32 }),
  // Lifecycle timestamps
  sourceLeadId: varchar("sourceLeadId", { length: 64 }),
  sourceEstimateId: varchar("sourceEstimateId", { length: 64 }),
  convertedToEstimateAt: varchar("convertedToEstimateAt", { length: 32 }),
  convertedToJobAt: varchar("convertedToJobAt", { length: 32 }),
  sentAt: varchar("sentAt", { length: 32 }),
  wonAt: varchar("wonAt", { length: 32 }),
  /** Set when the customer approves via the client portal (distinct from in-app approval) */
  portalApprovedAt: varchar("portalApprovedAt", { length: 32 }),
  // Schedule
  scheduledDate: varchar("scheduledDate", { length: 32 }),
  scheduledEndDate: varchar("scheduledEndDate", { length: 32 }),
  scheduledDuration: int("scheduledDuration"),
  assignedTo: text("assignedTo"),
  scheduleNotes: text("scheduleNotes"),
  // Large JSON blobs stored as text
  estimateSnapshot: text("estimateSnapshot"), // JSON EstimateSnapshot
  tasks: text("tasks"),                       // JSON JobTask[]
  attachments: text("attachments"),           // JSON JobAttachment[]
  jobActivity: text("jobActivity"),           // JSON ActivityEvent[]
  clientSnapshot: text("clientSnapshot"),     // JSON clientSnapshot
  // Signed documents (S3 URLs preferred over base64)
  signedEstimateUrl: text("signedEstimateUrl"),
  signedEstimateFilename: varchar("signedEstimateFilename", { length: 255 }),
  completionSignatureUrl: text("completionSignatureUrl"),
  completionSignedBy: varchar("completionSignedBy", { length: 255 }),
  completionSignedAt: varchar("completionSignedAt", { length: 32 }),
  sowDocument: text("sowDocument"),
  sowGeneratedAt: varchar("sowGeneratedAt", { length: 32 }),
  // Source tracking
  /** If created from an online request */
  onlineRequestId: int("onlineRequestId"),
  /** Property this opportunity is linked to (null = not yet linked) */
  propertyId: varchar("propertyId", { length: 64 }),
  /** How propertyId was set: 'manual' | 'auto-migrated' | null */
  propertyIdSource: varchar("propertyIdSource", { length: 32 }),
  /** FK to threeSixtyMemberships.id — set when job is created from a 360° work order */
  membershipId: int("membershipId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DbOpportunity = typeof opportunities.$inferSelect;
export type InsertDbOpportunity = typeof opportunities.$inferInsert;

// ─── PORTAL: SERVICE REQUESTS ─────────────────────────────────────────────────
// Customer-initiated booking requests from the portal.
// On submit, a lead is created on the pro side.
export const portalServiceRequests = mysqlTable("portalServiceRequests", {
  id: int("id").autoincrement().primaryKey(),
  /** Portal customer who submitted the request */
  customerId: int("customerId").notNull(),
  /** Free-text description of work needed */
  description: text("description").notNull(),
  /** ASAP | within_week | flexible */
  timeline: varchar("timeline", { length: 32 }).notNull().default("flexible"),
  /** Service address (defaults to customer address) */
  address: text("address"),
  /** pending | reviewed | converted */
  status: varchar("status", { length: 32 }).notNull().default("pending"),
  /** HP lead ID created from this request */
  leadId: varchar("leadId", { length: 64 }),
  /** service_request | off_cycle_visit */
  requestType: varchar("requestType", { length: 32 }).notNull().default("service_request"),
  /** Preferred date range for off-cycle visits */
  preferredDateRange: varchar("preferredDateRange", { length: 64 }),
  /** JSON array of S3 photo URLs attached to the request */
  photoUrls: text("photoUrls"),
  /** Set when HP staff views/reads this request */
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PortalServiceRequest = typeof portalServiceRequests.$inferSelect;
export type InsertPortalServiceRequest = typeof portalServiceRequests.$inferInsert;

// ─── PORTAL: JOB MILESTONES ───────────────────────────────────────────────────
// HP team manages milestones per job; customers see them in the portal.
export const portalJobMilestones = mysqlTable("portalJobMilestones", {
  id: int("id").autoincrement().primaryKey(),
  /** Pro-side opportunity ID (area='job') */
  hpOpportunityId: varchar("hpOpportunityId", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  /** pending | in_progress | complete */
  status: mysqlEnum("status", ["pending", "in_progress", "complete"]).default("pending").notNull(),
  /** ISO date string for when this milestone is expected */
  scheduledDate: varchar("scheduledDate", { length: 32 }),
  completedAt: timestamp("completedAt"),
  /** Controls display order */
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PortalJobMilestone = typeof portalJobMilestones.$inferSelect;
export type InsertPortalJobMilestone = typeof portalJobMilestones.$inferInsert;

// ─── PORTAL: JOB UPDATES ─────────────────────────────────────────────────────
// Progress notes/photos posted by the HP team, visible to the customer in portal.
export const portalJobUpdates = mysqlTable("portalJobUpdates", {
  id: int("id").autoincrement().primaryKey(),
  /** Pro-side opportunity ID (area='job') */
  hpOpportunityId: varchar("hpOpportunityId", { length: 64 }).notNull(),
  /** Short progress note */
  message: text("message").notNull(),
  /** Optional S3 URL for a progress photo */
  photoUrl: text("photoUrl"),
  /** HP team member who posted this */
  postedBy: varchar("postedBy", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PortalJobUpdate = typeof portalJobUpdates.$inferSelect;
export type InsertPortalJobUpdate = typeof portalJobUpdates.$inferInsert;

// ─── PORTAL: JOB SIGN-OFFS ───────────────────────────────────────────────────
// Customer e-signature confirming job completion, collected via the portal.
export const portalJobSignOffs = mysqlTable("portalJobSignOffs", {
  id: int("id").autoincrement().primaryKey(),
  /** Pro-side opportunity ID (area='job') — unique: one sign-off per job */
  hpOpportunityId: varchar("hpOpportunityId", { length: 64 }).notNull().unique(),
  /** Portal customer who signed */
  customerId: int("customerId").notNull(),
  /** Base64 PNG data URL of the drawn/adopted signature */
  signatureDataUrl: text("signatureDataUrl").notNull(),
  /** Name typed/adopted by the signer */
  signerName: varchar("signerName", { length: 255 }).notNull(),
  /** ISO timestamp of signing */
  signedAt: varchar("signedAt", { length: 32 }).notNull(),
  /** Optional notes / work summary from the customer at sign-off */
  workSummary: text("workSummary"),
  /** Portal invoice ID of the final/balance invoice linked to this job */
  finalInvoiceId: int("finalInvoiceId"),
  /** Timestamp when the first review request email was sent */
  reviewRequestSentAt: timestamp("reviewRequestSentAt"),
  /** Timestamp when the 48h reminder review request email was sent */
  reviewReminderSentAt: timestamp("reviewReminderSentAt"),
  /** Pro can set this to true to suppress review request emails for this job */
  skipReviewRequest: boolean("skipReviewRequest").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PortalJobSignOff = typeof portalJobSignOffs.$inferSelect;
export type InsertPortalJobSignOff = typeof portalJobSignOffs.$inferInsert;

// ─── PORTAL: CHANGE ORDERS ───────────────────────────────────────────────
// Change orders sent from the HP estimator to the customer portal for approval.
export const portalChangeOrders = mysqlTable("portalChangeOrders", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  /** Pro-side opportunity ID (area='job') this CO belongs to */
  hpOpportunityId: varchar("hpOpportunityId", { length: 64 }).notNull(),
  /** e.g. "CO-HP-2026-042-01" */
  coNumber: varchar("coNumber", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  /** Full scope of work text for this change order */
  scopeOfWork: text("scopeOfWork"),
  /** JSON array of line items */
  lineItemsJson: text("lineItemsJson"),
  /** Total amount in cents */
  totalAmount: int("totalAmount").notNull().default(0),
  /** pending | sent | viewed | approved | declined | void */
  status: varchar("status", { length: 32 }).default("sent").notNull(),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  viewedAt: timestamp("viewedAt"),
  approvedAt: timestamp("approvedAt"),
  /** S3 URL of the customer signature PNG */
  signatureDataUrl: text("signatureDataUrl"),
  signerName: varchar("signerName", { length: 255 }),
  declinedAt: timestamp("declinedAt"),
  declineReason: text("declineReason"),
  /** Portal invoice ID linked to this CO (auto-created on approval) */
  invoiceId: int("invoiceId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PortalChangeOrder = typeof portalChangeOrders.$inferSelect;
export type InsertPortalChangeOrder = typeof portalChangeOrders.$inferInsert;

// ─── PORTAL: DOCUMENTS ───────────────────────────────────────────────────────
// Files shared by the pro team with a portal customer.
export const portalDocuments = mysqlTable("portalDocuments", {
  id: int("id").autoincrement().primaryKey(),
  /** portalCustomers.id */
  portalCustomerId: int("portalCustomerId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  /** Public S3 URL */
  url: text("url").notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }).default("application/octet-stream").notNull(),
  /** Optional pro-side job reference */
  jobId: varchar("jobId", { length: 64 }),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
});
export type PortalDocument = typeof portalDocuments.$inferSelect;
export type InsertPortalDocument = typeof portalDocuments.$inferInsert;

// ─── 360 METHOD: MEMBERSHIPS ─────────────────────────────────────────────────
export const threeSixtyMemberships = mysqlTable("threeSixtyMemberships", {
  id: int("id").autoincrement().primaryKey(),
  /** customers.id (varchar nanoid) */
  customerId: varchar("customerId", { length: 64 }).notNull(),
  /** customerAddresses.id — the enrolled property */
  propertyAddressId: int("propertyAddressId"),
  tier: mysqlEnum("tier", ["bronze", "silver", "gold"]).notNull().default("bronze"),
  status: mysqlEnum("status", ["active", "paused", "cancelled"]).notNull().default("active"),
  /** Unix ms */
  startDate: bigint("startDate", { mode: "number" }).notNull(),
  /** Unix ms — next renewal date */
  renewalDate: bigint("renewalDate", { mode: "number" }).notNull(),
  /** Labor bank balance in cents */
  laborBankBalance: int("laborBankBalance").notNull().default(0),
  /** Stripe subscription ID for recurring billing */
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
  /** Stripe customer ID — mirrors portalCustomers.stripeCustomerId */
  stripeCustomerId: varchar("stripeCustomerId", { length: 64 }),
  /** Billing cadence selected at enrollment */
  billingCadence: mysqlEnum("billingCadence", ["monthly", "quarterly", "annual"]).notNull().default("annual"),
  /** Whether the annual 360 scan has been completed this cycle */
  annualScanCompleted: boolean("annualScanCompleted").notNull().default(false),
  /** Unix ms — date of last completed annual scan */
  annualScanDate: bigint("annualScanDate", { mode: "number" }),
  notes: text("notes"),
  /** 'single' for homeowner plan, 'portfolio' for landlord multi-property plan */
  planType: mysqlEnum("planType", ["single", "portfolio"]).notNull().default("single"),
  /** JSON array of portfolio properties — only populated when planType='portfolio' */
  portfolioProperties: text("portfolioProperties"),
  /** Total number of interior add-on doors enrolled */
  interiorAddonDoors: int("interiorAddonDoors").notNull().default(0),
  /** Stripe subscription quantity (portfolio unit multiplier) */
  stripeQuantity: int("stripeQuantity").notNull().default(1),
  /** Unix ms — when the deferred labor bank credit should be released (monthly full_coverage/max only) */
  scheduledCreditAt: bigint("scheduledCreditAt", { mode: "number" }),
  /** Cents — amount of the deferred credit to release at scheduledCreditAt */
  scheduledCreditCents: int("scheduledCreditCents").notNull().default(0),
  /** HP CRM customer ID (nanoid string) — links to customers table */
  hpCustomerId: varchar("hpCustomerId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ThreeSixtyMembership = typeof threeSixtyMemberships.$inferSelect;
export type InsertThreeSixtyMembership = typeof threeSixtyMemberships.$inferInsert;

// ─── 360 METHOD: SEASONAL VISITS ─────────────────────────────────────────────
export const threeSixtyVisits = mysqlTable("threeSixtyVisits", {
  id: int("id").autoincrement().primaryKey(),
  membershipId: int("membershipId").notNull(),
  customerId: varchar("customerId", { length: 64 }).notNull(),
  season: mysqlEnum("season", ["spring", "summer", "fall", "winter"]).notNull(),
  /** Unix ms */
  scheduledDate: bigint("scheduledDate", { mode: "number" }),
  /** Unix ms */
  completedDate: bigint("completedDate", { mode: "number" }),
  status: mysqlEnum("status", ["scheduled", "completed", "skipped"]).notNull().default("scheduled"),
  technicianNotes: text("technicianNotes"),
  /** JSON snapshot of checklist completion state: { taskId: boolean } */
  checklistSnapshot: text("checklistSnapshot"),
  /** Labor bank deducted in cents for this visit */
  laborBankUsed: int("laborBankUsed").notNull().default(0),
  /** If visit generated an upsell estimate */
  linkedOpportunityId: varchar("linkedOpportunityId", { length: 64 }),
  /** Year this visit belongs to (for grouping) */
  visitYear: int("visitYear").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ThreeSixtyVisit = typeof threeSixtyVisits.$inferSelect;
export type InsertThreeSixtyVisit = typeof threeSixtyVisits.$inferInsert;

// ─── 360 METHOD: MASTER CHECKLIST LIBRARY ────────────────────────────────────
export const threeSixtyChecklist = mysqlTable("threeSixtyChecklist", {
  id: int("id").autoincrement().primaryKey(),
  season: mysqlEnum("season", ["spring", "summer", "fall", "winter"]).notNull(),
  /** inspect | service */
  category: mysqlEnum("category", ["inspect", "service"]).notNull(),
  /** e.g. "PNW" — for future regional expansion */
  region: varchar("region", { length: 32 }).notNull().default("PNW"),
  taskName: varchar("taskName", { length: 255 }).notNull(),
  description: text("description"),
  /** Estimated minutes to complete */
  estimatedMinutes: int("estimatedMinutes").notNull().default(15),
  /** Whether flagging this item should prompt an upsell estimate */
  isUpsellTrigger: boolean("isUpsellTrigger").notNull().default(false),
  sortOrder: int("sortOrder").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // ── 360 Inspection additions ──────────────────────────────────────────────
  /** Which home system this item belongs to (for cascade risk scoring) */
  systemType: varchar("systemType", { length: 64 }),
  /** Base cascade risk score 1-10 for this item type */
  cascadeRiskBase: int("cascadeRiskBase").default(3),
  /** Default estimated repair cost low (USD) */
  defaultCostLow: decimal("defaultCostLow", { precision: 10, scale: 2 }),
  /** Default estimated repair cost high (USD) */
  defaultCostHigh: decimal("defaultCostHigh", { precision: 10, scale: 2 }),
});
export type ThreeSixtyChecklistItem = typeof threeSixtyChecklist.$inferSelect;
export type InsertThreeSixtyChecklistItem = typeof threeSixtyChecklist.$inferInsert;

// ─── 360 METHOD: LABOR BANK LEDGER ───────────────────────────────────────────
export const threeSixtyLaborBankTransactions = mysqlTable("threeSixtyLaborBankTransactions", {
  id: int("id").autoincrement().primaryKey(),
  membershipId: int("membershipId").notNull(),
  /** credit | debit | adjustment */
  type: mysqlEnum("type", ["credit", "debit", "adjustment"]).notNull(),
  /** Amount in cents — always positive; type determines direction */
  amountCents: int("amountCents").notNull(),
  description: varchar("description", { length: 512 }).notNull(),
  linkedVisitId: int("linkedVisitId"),
  linkedOpportunityId: varchar("linkedOpportunityId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** User ID of the staff member who created this transaction */
  createdBy: int("createdBy"),
});
export type ThreeSixtyLaborBankTransaction = typeof threeSixtyLaborBankTransactions.$inferSelect;
export type InsertThreeSixtyLaborBankTransaction = typeof threeSixtyLaborBankTransactions.$inferInsert;

// ─── 360 METHOD: ANNUAL HOME SCANS ───────────────────────────────────────────
export const threeSixtyScans = mysqlTable("threeSixtyScans", {
  id: int("id").autoincrement().primaryKey(),
  membershipId: int("membershipId").notNull(),
  customerId: varchar("customerId", { length: 64 }).notNull(),
  /** Unix ms */
  scanDate: bigint("scanDate", { mode: "number" }).notNull(),
  /** JSON: { system: string, rating: 1-5, notes: string, photos: string[], priority: 'urgent'|'1yr'|'3yr'|'monitor' }[] */
  systemRatings: text("systemRatings"),
  /** S3 URL of generated PDF report */
  reportUrl: text("reportUrl"),
  reportFileKey: varchar("reportFileKey", { length: 512 }),
  technicianNotes: text("technicianNotes"),
  status: mysqlEnum("status", ["draft", "completed", "delivered"]).notNull().default("draft"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  // ── 360 Inspection additions ──────────────────────────────────────────────
  /** Computed property health score 0-100 */
  healthScore: int("healthScore"),
  /** JSON array of structured inspection findings */
  inspectionItemsJson: text("inspectionItemsJson"),
  /** JSON array of prioritized repair recommendations */
  recommendationsJson: text("recommendationsJson"),
  /** Editable executive summary narrative */
  summary: text("summary"),
  /** Unix ms — when report was sent to client portal */
  sentToPortalAt: bigint("sentToPortalAt", { mode: "number" }),
  /** S3 URL of generated PDF report (replaces reportUrl for new scans) */
  pdfUrl: text("pdfUrl"),
  pdfFileKey: varchar("pdfFileKey", { length: 512 }),
  /** visitId that produced this scan's findings (for visit-linked scans) */
  linkedVisitId: int("linkedVisitId"),
});
export type ThreeSixtyScan = typeof threeSixtyScans.$inferSelect;
export type InsertThreeSixtyScan = typeof threeSixtyScans.$inferInsert;

// ─── 360 METHOD: PROPERTY SYSTEM BASELINES ───────────────────────────────────
export const threeSixtyPropertySystems = mysqlTable("threeSixtyPropertySystems", {
  id: int("id").autoincrement().primaryKey(),
  membershipId: int("membershipId").notNull(),
  customerId: varchar("customerId", { length: 64 }).notNull(),
  /** hvac | roof | plumbing | electrical | foundation | exterior_siding | interior | appliances */
  systemType: mysqlEnum("systemType", [
    "hvac",
    "roof",
    "plumbing",
    "electrical",
    "foundation",
    "exterior_siding",
    "interior",
    "appliances",
  ]).notNull(),
  brandModel: varchar("brandModel", { length: 255 }),
  installYear: int("installYear"),
  /** good | fair | poor | critical */
  condition: mysqlEnum("condition", ["good", "fair", "poor", "critical"]).notNull().default("good"),
  conditionNotes: text("conditionNotes"),
  lastServiceDate: date("lastServiceDate"),
  nextServiceDate: date("nextServiceDate"),
  estimatedLifespanYears: int("estimatedLifespanYears"),
  replacementCostEstimate: decimal("replacementCostEstimate", { precision: 10, scale: 2 }),
  /** JSON array of S3 photo URLs */
  photoUrls: text("photoUrls"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ThreeSixtyPropertySystem = typeof threeSixtyPropertySystems.$inferSelect;
export type InsertThreeSixtyPropertySystem = typeof threeSixtyPropertySystems.$inferInsert;

// ─── PORTAL REPORTS ──────────────────────────────────────────────────────────
export const portalReports = mysqlTable("portalReports", {
  id: int("id").autoincrement().primaryKey(),
  portalCustomerId: int("portalCustomerId").notNull(),
  scanId: int("scanId").notNull(),
  membershipId: int("membershipId").notNull(),
  hpCustomerId: int("hpCustomerId").notNull(),
  healthScore: int("healthScore"),
  /** Full report JSON snapshot at time of delivery */
  reportJson: text("reportJson").notNull(),
  pdfUrl: text("pdfUrl"),
  /** Unix ms */
  sentAt: bigint("sentAt", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PortalReport = typeof portalReports.$inferSelect;
export type InsertPortalReport = typeof portalReports.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// PRO-SIDE INVOICES  (source of truth — replaces localStorage))
// ═══════════════════════════════════════════════════════════════════════════════

// ─── INVOICES ────────────────────────────────────────────────────────────────
export const invoices = mysqlTable("invoices", {
  id: varchar("id", { length: 64 }).primaryKey(),
  /** 'deposit' | 'final' */
  type: varchar("type", { length: 16 }).notNull().default("deposit"),
  /** draft | sent | due | paid | void | partial | pending_signoff */
  status: varchar("status", { length: 32 }).notNull().default("draft"),
  /** e.g. INV-2026-001 */
  invoiceNumber: varchar("invoiceNumber", { length: 64 }).notNull(),
  customerId: varchar("customerId", { length: 64 }).notNull(),
  opportunityId: varchar("opportunityId", { length: 64 }).notNull(),
  sourceEstimateId: varchar("sourceEstimateId", { length: 64 }),
  // Amounts — stored as integers (cents) for precision
  subtotal: int("subtotal").notNull().default(0),
  taxRate: int("taxRate").notNull().default(0),    // basis points e.g. 890 = 8.90%
  taxAmount: int("taxAmount").notNull().default(0),
  total: int("total").notNull().default(0),
  depositPercent: int("depositPercent"),
  amountPaid: int("amountPaid").notNull().default(0),
  balance: int("balance").notNull().default(0),
  // Dates (ISO strings)
  issuedAt: varchar("issuedAt", { length: 32 }).notNull(),
  dueDate: varchar("dueDate", { length: 32 }).notNull(),
  paidAt: varchar("paidAt", { length: 32 }),
  serviceDate: varchar("serviceDate", { length: 32 }),
  // Content
  notes: text("notes"),
  internalNotes: text("internalNotes"),
  paymentTerms: varchar("paymentTerms", { length: 128 }),
  taxLabel: varchar("taxLabel", { length: 64 }),
  // Stripe / PayPal
  stripePaymentIntentId: varchar("stripePaymentIntentId", { length: 128 }),
  stripeClientSecret: text("stripeClientSecret"),
  paypalOrderId: varchar("paypalOrderId", { length: 128 }),
  // Job completion sign-off
  completionSignatureUrl: text("completionSignatureUrl"),
  completionSignedBy: varchar("completionSignedBy", { length: 255 }),
  completionSignedAt: varchar("completionSignedAt", { length: 32 }),
  // QuickBooks sync
  qbEntityId: varchar("qbEntityId", { length: 64 }),
  qbSyncedAt: varchar("qbSyncedAt", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DbInvoice = typeof invoices.$inferSelect;
export type InsertDbInvoice = typeof invoices.$inferInsert;

// ─── INVOICE LINE ITEMS ───────────────────────────────────────────────────────
export const invoiceLineItems = mysqlTable("invoiceLineItems", {
  id: varchar("id", { length: 64 }).primaryKey(),
  invoiceId: varchar("invoiceId", { length: 64 }).notNull(),
  description: text("description").notNull(),
  qty: double("qty").notNull().default(1),
  unitPrice: int("unitPrice").notNull().default(0), // cents
  total: int("total").notNull().default(0),         // cents
  notes: text("notes"),
  sortOrder: int("sortOrder").notNull().default(0),
});
export type DbInvoiceLineItem = typeof invoiceLineItems.$inferSelect;
export type InsertDbInvoiceLineItem = typeof invoiceLineItems.$inferInsert;

// ─── INVOICE PAYMENTS ────────────────────────────────────────────────────────
export const invoicePayments = mysqlTable("invoicePayments", {
  id: varchar("id", { length: 64 }).primaryKey(),
  invoiceId: varchar("invoiceId", { length: 64 }).notNull(),
  /** stripe | paypal | cash | check | zelle | venmo | other */
  method: varchar("method", { length: 32 }).notNull(),
  /** cents */
  amount: int("amount").notNull(),
  paidAt: varchar("paidAt", { length: 32 }).notNull(),
  /** Stripe PaymentIntent ID, PayPal order ID, or manual note */
  reference: varchar("reference", { length: 255 }).notNull().default(""),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type DbInvoicePayment = typeof invoicePayments.$inferSelect;
export type InsertDbInvoicePayment = typeof invoicePayments.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// PRO-SIDE SCHEDULE EVENTS  (source of truth — replaces localStorage)
// ═══════════════════════════════════════════════════════════════════════════════

export const scheduleEvents = mysqlTable("scheduleEvents", {
  id: varchar("id", { length: 64 }).primaryKey(),
  /** estimate | job | recurring | task | follow_up | three_sixty */
  type: varchar("type", { length: 32 }).notNull().default("task"),
  title: varchar("title", { length: 255 }).notNull(),
  /** ISO datetime */
  start: varchar("start", { length: 32 }).notNull(),
  /** ISO datetime */
  end: varchar("end", { length: 32 }).notNull(),
  allDay: boolean("allDay").default(false).notNull(),
  // Links
  opportunityId: varchar("opportunityId", { length: 64 }),
  customerId: varchar("customerId", { length: 64 }),
  // People — JSON string[]
  assignedTo: text("assignedTo"),
  // Content
  notes: text("notes"),
  color: varchar("color", { length: 16 }),
  // Recurrence — JSON RecurrenceRule
  recurrence: text("recurrence"),
  parentEventId: varchar("parentEventId", { length: 64 }),
  // Status
  completed: boolean("completed").default(false).notNull(),
  completedAt: varchar("completedAt", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DbScheduleEvent = typeof scheduleEvents.$inferSelect;
export type InsertDbScheduleEvent = typeof scheduleEvents.$inferInsert;

// ─── EXPENSES ─────────────────────────────────────────────────────────────────
// Job-level and general business expenses for P&L tracking.
export const expenses = mysqlTable("expenses", {
  id: varchar("id", { length: 64 }).primaryKey(),
  /** Owner user ID */
  userId: int("userId").notNull(),
  /** Link to job/estimate opportunity (optional) */
  opportunityId: varchar("opportunityId", { length: 64 }),
  /** Link to customer (optional) */
  customerId: varchar("customerId", { length: 64 }),
  vendor: varchar("vendor", { length: 255 }),
  /** Amount in cents */
  amount: int("amount").notNull().default(0),
  /** materials | labor | subcontractor | equipment | fuel | permits | other */
  category: varchar("category", { length: 32 }).notNull().default("other"),
  description: text("description"),
  /** S3 URL for receipt photo/PDF */
  receiptUrl: text("receiptUrl"),
  /** ISO date string YYYY-MM-DD */
  date: varchar("date", { length: 16 }).notNull(),
  // QuickBooks sync
  qbEntityId: varchar("qbEntityId", { length: 64 }),
  qbSyncedAt: varchar("qbSyncedAt", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DbExpense = typeof expenses.$inferSelect;
export type InsertDbExpense = typeof expenses.$inferInsert;

// ─── QUICKBOOKS TOKENS ────────────────────────────────────────────────────────
// Stores OAuth 2.0 tokens for QuickBooks Online per user.
export const qbTokens = mysqlTable("qbTokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  accessToken: text("accessToken").notNull(),
  refreshToken: text("refreshToken").notNull(),
  /** QuickBooks company/realm ID */
  realmId: varchar("realmId", { length: 64 }).notNull(),
  /** ISO datetime when access token expires */
  expiresAt: varchar("expiresAt", { length: 32 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DbQbToken = typeof qbTokens.$inferSelect;
export type InsertDbQbToken = typeof qbTokens.$inferInsert;

// ─── 360° WORK ORDERS ─────────────────────────────────────────────────────────
// Central record for every 360° service event (baseline scan + seasonal visits).
// Created automatically on enrollment and after baseline completion.
export const threeSixtyWorkOrders = mysqlTable("threeSixtyWorkOrders", {
  id: int("id").autoincrement().primaryKey(),
  membershipId: int("membershipId").notNull(),
  /** CRM customer ID (nanoid string) */
  customerId: varchar("customerId", { length: 64 }).notNull(),
  /** baseline_scan | spring | summer | fall | winter */
  type: varchar("type", { length: 32 }).notNull(),
  /** open | scheduled | in_progress | completed | skipped */
  status: varchar("status", { length: 32 }).notNull().default("open"),
  /** Year this work order belongs to (e.g. 2026) */
  visitYear: int("visitYear").notNull(),
  /** Unix ms of scheduled appointment */
  scheduledDate: bigint("scheduledDate", { mode: "number" }),
  /** Unix ms of completion */
  completedDate: bigint("completedDate", { mode: "number" }),
  /** JSON string[] of technician names/IDs */
  assignedTo: text("assignedTo"),
  technicianNotes: text("technicianNotes"),
  /** JSON array of structured inspection items with photos */
  inspectionItemsJson: text("inspectionItemsJson"),
  /** Labor bank draw in cents */
  laborBankUsed: int("laborBankUsed").notNull().default(0),
  /** FK to portalReports.id once report is sent */
  portalReportId: int("portalReportId"),
  /** FK to scheduleEvents.id */
  scheduleEventId: varchar("scheduleEventId", { length: 64 }),
  /** FK to threeSixtyVisits.id (legacy link) */
  visitId: int("visitId"),
  /** 0-100 home health score set on completion */
  healthScore: int("healthScore"),
  /** Reason for skipping (if status=skipped) */
  skipReason: varchar("skipReason", { length: 255 }),
  /** FK to opportunities.id — set when completion creates or links a job/estimate */
  hpOpportunityId: varchar("hpOpportunityId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DbThreeSixtyWorkOrder = typeof threeSixtyWorkOrders.$inferSelect;
export type InsertDbThreeSixtyWorkOrder = typeof threeSixtyWorkOrders.$inferInsert;

// ─── Phone Settings ───────────────────────────────────────────────────────────
/**
 * Single-row table storing inbound call routing configuration.
 * id is always 1 (singleton pattern — upsert on id=1).
 */
export const phoneSettings = mysqlTable("phoneSettings", {
  id: int("id").primaryKey().default(1),
  /**
   * How to route inbound calls:
   *   forward_to_number — dial forwardingNumber
   *   forward_to_ai     — dial aiServiceNumber
   *   voicemail         — record a voicemail and notify owner
   */
  forwardingMode: mysqlEnum("forwardingMode", [
    "forward_to_number",
    "forward_to_ai",
    "voicemail",
  ])
    .notNull()
    .default("forward_to_number"),
  /** E.164 number to forward calls to (personal cell) */
  forwardingNumber: varchar("forwardingNumber", { length: 20 }).default(""),
  /** E.164 number of the AI answering service */
  aiServiceNumber: varchar("aiServiceNumber", { length: 20 }).default(""),
  /** Optional TTS greeting played before connecting the call (forwarding modes only) */
  greeting: varchar("greeting", { length: 500 }).default(""),
  /** TTS prompt played to callers before they leave a voicemail (voicemail mode + after-hours) */
  voicemailPrompt: varchar("voicemailPrompt", { length: 600 }).default(""),
  /** Whether to record inbound calls */
  callRecording: boolean("callRecording").notNull().default(false),
  /** Voicemail transcription enabled */
  transcribeVoicemail: boolean("transcribeVoicemail").notNull().default(true),
  /** When true, calls outside business hours are routed to voicemail regardless of forwardingMode */
  afterHoursEnabled: boolean("afterHoursEnabled").notNull().default(false),
  /** Business hours start time in HH:MM 24h format (America/Los_Angeles) */
  businessHoursStart: varchar("businessHoursStart", { length: 5 }).default("08:00"),
  /** Business hours end time in HH:MM 24h format (America/Los_Angeles) */
  businessHoursEnd: varchar("businessHoursEnd", { length: 5 }).default("17:00"),
  /** Comma-separated days of week (0=Sun,1=Mon,...,6=Sat) e.g. "1,2,3,4,5" */
  businessDays: varchar("businessDays", { length: 20 }).default("1,2,3,4,5"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DbPhoneSettings = typeof phoneSettings.$inferSelect;
export type InsertDbPhoneSettings = typeof phoneSettings.$inferInsert;

// ─── App Settings (singleton, id=1) ─────────────────────────────────────────
// White-label foundation: every workspace-level config lives here.
export const appSettings = mysqlTable("appSettings", {
  id: int("id").primaryKey().default(1),
  /** Company display name */
  companyName: varchar("companyName", { length: 120 }).default("Handy Pioneers"),
  /** Public logo URL (CDN) */
  logoUrl: varchar("logoUrl", { length: 500 }).default(""),
  /** Brand primary color (hex, e.g. #1E3A5F) */
  brandColor: varchar("brandColor", { length: 20 }).default("#1E3A5F"),
  /** IANA timezone string (e.g. America/Los_Angeles) */
  timezone: varchar("timezone", { length: 60 }).default("America/Los_Angeles"),
  /** Prefix for estimate numbers (e.g. EST) */
  estimatePrefix: varchar("estimatePrefix", { length: 10 }).default("EST"),
  /** Prefix for invoice numbers (e.g. INV) */
  invoicePrefix: varchar("invoicePrefix", { length: 10 }).default("INV"),
  /** Prefix for job numbers (e.g. JOB) */
  jobPrefix: varchar("jobPrefix", { length: 10 }).default("JOB"),
  /** Customer-facing portal base URL */
  portalUrl: varchar("portalUrl", { length: 300 }).default("https://client.handypioneers.com"),
  /** Company website URL */
  websiteUrl: varchar("websiteUrl", { length: 300 }).default("https://handypioneers.com"),
  /** Support / contact email shown to customers */
  supportEmail: varchar("supportEmail", { length: 320 }).default(""),
  /** Support phone shown to customers */
  supportPhone: varchar("supportPhone", { length: 30 }).default(""),
  /** Physical address line 1 */
  addressLine1: varchar("addressLine1", { length: 200 }).default(""),
  /** City, State ZIP */
  addressLine2: varchar("addressLine2", { length: 200 }).default(""),
  /** Default tax rate (basis points, e.g. 875 = 8.75%) */
  defaultTaxBps: int("defaultTaxBps").default(875),
  /** Default deposit percentage (0–100) */
  defaultDepositPct: int("defaultDepositPct").default(50),
  /** Footer text shown on estimates and invoices */
  documentFooter: text("documentFooter"),
  /** Terms & conditions text shown on estimates */
  termsText: text("termsText"),
  /** Google Business review link (used in review-request automations) */
  googleReviewLink: varchar("googleReviewLink", { length: 500 }).default(""),
  /** Internal labor rate in cents per hour (e.g. 15000 = $150/hr) */
  internalLaborRateCents: int("internalLaborRateCents").default(15000),
  /** Default markup percentage applied to material costs (0–200) */
  defaultMarkupPct: int("defaultMarkupPct").default(20),
  /** SMS sender name shown to customers (max 11 chars for alphanumeric sender) */
  smsFromName: varchar("smsFromName", { length: 30 }).default("HandyPioneers"),
  // ── Transactional email templates (editable from Settings → Company) ──────
  /** Subject for the estimate approval confirmation email */
  emailEstimateApprovedSubject: varchar("emailEstimateApprovedSubject", { length: 300 }).default("Your estimate has been approved — Handy Pioneers"),
  /** Body for the estimate approval confirmation email (HTML allowed) */
  emailEstimateApprovedBody: text("emailEstimateApprovedBody"),
  /** Subject for the job sign-off confirmation email */
  emailJobSignOffSubject: varchar("emailJobSignOffSubject", { length: 300 }).default("Job complete — your final invoice is ready"),
  /** Body for the job sign-off confirmation email (HTML allowed) */
  emailJobSignOffBody: text("emailJobSignOffBody"),
  /** Subject for the change order approval confirmation email */
  emailChangeOrderApprovedSubject: varchar("emailChangeOrderApprovedSubject", { length: 300 }).default("Change order approved — Handy Pioneers"),
  /** Body for the change order approval confirmation email (HTML allowed) */
  emailChangeOrderApprovedBody: text("emailChangeOrderApprovedBody"),
  /** Subject for the magic link login email */
  emailMagicLinkSubject: varchar("emailMagicLinkSubject", { length: 300 }).default("Your Handy Pioneers Customer Portal Login"),
  /** Body for the magic link login email (HTML allowed) */
  emailMagicLinkBody: text("emailMagicLinkBody"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DbAppSettings = typeof appSettings.$inferSelect;

// ─── Notification Preferences ────────────────────────────────────────────────
// One row per event type + channel combination. Checked before any notification fires.
export const notificationPreferences = mysqlTable("notificationPreferences", {
  id: int("id").autoincrement().primaryKey(),
  /** Stable event key, e.g. 'new_lead', 'estimate_sent', 'invoice_paid' */
  eventKey: varchar("eventKey", { length: 60 }).notNull(),
  /** Channel: email | sms | in_app */
  channel: mysqlEnum("channel", ["email", "sms", "in_app"]).notNull(),
  /** Whether this channel is enabled for this event */
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DbNotificationPreference = typeof notificationPreferences.$inferSelect;

// ─── Automation Rules ─────────────────────────────────────────────────────────
// User-created if-this-then-that rules. Evaluated by the automation engine.
export const automationRules = mysqlTable("automationRules", {
  id: int("id").autoincrement().primaryKey(),
  /** Human-readable rule name */
  name: varchar("name", { length: 120 }).notNull(),
  /** Trigger event key, e.g. 'lead_created', 'estimate_sent', 'missed_call' */
  trigger: varchar("trigger", { length: 60 }).notNull(),
  /**
   * Optional condition as JSON array of {field, operator, value} objects.
   * Example: [{"field":"leadSource","operator":"eq","value":"Google Ads"}]
   */
  conditions: text("conditions"),
  /** Action type: send_sms | send_email | notify_owner | create_note */
  actionType: mysqlEnum("actionType", [
    "send_sms",
    "send_email",
    "notify_owner",
    "create_note",
  ]).notNull(),
  /**
   * Action payload as JSON. Shape depends on actionType:
   *   send_sms:      { messageTemplate: string }
   *   send_email:    { subject: string, bodyTemplate: string }
   *   notify_owner:  { title: string, contentTemplate: string }
   *   create_note:   { noteTemplate: string }
   */
  actionPayload: text("actionPayload").notNull(),
  /** Minutes to wait before executing the action (0 = immediate) */
  delayMinutes: int("delayMinutes").notNull().default(0),
  /** Whether this rule is active */
  enabled: boolean("enabled").notNull().default(true),
  /** Display order */
  sortOrder: int("sortOrder").notNull().default(0),
  /** Lifecycle stage for grouping: lead | estimate | job | invoice | review */
  stage: varchar("stage", { length: 30 }).notNull().default("lead"),
  /** Category grouping for UI tabs: lead_intake | estimate_follow_up | review_request | etc. */
  category: varchar("category", { length: 40 }).notNull().default("lead_intake"),
  /** Optional FK to emailTemplates.id — if set, overrides inline bodyTemplate */
  emailTemplateId: int("emailTemplateId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DbAutomationRule = typeof automationRules.$inferSelect;

// ─── Automation Rule Logs ─────────────────────────────────────────────────────
// Execution history for each rule run. Used for debugging and audit.
export const automationRuleLogs = mysqlTable("automationRuleLogs", {
  id: int("id").autoincrement().primaryKey(),
  ruleId: int("ruleId").notNull(),
  /** Trigger event key */
  trigger: varchar("trigger", { length: 60 }).notNull(),
  /** JSON snapshot of the trigger payload */
  triggerPayload: text("triggerPayload"),
  /** Execution result */
  status: mysqlEnum("status", ["success", "failed", "skipped"]).notNull(),
  /** Error message if status = failed */
  errorMessage: text("errorMessage"),
  executedAt: timestamp("executedAt").defaultNow().notNull(),
});
export type DbAutomationRuleLog = typeof automationRuleLogs.$inferSelect;

// ─── STAFF USERS (self-hosted auth) ──────────────────────────────────────────
// Replaces Manus OAuth. Staff log in with email + bcrypt password.
export const staffUsers = mysqlTable("staffUsers", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: text("passwordHash").notNull(),
  name: varchar("name", { length: 255 }),
  role: mysqlEnum("role", ["admin", "staff"]).default("staff").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type StaffUser = typeof staffUsers.$inferSelect;
export type InsertStaffUser = typeof staffUsers.$inferInsert;

// ─── EMAIL TEMPLATES ──────────────────────────────────────────────────────────
// First-class template records, looked up by (tenantId, key) for deterministic
// send paths (magic_link, estimate_sent, …).  `mergeTagSchema` is a JSON blob
// describing available {{vars}} for the editor UI.
export const emailTemplates = mysqlTable("emailTemplates", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().default(1),
  key: varchar("key", { length: 80 }).notNull(),
  name: varchar("name", { length: 160 }).notNull().default(""),
  subject: varchar("subject", { length: 300 }).notNull().default(""),
  preheader: varchar("preheader", { length: 300 }).default(""),
  html: text("html").notNull(),
  text: text("text"),
  /** JSON array of {tag, description} describing available merge vars */
  mergeTagSchema: text("mergeTagSchema"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DbEmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertDbEmailTemplate = typeof emailTemplates.$inferInsert;

// ─── CAMPAIGNS ────────────────────────────────────────────────────────────────
// Marketing blasts — one-shot sends to a static recipient list with per-send
// open/click/bounce tracking.
export const campaigns = mysqlTable("campaigns", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  channel: mysqlEnum("channel", ["email", "sms"]).notNull().default("email"),
  emailTemplateId: int("emailTemplateId"),
  subjectOverride: varchar("subjectOverride", { length: 300 }),
  smsBody: text("smsBody"),
  status: mysqlEnum("status", [
    "draft",
    "scheduled",
    "sending",
    "sent",
    "cancelled",
  ])
    .notNull()
    .default("draft"),
  scheduledAt: timestamp("scheduledAt"),
  sentAt: timestamp("sentAt"),
  createdBy: varchar("createdBy", { length: 64 }),
  recipientCount: int("recipientCount").notNull().default(0),
  sentCount: int("sentCount").notNull().default(0),
  openCount: int("openCount").notNull().default(0),
  clickCount: int("clickCount").notNull().default(0),
  bounceCount: int("bounceCount").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DbCampaign = typeof campaigns.$inferSelect;
export type InsertDbCampaign = typeof campaigns.$inferInsert;

export const campaignRecipients = mysqlTable("campaignRecipients", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  customerId: varchar("customerId", { length: 64 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 32 }),
  /** JSON object of per-recipient merge var overrides */
  mergeVars: text("mergeVars"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type DbCampaignRecipient = typeof campaignRecipients.$inferSelect;
export type InsertDbCampaignRecipient = typeof campaignRecipients.$inferInsert;

export const campaignSends = mysqlTable("campaignSends", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  recipientId: int("recipientId").notNull(),
  status: mysqlEnum("status", [
    "pending",
    "sent",
    "delivered",
    "bounced",
    "failed",
    "opened",
    "clicked",
  ])
    .notNull()
    .default("pending"),
  providerMessageId: varchar("providerMessageId", { length: 120 }),
  openedAt: timestamp("openedAt"),
  clickedAt: timestamp("clickedAt"),
  bounceReason: varchar("bounceReason", { length: 300 }),
  errorMessage: text("errorMessage"),
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type DbCampaignSend = typeof campaignSends.$inferSelect;
export type InsertDbCampaignSend = typeof campaignSends.$inferInsert;
