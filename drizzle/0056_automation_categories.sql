-- 0056_automation_categories.sql
-- Add category grouping + optional email template reference to automationRules.

ALTER TABLE "automationRules" ADD COLUMN IF NOT EXISTS "category" varchar(40) DEFAULT 'lead_intake' NOT NULL;--> statement-breakpoint
ALTER TABLE "automationRules" ADD COLUMN IF NOT EXISTS "emailTemplateId" integer;
