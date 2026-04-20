import {
  bigint,
  boolean,
  date,
  decimal,
  doublePrecision,
  integer,
  pgEnum,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

// ─── pgEnum declarations ────────────────────────────────────────────────────
export const userRoleEnum = pgEnum('user_role', ['user', 'admin']);
export const messageChannelEnum = pgEnum('message_channel', ['sms', 'email', 'call', 'note']);
export const messageDirectionEnum = pgEnum('message_direction', ['inbound', 'outbound']);
export const portalSenderRoleEnum = pgEnum('portal_sender_role', ['customer', 'hp_team']);
export const milestoneStatusEnum = pgEnum('milestone_status', ['pending', 'in_progress', 'complete']);
export const membershipTierEnum = pgEnum('membership_tier', ['bronze', 'silver', 'gold']);
export const membershipStatusEnum = pgEnum('membership_status', ['active', 'paused', 'cancelled']);
export const billingCadenceEnum = pgEnum('billing_cadence', ['monthly', 'quarterly', 'annual']);
export const planTypeEnum = pgEnum('plan_type', ['single', 'portfolio']);
export const seasonEnum = pgEnum('season', ['spring', 'summer', 'fall', 'winter']);
export const visitStatusEnum = pgEnum('visit_status', ['scheduled', 'completed', 'skipped']);
export const checklistCategoryEnum = pgEnum('checklist_category', ['inspect', 'service']);
export const laborBankTxTypeEnum = pgEnum('labor_bank_tx_type', ['credit', 'debit', 'adjustment']);
export const scanStatusEnum = pgEnum('scan_status', ['draft', 'completed', 'delivered']);
export const systemTypeEnum = pgEnum('system_type', ['hvac', 'roof', 'plumbing', 'electrical', 'foundation', 'exterior_siding', 'interior', 'appliances']);
export const systemConditionEnum = pgEnum('system_condition', ['good', 'fair', 'poor', 'critical']);
export const lifeCycleStageEnum = pgEnum('life_cycle_stage', ['prospect', 'active', 'member', 'at_risk', 'churned']);
export const automationTriggerEnum = pgEnum('automation_trigger', ['review_request', 'enrollment_offer', 'estimate_followup_d3', 'estimate_followup_d7', 'winback', 'labor_bank_low']);

/**
 * Core user table backing auth flow.
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── INBOX: CONVERSATIONS ─────────────────────────────────────────────────────
// One row per contact. Aggregates all channels into a single thread.
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  /** Link to the HP customer record (optional — may be unknown contact) */
  customerId: varchar("customerId", { length: 64 }),
  /** Link to the portal customer record (optional — set when portal message is bridged) */
  portalCustomerId: integer("portalCustomerId"),
  contactName: varchar("contactName", { length: 255 }),
  contactPhone: varchar("contactPhone", { length: 32 }),
  contactEmail: varchar("contactEmail", { length: 320 }),
  /** Comma-separated active channels: sms,email,call,note */
  channels: varchar("channels", { length: 64 }).default("note").notNull(),
  lastMessageAt: timestamp("lastMessageAt").defaultNow().notNull(),
  lastMessagePreview: varchar("lastMessagePreview", { length: 255 }),
  unreadCount: integer("unreadCount").default(0).notNull(),
  /** Twilio conversation SID if using Twilio Conversations API */
  twilioConversationSid: varchar("twilioConversationSid", { length: 64 }),
  /** Gmail thread ID for email threading */
  gmailThreadId: varchar("gmailThreadId", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

// ─── INBOX: MESSAGES ─────────────────────────────────────────────────────────
// Every message in a conversation thread, regardless of channel.
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversationId").notNull(),
  /** Channel this message was sent/received on */
  channel: messageChannelEnum("channel").notNull(),
  /** inbound = from contact, outbound = from HP team */
  direction: messageDirectionEnum("direction").notNull(),
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
  sentByUserId: integer("sentByUserId"),
});

export type Message = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

// ─── INBOX: CALL LOGS ────────────────────────────────────────────────────────
// Extended metadata for call-type messages.
export const callLogs = pgTable("callLogs", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversationId").notNull(),
  /** References the messages row of channel='call' */
  messageId: integer("messageId"),
  twilioCallSid: varchar("twilioCallSid", { length: 64 }),
  direction: messageDirectionEnum("direction").notNull(),
  /** answered / missed / voicemail / busy / no-answer */
  status: varchar("status", { length: 32 }).default("answered").notNull(),
  /** Duration in seconds */
  durationSecs: integer("durationSecs").default(0).notNull(),
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
export const gmailTokens = pgTable("gmailTokens", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  expiresAt: bigint("expiresAt", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type GmailToken = typeof gmailTokens.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOMER PORTAL TABLES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── PORTAL: CUSTOMERS ───────────────────────────────────────────────────────
// One row per customer who has portal access. Created when HP sends first estimate.
export const portalCustomers = pgTable("portalCustomers", {
  id: serial("id").primaryKey(),
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type PortalCustomer = typeof portalCustomers.$inferSelect;
export type InsertPortalCustomer = typeof portalCustomers.$inferInsert;

// ─── PORTAL: MAGIC LINK TOKENS ───────────────────────────────────────────────
// Short-lived tokens emailed to customers for passwordless login.
export const portalTokens = pgTable("portalTokens", {
  id: serial("id").primaryKey(),
  customerId: integer("customerId").notNull(),
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
export const portalSessions = pgTable("portalSessions", {
  id: serial("id").primaryKey(),
  customerId: integer("customerId").notNull(),
  /** Cryptographically random session token (64 hex chars) */
  sessionToken: varchar("sessionToken", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PortalSession = typeof portalSessions.$inferSelect;
export type InsertPortalSession = typeof portalSessions.$inferInsert;

// ─── PORTAL: ESTIMATES ────────────────────────────────────────────────────────────────
// Customer-facing estimates sent from the HP estimator.
export const portalEstimates = pgTable(
  "portalEstimates",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customerId").notNull(),
    /** e.g. "HP-2026-042" */
    estimateNumber: varchar("estimateNumber", { length: 64 }).notNull(),
    /** Pro-side opportunity ID (from local state) — used to mark won on approval */
    hpOpportunityId: varchar("hpOpportunityId", { length: 64 }),
    title: varchar("title", { length: 255 }).notNull(),
    /** pending | sent | viewed | approved | declined | expired */
    status: varchar("status", { length: 32 }).default("sent").notNull(),
    totalAmount: integer("totalAmount").notNull().default(0), // cents
    depositAmount: integer("depositAmount").notNull().default(0), // cents
    depositPercent: integer("depositPercent").notNull().default(50),
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
    taxEnabled: smallint("taxEnabled").default(0).notNull(),
    taxRateCode: varchar("taxRateCode", { length: 32 }).default('0603').notNull(),
    customTaxPct: integer("customTaxPct").default(890).notNull(), // stored as basis points (890 = 8.90%)
    taxAmount: integer("taxAmount").default(0).notNull(), // cents
    /** Base64 PNG of customer signature */
    signatureDataUrl: text("signatureDataUrl"),
    signerName: varchar("signerName", { length: 255 }),
    declinedAt: timestamp("declinedAt"),
    declineReason: text("declineReason"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
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
export const portalInvoices = pgTable("portalInvoices", {
  id: serial("id").primaryKey(),
  customerId: integer("customerId").notNull(),
  /** References portal_estimates.id if this invoice came from an estimate */
  estimateId: integer("estimateId"),
  /** e.g. "INV-2026-001" */
  invoiceNumber: varchar("invoiceNumber", { length: 64 }).notNull(),
  /** deposit | final | balance */
  type: varchar("type", { length: 32 }).default("final").notNull(),
  /** draft | sent | due | paid | void | partial */
  status: varchar("status", { length: 32 }).default("sent").notNull(),
  amountDue: integer("amountDue").notNull().default(0), // cents
  amountPaid: integer("amountPaid").notNull().default(0), // cents
  tipAmount: integer("tipAmount").notNull().default(0), // cents
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type PortalInvoice = typeof portalInvoices.$inferSelect;
export type InsertPortalInvoice = typeof portalInvoices.$inferInsert;

// ─── PORTAL: APPOINTMENTS ────────────────────────────────────────────────────
// Scheduled appointments visible to the customer.
export const portalAppointments = pgTable("portalAppointments", {
  id: serial("id").primaryKey(),
  customerId: integer("customerId").notNull(),
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type PortalAppointment = typeof portalAppointments.$inferSelect;
export type InsertPortalAppointment = typeof portalAppointments.$inferInsert;

// ─── PORTAL: MESSAGES ────────────────────────────────────────────────────────
// In-portal messaging between customer and HP team.
export const portalMessages = pgTable("portalMessages", {
  id: serial("id").primaryKey(),
  customerId: integer("customerId").notNull(),
  /** customer | hp_team */
  senderRole: portalSenderRoleEnum("senderRole").notNull(),
  senderName: varchar("senderName", { length: 255 }),
  body: text("body").notNull(),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PortalMessage = typeof portalMessages.$inferSelect;
export type InsertPortalMessage = typeof portalMessages.$inferInsert;

// ─── PORTAL: GALLERY ─────────────────────────────────────────────────────────
// Project photos shared with the customer.
export const portalGallery = pgTable("portalGallery", {
  id: serial("id").primaryKey(),
  customerId: integer("customerId").notNull(),
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
export const portalReferrals = pgTable("portalReferrals", {
  id: serial("id").primaryKey(),
  /** customerId of the referrer */
  referrerId: integer("referrerId").notNull(),
  /** Email of the referred person */
  referredEmail: varchar("referredEmail", { length: 320 }).notNull(),
  /** customerId once they sign up */
  referredCustomerId: integer("referredCustomerId"),
  /** pending | signed_up | job_completed | rewarded */
  status: varchar("status", { length: 32 }).default("pending").notNull(),
  /** Reward amount in cents */
  rewardAmount: integer("rewardAmount").default(0).notNull(),
  rewardedAt: timestamp("rewardedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PortalReferral = typeof portalReferrals.$inferSelect;
export type InsertPortalReferral = typeof portalReferrals.$inferInsert;

// ─── Reporting Snapshot Tables ────────────────────────────────────────────────
// These tables receive periodic snapshots of local-state data for reporting.
// They are NOT the source of truth — EstimatorContext is. They exist solely
// to power the Reporting page with DB-backed queries.

export const snapshotOpportunities = pgTable("snapshotOpportunities", {
  /** Matches Opportunity.id from local state */
  id: varchar("id", { length: 64 }).primaryKey(),
  area: varchar("area", { length: 16 }).notNull(), // lead | estimate | job
  stage: varchar("stage", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  value: integer("value").default(0).notNull(), // cents
  archived: boolean("archived").default(false).notNull(),
  /** ISO string — when the estimate/job was won */
  wonAt: varchar("wonAt", { length: 32 }),
  /** ISO string — when the estimate was sent to the customer */
  sentAt: varchar("sentAt", { length: 32 }),
  /** HP customer ID from local state */
  customerId: varchar("customerId", { length: 64 }),
  customerName: varchar("customerName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const snapshotInvoices = pgTable("snapshotInvoices", {
  /** Matches Invoice.id from local state */
  id: varchar("id", { length: 64 }).primaryKey(),
  opportunityId: varchar("opportunityId", { length: 64 }),
  customerId: varchar("customerId", { length: 64 }),
  customerName: varchar("customerName", { length: 255 }),
  status: varchar("status", { length: 32 }).notNull(), // draft | unpaid | partial | paid | void
  /** Total amount in cents */
  total: integer("total").default(0).notNull(),
  /** Amount paid in cents */
  amountPaid: integer("amountPaid").default(0).notNull(),
  /** Due date ISO string */
  dueDate: varchar("dueDate", { length: 32 }),
  /** Issued date ISO string */
  issuedAt: varchar("issuedAt", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type SnapshotOpportunity = typeof snapshotOpportunities.$inferSelect;
export type SnapshotInvoice = typeof snapshotInvoices.$inferSelect;

// ─── ADMIN ALLOWLIST ─────────────────────────────────────────────────────────
// Emails allowed to access the admin app (pro.handypioneers.com).
// If the table is empty, all authenticated users are allowed (open mode).
export const adminAllowlist = pgTable("adminAllowlist", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  addedBy: varchar("addedBy", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type AdminAllowlistEntry = typeof adminAllowlist.$inferSelect;
export type InsertAdminAllowlistEntry = typeof adminAllowlist.$inferInsert;


// ─── SERVICE ZIP CODES ────────────────────────────────────────────────────────
// Zip codes where Handy Pioneers operates. Managed in Settings → Service Area.
// If the table is empty, all zip codes are accepted (open mode).
export const serviceZipCodes = pgTable("serviceZipCodes", {
  id: serial("id").primaryKey(),
  zip: varchar("zip", { length: 10 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ServiceZipCode = typeof serviceZipCodes.$inferSelect;
export type InsertServiceZipCode = typeof serviceZipCodes.$inferInsert;

// ─── ONLINE REQUESTS ──────────────────────────────────────────────────────────
// Submitted via the public booking wizard at /book.
// On submit, a customer record and a lead are created automatically.
export const onlineRequests = pgTable("onlineRequests", {
  id: serial("id").primaryKey(),
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
export const customers = pgTable("customers", {
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
  lifetimeValue: integer("lifetimeValue").default(0).notNull(),
  outstandingBalance: integer("outstandingBalance").default(0).notNull(),
  // Source tracking
  /** If created from an online request, link to it */
  onlineRequestId: integer("onlineRequestId"),
  /** If this customer was merged into another, store the surviving customer id (soft-delete) */
  mergedIntoId: varchar("mergedIntoId", { length: 64 }),
  // QuickBooks sync
  qbCustomerId: varchar("qbCustomerId", { length: 64 }),
  // ── Lifecycle & retention ──────────────────────────────────────────────────
  lifeCycleStage: lifeCycleStageEnum("lifeCycleStage").default('prospect').notNull(),
  lastJobArchivedAt: timestamp("lastJobArchivedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type DbCustomer = typeof customers.$inferSelect;
export type InsertDbCustomer = typeof customers.$inferInsert;

// ─── PROPERTIES ─────────────────────────────────────────────────────────────
// First-class property records. Each customer can have one or many properties.
// The primary property mirrors the customer's flat street/city/state/zip fields.
// membershipId links to an active threeSixtyMembership for this property.
export const properties = pgTable("properties", {
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
  membershipId: integer("membershipId"),
  /** Source of this record: manual | auto-migrated (from flat address fields) */
  source: varchar("source", { length: 32 }).default("manual"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type DbProperty = typeof properties.$inferSelect;
export type InsertDbProperty = typeof properties.$inferInsert;

// ─── CUSTOMER ADDRESSES ───────────────────────────────────────────────────────
// Additional service addresses for a customer (beyond the primary flat fields).
export const customerAddresses = pgTable("customerAddresses", {
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
export const opportunities = pgTable("opportunities", {
  id: varchar("id", { length: 64 }).primaryKey(),
  customerId: varchar("customerId", { length: 64 }).notNull(),
  area: varchar("area", { length: 16 }).notNull().default("lead"), // lead | estimate | job
  stage: varchar("stage", { length: 64 }).notNull().default("New Lead"),
  title: varchar("title", { length: 255 }).notNull().default(""),
  value: integer("value").default(0).notNull(), // cents
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
  /** Set when the customer approves via the client portal (distinct from in-app approval) */
  portalApprovedAt: varchar("portalApprovedAt", { length: 32 }),
  // Schedule
  scheduledDate: varchar("scheduledDate", { length: 32 }),
  scheduledEndDate: varchar("scheduledEndDate", { length: 32 }),
  scheduledDuration: integer("scheduledDuration"),
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
  onlineRequestId: integer("onlineRequestId"),
  /** Property this opportunity is linked to (null = not yet linked) */
  propertyId: varchar("propertyId", { length: 64 }),
  /** How propertyId was set: 'manual' | 'auto-migrated' | null */
  propertyIdSource: varchar("propertyIdSource", { length: 32 }),
  /** FK to threeSixtyMemberships.id — set when job is created from a 360° work order */
  membershipId: integer("membershipId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type DbOpportunity = typeof opportunities.$inferSelect;
export type InsertDbOpportunity = typeof opportunities.$inferInsert;

// ─── PORTAL: SERVICE REQUESTS ─────────────────────────────────────────────────
// Customer-initiated booking requests from the portal.
// On submit, a lead is created on the pro side.
export const portalServiceRequests = pgTable("portalServiceRequests", {
  id: serial("id").primaryKey(),
  /** Portal customer who submitted the request */
  customerId: integer("customerId").notNull(),
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

// ─── PORTAL: JOB MILESTONES ───────────────────────────────────────────────────
// HP team manages milestones per job; customers see them in the portal.
export const portalJobMilestones = pgTable("portalJobMilestones", {
  id: serial("id").primaryKey(),
  /** Pro-side opportunity ID (area='job') */
  hpOpportunityId: varchar("hpOpportunityId", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  /** pending | in_progress | complete */
  status: milestoneStatusEnum("status").default("pending").notNull(),
  /** ISO date string for when this milestone is expected */
  scheduledDate: varchar("scheduledDate", { length: 32 }),
  completedAt: timestamp("completedAt"),
  /** Controls display order */
  sortOrder: integer("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type PortalJobMilestone = typeof portalJobMilestones.$inferSelect;
export type InsertPortalJobMilestone = typeof portalJobMilestones.$inferInsert;

// ─── PORTAL: JOB UPDATES ─────────────────────────────────────────────────────
// Progress notes/photos posted by the HP team, visible to the customer in portal.
export const portalJobUpdates = pgTable("portalJobUpdates", {
  id: serial("id").primaryKey(),
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
export const portalJobSignOffs = pgTable("portalJobSignOffs", {
  id: serial("id").primaryKey(),
  /** Pro-side opportunity ID (area='job') — unique: one sign-off per job */
  hpOpportunityId: varchar("hpOpportunityId", { length: 64 }).notNull().unique(),
  /** Portal customer who signed */
  customerId: integer("customerId").notNull(),
  /** Base64 PNG data URL of the drawn/adopted signature */
  signatureDataUrl: text("signatureDataUrl").notNull(),
  /** Name typed/adopted by the signer */
  signerName: varchar("signerName", { length: 255 }).notNull(),
  /** ISO timestamp of signing */
  signedAt: varchar("signedAt", { length: 32 }).notNull(),
  /** Optional notes / work summary from the customer at sign-off */
  workSummary: text("workSummary"),
  /** Portal invoice ID of the final/balance invoice linked to this job */
  finalInvoiceId: integer("finalInvoiceId"),
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
export const portalChangeOrders = pgTable("portalChangeOrders", {
  id: serial("id").primaryKey(),
  customerId: integer("customerId").notNull(),
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
  totalAmount: integer("totalAmount").notNull().default(0),
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
  invoiceId: integer("invoiceId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type PortalChangeOrder = typeof portalChangeOrders.$inferSelect;
export type InsertPortalChangeOrder = typeof portalChangeOrders.$inferInsert;

// ─── PORTAL: DOCUMENTS ───────────────────────────────────────────────────────
// Files shared by the pro team with a portal customer.
export const portalDocuments = pgTable("portalDocuments", {
  id: serial("id").primaryKey(),
  /** portalCustomers.id */
  portalCustomerId: integer("portalCustomerId").notNull(),
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
export const threeSixtyMemberships = pgTable("threeSixtyMemberships", {
  id: serial("id").primaryKey(),
  /** customers.id (varchar nanoid) */
  customerId: varchar("customerId", { length: 64 }).notNull(),
  /** customerAddresses.id — the enrolled property */
  propertyAddressId: integer("propertyAddressId"),
  tier: membershipTierEnum("tier").notNull().default("bronze"),
  status: membershipStatusEnum("status").notNull().default("active"),
  /** Unix ms */
  startDate: bigint("startDate", { mode: "number" }).notNull(),
  /** Unix ms — next renewal date */
  renewalDate: bigint("renewalDate", { mode: "number" }).notNull(),
  /** Labor bank balance in cents */
  laborBankBalance: integer("laborBankBalance").notNull().default(0),
  /** Stripe subscription ID for recurring billing */
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
  /** Stripe customer ID — mirrors portalCustomers.stripeCustomerId */
  stripeCustomerId: varchar("stripeCustomerId", { length: 64 }),
  /** Billing cadence selected at enrollment */
  billingCadence: billingCadenceEnum("billingCadence").notNull().default("annual"),
  /** Whether the annual 360 scan has been completed this cycle */
  annualScanCompleted: boolean("annualScanCompleted").notNull().default(false),
  /** Unix ms — date of last completed annual scan */
  annualScanDate: bigint("annualScanDate", { mode: "number" }),
  notes: text("notes"),
  /** 'single' for homeowner plan, 'portfolio' for landlord multi-property plan */
  planType: planTypeEnum("planType").notNull().default("single"),
  /** JSON array of portfolio properties — only populated when planType='portfolio' */
  portfolioProperties: text("portfolioProperties"),
  /** Total number of interior add-on doors enrolled */
  interiorAddonDoors: integer("interiorAddonDoors").notNull().default(0),
  /** Stripe subscription quantity (portfolio unit multiplier) */
  stripeQuantity: integer("stripeQuantity").notNull().default(1),
  /** Unix ms — when the deferred labor bank credit should be released (monthly full_coverage/max only) */
  scheduledCreditAt: bigint("scheduledCreditAt", { mode: "number" }),
  /** Cents — amount of the deferred credit to release at scheduledCreditAt */
  scheduledCreditCents: integer("scheduledCreditCents").notNull().default(0),
  /** HP CRM customer ID (nanoid string) — links to customers table */
  hpCustomerId: varchar("hpCustomerId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type ThreeSixtyMembership = typeof threeSixtyMemberships.$inferSelect;
export type InsertThreeSixtyMembership = typeof threeSixtyMemberships.$inferInsert;

// ─── 360 METHOD: SEASONAL VISITS ─────────────────────────────────────────────
export const threeSixtyVisits = pgTable("threeSixtyVisits", {
  id: serial("id").primaryKey(),
  membershipId: integer("membershipId").notNull(),
  customerId: varchar("customerId", { length: 64 }).notNull(),
  season: seasonEnum("season").notNull(),
  /** Unix ms */
  scheduledDate: bigint("scheduledDate", { mode: "number" }),
  /** Unix ms */
  completedDate: bigint("completedDate", { mode: "number" }),
  status: visitStatusEnum("status").notNull().default("scheduled"),
  technicianNotes: text("technicianNotes"),
  /** JSON snapshot of checklist completion state: { taskId: boolean } */
  checklistSnapshot: text("checklistSnapshot"),
  /** Labor bank deducted in cents for this visit */
  laborBankUsed: integer("laborBankUsed").notNull().default(0),
  /** If visit generated an upsell estimate */
  linkedOpportunityId: varchar("linkedOpportunityId", { length: 64 }),
  /** Year this visit belongs to (for grouping) */
  visitYear: integer("visitYear").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type ThreeSixtyVisit = typeof threeSixtyVisits.$inferSelect;
export type InsertThreeSixtyVisit = typeof threeSixtyVisits.$inferInsert;

// ─── 360 METHOD: MASTER CHECKLIST LIBRARY ────────────────────────────────────
export const threeSixtyChecklist = pgTable("threeSixtyChecklist", {
  id: serial("id").primaryKey(),
  season: seasonEnum("season").notNull(),
  /** inspect | service */
  category: checklistCategoryEnum("category").notNull(),
  /** e.g. "PNW" — for future regional expansion */
  region: varchar("region", { length: 32 }).notNull().default("PNW"),
  taskName: varchar("taskName", { length: 255 }).notNull(),
  description: text("description"),
  /** Estimated minutes to complete */
  estimatedMinutes: integer("estimatedMinutes").notNull().default(15),
  /** Whether flagging this item should prompt an upsell estimate */
  isUpsellTrigger: boolean("isUpsellTrigger").notNull().default(false),
  sortOrder: integer("sortOrder").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // ── 360 Inspection additions ──────────────────────────────────────────────
  /** Which home system this item belongs to (for cascade risk scoring) */
  systemType: varchar("systemType", { length: 64 }),
  /** Base cascade risk score 1-10 for this item type */
  cascadeRiskBase: integer("cascadeRiskBase").default(3),
  /** Default estimated repair cost low (USD) */
  defaultCostLow: decimal("defaultCostLow", { precision: 10, scale: 2 }),
  /** Default estimated repair cost high (USD) */
  defaultCostHigh: decimal("defaultCostHigh", { precision: 10, scale: 2 }),
});
export type ThreeSixtyChecklistItem = typeof threeSixtyChecklist.$inferSelect;
export type InsertThreeSixtyChecklistItem = typeof threeSixtyChecklist.$inferInsert;

// ─── 360 METHOD: LABOR BANK LEDGER ───────────────────────────────────────────
export const threeSixtyLaborBankTransactions = pgTable("threeSixtyLaborBankTransactions", {
  id: serial("id").primaryKey(),
  membershipId: integer("membershipId").notNull(),
  /** credit | debit | adjustment */
  type: laborBankTxTypeEnum("type").notNull(),
  /** Amount in cents — always positive; type determines direction */
  amountCents: integer("amountCents").notNull(),
  description: varchar("description", { length: 512 }).notNull(),
  linkedVisitId: integer("linkedVisitId"),
  linkedOpportunityId: varchar("linkedOpportunityId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** User ID of the staff member who created this transaction */
  createdBy: integer("createdBy"),
});
export type ThreeSixtyLaborBankTransaction = typeof threeSixtyLaborBankTransactions.$inferSelect;
export type InsertThreeSixtyLaborBankTransaction = typeof threeSixtyLaborBankTransactions.$inferInsert;

// ─── 360 METHOD: ANNUAL HOME SCANS ───────────────────────────────────────────
export const threeSixtyScans = pgTable("threeSixtyScans", {
  id: serial("id").primaryKey(),
  membershipId: integer("membershipId").notNull(),
  customerId: varchar("customerId", { length: 64 }).notNull(),
  /** Unix ms */
  scanDate: bigint("scanDate", { mode: "number" }).notNull(),
  /** JSON: { system: string, rating: 1-5, notes: string, photos: string[], priority: 'urgent'|'1yr'|'3yr'|'monitor' }[] */
  systemRatings: text("systemRatings"),
  /** S3 URL of generated PDF report */
  reportUrl: text("reportUrl"),
  reportFileKey: varchar("reportFileKey", { length: 512 }),
  technicianNotes: text("technicianNotes"),
  status: scanStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  // ── 360 Inspection additions ──────────────────────────────────────────────
  /** Computed property health score 0-100 */
  healthScore: integer("healthScore"),
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
  linkedVisitId: integer("linkedVisitId"),
});
export type ThreeSixtyScan = typeof threeSixtyScans.$inferSelect;
export type InsertThreeSixtyScan = typeof threeSixtyScans.$inferInsert;

// ─── 360 METHOD: PROPERTY SYSTEM BASELINES ───────────────────────────────────
export const threeSixtyPropertySystems = pgTable("threeSixtyPropertySystems", {
  id: serial("id").primaryKey(),
  membershipId: integer("membershipId").notNull(),
  customerId: varchar("customerId", { length: 64 }).notNull(),
  /** hvac | roof | plumbing | electrical | foundation | exterior_siding | interior | appliances */
  systemType: systemTypeEnum("systemType").notNull(),
  brandModel: varchar("brandModel", { length: 255 }),
  installYear: integer("installYear"),
  /** good | fair | poor | critical */
  condition: systemConditionEnum("condition").notNull().default("good"),
  conditionNotes: text("conditionNotes"),
  lastServiceDate: date("lastServiceDate"),
  nextServiceDate: date("nextServiceDate"),
  estimatedLifespanYears: integer("estimatedLifespanYears"),
  replacementCostEstimate: decimal("replacementCostEstimate", { precision: 10, scale: 2 }),
  /** JSON array of S3 photo URLs */
  photoUrls: text("photoUrls"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type ThreeSixtyPropertySystem = typeof threeSixtyPropertySystems.$inferSelect;
export type InsertThreeSixtyPropertySystem = typeof threeSixtyPropertySystems.$inferInsert;

// ─── PORTAL REPORTS ──────────────────────────────────────────────────────────
export const portalReports = pgTable("portalReports", {
  id: serial("id").primaryKey(),
  portalCustomerId: integer("portalCustomerId").notNull(),
  scanId: integer("scanId").notNull(),
  membershipId: integer("membershipId").notNull(),
  hpCustomerId: integer("hpCustomerId").notNull(),
  healthScore: integer("healthScore"),
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
export const invoices = pgTable("invoices", {
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
  subtotal: integer("subtotal").notNull().default(0),
  taxRate: integer("taxRate").notNull().default(0),    // basis points e.g. 890 = 8.90%
  taxAmount: integer("taxAmount").notNull().default(0),
  total: integer("total").notNull().default(0),
  depositPercent: integer("depositPercent"),
  amountPaid: integer("amountPaid").notNull().default(0),
  balance: integer("balance").notNull().default(0),
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type DbInvoice = typeof invoices.$inferSelect;
export type InsertDbInvoice = typeof invoices.$inferInsert;

// ─── INVOICE LINE ITEMS ───────────────────────────────────────────────────────
export const invoiceLineItems = pgTable("invoiceLineItems", {
  id: varchar("id", { length: 64 }).primaryKey(),
  invoiceId: varchar("invoiceId", { length: 64 }).notNull(),
  description: text("description").notNull(),
  qty: doublePrecision("qty").notNull().default(1),
  unitPrice: integer("unitPrice").notNull().default(0), // cents
  total: integer("total").notNull().default(0),         // cents
  notes: text("notes"),
  sortOrder: integer("sortOrder").notNull().default(0),
});
export type DbInvoiceLineItem = typeof invoiceLineItems.$inferSelect;
export type InsertDbInvoiceLineItem = typeof invoiceLineItems.$inferInsert;

// ─── INVOICE PAYMENTS ────────────────────────────────────────────────────────
export const invoicePayments = pgTable("invoicePayments", {
  id: varchar("id", { length: 64 }).primaryKey(),
  invoiceId: varchar("invoiceId", { length: 64 }).notNull(),
  /** stripe | paypal | cash | check | zelle | venmo | other */
  method: varchar("method", { length: 32 }).notNull(),
  /** cents */
  amount: integer("amount").notNull(),
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

export const scheduleEvents = pgTable("scheduleEvents", {
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type DbScheduleEvent = typeof scheduleEvents.$inferSelect;
export type InsertDbScheduleEvent = typeof scheduleEvents.$inferInsert;

// ─── EXPENSES ─────────────────────────────────────────────────────────────────
// Job-level and general business expenses for P&L tracking.
export const expenses = pgTable("expenses", {
  id: varchar("id", { length: 64 }).primaryKey(),
  /** Owner user ID */
  userId: integer("userId").notNull(),
  /** Link to job/estimate opportunity (optional) */
  opportunityId: varchar("opportunityId", { length: 64 }),
  /** Link to customer (optional) */
  customerId: varchar("customerId", { length: 64 }),
  vendor: varchar("vendor", { length: 255 }),
  /** Amount in cents */
  amount: integer("amount").notNull().default(0),
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
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type DbExpense = typeof expenses.$inferSelect;
export type InsertDbExpense = typeof expenses.$inferInsert;

// ─── QUICKBOOKS TOKENS ────────────────────────────────────────────────────────
// Stores OAuth 2.0 tokens for QuickBooks Online per user.
export const qbTokens = pgTable("qbTokens", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().unique(),
  accessToken: text("accessToken").notNull(),
  refreshToken: text("refreshToken").notNull(),
  /** QuickBooks company/realm ID */
  realmId: varchar("realmId", { length: 64 }).notNull(),
  /** ISO datetime when access token expires */
  expiresAt: varchar("expiresAt", { length: 32 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type DbQbToken = typeof qbTokens.$inferSelect;
export type InsertDbQbToken = typeof qbTokens.$inferInsert;

// ─── 360° WORK ORDERS ─────────────────────────────────────────────────────────
// Central record for every 360° service event (baseline scan + seasonal visits).
// Created automatically on enrollment and after baseline completion.
export const threeSixtyWorkOrders = pgTable("threeSixtyWorkOrders", {
  id: serial("id").primaryKey(),
  membershipId: integer("membershipId").notNull(),
  /** CRM customer ID (nanoid string) */
  customerId: varchar("customerId", { length: 64 }).notNull(),
  /** baseline_scan | spring | summer | fall | winter */
  type: varchar("type", { length: 32 }).notNull(),
  /** open | scheduled | in_progress | completed | skipped */
  status: varchar("status", { length: 32 }).notNull().default("open"),
  /** Year this work order belongs to (e.g. 2026) */
  visitYear: integer("visitYear").notNull(),
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
  laborBankUsed: integer("laborBankUsed").notNull().default(0),
  /** FK to portalReports.id once report is sent */
  portalReportId: integer("portalReportId"),
  /** FK to scheduleEvents.id */
  scheduleEventId: varchar("scheduleEventId", { length: 64 }),
  /** FK to threeSixtyVisits.id (legacy link) */
  visitId: integer("visitId"),
  /** 0-100 home health score set on completion */
  healthScore: integer("healthScore"),
  /** Reason for skipping (if status=skipped) */
  skipReason: varchar("skipReason", { length: 255 }),
  /** FK to opportunities.id — set when completion creates or links a job/estimate */
  hpOpportunityId: varchar("hpOpportunityId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});
export type DbThreeSixtyWorkOrder = typeof threeSixtyWorkOrders.$inferSelect;
export type InsertDbThreeSixtyWorkOrder = typeof threeSixtyWorkOrders.$inferInsert;

// ─── AUTOMATION LOGS ──────────────────────────────────────────────────────────
// Tracks every automation trigger fired per customer, preventing duplicate sends.
export const automationLogs = pgTable("automationLogs", {
  id: serial("id").primaryKey(),
  customerId: varchar("customerId", { length: 64 }).notNull(),
  trigger: automationTriggerEnum("trigger").notNull(),
  /** tRPC opportunity or membership ID that caused this fire */
  referenceId: varchar("referenceId", { length: 64 }),
  channel: varchar("channel", { length: 16 }).notNull().default("sms"), // sms | email
  status: varchar("status", { length: 16 }).notNull().default("sent"),  // sent | failed | skipped
  error: text("error"),
  firedAt: timestamp("firedAt").defaultNow().notNull(),
});
export type DbAutomationLog = typeof automationLogs.$inferSelect;

// ─── TIME LOGS ────────────────────────────────────────────────────────────────
export const timeLogs = pgTable("timeLogs", {
  id: serial("id").primaryKey(),
  techName: varchar("techName", { length: 128 }).notNull(),
  workOrderId: integer("workOrderId"),
  scheduleEventId: varchar("scheduleEventId", { length: 64 }),
  opportunityId: varchar("opportunityId", { length: 64 }),
  customerId: varchar("customerId", { length: 64 }),
  jobTitle: text("jobTitle"),
  clockIn: timestamp("clockIn").notNull(),
  clockOut: timestamp("clockOut"),
  durationMins: integer("durationMins"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TimeLog = typeof timeLogs.$inferSelect;
export type InsertTimeLog = typeof timeLogs.$inferInsert;
export type InsertDbAutomationLog = typeof automationLogs