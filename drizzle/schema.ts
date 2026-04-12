import {
  bigint,
  boolean,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
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
  paidAt: timestamp("paidAt"),
  /** JSON array of line items */
  lineItemsJson: text("lineItemsJson"),
  /** Job title / description */
  jobTitle: varchar("jobTitle", { length: 255 }),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
  viewedAt: timestamp("viewedAt"),
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
  // Financials (computed/cached)
  lifetimeValue: int("lifetimeValue").default(0).notNull(),
  outstandingBalance: int("outstandingBalance").default(0).notNull(),
  // Source tracking
  /** If created from an online request, link to it */
  onlineRequestId: int("onlineRequestId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DbCustomer = typeof customers.$inferSelect;
export type InsertDbCustomer = typeof customers.$inferInsert;

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
  // Lifecycle timestamps
  sourceLeadId: varchar("sourceLeadId", { length: 64 }),
  sourceEstimateId: varchar("sourceEstimateId", { length: 64 }),
  convertedToEstimateAt: varchar("convertedToEstimateAt", { length: 32 }),
  convertedToJobAt: varchar("convertedToJobAt", { length: 32 }),
  sentAt: varchar("sentAt", { length: 32 }),
  wonAt: varchar("wonAt", { length: 32 }),
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
  /** Set when HP staff views/reads this request */
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PortalServiceRequest = typeof portalServiceRequests.$inferSelect;
export type InsertPortalServiceRequest = typeof portalServiceRequests.$inferInsert;
