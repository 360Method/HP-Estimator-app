CREATE TYPE "public"."billing_cadence" AS ENUM('monthly', 'quarterly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."checklist_category" AS ENUM('inspect', 'service');--> statement-breakpoint
CREATE TYPE "public"."labor_bank_tx_type" AS ENUM('credit', 'debit', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('active', 'paused', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."membership_tier" AS ENUM('bronze', 'silver', 'gold');--> statement-breakpoint
CREATE TYPE "public"."message_channel" AS ENUM('sms', 'email', 'call', 'note');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."milestone_status" AS ENUM('pending', 'in_progress', 'complete');--> statement-breakpoint
CREATE TYPE "public"."plan_type" AS ENUM('single', 'portfolio');--> statement-breakpoint
CREATE TYPE "public"."portal_sender_role" AS ENUM('customer', 'hp_team');--> statement-breakpoint
CREATE TYPE "public"."scan_status" AS ENUM('draft', 'completed', 'delivered');--> statement-breakpoint
CREATE TYPE "public"."season" AS ENUM('spring', 'summer', 'fall', 'winter');--> statement-breakpoint
CREATE TYPE "public"."system_condition" AS ENUM('good', 'fair', 'poor', 'critical');--> statement-breakpoint
CREATE TYPE "public"."system_type" AS ENUM('hvac', 'roof', 'plumbing', 'electrical', 'foundation', 'exterior_siding', 'interior', 'appliances');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."visit_status" AS ENUM('scheduled', 'completed', 'skipped');--> statement-breakpoint
CREATE TABLE "adminAllowlist" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"addedBy" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "adminAllowlist_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "callLogs" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversationId" integer NOT NULL,
	"messageId" integer,
	"twilioCallSid" varchar(64),
	"direction" "message_direction" NOT NULL,
	"status" varchar(32) DEFAULT 'answered' NOT NULL,
	"durationSecs" integer DEFAULT 0 NOT NULL,
	"recordingUrl" text,
	"voicemailUrl" text,
	"callerPhone" varchar(32),
	"startedAt" timestamp DEFAULT now() NOT NULL,
	"endedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" varchar(64),
	"portalCustomerId" integer,
	"contactName" varchar(255),
	"contactPhone" varchar(32),
	"contactEmail" varchar(320),
	"channels" varchar(64) DEFAULT 'note' NOT NULL,
	"lastMessageAt" timestamp DEFAULT now() NOT NULL,
	"lastMessagePreview" varchar(255),
	"unreadCount" integer DEFAULT 0 NOT NULL,
	"twilioConversationSid" varchar(64),
	"gmailThreadId" varchar(128),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customerAddresses" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"customerId" varchar(64) NOT NULL,
	"label" varchar(64) DEFAULT 'Home' NOT NULL,
	"street" varchar(255) DEFAULT '' NOT NULL,
	"unit" varchar(64) DEFAULT '' NOT NULL,
	"city" varchar(128) DEFAULT '' NOT NULL,
	"state" varchar(64) DEFAULT '' NOT NULL,
	"zip" varchar(10) DEFAULT '' NOT NULL,
	"isPrimary" boolean DEFAULT false NOT NULL,
	"lat" text,
	"lng" text,
	"propertyNotes" text,
	"isBilling" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"firstName" varchar(128) DEFAULT '' NOT NULL,
	"lastName" varchar(128) DEFAULT '' NOT NULL,
	"displayName" varchar(255) DEFAULT '' NOT NULL,
	"company" varchar(255) DEFAULT '' NOT NULL,
	"mobilePhone" varchar(32) DEFAULT '' NOT NULL,
	"homePhone" varchar(32) DEFAULT '' NOT NULL,
	"workPhone" varchar(32) DEFAULT '' NOT NULL,
	"email" varchar(320) DEFAULT '' NOT NULL,
	"role" varchar(128) DEFAULT '' NOT NULL,
	"customerType" varchar(32) DEFAULT 'homeowner' NOT NULL,
	"doNotService" boolean DEFAULT false NOT NULL,
	"street" varchar(255) DEFAULT '' NOT NULL,
	"unit" varchar(64) DEFAULT '' NOT NULL,
	"city" varchar(128) DEFAULT '' NOT NULL,
	"state" varchar(64) DEFAULT '' NOT NULL,
	"zip" varchar(10) DEFAULT '' NOT NULL,
	"addressNotes" text,
	"customerNotes" text,
	"billsTo" varchar(255) DEFAULT '' NOT NULL,
	"tags" text,
	"leadSource" varchar(64) DEFAULT '' NOT NULL,
	"referredBy" varchar(255) DEFAULT '' NOT NULL,
	"sendNotifications" boolean DEFAULT true NOT NULL,
	"sendMarketingOptIn" boolean DEFAULT false NOT NULL,
	"defaultTaxCode" varchar(16),
	"additionalPhones" text,
	"additionalEmails" text,
	"lifetimeValue" integer DEFAULT 0 NOT NULL,
	"outstandingBalance" integer DEFAULT 0 NOT NULL,
	"onlineRequestId" integer,
	"mergedIntoId" varchar(64),
	"qbCustomerId" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"opportunityId" varchar(64),
	"customerId" varchar(64),
	"vendor" varchar(255),
	"amount" integer DEFAULT 0 NOT NULL,
	"category" varchar(32) DEFAULT 'other' NOT NULL,
	"description" text,
	"receiptUrl" text,
	"date" varchar(16) NOT NULL,
	"qbEntityId" varchar(64),
	"qbSyncedAt" varchar(32),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gmailTokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"expiresAt" bigint,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gmailTokens_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "invoiceLineItems" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"invoiceId" varchar(64) NOT NULL,
	"description" text NOT NULL,
	"qty" double precision DEFAULT 1 NOT NULL,
	"unitPrice" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"sortOrder" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoicePayments" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"invoiceId" varchar(64) NOT NULL,
	"method" varchar(32) NOT NULL,
	"amount" integer NOT NULL,
	"paidAt" varchar(32) NOT NULL,
	"reference" varchar(255) DEFAULT '' NOT NULL,
	"note" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"type" varchar(16) DEFAULT 'deposit' NOT NULL,
	"status" varchar(32) DEFAULT 'draft' NOT NULL,
	"invoiceNumber" varchar(64) NOT NULL,
	"customerId" varchar(64) NOT NULL,
	"opportunityId" varchar(64) NOT NULL,
	"sourceEstimateId" varchar(64),
	"subtotal" integer DEFAULT 0 NOT NULL,
	"taxRate" integer DEFAULT 0 NOT NULL,
	"taxAmount" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"depositPercent" integer,
	"amountPaid" integer DEFAULT 0 NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"issuedAt" varchar(32) NOT NULL,
	"dueDate" varchar(32) NOT NULL,
	"paidAt" varchar(32),
	"serviceDate" varchar(32),
	"notes" text,
	"internalNotes" text,
	"paymentTerms" varchar(128),
	"taxLabel" varchar(64),
	"stripePaymentIntentId" varchar(128),
	"stripeClientSecret" text,
	"paypalOrderId" varchar(128),
	"completionSignatureUrl" text,
	"completionSignedBy" varchar(255),
	"completionSignedAt" varchar(32),
	"qbEntityId" varchar(64),
	"qbSyncedAt" varchar(32),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversationId" integer NOT NULL,
	"channel" "message_channel" NOT NULL,
	"direction" "message_direction" NOT NULL,
	"body" text,
	"subject" varchar(512),
	"status" varchar(32) DEFAULT 'sent' NOT NULL,
	"twilioSid" varchar(64),
	"gmailMessageId" varchar(128),
	"attachmentUrl" text,
	"attachmentMime" varchar(128),
	"isInternal" boolean DEFAULT false NOT NULL,
	"sentAt" timestamp DEFAULT now() NOT NULL,
	"readAt" timestamp,
	"sentByUserId" integer
);
--> statement-breakpoint
CREATE TABLE "onlineRequests" (
	"id" serial PRIMARY KEY NOT NULL,
	"zip" varchar(10) NOT NULL,
	"serviceType" varchar(64) DEFAULT 'general' NOT NULL,
	"description" text,
	"timeline" varchar(32),
	"photoUrls" text,
	"firstName" varchar(128) NOT NULL,
	"lastName" varchar(128) NOT NULL,
	"phone" varchar(32) NOT NULL,
	"email" varchar(320) NOT NULL,
	"street" varchar(255) NOT NULL,
	"unit" varchar(64),
	"city" varchar(128) NOT NULL,
	"state" varchar(64) NOT NULL,
	"smsConsent" boolean DEFAULT false NOT NULL,
	"customerId" varchar(64),
	"leadId" varchar(64),
	"readAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"customerId" varchar(64) NOT NULL,
	"area" varchar(16) DEFAULT 'lead' NOT NULL,
	"stage" varchar(64) DEFAULT 'New Lead' NOT NULL,
	"title" varchar(255) DEFAULT '' NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"jobNumber" varchar(64),
	"notes" text,
	"archived" boolean DEFAULT false NOT NULL,
	"archivedAt" varchar(32),
	"sourceLeadId" varchar(64),
	"sourceEstimateId" varchar(64),
	"convertedToEstimateAt" varchar(32),
	"convertedToJobAt" varchar(32),
	"sentAt" varchar(32),
	"wonAt" varchar(32),
	"portalApprovedAt" varchar(32),
	"scheduledDate" varchar(32),
	"scheduledEndDate" varchar(32),
	"scheduledDuration" integer,
	"assignedTo" text,
	"scheduleNotes" text,
	"estimateSnapshot" text,
	"tasks" text,
	"attachments" text,
	"jobActivity" text,
	"clientSnapshot" text,
	"signedEstimateUrl" text,
	"signedEstimateFilename" varchar(255),
	"completionSignatureUrl" text,
	"completionSignedBy" varchar(255),
	"completionSignedAt" varchar(32),
	"sowDocument" text,
	"sowGeneratedAt" varchar(32),
	"onlineRequestId" integer,
	"propertyId" varchar(64),
	"propertyIdSource" varchar(32),
	"membershipId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portalAppointments" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"type" varchar(64) DEFAULT 'job' NOT NULL,
	"scheduledAt" timestamp NOT NULL,
	"scheduledEndAt" timestamp,
	"address" text,
	"techName" varchar(255),
	"status" varchar(32) DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portalChangeOrders" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" integer NOT NULL,
	"hpOpportunityId" varchar(64) NOT NULL,
	"coNumber" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"scopeOfWork" text,
	"lineItemsJson" text,
	"totalAmount" integer DEFAULT 0 NOT NULL,
	"status" varchar(32) DEFAULT 'sent' NOT NULL,
	"sentAt" timestamp DEFAULT now() NOT NULL,
	"viewedAt" timestamp,
	"approvedAt" timestamp,
	"signatureDataUrl" text,
	"signerName" varchar(255),
	"declinedAt" timestamp,
	"declineReason" text,
	"invoiceId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portalCustomers" (
	"id" serial PRIMARY KEY NOT NULL,
	"hpCustomerId" varchar(64),
	"name" varchar(255) NOT NULL,
	"email" varchar(320) NOT NULL,
	"phone" varchar(32),
	"address" text,
	"stripeCustomerId" varchar(64),
	"referralCode" varchar(32),
	"referredBy" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "portalCustomers_hpCustomerId_unique" UNIQUE("hpCustomerId"),
	CONSTRAINT "portalCustomers_email_unique" UNIQUE("email"),
	CONSTRAINT "portalCustomers_referralCode_unique" UNIQUE("referralCode")
);
--> statement-breakpoint
CREATE TABLE "portalDocuments" (
	"id" serial PRIMARY KEY NOT NULL,
	"portalCustomerId" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"url" text NOT NULL,
	"fileKey" varchar(512) NOT NULL,
	"mimeType" varchar(128) DEFAULT 'application/octet-stream' NOT NULL,
	"jobId" varchar(64),
	"uploadedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portalEstimates" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" integer NOT NULL,
	"estimateNumber" varchar(64) NOT NULL,
	"hpOpportunityId" varchar(64),
	"title" varchar(255) NOT NULL,
	"status" varchar(32) DEFAULT 'sent' NOT NULL,
	"totalAmount" integer DEFAULT 0 NOT NULL,
	"depositAmount" integer DEFAULT 0 NOT NULL,
	"depositPercent" integer DEFAULT 50 NOT NULL,
	"lineItemsJson" text,
	"scopeOfWork" text,
	"expiresAt" timestamp,
	"sentAt" timestamp DEFAULT now() NOT NULL,
	"viewedAt" timestamp,
	"approvedAt" timestamp,
	"taxEnabled" smallint DEFAULT 0 NOT NULL,
	"taxRateCode" varchar(32) DEFAULT '0603' NOT NULL,
	"customTaxPct" integer DEFAULT 890 NOT NULL,
	"taxAmount" integer DEFAULT 0 NOT NULL,
	"signatureDataUrl" text,
	"signerName" varchar(255),
	"declinedAt" timestamp,
	"declineReason" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portalGallery" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" integer NOT NULL,
	"jobId" varchar(64),
	"jobTitle" varchar(255),
	"imageUrl" text NOT NULL,
	"caption" varchar(512),
	"phase" varchar(32) DEFAULT 'after' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portalInvoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" integer NOT NULL,
	"estimateId" integer,
	"invoiceNumber" varchar(64) NOT NULL,
	"type" varchar(32) DEFAULT 'final' NOT NULL,
	"status" varchar(32) DEFAULT 'sent' NOT NULL,
	"amountDue" integer DEFAULT 0 NOT NULL,
	"amountPaid" integer DEFAULT 0 NOT NULL,
	"tipAmount" integer DEFAULT 0 NOT NULL,
	"dueDate" timestamp,
	"stripePaymentIntentId" varchar(64),
	"stripeCheckoutSessionId" varchar(128),
	"paidAt" timestamp,
	"lineItemsJson" text,
	"jobTitle" varchar(255),
	"sentAt" timestamp DEFAULT now() NOT NULL,
	"viewedAt" timestamp,
	"lastReminderSentAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portalJobMilestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"hpOpportunityId" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"status" "milestone_status" DEFAULT 'pending' NOT NULL,
	"scheduledDate" varchar(32),
	"completedAt" timestamp,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portalJobSignOffs" (
	"id" serial PRIMARY KEY NOT NULL,
	"hpOpportunityId" varchar(64) NOT NULL,
	"customerId" integer NOT NULL,
	"signatureDataUrl" text NOT NULL,
	"signerName" varchar(255) NOT NULL,
	"signedAt" varchar(32) NOT NULL,
	"workSummary" text,
	"finalInvoiceId" integer,
	"reviewRequestSentAt" timestamp,
	"reviewReminderSentAt" timestamp,
	"skipReviewRequest" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "portalJobSignOffs_hpOpportunityId_unique" UNIQUE("hpOpportunityId")
);
--> statement-breakpoint
CREATE TABLE "portalJobUpdates" (
	"id" serial PRIMARY KEY NOT NULL,
	"hpOpportunityId" varchar(64) NOT NULL,
	"message" text NOT NULL,
	"photoUrl" text,
	"postedBy" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portalMessages" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" integer NOT NULL,
	"senderRole" "portal_sender_role" NOT NULL,
	"senderName" varchar(255),
	"body" text NOT NULL,
	"readAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portalReferrals" (
	"id" serial PRIMARY KEY NOT NULL,
	"referrerId" integer NOT NULL,
	"referredEmail" varchar(320) NOT NULL,
	"referredCustomerId" integer,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"rewardAmount" integer DEFAULT 0 NOT NULL,
	"rewardedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portalReports" (
	"id" serial PRIMARY KEY NOT NULL,
	"portalCustomerId" integer NOT NULL,
	"scanId" integer NOT NULL,
	"membershipId" integer NOT NULL,
	"hpCustomerId" integer NOT NULL,
	"healthScore" integer,
	"reportJson" text NOT NULL,
	"pdfUrl" text,
	"sentAt" bigint NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portalServiceRequests" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" integer NOT NULL,
	"description" text NOT NULL,
	"timeline" varchar(32) DEFAULT 'flexible' NOT NULL,
	"address" text,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"leadId" varchar(64),
	"readAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portalSessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" integer NOT NULL,
	"sessionToken" varchar(128) NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "portalSessions_sessionToken_unique" UNIQUE("sessionToken")
);
--> statement-breakpoint
CREATE TABLE "portalTokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" integer NOT NULL,
	"token" varchar(128) NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"usedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "portalTokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"customerId" varchar(64) NOT NULL,
	"label" varchar(64) DEFAULT 'Home' NOT NULL,
	"street" varchar(255) DEFAULT '' NOT NULL,
	"unit" varchar(64) DEFAULT '' NOT NULL,
	"city" varchar(128) DEFAULT '' NOT NULL,
	"state" varchar(64) DEFAULT '' NOT NULL,
	"zip" varchar(10) DEFAULT '' NOT NULL,
	"isPrimary" boolean DEFAULT false NOT NULL,
	"isBilling" boolean DEFAULT false NOT NULL,
	"propertyNotes" text,
	"addressNotes" text,
	"lat" text,
	"lng" text,
	"membershipId" integer,
	"source" varchar(32) DEFAULT 'manual',
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qbTokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"accessToken" text NOT NULL,
	"refreshToken" text NOT NULL,
	"realmId" varchar(64) NOT NULL,
	"expiresAt" varchar(32) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "qbTokens_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "scheduleEvents" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"type" varchar(32) DEFAULT 'task' NOT NULL,
	"title" varchar(255) NOT NULL,
	"start" varchar(32) NOT NULL,
	"end" varchar(32) NOT NULL,
	"allDay" boolean DEFAULT false NOT NULL,
	"opportunityId" varchar(64),
	"customerId" varchar(64),
	"assignedTo" text,
	"notes" text,
	"color" varchar(16),
	"recurrence" text,
	"parentEventId" varchar(64),
	"completed" boolean DEFAULT false NOT NULL,
	"completedAt" varchar(32),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "serviceZipCodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"zip" varchar(10) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "serviceZipCodes_zip_unique" UNIQUE("zip")
);
--> statement-breakpoint
CREATE TABLE "snapshotInvoices" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"opportunityId" varchar(64),
	"customerId" varchar(64),
	"customerName" varchar(255),
	"status" varchar(32) NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"amountPaid" integer DEFAULT 0 NOT NULL,
	"dueDate" varchar(32),
	"issuedAt" varchar(32),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshotOpportunities" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"area" varchar(16) NOT NULL,
	"stage" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"wonAt" varchar(32),
	"sentAt" varchar(32),
	"customerId" varchar(64),
	"customerName" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threeSixtyChecklist" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" "season" NOT NULL,
	"category" "checklist_category" NOT NULL,
	"region" varchar(32) DEFAULT 'PNW' NOT NULL,
	"taskName" varchar(255) NOT NULL,
	"description" text,
	"estimatedMinutes" integer DEFAULT 15 NOT NULL,
	"isUpsellTrigger" boolean DEFAULT false NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"systemType" varchar(64),
	"cascadeRiskBase" integer DEFAULT 3,
	"defaultCostLow" numeric(10, 2),
	"defaultCostHigh" numeric(10, 2)
);
--> statement-breakpoint
CREATE TABLE "threeSixtyLaborBankTransactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"membershipId" integer NOT NULL,
	"type" "labor_bank_tx_type" NOT NULL,
	"amountCents" integer NOT NULL,
	"description" varchar(512) NOT NULL,
	"linkedVisitId" integer,
	"linkedOpportunityId" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"createdBy" integer
);
--> statement-breakpoint
CREATE TABLE "threeSixtyMemberships" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" varchar(64) NOT NULL,
	"propertyAddressId" integer,
	"tier" "membership_tier" DEFAULT 'bronze' NOT NULL,
	"status" "membership_status" DEFAULT 'active' NOT NULL,
	"startDate" bigint NOT NULL,
	"renewalDate" bigint NOT NULL,
	"laborBankBalance" integer DEFAULT 0 NOT NULL,
	"stripeSubscriptionId" varchar(255),
	"stripeCustomerId" varchar(64),
	"billingCadence" "billing_cadence" DEFAULT 'annual' NOT NULL,
	"annualScanCompleted" boolean DEFAULT false NOT NULL,
	"annualScanDate" bigint,
	"notes" text,
	"planType" "plan_type" DEFAULT 'single' NOT NULL,
	"portfolioProperties" text,
	"interiorAddonDoors" integer DEFAULT 0 NOT NULL,
	"stripeQuantity" integer DEFAULT 1 NOT NULL,
	"scheduledCreditAt" bigint,
	"scheduledCreditCents" integer DEFAULT 0 NOT NULL,
	"hpCustomerId" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threeSixtyPropertySystems" (
	"id" serial PRIMARY KEY NOT NULL,
	"membershipId" integer NOT NULL,
	"customerId" varchar(64) NOT NULL,
	"systemType" "system_type" NOT NULL,
	"brandModel" varchar(255),
	"installYear" integer,
	"condition" "system_condition" DEFAULT 'good' NOT NULL,
	"conditionNotes" text,
	"lastServiceDate" date,
	"nextServiceDate" date,
	"estimatedLifespanYears" integer,
	"replacementCostEstimate" numeric(10, 2),
	"photoUrls" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threeSixtyScans" (
	"id" serial PRIMARY KEY NOT NULL,
	"membershipId" integer NOT NULL,
	"customerId" varchar(64) NOT NULL,
	"scanDate" bigint NOT NULL,
	"systemRatings" text,
	"reportUrl" text,
	"reportFileKey" varchar(512),
	"technicianNotes" text,
	"status" "scan_status" DEFAULT 'draft' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"healthScore" integer,
	"inspectionItemsJson" text,
	"recommendationsJson" text,
	"summary" text,
	"sentToPortalAt" bigint,
	"pdfUrl" text,
	"pdfFileKey" varchar(512),
	"linkedVisitId" integer
);
--> statement-breakpoint
CREATE TABLE "threeSixtyVisits" (
	"id" serial PRIMARY KEY NOT NULL,
	"membershipId" integer NOT NULL,
	"customerId" varchar(64) NOT NULL,
	"season" "season" NOT NULL,
	"scheduledDate" bigint,
	"completedDate" bigint,
	"status" "visit_status" DEFAULT 'scheduled' NOT NULL,
	"technicianNotes" text,
	"checklistSnapshot" text,
	"laborBankUsed" integer DEFAULT 0 NOT NULL,
	"linkedOpportunityId" varchar(64),
	"visitYear" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threeSixtyWorkOrders" (
	"id" serial PRIMARY KEY NOT NULL,
	"membershipId" integer NOT NULL,
	"customerId" varchar(64) NOT NULL,
	"type" varchar(32) NOT NULL,
	"status" varchar(32) DEFAULT 'open' NOT NULL,
	"visitYear" integer NOT NULL,
	"scheduledDate" bigint,
	"completedDate" bigint,
	"assignedTo" text,
	"technicianNotes" text,
	"inspectionItemsJson" text,
	"laborBankUsed" integer DEFAULT 0 NOT NULL,
	"portalReportId" integer,
	"scheduleEventId" varchar(64),
	"visitId" integer,
	"healthScore" integer,
	"skipReason" varchar(255),
	"hpOpportunityId" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "portalEstimates_customer_estimate_uidx" ON "portalEstimates" USING btree ("customerId","estimateNumber");