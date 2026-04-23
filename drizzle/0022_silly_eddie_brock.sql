CREATE TABLE `threeSixtyChecklist` (
	`id` int AUTO_INCREMENT NOT NULL,
	`season` enum('spring','summer','fall','winter') NOT NULL,
	`category` enum('inspect','service') NOT NULL,
	`region` varchar(32) NOT NULL DEFAULT 'PNW',
	`taskName` varchar(255) NOT NULL,
	`description` text,
	`estimatedMinutes` int NOT NULL DEFAULT 15,
	`isUpsellTrigger` boolean NOT NULL DEFAULT false,
	`sortOrder` int NOT NULL DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `threeSixtyChecklist_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `threeSixtyLaborBankTransactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`membershipId` int NOT NULL,
	`type` enum('credit','debit','adjustment') NOT NULL,
	`amountCents` int NOT NULL,
	`description` varchar(512) NOT NULL,
	`linkedVisitId` int,
	`linkedOpportunityId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`createdBy` int,
	CONSTRAINT `threeSixtyLaborBankTransactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `threeSixtyMemberships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`propertyAddressId` int,
	`tier` enum('bronze','silver','gold') NOT NULL DEFAULT 'bronze',
	`status` enum('active','paused','cancelled') NOT NULL DEFAULT 'active',
	`startDate` bigint NOT NULL,
	`renewalDate` bigint NOT NULL,
	`laborBankBalance` int NOT NULL DEFAULT 0,
	`stripeSubscriptionId` varchar(255),
	`annualScanCompleted` boolean NOT NULL DEFAULT false,
	`annualScanDate` bigint,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `threeSixtyMemberships_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `threeSixtyScans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`membershipId` int NOT NULL,
	`customerId` int NOT NULL,
	`scanDate` bigint NOT NULL,
	`systemRatings` text,
	`reportUrl` text,
	`reportFileKey` varchar(512),
	`technicianNotes` text,
	`status` enum('draft','completed','delivered') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `threeSixtyScans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `threeSixtyVisits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`membershipId` int NOT NULL,
	`customerId` int NOT NULL,
	`season` enum('spring','summer','fall','winter') NOT NULL,
	`scheduledDate` bigint,
	`completedDate` bigint,
	`status` enum('scheduled','completed','skipped') NOT NULL DEFAULT 'scheduled',
	`technicianNotes` text,
	`checklistSnapshot` text,
	`laborBankUsed` int NOT NULL DEFAULT 0,
	`linkedOpportunityId` varchar(64),
	`visitYear` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `threeSixtyVisits_id` PRIMARY KEY(`id`)
);
