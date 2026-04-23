-- 0058_priority_translations.sql
--
-- Priority Translation lead magnet: portal + health record + translation tables.
-- MySQL port of feat/priority-translation-backend migration 0050.
--
--   portalAccounts        (one per email)
--       │
--       ▼
--   portalProperties      (one per physical address)
--       │
--       ▼
--   homeHealthRecords     (one per property — the "living health record")
--       │
--       ▼
--   priorityTranslations  (one per submitted inspection report)

CREATE TABLE IF NOT EXISTS `portalAccounts` (
  `id` varchar(64) NOT NULL,
  `email` varchar(320) NOT NULL,
  `firstName` varchar(128) NOT NULL DEFAULT '',
  `lastName` varchar(128) NOT NULL DEFAULT '',
  `phone` varchar(32) NOT NULL DEFAULT '',
  `customerId` varchar(64),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `lastLoginAt` timestamp NULL,
  CONSTRAINT `portalAccounts_id` PRIMARY KEY(`id`),
  CONSTRAINT `portalAccounts_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE INDEX `portalAccounts_email_idx` ON `portalAccounts` (`email`);
--> statement-breakpoint
CREATE INDEX `portalAccounts_customerId_idx` ON `portalAccounts` (`customerId`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `portalMagicLinks` (
  `token` varchar(128) NOT NULL,
  `portalAccountId` varchar(64) NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `consumedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `portalMagicLinks_token` PRIMARY KEY(`token`)
);
--> statement-breakpoint
CREATE INDEX `portalMagicLinks_account_idx` ON `portalMagicLinks` (`portalAccountId`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `portalProperties` (
  `id` varchar(64) NOT NULL,
  `portalAccountId` varchar(64) NOT NULL,
  `street` varchar(255) NOT NULL DEFAULT '',
  `unit` varchar(64) NOT NULL DEFAULT '',
  `city` varchar(128) NOT NULL DEFAULT '',
  `state` varchar(64) NOT NULL DEFAULT '',
  `zip` varchar(10) NOT NULL DEFAULT '',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `portalProperties_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `portalProperties_account_idx` ON `portalProperties` (`portalAccountId`);
--> statement-breakpoint
CREATE UNIQUE INDEX `portalProperties_account_zip_street_idx`
  ON `portalProperties`(`portalAccountId`, `street`, `zip`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `homeHealthRecords` (
  `id` varchar(64) NOT NULL,
  `propertyId` varchar(64) NOT NULL,
  `portalAccountId` varchar(64) NOT NULL,
  `findings` json NOT NULL,
  `summary` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `homeHealthRecords_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `homeHealthRecords_property_idx`
  ON `homeHealthRecords`(`propertyId`);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `priorityTranslations` (
  `id` varchar(64) NOT NULL,
  `portalAccountId` varchar(64) NOT NULL,
  `propertyId` varchar(64) NOT NULL,
  `homeHealthRecordId` varchar(64),
  `pdfStoragePath` text,
  `reportUrl` text,
  `notes` text,
  `status` varchar(32) NOT NULL DEFAULT 'submitted',
  `claudeResponse` json,
  `outputPdfPath` text,
  `deliveredAt` timestamp NULL,
  `failureReason` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `priorityTranslations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `priorityTranslations_account_idx` ON `priorityTranslations` (`portalAccountId`);
--> statement-breakpoint
CREATE INDEX `priorityTranslations_property_idx` ON `priorityTranslations` (`propertyId`);
--> statement-breakpoint
CREATE INDEX `priorityTranslations_status_idx` ON `priorityTranslations` (`status`);
