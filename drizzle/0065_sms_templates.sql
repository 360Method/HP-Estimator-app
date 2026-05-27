-- Migration 0065: smsTemplates table.
--
-- First-class SMS template records, looked up by (tenantId, key). Mirrors the
-- emailTemplates contract (0052) so the render/lookup path is symmetric.
-- 160-char bodies fit in text(); mergeTagSchema describes available {{vars}}.
--
-- Gap note: migration 0064 is intentionally reserved — the drizzle tracker
-- has diverged from prod state during the MySQL port, and 0065 was the
-- slot allocated for this change in the lead-routing/email-library batch.

CREATE TABLE IF NOT EXISTS `smsTemplates` (
  `id` int AUTO_INCREMENT NOT NULL,
  `tenantId` int NOT NULL DEFAULT 1,
  `key` varchar(80) NOT NULL,
  `name` varchar(160) NOT NULL DEFAULT '',
  `body` text NOT NULL,
  `mergeTagSchema` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `smsTemplates_id` PRIMARY KEY(`id`),
  CONSTRAINT `smsTemplates_tenant_key_unique` UNIQUE(`tenantId`, `key`)
);
--> statement-breakpoint
CREATE INDEX `smsTemplates_key_idx` ON `smsTemplates` (`key`);
