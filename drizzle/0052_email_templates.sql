CREATE TABLE "emailTemplates" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenantId" integer DEFAULT 1 NOT NULL,
	"key" varchar(80) NOT NULL,
	"name" varchar(160) DEFAULT '' NOT NULL,
	"subject" varchar(300) DEFAULT '' NOT NULL,
	"preheader" varchar(300) DEFAULT '',
	"html" text DEFAULT '' NOT NULL,
	"text" text DEFAULT '',
	"mergeTagSchema" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "emailTemplates_tenant_key_unique" UNIQUE ("tenantId", "key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "emailTemplates_key_idx" ON "emailTemplates" ("key");
