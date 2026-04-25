-- 0065_oauth_integrations.sql
-- Adds tables for GBP, Meta, and Google Ads integrations, plus the aiAgentTools registry.
-- All CREATE TABLE statements are defensive (IF NOT EXISTS) because the Railway drizzle
-- tracker may diverge from the actual prod DB state (see project memory note).

CREATE TABLE IF NOT EXISTS `gbpTokens` (
  `id` int AUTO_INCREMENT NOT NULL,
  `accountId` varchar(128) NOT NULL,
  `locationId` varchar(128),
  `accessToken` text NOT NULL,
  `refreshToken` text NOT NULL,
  `expiresAt` varchar(32) NOT NULL,
  `connectedAt` timestamp NOT NULL DEFAULT (now()),
  `connectedByStaffId` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `gbpTokens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `metaConnections` (
  `id` int AUTO_INCREMENT NOT NULL,
  `adAccountId` varchar(64) NOT NULL,
  `pageIds` text,
  `tokenStatus` varchar(32) NOT NULL DEFAULT 'active',
  `lastVerifiedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `metaConnections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `googleAdsTokens` (
  `id` int AUTO_INCREMENT NOT NULL,
  `customerId` varchar(64) NOT NULL,
  `accessToken` text NOT NULL,
  `refreshToken` text NOT NULL,
  `expiresAt` varchar(32) NOT NULL,
  `connectedAt` timestamp NOT NULL DEFAULT (now()),
  `connectedByStaffId` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `googleAdsTokens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `aiAgentTools` (
  `id` int AUTO_INCREMENT NOT NULL,
  `toolName` varchar(128) NOT NULL,
  `description` text,
  `mode` varchar(32) NOT NULL DEFAULT 'draft_only',
  `category` varchar(64),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `aiAgentTools_id` PRIMARY KEY(`id`),
  CONSTRAINT `aiAgentTools_toolName_unique` UNIQUE(`toolName`)
);
