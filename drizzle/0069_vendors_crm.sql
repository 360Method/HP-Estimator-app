-- Vendors CRM
-- Tables: vendors, trades, vendor_trades (many-to-many),
-- vendor_jobs (assignments), vendor_communications (activity log),
-- vendor_onboarding_steps (workflow tracking).

CREATE TABLE IF NOT EXISTS `vendors` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(255) NOT NULL,
  `companyName` varchar(255),
  `contactName` varchar(255),
  `email` varchar(255),
  `phone` varchar(32),
  `addressLine1` varchar(255),
  `city` varchar(120),
  `state` varchar(40),
  `zip` varchar(20),
  `serviceArea` varchar(255),
  `licenseNumber` varchar(120),
  `insuranceExpiry` date,
  `bondingExpiry` date,
  `w9OnFile` boolean NOT NULL DEFAULT false,
  `coiOnFile` boolean NOT NULL DEFAULT false,
  `status` enum('prospect','onboarding','active','paused','retired') NOT NULL DEFAULT 'prospect',
  `tier` enum('preferred','approved','trial','probation') NOT NULL DEFAULT 'trial',
  `rating` decimal(3,2),
  `jobsCompleted` int NOT NULL DEFAULT 0,
  `lastJobAt` timestamp NULL,
  `notes` text,
  `tagsJson` json,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `vendors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `trades` (
  `id` int AUTO_INCREMENT NOT NULL,
  `slug` varchar(80) NOT NULL,
  `name` varchar(120) NOT NULL,
  `category` varchar(80),
  `description` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `trades_id` PRIMARY KEY(`id`),
  CONSTRAINT `trades_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `vendor_trades` (
  `vendorId` int NOT NULL,
  `tradeId` int NOT NULL,
  `proficiency` enum('primary','secondary','occasional') NOT NULL DEFAULT 'primary',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `vendor_trades_pk` PRIMARY KEY(`vendorId`, `tradeId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `vendor_jobs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `vendorId` int NOT NULL,
  `opportunityId` varchar(64),
  `customerId` varchar(64),
  `status` enum('proposed','accepted','in_progress','completed','cancelled') NOT NULL DEFAULT 'proposed',
  `agreedAmountCents` int,
  `paidAmountCents` int NOT NULL DEFAULT 0,
  `scheduledFor` timestamp NULL,
  `completedAt` timestamp NULL,
  `qualityRating` int,
  `qualityNotes` text,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `vendor_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `vendor_communications` (
  `id` int AUTO_INCREMENT NOT NULL,
  `vendorId` int NOT NULL,
  `channel` enum('call','email','sms','meeting','note','quote','order','followup') NOT NULL,
  `direction` enum('inbound','outbound','internal') NOT NULL DEFAULT 'outbound',
  `subject` varchar(255),
  `body` text,
  `opportunityId` varchar(64),
  `loggedByUserId` int,
  `loggedByAgent` varchar(80),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `vendor_communications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `vendor_onboarding_steps` (
  `id` int AUTO_INCREMENT NOT NULL,
  `vendorId` int NOT NULL,
  `stepKey` varchar(80) NOT NULL,
  `label` varchar(255) NOT NULL,
  `status` enum('pending','in_progress','complete','skipped','blocked') NOT NULL DEFAULT 'pending',
  `dueAt` timestamp NULL,
  `completedAt` timestamp NULL,
  `notes` text,
  `assignedToUserId` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `vendor_onboarding_steps_id` PRIMARY KEY(`id`)
);
