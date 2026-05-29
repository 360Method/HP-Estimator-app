CREATE TABLE "idsIssues" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"category" varchar(8) NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"priority" varchar(8) DEFAULT 'normal' NOT NULL,
	"source" varchar(32) DEFAULT 'manual' NOT NULL,
	"dedupeKey" varchar(160),
	"ownerUserId" integer,
	"action" text,
	"dueDate" varchar(32),
	"opportunityId" varchar(64),
	"customerId" varchar(64),
	"resolvedAt" varchar(32),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idsIssues_dedupeKey_uidx" ON "idsIssues" USING btree ("dedupeKey");