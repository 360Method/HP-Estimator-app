-- 0077_reengagement_campaign.sql
-- Database reactivation campaign for the 458 HCP-imported customers
-- (and similar one-off cohorts going forward).
--
-- Design:
--   reengagementCampaigns  one row per cohort run (e.g. "HCP Reactivation 2026")
--   reengagementDrafts     one row per (campaign, customer, channel)
--                          drafts start status='pending', move to 'approved',
--                          then 'sent', and webhook events fill in the rest.
--
-- Defensive: uses CREATE TABLE IF NOT EXISTS so re-running is safe and so the
-- accompanying boot guard in server/_core/index.ts (ensureReengagementTables)
-- can recreate them if the drizzle tracker diverges from prod.

CREATE TABLE IF NOT EXISTS `reengagementCampaigns` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(160) NOT NULL,
  `segment` enum('hot','warm','cold','custom') NOT NULL DEFAULT 'custom',
  `status` enum('draft','generating','review','sending','sent','cancelled') NOT NULL DEFAULT 'draft',
  `description` text,
  `createdBy` varchar(64),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `reengagementCampaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `reengagementDrafts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `campaignId` int NOT NULL,
  `customerId` varchar(64) NOT NULL,
  `segment` enum('hot','warm','cold') NOT NULL,
  `channel` enum('email','sms') NOT NULL,
  `subject` varchar(300),
  `body` text NOT NULL,
  `status` enum('pending','approved','rejected','queued','sent','bounced','replied','failed') NOT NULL DEFAULT 'pending',
  `customerHistorySummary` text,
  `qaNotes` text,
  `lastWorkDate` varchar(32),
  `lastWorkSummary` varchar(500),
  `lifetimeValueCents` int,
  `scheduledFor` timestamp NULL,
  `sentAt` timestamp NULL,
  `openedAt` timestamp NULL,
  `clickedAt` timestamp NULL,
  `repliedAt` timestamp NULL,
  `bounceReason` varchar(300),
  `errorMessage` text,
  `providerMessageId` varchar(120),
  `approvedBy` varchar(64),
  `approvedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `reengagementDrafts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `reengagementDrafts_campaign_idx` ON `reengagementDrafts` (`campaignId`);
--> statement-breakpoint
CREATE INDEX `reengagementDrafts_customer_idx` ON `reengagementDrafts` (`customerId`);
--> statement-breakpoint
CREATE INDEX `reengagementDrafts_status_idx` ON `reengagementDrafts` (`status`);
--> statement-breakpoint
CREATE INDEX `reengagementDrafts_provider_msg_idx` ON `reengagementDrafts` (`providerMessageId`);
