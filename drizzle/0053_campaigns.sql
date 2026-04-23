CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'scheduled', 'sending', 'sent', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."campaign_channel" AS ENUM('email', 'sms');--> statement-breakpoint
CREATE TYPE "public"."campaign_send_status" AS ENUM('pending', 'sent', 'delivered', 'bounced', 'failed', 'opened', 'clicked');--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"channel" "campaign_channel" DEFAULT 'email' NOT NULL,
	"emailTemplateId" integer,
	"subjectOverride" varchar(300),
	"smsBody" text,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
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
CREATE INDEX IF NOT EXISTS "campaignRecipients_campaign_idx" ON "campaignRecipients" ("campaignId");
--> statement-breakpoint
CREATE TABLE "campaignSends" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaignId" integer NOT NULL,
	"recipientId" integer NOT NULL,
	"status" "campaign_send_status" DEFAULT 'pending' NOT NULL,
	"providerMessageId" varchar(120),
	"openedAt" timestamp,
	"clickedAt" timestamp,
	"bounceReason" varchar(300),
	"errorMessage" text,
	"sentAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaignSends_campaign_idx" ON "campaignSends" ("campaignId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaignSends_recipient_idx" ON "campaignSends" ("recipientId");
