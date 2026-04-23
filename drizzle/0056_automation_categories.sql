-- 0056_automation_categories.sql
-- Add category grouping + optional email template reference to automationRules.
ALTER TABLE `automationRules` ADD COLUMN `category` varchar(40) NOT NULL DEFAULT 'lead_intake';
--> statement-breakpoint
ALTER TABLE `automationRules` ADD COLUMN `emailTemplateId` int;
