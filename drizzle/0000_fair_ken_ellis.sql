CREATE TABLE "adminAllowlist" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"addedBy" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "adminAllowlist_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "agentCharters" (
	"id" serial PRIMARY KEY NOT NULL,
	"department" varchar(50) NOT NULL,
	"markdownContent" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"updatedByStaffId" integer,
	CONSTRAINT "agentCharters_department_unique" UNIQUE("department")
);
--> statement-breakpoint
CREATE TABLE "agentDrafts" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" varchar(64) NOT NULL,
	"opportunityId" varchar(64),
	"playbookKey" varchar(64) NOT NULL,
	"stepKey" varchar(64) NOT NULL,
	"channel" varchar(16) NOT NULL,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"draftAutoSend" boolean DEFAULT false NOT NULL,
	"scheduledFor" timestamp NOT NULL,
	"subject" varchar(255),
	"body" text,
	"recipientEmail" varchar(320),
	"recipientPhone" varchar(32),
	"contextJson" text,
	"assigneeUserId" integer,
	"cancelReason" varchar(64),
	"generatedAt" timestamp,
	"sentAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agentKpis" (
	"id" serial PRIMARY KEY NOT NULL,
	"scopeType" text NOT NULL,
	"scopeId" varchar(100) NOT NULL,
	"key" varchar(100) NOT NULL,
	"label" varchar(200) NOT NULL,
	"targetMin" numeric(10, 2),
	"targetMax" numeric(10, 2),
	"unit" varchar(20) NOT NULL,
	"period" text NOT NULL,
	"sourceQuery" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_optimization_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"agentId" integer NOT NULL,
	"seatName" varchar(80) NOT NULL,
	"kind" varchar(40) NOT NULL,
	"title" varchar(255) NOT NULL,
	"details" text,
	"severity" text DEFAULT 'info' NOT NULL,
	"dayKey" varchar(10) NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"reviewedByUserId" integer,
	"reviewedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agentPlaybooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerSeatName" varchar(100) NOT NULL,
	"ownerDepartment" varchar(50) NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"content" text NOT NULL,
	"variables" text,
	"category" varchar(50) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"updatedByStaffId" integer,
	CONSTRAINT "agentPlaybooks_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "agent_team_artifacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"taskId" integer NOT NULL,
	"teamId" integer NOT NULL,
	"fromSeatId" integer NOT NULL,
	"territory" text NOT NULL,
	"key" varchar(120) NOT NULL,
	"contentJson" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_team_handoffs" (
	"id" serial PRIMARY KEY NOT NULL,
	"fromTeamId" integer NOT NULL,
	"toTeamId" integer NOT NULL,
	"eventType" varchar(80) NOT NULL,
	"payload" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"declineReason" text,
	"acceptedAt" timestamp,
	"declinedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_team_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"teamId" integer NOT NULL,
	"seatId" integer NOT NULL,
	"role" text DEFAULT 'backend' NOT NULL,
	"joinedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_team_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"teamId" integer NOT NULL,
	"fromSeatId" integer NOT NULL,
	"toSeatId" integer,
	"body" text NOT NULL,
	"threadId" integer,
	"attachments" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_team_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"teamId" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"status" text DEFAULT 'open' NOT NULL,
	"claimedBySeatId" integer,
	"ownerFiles" text,
	"sourceEventType" varchar(80),
	"sourceEventPayload" text,
	"customerId" varchar(64),
	"priority" text DEFAULT 'normal' NOT NULL,
	"dueAt" timestamp,
	"completedAt" timestamp,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_team_violations" (
	"id" serial PRIMARY KEY NOT NULL,
	"taskId" integer,
	"teamId" integer NOT NULL,
	"seatId" integer NOT NULL,
	"attemptedRole" varchar(40) NOT NULL,
	"attemptedTerritory" varchar(40) NOT NULL,
	"attemptedKey" varchar(255),
	"reason" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"department" text NOT NULL,
	"name" varchar(120) NOT NULL,
	"teamLeadSeatId" integer,
	"purpose" text,
	"status" text DEFAULT 'active' NOT NULL,
	"costCapDailyUsd" numeric(8, 2) DEFAULT '5.00' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_agent_event_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"agentId" integer NOT NULL,
	"eventName" varchar(80) NOT NULL,
	"filter" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_agent_handoffs" (
	"id" serial PRIMARY KEY NOT NULL,
	"fromAgentId" integer NOT NULL,
	"toAgentId" integer NOT NULL,
	"taskId" integer NOT NULL,
	"reason" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_agent_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"taskId" integer NOT NULL,
	"agentId" integer NOT NULL,
	"input" text,
	"output" text,
	"toolCalls" text,
	"inputTokens" integer DEFAULT 0 NOT NULL,
	"outputTokens" integer DEFAULT 0 NOT NULL,
	"costUsd" numeric(10, 4) DEFAULT '0.0000' NOT NULL,
	"durationMs" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"errorMessage" text,
	"approvedByUserId" integer,
	"approvedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_agent_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"agentId" integer NOT NULL,
	"cronExpression" varchar(80) NOT NULL,
	"timezone" varchar(64) DEFAULT 'America/Los_Angeles' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"lastRunAt" timestamp,
	"nextRunAt" timestamp,
	"payload" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_agent_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"agentId" integer NOT NULL,
	"triggerType" text NOT NULL,
	"triggerPayload" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"startedAt" timestamp,
	"completedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "ai_agent_tools" (
	"id" serial PRIMARY KEY NOT NULL,
	"agentId" integer NOT NULL,
	"toolKey" varchar(80) NOT NULL,
	"authorized" boolean DEFAULT true NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "ai_agents" (
	"id" serial PRIMARY KEY NOT NULL,
	"seatName" varchar(80) NOT NULL,
	"department" text NOT NULL,
	"role" text NOT NULL,
	"systemPrompt" text NOT NULL,
	"model" varchar(40) DEFAULT 'claude-haiku-4-5-20251001' NOT NULL,
	"status" text DEFAULT 'draft_queue' NOT NULL,
	"reportsToSeatId" integer,
	"isDepartmentHead" boolean DEFAULT false NOT NULL,
	"costCapDailyUsd" numeric(6, 2) DEFAULT '5.00' NOT NULL,
	"runLimitDaily" integer DEFAULT 200 NOT NULL,
	"lastRunAt" timestamp,
	"charterLoaded" boolean DEFAULT false NOT NULL,
	"kpiCount" integer DEFAULT 0 NOT NULL,
	"playbookCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aiAgents" (
	"id" serial PRIMARY KEY NOT NULL,
	"seatName" varchar(80) NOT NULL,
	"department" varchar(80) DEFAULT 'integrator_visionary' NOT NULL,
	"reportsTo" varchar(80) DEFAULT 'Integrator' NOT NULL,
	"status" text DEFAULT 'draft_queue' NOT NULL,
	"systemPrompt" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "aiAgents_seatName_unique" UNIQUE("seatName")
);
--> statement-breakpoint
CREATE TABLE "appSettings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"companyName" varchar(120) DEFAULT 'Handy Pioneers',
	"logoUrl" varchar(500) DEFAULT '',
	"brandColor" varchar(20) DEFAULT '#1E3A5F',
	"timezone" varchar(60) DEFAULT 'America/Los_Angeles',
	"estimatePrefix" varchar(10) DEFAULT 'EST',
	"invoicePrefix" varchar(10) DEFAULT 'INV',
	"jobPrefix" varchar(10) DEFAULT 'JOB',
	"portalUrl" varchar(300) DEFAULT 'https://client.handypioneers.com',
	"websiteUrl" varchar(300) DEFAULT 'https://handypioneers.com',
	"supportEmail" varchar(320) DEFAULT '',
	"supportPhone" varchar(30) DEFAULT '',
	"addressLine1" varchar(200) DEFAULT '',
	"addressLine2" varchar(200) DEFAULT '',
	"defaultTaxBps" integer DEFAULT 875,
	"defaultDepositPct" integer DEFAULT 50,
	"documentFooter" text,
	"termsText" text,
	"googleReviewLink" varchar(500) DEFAULT '',
	"internalLaborRateCents" integer DEFAULT 15000,
	"defaultMarkupPct" integer DEFAULT 20,
	"smsFromName" varchar(30) DEFAULT 'HandyPioneers',
	"emailEstimateApprovedSubject" varchar(300) DEFAULT 'Your estimate has been approved — Handy Pioneers',
	"emailEstimateApprovedBody" text,
	"emailJobSignOffSubject" varchar(300) DEFAULT 'Job complete — your final invoice is ready',
	"emailJobSignOffBody" text,
	"emailChangeOrderApprovedSubject" varchar(300) DEFAULT 'Change order approved — Handy Pioneers',
	"emailChangeOrderApprovedBody" text,
	"emailMagicLinkSubject" varchar(300) DEFAULT 'Your Handy Pioneers Customer Portal Login',
	"emailMagicLinkBody" text,
	"portalContinuityEnabled" boolean DEFAULT true NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automationRuleLogs" (
	"id" serial PRIMARY KEY NOT NULL,
	"ruleId" integer NOT NULL,
	"trigger" varchar(60) NOT NULL,
	"triggerPayload" text,
	"status" text NOT NULL,
	"errorMessage" text,
	"executedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automationRules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"trigger" varchar(60) NOT NULL,
	"conditions" text,
	"actionType" text NOT NULL,
	"actionPayload" text NOT NULL,
	"delayMinutes" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"stage" varchar(30) DEFAULT 'lead' NOT NULL,
	"category" varchar(40) DEFAULT 'lead_intake' NOT NULL,
	"emailTemplateId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "callLogs" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversationId" integer NOT NULL,
	"messageId" integer,
	"twilioCallSid" varchar(64),
	"direction" text NOT NULL,
	"status" varchar(32) DEFAULT 'answered' NOT NULL,
	"durationSecs" integer DEFAULT 0 NOT NULL,
	"recordingUrl" text,
	"recordingAppUrl" text,
	"voicemailUrl" text,
	"callerPhone" varchar(32),
	"startedAt" timestamp DEFAULT now() NOT NULL,
	"endedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "campaignRecipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaignId" integer NOT NULL,
	"customerId" varchar(64),
	"email" varchar(320),
	"phone" varchar(32),
	"mergeVars" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaignSends" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaignId" integer NOT NULL,
	"recipientId" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"providerMessageId" varchar(120),
	"openedAt" timestamp,
	"clickedAt" timestamp,
	"bounceReason" varchar(300),
	"errorMessage" text,
	"sentAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"emailTemplateId" integer,
	"subjectOverride" varchar(300),
	"smsBody" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduledAt" timestamp,
	"sentAt" timestamp,
	"createdBy" varchar(64),
	"recipientCount" integer DEFAULT 0 NOT NULL,
	"sentCount" integer DEFAULT 0 NOT NULL,
	"openCount" integer DEFAULT 0 NOT NULL,
	"clickCount" integer DEFAULT 0 NOT NULL,
	"bounceCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "cron_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"runKey" varchar(64) NOT NULL,
	"periodKey" varchar(32) NOT NULL,
	"status" text DEFAULT 'claimed' NOT NULL,
	"detail" text,
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
	"bypassAutoNurture" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emailTemplates" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" integer DEFAULT 1 NOT NULL,
	"key" varchar(80) NOT NULL,
	"name" varchar(160) DEFAULT '' NOT NULL,
	"subject" varchar(300) DEFAULT '' NOT NULL,
	"preheader" varchar(300) DEFAULT '',
	"html" text NOT NULL,
	"text" text,
	"mergeTagSchema" text,
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
CREATE TABLE "gbpTokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"accountId" varchar(128) NOT NULL,
	"locationId" varchar(128),
	"accessToken" text NOT NULL,
	"refreshToken" text NOT NULL,
	"expiresAt" varchar(32) NOT NULL,
	"connectedAt" timestamp DEFAULT now() NOT NULL,
	"connectedByStaffId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gmailMessageLinks" (
	"id" serial PRIMARY KEY NOT NULL,
	"gmailMessageId" varchar(128) NOT NULL,
	"gmailThreadId" varchar(128),
	"staffGmailEmail" varchar(320) NOT NULL,
	"customerId" varchar(64),
	"classification" text DEFAULT 'unclassified' NOT NULL,
	"classificationScore" integer DEFAULT 0 NOT NULL,
	"aiDraftReplyId" integer,
	"gmailDraftId" varchar(128),
	"fromEmail" varchar(320) DEFAULT '' NOT NULL,
	"fromName" varchar(255) DEFAULT '' NOT NULL,
	"subject" varchar(512) DEFAULT '' NOT NULL,
	"bodyPreview" varchar(500) DEFAULT '' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"processedAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gmailMessageLinks_gmailMessageId_unique" UNIQUE("gmailMessageId")
);
--> statement-breakpoint
CREATE TABLE "gmailTokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"expiresAt" bigint,
	"staffUserId" integer,
	"scopesGranted" text,
	"connectedAt" timestamp,
	"lastSyncedAt" timestamp,
	"lastMessageIdSeen" varchar(128),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gmailTokens_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "googleAdsTokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" varchar(64) NOT NULL,
	"accessToken" text NOT NULL,
	"refreshToken" text NOT NULL,
	"expiresAt" varchar(32) NOT NULL,
	"connectedAt" timestamp DEFAULT now() NOT NULL,
	"connectedByStaffId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrator_chat_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"title" varchar(200),
	"lastMessageAt" timestamp,
	"archived" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrator_chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversationId" integer NOT NULL,
	"userId" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"toolCalls" text,
	"inputTokens" integer DEFAULT 0 NOT NULL,
	"outputTokens" integer DEFAULT 0 NOT NULL,
	"costUsd" numeric(10, 4) DEFAULT '0.0000' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "kpi_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"scopeId" integer,
	"scopeKey" varchar(40),
	"key" varchar(80) NOT NULL,
	"value" numeric(14, 4) NOT NULL,
	"unit" varchar(20) DEFAULT 'count' NOT NULL,
	"period" text DEFAULT 'realtime' NOT NULL,
	"computedAt" timestamp DEFAULT now() NOT NULL,
	"sourceTaskId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversationId" integer NOT NULL,
	"channel" text NOT NULL,
	"direction" text NOT NULL,
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
	"sentByUserId" integer,
	"replyToken" varchar(64),
	"opportunityId" varchar(64),
	"isPortalReply" boolean DEFAULT false NOT NULL,
	"threadRootId" integer
);
--> statement-breakpoint
CREATE TABLE "metaConnections" (
	"id" serial PRIMARY KEY NOT NULL,
	"adAccountId" varchar(64) NOT NULL,
	"pageIds" text,
	"tokenStatus" varchar(32) DEFAULT 'active' NOT NULL,
	"lastVerifiedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notificationPreferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"eventKey" varchar(60) NOT NULL,
	"channel" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer,
	"role" varchar(32),
	"eventType" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text,
	"linkUrl" varchar(512),
	"opportunityId" varchar(64),
	"customerId" varchar(64),
	"priority" varchar(16) DEFAULT 'normal' NOT NULL,
	"emailSent" boolean DEFAULT false NOT NULL,
	"smsSent" boolean DEFAULT false NOT NULL,
	"readAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nurturerPlaybooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(64) NOT NULL,
	"displayName" varchar(255) NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"stepsJson" text NOT NULL,
	"voiceRulesJson" text,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "nurturerPlaybooks_key_unique" UNIQUE("key")
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
	"funnel" varchar(32) DEFAULT 'project',
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
	"assignedUserId" integer,
	"assignedRole" varchar(32),
	"assignedAt" varchar(32),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orphanEmails" (
	"id" serial PRIMARY KEY NOT NULL,
	"gmailMessageId" varchar(128) NOT NULL,
	"gmailThreadId" varchar(128),
	"fromEmail" varchar(320) NOT NULL,
	"fromName" varchar(255),
	"subject" varchar(512),
	"body" text,
	"resolvedAt" timestamp,
	"resolvedCustomerId" varchar(64),
	"receivedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "orphanEmails_gmailMessageId_unique" UNIQUE("gmailMessageId")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"staffUserId" integer NOT NULL,
	"tokenHash" varchar(255) NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"usedAt" timestamp,
	"requestIp" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phoneSettings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"forwardingMode" text DEFAULT 'forward_to_number' NOT NULL,
	"forwardingNumber" varchar(20) DEFAULT '',
	"aiServiceNumber" varchar(20) DEFAULT '',
	"greeting" varchar(500) DEFAULT '',
	"voicemailPrompt" varchar(600) DEFAULT '',
	"callRecording" boolean DEFAULT false NOT NULL,
	"transcribeVoicemail" boolean DEFAULT true NOT NULL,
	"afterHoursEnabled" boolean DEFAULT false NOT NULL,
	"businessHoursStart" varchar(5) DEFAULT '08:00',
	"businessHoursEnd" varchar(5) DEFAULT '17:00',
	"businessDays" varchar(20) DEFAULT '1,2,3,4,5',
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipelineEvents" (
	"id" serial PRIMARY KEY NOT NULL,
	"opportunityId" varchar(64) NOT NULL,
	"eventType" varchar(64) NOT NULL,
	"fromStage" varchar(64),
	"toStage" varchar(64),
	"fromRole" varchar(32),
	"toRole" varchar(32),
	"fromUserId" integer,
	"toUserId" integer,
	"triggeredBy" integer,
	"payloadJson" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
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
	"onboardingCompletedAt" timestamp,
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
	"status" text DEFAULT 'pending' NOT NULL,
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
	"senderRole" text NOT NULL,
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
	"requestType" varchar(32) DEFAULT 'service_request' NOT NULL,
	"preferredDateRange" varchar(64),
	"photoUrls" text,
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
CREATE TABLE "reengagementCampaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"segment" text DEFAULT 'custom' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"description" text,
	"createdBy" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reengagementDrafts" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaignId" integer NOT NULL,
	"customerId" varchar(64) NOT NULL,
	"segment" text NOT NULL,
	"channel" text NOT NULL,
	"subject" varchar(300),
	"body" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"customerHistorySummary" text,
	"qaNotes" text,
	"lastWorkDate" varchar(32),
	"lastWorkSummary" varchar(500),
	"lifetimeValueCents" integer,
	"scheduledFor" timestamp,
	"sentAt" timestamp,
	"openedAt" timestamp,
	"clickedAt" timestamp,
	"repliedAt" timestamp,
	"bounceReason" varchar(300),
	"errorMessage" text,
	"providerMessageId" varchar(120),
	"approvedBy" varchar(64),
	"approvedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "scheduled_bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"customerId" varchar(64) NOT NULL,
	"slotId" integer NOT NULL,
	"visitType" text DEFAULT 'consultation' NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"notes" text,
	"bookedBy" varchar(64) DEFAULT 'customer' NOT NULL,
	"confirmationCode" varchar(16),
	"cancelledAt" timestamp,
	"cancelReason" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduling_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"startAt" timestamp NOT NULL,
	"endAt" timestamp NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"bookedCount" integer DEFAULT 0 NOT NULL,
	"blocked" boolean DEFAULT false NOT NULL,
	"notes" varchar(255),
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
CREATE TABLE "smsTemplates" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" integer DEFAULT 1 NOT NULL,
	"key" varchar(80) NOT NULL,
	"name" varchar(160) DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"mergeTagSchema" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
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
CREATE TABLE "staffUsers" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"passwordHash" text NOT NULL,
	"name" varchar(255),
	"role" text DEFAULT 'staff' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "staffUsers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "threeSixtyChecklist" (
	"id" serial PRIMARY KEY NOT NULL,
	"season" text NOT NULL,
	"category" text NOT NULL,
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
	"type" text NOT NULL,
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
	"tier" text DEFAULT 'bronze' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"startDate" bigint NOT NULL,
	"renewalDate" bigint NOT NULL,
	"laborBankBalance" integer DEFAULT 0 NOT NULL,
	"stripeSubscriptionId" varchar(255),
	"stripeCustomerId" varchar(64),
	"billingCadence" text DEFAULT 'annual' NOT NULL,
	"annualScanCompleted" boolean DEFAULT false NOT NULL,
	"annualScanDate" bigint,
	"annualValuationOptIn" boolean DEFAULT false NOT NULL,
	"notes" text,
	"planType" text DEFAULT 'single' NOT NULL,
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
	"systemType" text NOT NULL,
	"brandModel" varchar(255),
	"installYear" integer,
	"condition" text DEFAULT 'good' NOT NULL,
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
	"status" text DEFAULT 'draft' NOT NULL,
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
	"season" text NOT NULL,
	"scheduledDate" bigint,
	"completedDate" bigint,
	"status" text DEFAULT 'scheduled' NOT NULL,
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
CREATE TABLE "timeLogs" (
	"id" serial PRIMARY KEY NOT NULL,
	"techName" varchar(128) NOT NULL,
	"workOrderId" integer,
	"scheduleEventId" varchar(64),
	"opportunityId" varchar(64),
	"customerId" varchar(64),
	"jobTitle" text,
	"clockIn" timestamp NOT NULL,
	"clockOut" timestamp,
	"durationMins" integer,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(120) NOT NULL,
	"category" varchar(80),
	"description" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trades_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "userRoles" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"role" varchar(32) NOT NULL,
	"isPrimary" boolean DEFAULT false NOT NULL,
	"mobileUrgent" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" text DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE TABLE "vendor_communications" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendorId" integer NOT NULL,
	"channel" text NOT NULL,
	"direction" text DEFAULT 'outbound' NOT NULL,
	"subject" varchar(255),
	"body" text,
	"opportunityId" varchar(64),
	"loggedByUserId" integer,
	"loggedByAgent" varchar(80),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendorId" integer NOT NULL,
	"opportunityId" varchar(64),
	"customerId" varchar(64),
	"status" text DEFAULT 'proposed' NOT NULL,
	"agreedAmountCents" integer,
	"paidAmountCents" integer DEFAULT 0 NOT NULL,
	"scheduledFor" timestamp,
	"completedAt" timestamp,
	"qualityRating" integer,
	"qualityNotes" text,
	"notes" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_onboarding_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendorId" integer NOT NULL,
	"stepKey" varchar(80) NOT NULL,
	"label" varchar(255) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"dueAt" timestamp,
	"completedAt" timestamp,
	"notes" text,
	"assignedToUserId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_trades" (
	"vendorId" integer NOT NULL,
	"tradeId" integer NOT NULL,
	"proficiency" text DEFAULT 'primary' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"companyName" varchar(255),
	"contactName" varchar(255),
	"email" varchar(255),
	"phone" varchar(32),
	"addressLine1" varchar(255),
	"city" varchar(120),
	"state" varchar(40),
	"zip" varchar(20),
	"serviceArea" varchar(255),
	"licenseNumber" varchar(120),
	"insuranceExpiry" date,
	"bondingExpiry" date,
	"w9OnFile" boolean DEFAULT false NOT NULL,
	"coiOnFile" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'prospect' NOT NULL,
	"tier" text DEFAULT 'trial' NOT NULL,
	"rating" numeric(3, 2),
	"jobsCompleted" integer DEFAULT 0 NOT NULL,
	"lastJobAt" timestamp,
	"notes" text,
	"tagsJson" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "homeHealthRecords" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"propertyId" varchar(64) NOT NULL,
	"portalAccountId" varchar(64) NOT NULL,
	"findings" json NOT NULL,
	"summary" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portalAccounts" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"firstName" varchar(128) DEFAULT '' NOT NULL,
	"lastName" varchar(128) DEFAULT '' NOT NULL,
	"phone" varchar(32) DEFAULT '' NOT NULL,
	"customerId" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"lastLoginAt" timestamp,
	CONSTRAINT "portalAccounts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "portalMagicLinks" (
	"tokenHash" varchar(64) PRIMARY KEY NOT NULL,
	"portalAccountId" varchar(64) NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"consumedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portalProperties" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"portalAccountId" varchar(64) NOT NULL,
	"street" varchar(255) DEFAULT '' NOT NULL,
	"unit" varchar(64) DEFAULT '' NOT NULL,
	"city" varchar(128) DEFAULT '' NOT NULL,
	"state" varchar(64) DEFAULT '' NOT NULL,
	"zip" varchar(10) DEFAULT '' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "priorityTranslations" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"portalAccountId" varchar(64) NOT NULL,
	"propertyId" varchar(64) NOT NULL,
	"homeHealthRecordId" varchar(64),
	"pdfStoragePath" text,
	"reportUrl" text,
	"notes" text,
	"status" varchar(32) DEFAULT 'submitted' NOT NULL,
	"claudeResponse" json,
	"outputPdfPath" text,
	"deliveredAt" timestamp,
	"failureReason" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projectEstimates" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"opportunityId" varchar(64) NOT NULL,
	"customerId" varchar(64) NOT NULL,
	"onlineRequestId" integer,
	"portalAccountId" varchar(64),
	"status" varchar(32) DEFAULT 'submitted' NOT NULL,
	"confidence" varchar(16),
	"claudeResponse" json,
	"customerRangeLowUsd" integer,
	"customerRangeHighUsd" integer,
	"scopeSummary" text,
	"inclusionsMd" text,
	"marginAudit" text,
	"deliveredAt" timestamp,
	"viewedAt" timestamp,
	"proceedClickedAt" timestamp,
	"walkthroughRequestedAt" timestamp,
	"declinedAt" timestamp,
	"failureReason" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_optimization_tasks_unique_per_day" ON "agent_optimization_tasks" USING btree ("agentId","kind","dayKey");--> statement-breakpoint
CREATE UNIQUE INDEX "cron_runs_run_period_uniq" ON "cron_runs" USING btree ("runKey","periodKey");--> statement-breakpoint
CREATE UNIQUE INDEX "notificationPreferences_event_channel_uidx" ON "notificationPreferences" USING btree ("eventKey","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "portalEstimates_customer_estimate_uidx" ON "portalEstimates" USING btree ("customerId","estimateNumber");--> statement-breakpoint
CREATE UNIQUE INDEX "homeHealthRecords_property_idx" ON "homeHealthRecords" USING btree ("propertyId");--> statement-breakpoint
CREATE INDEX "portalAccounts_email_idx" ON "portalAccounts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "portalAccounts_customerId_idx" ON "portalAccounts" USING btree ("customerId");--> statement-breakpoint
CREATE INDEX "portalMagicLinks_account_idx" ON "portalMagicLinks" USING btree ("portalAccountId");--> statement-breakpoint
CREATE INDEX "portalProperties_account_idx" ON "portalProperties" USING btree ("portalAccountId");--> statement-breakpoint
CREATE UNIQUE INDEX "portalProperties_account_zip_street_idx" ON "portalProperties" USING btree ("portalAccountId","street","zip");--> statement-breakpoint
CREATE INDEX "priorityTranslations_account_idx" ON "priorityTranslations" USING btree ("portalAccountId");--> statement-breakpoint
CREATE INDEX "priorityTranslations_property_idx" ON "priorityTranslations" USING btree ("propertyId");--> statement-breakpoint
CREATE INDEX "priorityTranslations_status_idx" ON "priorityTranslations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "projectEstimates_opportunity_idx" ON "projectEstimates" USING btree ("opportunityId");--> statement-breakpoint
CREATE INDEX "projectEstimates_customer_idx" ON "projectEstimates" USING btree ("customerId");--> statement-breakpoint
CREATE INDEX "projectEstimates_status_idx" ON "projectEstimates" USING btree ("status");